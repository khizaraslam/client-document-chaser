import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecurrenceEntity } from '../../database/entities/recurrence.entity';
import { TemplateItemEntity } from '../../database/entities/template-item.entity';
import { TemplateEntity } from '../../database/entities/template.entity';
import { AuditModule } from '../audit/audit.module';
import { PlansModule } from '../plans/plans.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TemplateEntity,
      TemplateItemEntity,
      RecurrenceEntity,
    ]),
    PlansModule,
    AuditModule,
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
