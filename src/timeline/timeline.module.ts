import { Module } from '@nestjs/common';
import { HealthcareTimelineService } from './healthcare-timeline.service';
import { TimelineService } from './timeline.service';
import { TimelineEventResolverService } from './timeline-event-resolver.service';
import { TimelineController, PatientTimelineController } from './timeline.controller';
import { DatabaseModule } from '../database/database.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [TimelineController, PatientTimelineController],
  providers: [
    HealthcareTimelineService,
    TimelineService,
    TimelineEventResolverService,
  ],
  exports: [
    HealthcareTimelineService,
    TimelineService,
    TimelineEventResolverService,
  ],
})
export class TimelineModule {}
