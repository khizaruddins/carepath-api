import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TimelineEventResolverService } from './timeline-event-resolver.service';
import { QueryTimelineDto } from './dto/query-timeline.dto';
import { TimelineResponseDto, TimelineEventItemDto } from './dto/timeline-response.dto';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import {
  TimelineEventType,
  TimelineSourceType,
  TimelineDatePrecision,
  TimelineVisibility,
  ConsentResourceType,
  ConsentStatus,
  Role,
  AuditAction,
  AuditResult,
  DocumentCategory,
} from '@prisma/client';

interface CursorPayload {
  eventDate: string;
  id: string;
}

@Injectable()
export class HealthcareTimelineService implements OnModuleInit {
  private readonly logger = new Logger(HealthcareTimelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly resolverService: TimelineEventResolverService,
  ) {}

  /**
   * On application startup, safely backfill any historical M1/M2/M3 clinical data
   */
  async onModuleInit() {
    try {
      this.logger.log('Starting idempotent healthcare timeline backfill...');
      const count = await this.backfillTimeline();
      this.logger.log(`Healthcare timeline projection initialized (${count} events projected).`);
    } catch (err: any) {
      this.logger.warn(`Timeline backfill deferred or error: ${err.message}`);
    }
  }

  // -------------------------------------------------------------
  // 1. Projections & Idempotent Upserts
  // -------------------------------------------------------------

  /**
   * Project a medical document into the timeline
   */
  async projectDocument(documentId: string): Promise<void> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { metadata: true },
    });

    if (!document || document.isArchived) return;

    const metadata = document.metadata;
    const eventDate = metadata?.documentDate || document.createdAt;
    const datePrecision = metadata?.documentDate
      ? TimelineDatePrecision.DAY
      : TimelineDatePrecision.EXACT;

    const categoryLabel = this.formatCategoryLabel(document.category);
    const title = metadata?.reportTitle || `${categoryLabel} Document`;
    const facilityInfo = metadata?.facility ? ` at ${metadata.facility}` : '';
    const summary = `${categoryLabel} record${facilityInfo}.${
      metadata?.providerName ? ` Provider: ${metadata.providerName}.` : ''
    }`;

    await this.upsertEvent({
      patientId: document.patientId,
      eventType: this.mapCategoryToEventType(document.category),
      eventDate,
      datePrecision,
      title,
      summary,
      sourceType: TimelineSourceType.DOCUMENT,
      sourceId: document.id,
      documentId: document.id,
      providerName: metadata?.providerName || null,
      visibility: TimelineVisibility.SHARED,
      metadata: {
        category: document.category,
        facility: metadata?.facility || null,
        ocrStatus: metadata?.ocrStatus || null,
      },
    });
  }

  /**
   * Project a clinical consultation into the timeline
   */
  async projectConsultation(consultationId: string): Promise<void> {
    const consult = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: { select: { fullName: true, specialization: true } },
          },
        },
      },
    });

    if (!consult) return;

    const doctorName = consult.doctor.doctorProfile?.fullName || consult.doctor.email;
    const specialty = consult.doctor.doctorProfile?.specialization;
    const title = `Consultation: ${consult.reasonForVisit}`;
    const summary = `Clinical visit with ${doctorName}${specialty ? ` (${specialty})` : ''}. Assessment and care plan documented.`;

    await this.upsertEvent({
      patientId: consult.patientId,
      eventType: TimelineEventType.CONSULTATION,
      eventDate: consult.consultationDate,
      datePrecision: TimelineDatePrecision.EXACT,
      title,
      summary,
      sourceType: TimelineSourceType.CONSULTATION,
      sourceId: consult.id,
      providerId: consult.doctorId,
      providerName: doctorName,
      visibility: TimelineVisibility.SHARED,
      metadata: {
        reasonForVisit: consult.reasonForVisit,
        hasFollowUp: !!consult.followUpDate,
      },
    });
  }

  /**
   * Project a prescription into the timeline
   */
  async projectPrescription(prescriptionId: string): Promise<void> {
    const rx = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        items: true,
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: { select: { fullName: true } },
          },
        },
      },
    });

    if (!rx) return;

    const doctorName = rx.doctor.doctorProfile?.fullName || rx.doctor.email;
    const count = rx.items.length;
    const medSummary = rx.items.slice(0, 3).map((i) => i.medicineName).join(', ');
    const title = `Prescription Issued (${count} medication${count === 1 ? '' : 's'})`;
    const summary = `Medication order issued by ${doctorName}: ${medSummary}${count > 3 ? '...' : ''}.`;

    await this.upsertEvent({
      patientId: rx.patientId,
      eventType: TimelineEventType.PRESCRIPTION,
      eventDate: rx.prescriptionDate,
      datePrecision: TimelineDatePrecision.EXACT,
      title,
      summary,
      sourceType: TimelineSourceType.PRESCRIPTION,
      sourceId: rx.id,
      providerId: rx.doctorId,
      providerName: doctorName,
      visibility: TimelineVisibility.SHARED,
      metadata: {
        itemCount: count,
        consultationId: rx.consultationId || null,
      },
    });
  }

  /**
   * Project an investigation request into the timeline
   */
  async projectInvestigation(investigationId: string): Promise<void> {
    const inv = await this.prisma.investigationRequest.findUnique({
      where: { id: investigationId },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: { select: { fullName: true } },
          },
        },
      },
    });

    if (!inv) return;

    const doctorName = inv.doctor.doctorProfile?.fullName || inv.doctor.email;
    const title = `Investigation Ordered: ${inv.investigationName}`;
    const summary = `${inv.category} diagnostic ordered by ${doctorName} with ${inv.priority.toLowerCase()} priority.`;

    await this.upsertEvent({
      patientId: inv.patientId,
      eventType: TimelineEventType.INVESTIGATION,
      eventDate: inv.requestedDate,
      datePrecision: TimelineDatePrecision.EXACT,
      title,
      summary,
      sourceType: TimelineSourceType.INVESTIGATION,
      sourceId: inv.id,
      providerId: inv.doctorId,
      providerName: doctorName,
      visibility: TimelineVisibility.SHARED,
      metadata: {
        category: inv.category,
        priority: inv.priority,
        status: inv.status,
      },
    });
  }

  /**
   * Project a clinical referral into the timeline
   */
  async projectReferral(referralId: string): Promise<void> {
    const ref = await this.prisma.referral.findUnique({
      where: { id: referralId },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: { select: { fullName: true } },
          },
        },
      },
    });

    if (!ref) return;

    const doctorName = ref.doctor.doctorProfile?.fullName || ref.doctor.email;
    const title = `Referral to ${ref.specialty}`;
    const summary = `Specialist referral initiated by ${doctorName}. Target: ${ref.referredProvider || ref.specialty}.`;

    await this.upsertEvent({
      patientId: ref.patientId,
      eventType: TimelineEventType.REFERRAL,
      eventDate: ref.referralDate,
      datePrecision: TimelineDatePrecision.EXACT,
      title,
      summary,
      sourceType: TimelineSourceType.REFERRAL,
      sourceId: ref.id,
      providerId: ref.doctorId,
      providerName: doctorName,
      visibility: TimelineVisibility.SHARED,
      metadata: {
        specialty: ref.specialty,
        priority: ref.priority,
        status: ref.status,
      },
    });
  }

  /**
   * Project a scheduled follow-up into the timeline
   */
  async projectFollowUp(followUpId: string): Promise<void> {
    const fu = await this.prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: { select: { fullName: true } },
          },
        },
      },
    });

    if (!fu) return;

    const doctorName = fu.doctor.doctorProfile?.fullName || fu.doctor.email;
    const title = `Follow-Up Scheduled: ${fu.reason}`;
    const summary = `Clinical follow-up scheduled with ${doctorName}. Current status: ${fu.status}.`;

    await this.upsertEvent({
      patientId: fu.patientId,
      eventType: TimelineEventType.FOLLOW_UP,
      eventDate: fu.dueDate,
      datePrecision: TimelineDatePrecision.EXACT,
      title,
      summary,
      sourceType: TimelineSourceType.FOLLOW_UP,
      sourceId: fu.id,
      providerId: fu.doctorId,
      providerName: doctorName,
      visibility: TimelineVisibility.SHARED,
      metadata: {
        status: fu.status,
        reason: fu.reason,
      },
    });
  }

  /**
   * Project a lab order / diagnostic booking into the timeline
   */
  async projectLabOrder(orderId: string): Promise<void> {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: orderId },
      include: {
        lab: true,
        items: true,
        prescribedDoctor: {
          include: { doctorProfile: { select: { fullName: true } } },
        },
      },
    });

    if (!order) return;

    const testNames = order.items.map((i: any) => i.testName).join(', ');
    const title = `Lab Order Placed: ${order.orderNumber}`;
    const summary = `Diagnostic order for ${testNames} placed with ${order.lab.name}. Mode: ${order.collectionMode}. Priority: ${order.priority}.`;

    await this.upsertEvent({
      patientId: order.patientId,
      eventType: TimelineEventType.LAB_ORDER_PLACED,
      eventDate: order.createdAt,
      datePrecision: TimelineDatePrecision.EXACT,
      title,
      summary,
      sourceType: TimelineSourceType.OTHER,
      sourceId: order.id,
      providerId: order.prescribedDoctorId || undefined,
      providerName: order.prescribedDoctor?.doctorProfile?.fullName || order.lab.name,
      visibility: TimelineVisibility.SHARED,
      metadata: {
        orderNumber: order.orderNumber,
        labId: order.labId,
        labName: order.lab.name,
        collectionMode: order.collectionMode,
        status: order.status,
      },
    });
  }

  /**
   * Project a finalized or amended lab report into the timeline
   */
  async projectLabReport(reportId: string): Promise<void> {
    const report = await this.prisma.labReport.findUnique({
      where: { id: reportId },
      include: {
        order: {
          include: {
            lab: true,
            items: true,
            prescribedDoctor: {
              include: { doctorProfile: { select: { fullName: true } } },
            },
          },
        },
      },
    });

    if (!report || (report.status !== 'FINALIZED' && report.status !== 'AMENDED')) return;

    const labName = report.order.lab.name;
    const testNames = report.order.items.map((i) => i.testName).join(', ') || 'Diagnostic Panel';
    const isAmended = report.status === 'AMENDED' || report.isAmended;
    const title = isAmended
      ? `Amended Lab Report: ${testNames}`
      : `Lab Report: ${testNames}`;
    const doctorRef = report.order.prescribedDoctor
      ? ` Requested by Dr. ${report.order.prescribedDoctor.doctorProfile?.fullName || report.order.prescribedDoctor.email}.`
      : '';
    const summary = `${isAmended ? 'Amended diagnostic' : 'Diagnostic'} test panel finalized by ${labName}.${doctorRef} ${report.testSummary || ''}`.trim();

    await this.upsertEvent({
      patientId: report.order.patientId,
      eventType: TimelineEventType.LAB_RESULT,
      eventDate: report.finalizedAt || report.createdAt,
      datePrecision: TimelineDatePrecision.EXACT,
      title,
      summary,
      sourceType: TimelineSourceType.LAB_RESULT,
      sourceId: report.id,
      documentId: report.documentId,
      providerId: report.order.prescribedDoctorId || null,
      providerName: labName,
      visibility: TimelineVisibility.SHARED,
      metadata: {
        reportNumber: report.reportNumber,
        orderNumber: report.order.orderNumber,
        labName,
        isAmended,
        status: report.status,
      },
    });
  }

  /**
   * Generic idempotent upsert with uniqueness constraint
   */
  private async upsertEvent(data: {
    patientId: string;
    eventType: TimelineEventType;
    eventDate: Date;
    datePrecision: TimelineDatePrecision;
    title: string;
    summary?: string | null;
    sourceType: TimelineSourceType;
    sourceId: string;
    documentId?: string | null;
    providerId?: string | null;
    providerName?: string | null;
    visibility: TimelineVisibility;
    metadata?: Record<string, any>;
  }) {
    await this.prisma.healthTimelineEvent.upsert({
      where: {
        patientId_sourceType_sourceId: {
          patientId: data.patientId,
          sourceType: data.sourceType,
          sourceId: data.sourceId,
        },
      },
      update: {
        eventType: data.eventType,
        eventDate: data.eventDate,
        datePrecision: data.datePrecision,
        title: data.title,
        summary: data.summary,
        documentId: data.documentId,
        providerId: data.providerId,
        providerName: data.providerName,
        visibility: data.visibility,
        metadata: data.metadata,
      },
      create: {
        patientId: data.patientId,
        eventType: data.eventType,
        eventDate: data.eventDate,
        datePrecision: data.datePrecision,
        title: data.title,
        summary: data.summary,
        description: data.summary, // preserve backwards compatibility
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        documentId: data.documentId,
        providerId: data.providerId,
        providerName: data.providerName,
        visibility: data.visibility,
        metadata: data.metadata,
      },
    });
  }

  /**
   * Handle deletion / archive of a source record
   */
  async handleSourceDeletion(sourceType: TimelineSourceType, sourceId: string) {
    try {
      await this.prisma.healthTimelineEvent.deleteMany({
        where: {
          sourceType,
          sourceId,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to remove timeline projection for ${sourceType}:${sourceId}: ${err.message}`);
    }
  }

  // -------------------------------------------------------------
  // 2. Data Backfill & Reconciliation
  // -------------------------------------------------------------

  /**
   * Idempotently backfills all existing clinical records into timeline projections
   */
  async backfillTimeline(patientId?: string): Promise<number> {
    let projectedCount = 0;
    const filter = patientId ? { patientId } : {};

    // 1. Documents
    const documents = await this.prisma.document.findMany({
      where: { ...filter, isArchived: false },
      select: { id: true },
    });
    for (const doc of documents) {
      await this.projectDocument(doc.id);
      projectedCount++;
    }

    // 2. Consultations
    const consultations = await this.prisma.consultation.findMany({
      where: filter,
      select: { id: true },
    });
    for (const c of consultations) {
      await this.projectConsultation(c.id);
      projectedCount++;
    }

    // 3. Prescriptions
    const prescriptions = await this.prisma.prescription.findMany({
      where: filter,
      select: { id: true },
    });
    for (const p of prescriptions) {
      await this.projectPrescription(p.id);
      projectedCount++;
    }

    // 4. Investigations
    const investigations = await this.prisma.investigationRequest.findMany({
      where: filter,
      select: { id: true },
    });
    for (const inv of investigations) {
      await this.projectInvestigation(inv.id);
      projectedCount++;
    }

    // 5. Referrals
    const referrals = await this.prisma.referral.findMany({
      where: filter,
      select: { id: true },
    });
    for (const ref of referrals) {
      await this.projectReferral(ref.id);
      projectedCount++;
    }

    // 6. Follow-ups
    const followUps = await this.prisma.followUp.findMany({
      where: filter,
      select: { id: true },
    });
    for (const fu of followUps) {
      await this.projectFollowUp(fu.id);
      projectedCount++;
    }

    // 7. Lab Reports
    if (this.prisma.labReport?.findMany) {
      const labReports = await this.prisma.labReport.findMany({
        where: {
          ...(patientId ? { order: { patientId } } : {}),
          status: { in: ['FINALIZED', 'AMENDED'] },
        },
        select: { id: true },
      });
      for (const lr of labReports) {
        await this.projectLabReport(lr.id);
        projectedCount++;
      }
    }

    return projectedCount;
  }

  // -------------------------------------------------------------
  // 3. Timeline Query API with M3 Authorization & Cursor Pagination
  // -------------------------------------------------------------

  /**
   * Queries patient longitudinal timeline with authorization filtering and cursor pagination
   */
  async getPatientTimeline(
    targetPatientId: string,
    query: QueryTimelineDto,
    actor: AuthenticatedUser,
    ip?: string,
    userAgent?: string,
  ): Promise<TimelineResponseDto> {
    // 1. Authorization Verification
    await this.assertTimelineAccess(targetPatientId, actor, ip, userAgent);

    // 2. Build Base Filter
    const where: any = {
      patientId: targetPatientId,
    };

    // Date range filters
    if (query.from || query.to) {
      where.eventDate = {};
      if (query.from) where.eventDate.gte = new Date(query.from);
      if (query.to) where.eventDate.lte = new Date(query.to);
    }

    // Event type filter
    if (query.eventType) {
      where.eventType = query.eventType;
    }

    // Source type filter
    if (query.sourceType) {
      where.sourceType = query.sourceType;
    }

    // Provider filter
    if (query.providerId) {
      where.providerId = query.providerId;
    }

    // Text search (deterministic)
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { summary: { contains: term, mode: 'insensitive' } },
        { providerName: { contains: term, mode: 'insensitive' } },
      ];
    }

    // 3. Clinician Consent-Based Resource Filtering (Section 18)
    if (actor.role === Role.DOCTOR) {
      const permittedScopeFilters = await this.getClinicianAuthorizedScopes(
        actor.id,
        targetPatientId,
      );

      // If clinician has no active consent or empty scopes, return empty
      if (!permittedScopeFilters) {
        return { items: [], nextCursor: null, hasMore: false, total: 0 };
      }

      // Merge scope filters with existing where clause
      if (permittedScopeFilters.length > 0) {
        if (where.OR) {
          where.AND = [{ OR: where.OR }, { OR: permittedScopeFilters }];
          delete where.OR;
        } else {
          where.OR = permittedScopeFilters;
        }
      }
    }

    // 4. Cursor Pagination Logic
    const limit = Math.min(query.limit || 50, 100);
    const sortOrder = query.sortOrder || 'desc';

    if (query.cursor) {
      const decodedCursor = this.decodeCursor(query.cursor);
      if (decodedCursor) {
        const cursorDate = new Date(decodedCursor.eventDate);
        if (sortOrder === 'desc') {
          where.AND = where.AND || [];
          where.AND.push({
            OR: [
              { eventDate: { lt: cursorDate } },
              { eventDate: cursorDate, id: { lt: decodedCursor.id } },
            ],
          });
        } else {
          where.AND = where.AND || [];
          where.AND.push({
            OR: [
              { eventDate: { gt: cursorDate } },
              { eventDate: cursorDate, id: { gt: decodedCursor.id } },
            ],
          });
        }
      }
    }

    const [total, rawEvents] = await Promise.all([
      this.prisma.healthTimelineEvent.count({ where: { patientId: targetPatientId } }),
      this.prisma.healthTimelineEvent.findMany({
        where,
        orderBy: [
          { eventDate: sortOrder },
          { id: sortOrder },
        ],
        take: limit + 1,
      }),
    ]);

    const hasMore = rawEvents.length > limit;
    const pagedEvents = hasMore ? rawEvents.slice(0, limit) : rawEvents;

    let nextCursor: string | null = null;
    if (hasMore && pagedEvents.length > 0) {
      const lastEvent = pagedEvents[pagedEvents.length - 1];
      nextCursor = this.encodeCursor({
        eventDate: lastEvent.eventDate.toISOString(),
        id: lastEvent.id,
      });
    }

    // Format projection items
    const items: TimelineEventItemDto[] = pagedEvents.map((event) => {
      const date = event.eventDate;
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const monthLabel = date.toLocaleString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
      const dayLabel = date.toISOString().split('T')[0];

      return {
        id: event.id,
        patientId: event.patientId,
        eventType: event.eventType,
        eventDate: event.eventDate,
        datePrecision: event.datePrecision,
        title: event.title,
        summary: event.summary || event.description,
        source: {
          type: event.sourceType,
          id: event.sourceId || event.id,
        },
        providerId: event.providerId,
        providerName: event.providerName,
        visibility: event.visibility,
        grouping: {
          year,
          month,
          monthLabel,
          dayLabel,
        },
        metadata: event.metadata as Record<string, any> | null,
        createdAt: event.createdAt,
      };
    });

    // Audit timeline view
    await this.auditService.log({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: AuditAction.VIEW_TIMELINE,
      resourceType: 'TIMELINE',
      resourceId: targetPatientId,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        patientId: targetPatientId,
        eventCount: items.length,
        hasMore,
      },
    });

    return {
      items,
      nextCursor,
      hasMore,
      total,
    };
  }

  /**
   * Retrieves single timeline event with permitted source details
   */
  async getTimelineEventDetails(
    eventId: string,
    actor: AuthenticatedUser,
    ip?: string,
    userAgent?: string,
  ) {
    const event = await this.prisma.healthTimelineEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Timeline event not found');
    }

    // Check authorization for the event
    await this.assertTimelineAccess(event.patientId, actor, ip, userAgent);

    // If actor is clinician, assert that active consent covers this specific event
    if (actor.role === Role.DOCTOR) {
      const isAllowed = await this.assertClinicianCanViewEvent(actor.id, event);
      if (!isAllowed) {
        throw new ForbiddenException(
          'Access denied: This timeline event is outside your active consent authorization scope',
        );
      }
    }

    // Resolve permitted source details
    const resolvedSource = await this.resolverService.resolveSource(
      event.sourceType,
      event.sourceId || event.id,
    );

    // Audit log
    await this.auditService.log({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: AuditAction.VIEW_TIMELINE_EVENT,
      resourceType: 'TIMELINE_EVENT',
      resourceId: event.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        patientId: event.patientId,
        eventType: event.eventType,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
      },
    });

    return {
      event,
      resolvedSource,
    };
  }

  // -------------------------------------------------------------
  // 4. Internal Authorization & Scope Filtering Helpers
  // -------------------------------------------------------------

  private async assertTimelineAccess(
    patientId: string,
    actor: AuthenticatedUser,
    ip?: string,
    userAgent?: string,
  ) {
    // 1. Patient self-access
    if (actor.role === Role.PATIENT) {
      if (actor.id !== patientId) {
        await this.auditService.log({
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          action: AuditAction.SECURITY_EVENT,
          resourceType: 'TIMELINE',
          resourceId: patientId,
          result: AuditResult.DENIED,
          ipAddress: ip,
          userAgent,
          details: { error: 'CROSS_PATIENT_TIMELINE_ACCESS_ATTEMPT' },
        });
        throw new ForbiddenException(
          'Access denied: You cannot view medical timeline records belonging to another patient',
        );
      }
      return;
    }

    // 2. Doctor access requires established relationship
    if (actor.role === Role.DOCTOR) {
      const relationship = await this.prisma.doctorPatientAccess.findFirst({
        where: {
          doctorId: actor.id,
          patientId,
          status: 'APPROVED',
        },
      });

      if (!relationship) {
        await this.auditService.log({
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          action: AuditAction.SECURITY_EVENT,
          resourceType: 'TIMELINE',
          resourceId: patientId,
          result: AuditResult.DENIED,
          ipAddress: ip,
          userAgent,
          details: { error: 'NO_CLINICAL_RELATIONSHIP' },
        });
        throw new ForbiddenException(
          'Access denied: You do not have an active clinical relationship with this patient',
        );
      }
      return;
    }

    // 3. Admin access
    if (actor.role === Role.ADMIN) {
      return;
    }

    throw new ForbiddenException('Access denied');
  }

  /**
   * Builds SQL OR-clauses based on the clinician's active M3 consent scopes
   */
  private async getClinicianAuthorizedScopes(
    doctorId: string,
    patientId: string,
  ): Promise<any[] | null> {
    const now = new Date();
    const activeConsents = await this.prisma.consent.findMany({
      where: {
        patientId,
        requesterId: doctorId,
        status: ConsentStatus.APPROVED,
        expiresAt: { gt: now },
      },
      include: { scopes: true },
    });

    if (!activeConsents || activeConsents.length === 0) {
      return null;
    }

    const scopeFilters: any[] = [];
    let hasFullTimelineScope = false;

    for (const consent of activeConsents) {
      for (const scope of consent.scopes) {
        if (scope.resourceType === ConsentResourceType.TIMELINE) {
          hasFullTimelineScope = true;
          break;
        }

        switch (scope.resourceType) {
          case ConsentResourceType.DOCUMENT:
            if (scope.resourceId) {
              scopeFilters.push({
                sourceType: TimelineSourceType.DOCUMENT,
                sourceId: scope.resourceId,
              });
            } else if (scope.resourceCategory) {
              scopeFilters.push({
                sourceType: TimelineSourceType.DOCUMENT,
                metadata: { path: ['category'], equals: scope.resourceCategory },
              });
            } else {
              scopeFilters.push({ sourceType: TimelineSourceType.DOCUMENT });
            }
            break;

          case ConsentResourceType.CONSULTATION:
            scopeFilters.push({ sourceType: TimelineSourceType.CONSULTATION });
            break;

          case ConsentResourceType.PRESCRIPTION:
            scopeFilters.push({ sourceType: TimelineSourceType.PRESCRIPTION });
            break;

          case ConsentResourceType.INVESTIGATION:
            scopeFilters.push({ sourceType: TimelineSourceType.INVESTIGATION });
            break;

          case ConsentResourceType.REFERRAL:
            scopeFilters.push({ sourceType: TimelineSourceType.REFERRAL });
            break;

          case ConsentResourceType.FOLLOW_UP:
            scopeFilters.push({ sourceType: TimelineSourceType.FOLLOW_UP });
            break;
        }
      }

      if (hasFullTimelineScope) break;
    }

    if (hasFullTimelineScope) {
      return []; // empty array means no restrictive filter needed, can view all
    }

    return scopeFilters.length > 0 ? scopeFilters : null;
  }

  private async assertClinicianCanViewEvent(
    doctorId: string,
    event: any,
  ): Promise<boolean> {
    const scopeFilters = await this.getClinicianAuthorizedScopes(doctorId, event.patientId);
    if (scopeFilters === null) return false;
    if (scopeFilters.length === 0) return true; // Full timeline scope granted

    for (const filter of scopeFilters) {
      if (filter.sourceType === event.sourceType) {
        if (filter.sourceId && filter.sourceId !== event.sourceId) {
          continue;
        }
        if (filter.metadata?.path && filter.metadata.equals) {
          const cat = event.metadata?.category;
          if (cat !== filter.metadata.equals) continue;
        }
        return true;
      }
    }

    return false;
  }

  private mapCategoryToEventType(category: DocumentCategory): TimelineEventType {
    switch (category) {
      case 'IMAGING_REPORT':
      case 'XRAY':
      case 'CT':
      case 'MRI':
        return TimelineEventType.IMAGING;
      case 'LAB_REPORT':
        return TimelineEventType.LAB_RESULT;
      default:
        return TimelineEventType.DOCUMENT;
    }
  }

  private formatCategoryLabel(category: DocumentCategory): string {
    switch (category) {
      case 'LAB_REPORT':
        return 'Lab & Pathology';
      case 'PRESCRIPTION':
        return 'Prescription';
      case 'CONSULTATION':
        return 'Consultation Note';
      case 'DISCHARGE_SUMMARY':
        return 'Discharge Summary';
      case 'IMAGING_REPORT':
        return 'Imaging Report';
      case 'XRAY':
        return 'X-Ray';
      case 'CT':
        return 'CT Scan';
      case 'MRI':
        return 'MRI Scan';
      default:
        return 'Medical Report';
    }
  }

  private encodeCursor(payload: CursorPayload): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  private decodeCursor(cursor: string): CursorPayload | null {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }
}
