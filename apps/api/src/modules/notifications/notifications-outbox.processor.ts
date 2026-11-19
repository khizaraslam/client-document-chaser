import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { NotificationsService } from './notifications.service';

@Processor('notifications')
export class NotificationsOutboxProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(NotificationsOutboxProcessor.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectQueue('notifications')
    private readonly notificationsQueue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.notificationsQueue.upsertJobScheduler(
        'notifications-outbox-retry',
        { every: 120_000 },
        {
          name: 'retry-due-outbox',
          opts: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 50,
            removeOnFail: 50,
          },
        },
      );
    } catch (error) {
      this.logger.warn(
        `Unable to register repeatable notifications outbox scheduler: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async process(job: Job): Promise<{ retried: number }> {
    this.logger.debug(`Processing notifications outbox job ${job.id}`);
    const retried = await this.notificationsService.retryDueOutboxEvents();
    return { retried };
  }
}
