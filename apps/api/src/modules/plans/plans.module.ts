import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationSubscriptionEntity } from '../../database/entities/organization-subscription.entity';
import { PlanEntity } from '../../database/entities/plan.entity';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlanEntity, OrganizationSubscriptionEntity])],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
