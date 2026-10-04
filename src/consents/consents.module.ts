import { Module } from '@nestjs/common';
import { ConsentsService } from './consents.service';
import { ConsentsController } from './consents.controller';
import { ConsentExpirySchedulerService } from './consent-expiry-scheduler.service';
import { DatabaseModule } from '../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    NotificationsModule,
    CommonModule,
  ],
  controllers: [ConsentsController],
  providers: [ConsentsService, ConsentExpirySchedulerService],
  exports: [ConsentsService, ConsentExpirySchedulerService],
})
export class ConsentsModule {}
