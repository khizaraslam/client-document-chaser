import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientContactEntity } from '../../database/entities/client-contact.entity';
import { ClientEntity } from '../../database/entities/client.entity';
import { DocumentRequestEntity } from '../../database/entities/document-request.entity';
import { MembershipEntity } from '../../database/entities/membership.entity';
import { AuditModule } from '../audit/audit.module';
import { PlansModule } from '../plans/plans.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientEntity,
      ClientContactEntity,
      MembershipEntity,
      DocumentRequestEntity,
    ]),
    PlansModule,
    AuditModule,
  ],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
