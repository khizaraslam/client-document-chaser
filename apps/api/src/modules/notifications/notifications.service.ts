import {
  EmailDeliverySummary,
  EmailStatus,
  OutboxStatus,
} from '@cdc/contracts';
import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Resend } from 'resend';
import { EntityManager, Repository } from 'typeorm';
import { safeTimingCompare } from '../../common/utils/crypto.util';
import { EmailEventEntity } from '../../database/entities/email-event.entity';
import { OutboxEventEntity } from '../../database/entities/outbox-event.entity';
import { EmailTemplatesService, RenderedEmail } from './email-templates.service';

export interface OutboxEmailParams {
  organizationId: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  idempotencyKey: string;
  recipientEmail: string;
  templateName: string;
  payload: Record<string, unknown>;
}

export interface EmailSendResult {
  sent: boolean;
  status: EmailStatus;
  emailEventId: string;
  providerMessageId?: string;
  errorMessage?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly resendClient: Resend | null;

  constructor(
    @InjectRepository(OutboxEventEntity)
    private readonly outboxRepo: Repository<OutboxEventEntity>,
    @InjectRepository(EmailEventEntity)
    private readonly emailEventRepo: Repository<EmailEventEntity>,
    private readonly configService: ConfigService,
    private readonly templates: EmailTemplatesService,
  ) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY', '').trim();
    this.resendClient = apiKey.length > 0 ? new Resend(apiKey) : null;
  }

  resolveFromAddress(): string {
    const emailFrom = this.configService.get<string>('EMAIL_FROM', '').trim();
    if (emailFrom) return emailFrom;
    return this.configService.get<string>('RESEND_FROM_EMAIL', '').trim();
  }

  async enqueueOutboxEvent(
    params: OutboxEmailParams,
    manager?: EntityManager,
  ): Promise<OutboxEventEntity> {
    const repo = manager
      ? manager.getRepository(OutboxEventEntity)
      : this.outboxRepo;

    const existing = await repo.findOne({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      return existing;
    }

    const outbox = repo.create({
      organizationId: params.organizationId,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      eventType: params.eventType,
      idempotencyKey: params.idempotencyKey,
      payload: {
        recipientEmail: params.recipientEmail,
        templateName: params.templateName,
        ...params.payload,
      },
      status: OutboxStatus.PENDING,
    });

    return repo.save(outbox);
  }

  async dispatchEmail(params: {
    organizationId: string | null;
    outboxEventId?: string | null;
    recipientEmail: string;
    templateName: string;
    rendered: RenderedEmail;
    idempotencyKey?: string;
  }): Promise<EmailSendResult> {
    if (params.outboxEventId) {
      const existingOutbox = await this.outboxRepo.findOne({
        where: { id: params.outboxEventId },
      });
      if (existingOutbox?.status === OutboxStatus.PROCESSED) {
        const existingEmail = await this.emailEventRepo.findOne({
          where: { outboxEventId: existingOutbox.id },
          order: { createdAt: 'DESC' },
        });
        return {
          sent: true,
          status: existingEmail?.status ?? EmailStatus.SENT,
          emailEventId: existingEmail?.id ?? existingOutbox.id,
          providerMessageId: existingEmail?.providerMessageId ?? undefined,
        };
      }

      if (existingOutbox) {
        const claimed = await this.outboxRepo
          .createQueryBuilder()
          .update(OutboxEventEntity)
          .set({ status: OutboxStatus.PROCESSING })
          .where('id = :id', { id: existingOutbox.id })
          .andWhere('status IN (:...allowed)', {
            allowed: [OutboxStatus.PENDING, OutboxStatus.FAILED],
          })
          .execute();

        if ((claimed.affected ?? 0) === 0) {
          const existingEmail = await this.emailEventRepo.findOne({
            where: { outboxEventId: existingOutbox.id },
            order: { createdAt: 'DESC' },
          });
          return {
            sent: existingEmail?.status === EmailStatus.SENT || existingEmail?.status === EmailStatus.DELIVERED,
            status: existingEmail?.status ?? EmailStatus.QUEUED,
            emailEventId: existingEmail?.id ?? existingOutbox.id,
            providerMessageId: existingEmail?.providerMessageId ?? undefined,
            errorMessage:
              existingEmail?.errorMessage ??
              'Outbox event is already being processed or has been finalized',
          };
        }
      }
    }

    const event = await this.emailEventRepo.save(
      this.emailEventRepo.create({
        organizationId: params.organizationId,
        outboxEventId: params.outboxEventId ?? null,
        recipientEmail: params.recipientEmail,
        templateName: params.templateName,
        status: EmailStatus.QUEUED,
      }),
    );

    if (!this.resendClient) {
      const errorMessage =
        'RESEND_API_KEY is not configured; email could not be dispatched.';
      this.logger.warn(
        `Email '${params.templateName}' failed (${event.id}): missing RESEND_API_KEY`,
      );
      await this.emailEventRepo.update(
        { id: event.id },
        {
          status: EmailStatus.FAILED_MISSING_CREDENTIALS,
          errorMessage,
        },
      );
      await this.markOutboxOutcome(
        params.outboxEventId,
        OutboxStatus.FAILED,
        errorMessage,
      );
      return {
        sent: false,
        status: EmailStatus.FAILED_MISSING_CREDENTIALS,
        emailEventId: event.id,
        errorMessage,
      };
    }

    const from = this.resolveFromAddress();
    if (!from) {
      const errorMessage =
        'EMAIL_FROM or RESEND_FROM_EMAIL is not configured; sender address is required.';
      this.logger.warn(
        `Email '${params.templateName}' failed (${event.id}): missing sender address`,
      );
      await this.emailEventRepo.update(
        { id: event.id },
        {
          status: EmailStatus.FAILED_MISSING_CREDENTIALS,
          errorMessage,
        },
      );
      await this.markOutboxOutcome(
        params.outboxEventId,
        OutboxStatus.FAILED,
        errorMessage,
      );
      return {
        sent: false,
        status: EmailStatus.FAILED_MISSING_CREDENTIALS,
        emailEventId: event.id,
        errorMessage,
      };
    }

    try {
      const result = await this.resendClient.emails.send(
        {
          from,
          to: [params.recipientEmail],
          subject: params.rendered.subject,
          html: params.rendered.html,
          text: params.rendered.text,
        },
        params.idempotencyKey
          ? { idempotencyKey: params.idempotencyKey }
          : undefined,
      );

      if (result.error) {
        const msg = result.error.message || 'Resend API rejected email';
        this.logger.warn(
          `Resend rejected email '${params.templateName}' (${event.id}): ${msg}`,
        );
        await this.emailEventRepo.update(
          { id: event.id },
          {
            status: EmailStatus.FAILED,
            errorMessage: msg,
          },
        );
        await this.markOutboxOutcome(
          params.outboxEventId,
          OutboxStatus.FAILED,
          msg,
        );
        return {
          sent: false,
          status: EmailStatus.FAILED,
          emailEventId: event.id,
          errorMessage: msg,
        };
      }

      const providerMessageId = result.data?.id ?? null;
      await this.emailEventRepo.update(
        { id: event.id },
        {
          status: EmailStatus.SENT,
          providerMessageId,
          errorMessage: null,
        },
      );
      await this.markOutboxOutcome(
        params.outboxEventId,
        OutboxStatus.PROCESSED,
        null,
      );
      return {
        sent: true,
        status: EmailStatus.SENT,
        emailEventId: event.id,
        providerMessageId: providerMessageId ?? undefined,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unexpected Resend transport error';
      this.logger.warn(
        `Email transport error for '${params.templateName}' (${event.id}): ${message}`,
      );
      await this.emailEventRepo.update(
        { id: event.id },
        {
          status: EmailStatus.FAILED,
          errorMessage: message,
        },
      );
      await this.markOutboxOutcome(
        params.outboxEventId,
        OutboxStatus.FAILED,
        message,
      );
      return {
        sent: false,
        status: EmailStatus.FAILED,
        emailEventId: event.id,
        errorMessage: message,
      };
    }
  }

  async getLatestEmailDeliveryForAggregate(
    organizationId: string,
    aggregateType: string,
    aggregateId: string,
  ): Promise<EmailDeliverySummary | null> {
    const outbox = await this.outboxRepo.findOne({
      where: {
        organizationId,
        aggregateType,
        aggregateId,
      },
      order: { createdAt: 'DESC' },
    });

    if (!outbox) {
      return null;
    }

    const emailEvent = await this.emailEventRepo.findOne({
      where: {
        organizationId,
        outboxEventId: outbox.id,
      },
      order: { createdAt: 'DESC' },
    });

    if (!emailEvent) {
      const recipientEmail =
        typeof outbox.payload?.['recipientEmail'] === 'string'
          ? outbox.payload['recipientEmail']
          : '';
      const templateName =
        typeof outbox.payload?.['templateName'] === 'string'
          ? outbox.payload['templateName']
          : outbox.eventType;
      return {
        id: outbox.id,
        status:
          outbox.status === OutboxStatus.FAILED
            ? EmailStatus.FAILED
            : EmailStatus.QUEUED,
        recipientEmail,
        templateName,
        providerMessageId: null,
        errorMessage: outbox.lastError,
        createdAt: outbox.createdAt.toISOString(),
        updatedAt: outbox.createdAt.toISOString(),
      };
    }

    return {
      id: emailEvent.id,
      status: emailEvent.status,
      recipientEmail: emailEvent.recipientEmail,
      templateName: emailEvent.templateName,
      providerMessageId: emailEvent.providerMessageId,
      errorMessage: emailEvent.errorMessage,
      createdAt: emailEvent.createdAt.toISOString(),
      updatedAt: emailEvent.updatedAt.toISOString(),
    };
  }

  async handleResendWebhook(params: {
    rawBody: string;
    svixId?: string;
    svixTimestamp?: string;
    svixSignature?: string;
    payload: {
      type?: string;
      data?: {
        email_id?: string;
        bounce?: { message?: string };
      };
    };
  }): Promise<{ processed: boolean }> {
    const secret = this.configService
      .get<string>('RESEND_WEBHOOK_SECRET', '')
      .trim();
    if (!secret) {
      throw new UnauthorizedException('Resend webhook secret is not configured');
    }

    if (!params.svixId || !params.svixTimestamp || !params.svixSignature) {
      throw new UnauthorizedException('Missing webhook signature headers');
    }

    const timestampSeconds = Number(params.svixTimestamp);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(nowSeconds - timestampSeconds) > 300
    ) {
      throw new UnauthorizedException('Webhook timestamp out of tolerance');
    }

    const decodedSecret = secret.startsWith('whsec_')
      ? Buffer.from(secret.slice(6), 'base64')
      : Buffer.from(secret, 'utf8');
    const signedContent = `${params.svixId}.${params.svixTimestamp}.${params.rawBody}`;
    const expectedSig = crypto
      .createHmac('sha256', decodedSecret)
      .update(signedContent)
      .digest('base64');

    const candidateSignatures = params.svixSignature
      .split(' ')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => (entry.startsWith('v1,') ? entry.slice(3) : entry));

    const verified = candidateSignatures.some((sig) =>
      safeTimingCompare(sig, expectedSig),
    );
    if (!verified) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const emailId = params.payload.data?.email_id;
    const eventType = params.payload.type;
    if (!emailId || !eventType) {
      return { processed: false };
    }

    const statusMap: Record<string, EmailStatus> = {
      'email.sent': EmailStatus.SENT,
      'email.delivered': EmailStatus.DELIVERED,
      'email.bounced': EmailStatus.BOUNCED,
      'email.complained': EmailStatus.COMPLAINED,
      'email.failed': EmailStatus.FAILED,
      'email.delivery_delayed': EmailStatus.FAILED,
    };

    const nextStatus = statusMap[eventType];
    if (!nextStatus) {
      return { processed: false };
    }

    const existing = await this.emailEventRepo.findOne({
      where: { providerMessageId: emailId },
    });
    if (!existing) {
      return { processed: false };
    }

    await this.emailEventRepo.update(
      { id: existing.id },
      {
        status: nextStatus,
        errorMessage:
          nextStatus === EmailStatus.BOUNCED || nextStatus === EmailStatus.FAILED
            ? params.payload.data?.bounce?.message || `Resend event: ${eventType}`
            : existing.errorMessage,
        providerPayload: {
          type: eventType,
          receivedAt: new Date().toISOString(),
        },
      },
    );

    return { processed: true };
  }

  async retryDueOutboxEvents(maxAttempts = 5): Promise<number> {
    const now = new Date();
    const candidates = await this.outboxRepo
      .createQueryBuilder('o')
      .where('o.status IN (:...statuses)', {
        statuses: [OutboxStatus.PENDING, OutboxStatus.FAILED],
      })
      .andWhere('o.attempts < :maxAttempts', { maxAttempts })
      .andWhere('o.next_attempt_at <= :now', { now })
      .orderBy('o.next_attempt_at', 'ASC')
      .take(25)
      .getMany();

    let retried = 0;
    for (const outbox of candidates) {
      const renderedCandidate = outbox.payload?.['renderedEmail'] as
        | Partial<RenderedEmail>
        | undefined;
      const recipientEmail =
        typeof outbox.payload?.['recipientEmail'] === 'string'
          ? outbox.payload['recipientEmail']
          : '';
      const templateName =
        typeof outbox.payload?.['templateName'] === 'string'
          ? outbox.payload['templateName']
          : outbox.eventType;

      // Secret-link emails intentionally omit renderedEmail from outbox payloads so raw tokens are never stored
      if (
        !recipientEmail ||
        !renderedCandidate ||
        typeof renderedCandidate.subject !== 'string' ||
        typeof renderedCandidate.html !== 'string' ||
        typeof renderedCandidate.text !== 'string'
      ) {
        continue;
      }

      const res = await this.dispatchEmail({
        organizationId: outbox.organizationId,
        outboxEventId: outbox.id,
        recipientEmail,
        templateName,
        rendered: {
          subject: renderedCandidate.subject,
          html: renderedCandidate.html,
          text: renderedCandidate.text,
        },
        idempotencyKey: outbox.idempotencyKey,
      });

      if (res.sent) {
        retried += 1;
      }
    }

    return retried;
  }

  getTemplates(): EmailTemplatesService {
    return this.templates;
  }

  private async markOutboxOutcome(
    outboxEventId: string | null | undefined,
    status: OutboxStatus,
    errorMessage: string | null,
  ): Promise<void> {
    if (!outboxEventId) return;
    const existing = await this.outboxRepo.findOne({
      where: { id: outboxEventId },
    });
    if (!existing) return;

    const nextAttempts = existing.attempts + 1;
    const backoffMs = Math.min(
      60 * 60_000,
      30_000 * Math.pow(2, existing.attempts),
    );

    await this.outboxRepo.update(
      { id: existing.id },
      {
        status,
        attempts: nextAttempts,
        lastError: errorMessage,
        processedAt: status === OutboxStatus.PROCESSED ? new Date() : null,
        ...(status === OutboxStatus.FAILED
          ? { nextAttemptAt: new Date(Date.now() + backoffMs) }
          : {}),
      },
    );
  }
}
