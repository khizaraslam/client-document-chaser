import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationEntity } from '../../database/entities/organization.entity';
import { AuditModule } from '../audit/audit.module';
import { PlansModule } from '../plans/plans.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationEntity]),
    PlansModule,
    AuditModule,
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
