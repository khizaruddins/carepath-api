import { Injectable } from '@nestjs/common';
import { HealthcareTimelineService } from './healthcare-timeline.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TimelineEventResolverService } from './timeline-event-resolver.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TimelineEventType } from '@prisma/client';

@Injectable()
export class TimelineService extends HealthcareTimelineService {
  constructor(
    prisma: PrismaService,
    auditService: AuditService,
    resolverService: TimelineEventResolverService,
  ) {
    super(prisma, auditService, resolverService);
  }

  /**
   * Backward-compatible helper for legacy M1 callers
   */
  async getTimeline(
    user: AuthenticatedUser,
    limit = 50,
    offset = 0,
    eventType?: TimelineEventType,
  ) {
    return this.getPatientTimeline(
      user.id,
      {
        limit,
        eventType,
      },
      user,
    );
  }
}
