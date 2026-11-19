import {
  AuthSubscriptionSummary,
  PlanCode,
  PlanSummary,
  SubscriptionStatus,
} from '@cdc/contracts';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OrganizationSubscriptionEntity } from '../../database/entities/organization-subscription.entity';
import { PlanEntity } from '../../database/entities/plan.entity';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(PlanEntity)
    private readonly planRepo: Repository<PlanEntity>,
    @InjectRepository(OrganizationSubscriptionEntity)
    private readonly subscriptionRepo: Repository<OrganizationSubscriptionEntity>,
    private readonly configService: ConfigService,
  ) {}

  async listPlans(): Promise<PlanSummary[]> {
    const plans = await this.planRepo.find({
      order: { monthlyPriceCents: 'ASC' },
    });

    return plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      monthlyPriceCents: plan.monthlyPriceCents,
      maxActiveClients: plan.maxActiveClients,
      maxTeamSeats: plan.maxTeamSeats,
      maxStorageBytes: Number(plan.maxStorageBytes),
      maxEmailsPerMonth: plan.maxEmailsPerMonth,
    }));
  }

  async ensureDefaultPlans(manager?: EntityManager): Promise<PlanEntity> {
    const repo = manager ? manager.getRepository(PlanEntity) : this.planRepo;
    let starter = await repo.findOne({ where: { code: PlanCode.STARTER } });
    if (!starter) {
      starter = await repo.save(
        repo.create({
          code: PlanCode.STARTER,
          name: 'Starter',
          monthlyPriceCents: 1900,
          maxActiveClients: 50,
          maxTeamSeats: 5,
          maxStorageBytes: String(10 * 1024 * 1024 * 1024),
          maxEmailsPerMonth: 2500,
        }),
      );
    }

    const pro = await repo.findOne({ where: { code: PlanCode.PROFESSIONAL } });
    if (!pro) {
      await repo.save(
        repo.create({
          code: PlanCode.PROFESSIONAL,
          name: 'Professional',
          monthlyPriceCents: 3900,
          maxActiveClients: 250,
          maxTeamSeats: 25,
          maxStorageBytes: String(100 * 1024 * 1024 * 1024),
          maxEmailsPerMonth: 15000,
        }),
      );
    }

    return starter;
  }

  async initializeTrialSubscription(
    organizationId: string,
    manager: EntityManager,
  ): Promise<OrganizationSubscriptionEntity> {
    const starterPlan = await this.ensureDefaultPlans(manager);
    const subRepo = manager.getRepository(OrganizationSubscriptionEntity);
    const trialDays = this.configService.get<number>('TRIAL_DAYS', 14);
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + trialDays * 86_400_000);
    const periodResetAt = new Date(now.getTime() + 30 * 86_400_000);

    const subscription = subRepo.create({
      organizationId,
      planId: starterPlan.id,
      status: SubscriptionStatus.TRIALING,
      trialStartsAt: now,
      trialEndsAt,
      activeClientsCount: 0,
      storageBytesUsed: '0',
      emailsSentThisPeriod: 0,
      periodResetAt,
    });

    return subRepo.save(subscription);
  }

  async getSubscriptionSummary(
    organizationId: string,
  ): Promise<AuthSubscriptionSummary> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { organizationId },
      relations: { plan: true },
    });

    if (!subscription || !subscription.plan) {
      throw new NotFoundException('Organization subscription not found');
    }

    const now = new Date();
    const trialExpired =
      subscription.status === SubscriptionStatus.TRIALING &&
      now.getTime() > subscription.trialEndsAt.getTime();
    const readOnlyEnabled = this.configService.get<boolean>(
      'TRIAL_EXPIRED_READ_ONLY',
      true,
    );
    const effectiveStatus = trialExpired
      ? SubscriptionStatus.TRIAL_EXPIRED
      : subscription.status;

    const isReadOnly =
      effectiveStatus === SubscriptionStatus.READ_ONLY ||
      (effectiveStatus === SubscriptionStatus.TRIAL_EXPIRED && readOnlyEnabled);

    return {
      planCode: subscription.plan.code,
      planName: subscription.plan.name,
      status: effectiveStatus,
      trialStartsAt: subscription.trialStartsAt.toISOString(),
      trialEndsAt: subscription.trialEndsAt.toISOString(),
      isReadOnly,
      maxActiveClients: subscription.plan.maxActiveClients,
      maxTeamSeats: subscription.plan.maxTeamSeats,
      maxStorageBytes: Number(subscription.plan.maxStorageBytes),
      maxEmailsPerMonth: subscription.plan.maxEmailsPerMonth,
      activeClientsCount: subscription.activeClientsCount,
      storageBytesUsed: Number(subscription.storageBytesUsed),
      emailsSentThisPeriod: subscription.emailsSentThisPeriod,
    };
  }
}
