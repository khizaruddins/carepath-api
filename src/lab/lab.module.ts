import { Module } from '@nestjs/common';
import { LabService } from './lab.service';
import { LabMarketplaceService } from './lab-marketplace.service';
import { LabCareConnectionService } from './lab-care-connection.service';
import { LabController } from './lab.controller';
import { DatabaseModule } from '../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    NotificationsModule,
    TimelineModule,
  ],
  controllers: [LabController],
  providers: [
    LabService,
    LabMarketplaceService,
    LabCareConnectionService,
  ],
  exports: [
    LabService,
    LabMarketplaceService,
    LabCareConnectionService,
  ],
})
export class LabModule {}

