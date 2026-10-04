import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HealthcareTimelineService } from '../timeline/healthcare-timeline.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import {
  Role,
  LabVerificationStatus,
  LabCareConnectionStatus,
  LabCareAccessScope,
  LabOrderStatus,
  LabCollectionMode,
  ConsentStatus,
  ConsentPurpose,
  ConsentResourceType,
  ConsentAccessLevel,
  AuditAction,
  AuditResult,
  NotificationType,
  TimelineEventType,
} from '@prisma/client';
import { SelectLabForInvestigationDto } from './dto/select-lab-for-investigation.dto';
import { ShareLabReportWithDoctorDto } from './dto/share-lab-report-with-doctor.dto';
import { RevokeLabCareConnectionDto } from './dto/revoke-lab-care-connection.dto';

const ALLOWED_TRANSITIONS: Record<LabCareConnectionStatus, LabCareConnectionStatus[]> = {
  [LabCareConnectionStatus.PENDING]: [
    LabCareConnectionStatus.ACTIVE,
    LabCareConnectionStatus.CANCELLED,
    LabCareConnectionStatus.EXPIRED,
    LabCareConnectionStatus.REVOKED,
  ],
  [LabCareConnectionStatus.ACTIVE]: [
    LabCareConnectionStatus.SAMPLE_COLLECTED,
    LabCareConnectionStatus.CANCELLED,
    LabCareConnectionStatus.EXPIRED,
    LabCareConnectionStatus.REVOKED,
  ],
  [LabCareConnectionStatus.SAMPLE_COLLECTED]: [
    LabCareConnectionStatus.TEST_COMPLETED,
    LabCareConnectionStatus.REVOKED,
    LabCareConnectionStatus.CANCELLED,
  ],
  [LabCareConnectionStatus.TEST_COMPLETED]: [
    LabCareConnectionStatus.REPORT_READY,
    LabCareConnectionStatus.REVOKED,
  ],
  [LabCareConnectionStatus.REPORT_READY]: [
    LabCareConnectionStatus.COMPLETED,
    LabCareConnectionStatus.REVOKED,
  ],
  [LabCareConnectionStatus.COMPLETED]: [],
  [LabCareConnectionStatus.EXPIRED]: [],
  [LabCareConnectionStatus.REVOKED]: [],
  [LabCareConnectionStatus.CANCELLED]: [],
};

@Injectable()
export class LabCareConnectionService {
  private readonly logger = new Logger(LabCareConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly timelineService: HealthcareTimelineService,
  ) {}

  /**
   * Helper: calculate age from date of birth
   */
  private calculateAge(dob?: Date | null): number | null {
    if (!dob) return null;
    const diffMs = Date.now() - new Date(dob).getTime();
    const ageDt = new Date(diffMs);
    return Math.abs(ageDt.getUTCFullYear() - 1970);
  }

  /**
   * Helper: generate human-readable order number
   */
  private async generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.labOrder.count();
    const sequence = String(count + 1).padStart(6, '0');
    return `CP-LAB-${year}-${sequence}`;
  }

  // -------------------------------------------------------------
  // 1. Investigation Lab Selection & Connection Creation
  // -------------------------------------------------------------

  /**
   * Patient selects a verified laboratory for an investigation request
   * Creates an immutable order, creates a purpose-bound temporary clinical connection,
   * schedules sample collection, projects timeline events, and audits access.
   */
  async selectLabForInvestigation(
    patient: AuthenticatedUser,
    investigationRequestId: string,
    dto: SelectLabForInvestigationDto,
    ip?: string,
    userAgent?: string,
  ) {
    if (patient.role !== Role.PATIENT) {
      throw new ForbiddenException('Only patients can select laboratories for diagnostic investigations');
    }

    // 1. Validate Investigation Request
    const investigation = await this.prisma.investigationRequest.findUnique({
      where: { id: investigationRequestId },
      include: {
        doctor: { select: { id: true, email: true, doctorProfile: true } },
      },
    });

    if (!investigation) {
      throw new NotFoundException(`Investigation request "${investigationRequestId}" not found`);
    }

    if (investigation.patientId !== patient.id) {
      throw new ForbiddenException('Access denied: You cannot select a laboratory for another patient’s investigation');
    }

    // 2. Validate Lab is verified and active
    const lab = await this.prisma.labOrganization.findUnique({
      where: { id: dto.labId },
      include: {
        locations: { where: { isActive: true } },
      },
    });

    if (!lab || !lab.isActive || lab.verificationStatus !== LabVerificationStatus.VERIFIED) {
      throw new BadRequestException('The selected laboratory is not currently active and verified');
    }

    // 3. Resolve diagnostic test
    let test: any = null;
    if (dto.testId) {
      test = await this.prisma.labTest.findFirst({
        where: { id: dto.testId, labId: dto.labId, isActive: true },
        include: { canonicalTest: true },
      });
    }

    if (!test) {
      // Find matching test in this lab catalog by investigation name or canonical
      test = await this.prisma.labTest.findFirst({
        where: {
          labId: dto.labId,
          isActive: true,
          OR: [
            { name: { contains: investigation.investigationName, mode: 'insensitive' } },
            { testCode: { contains: investigation.investigationName, mode: 'insensitive' } },
          ],
        },
        include: { canonicalTest: true },
      });
    }

    if (!test) {
      throw new BadRequestException(
        `Selected laboratory does not offer a diagnostic test matching "${investigation.investigationName}"`,
      );
    }

    // 4. Validate collection mode & location
    if (dto.collectionMode === LabCollectionMode.HOME && !dto.collectionAddress) {
      throw new BadRequestException('A physical collection address is required for home sample collection');
    }

    let branchLocation: any = null;
    if (dto.labLocationId) {
      branchLocation = lab.locations.find((l) => l.id === dto.labLocationId);
      if (!branchLocation) {
        throw new BadRequestException('Selected laboratory branch does not exist or is inactive');
      }
    }

    // 5. Calculate transparent pricing snapshot
    const basePrice = Number(test.price);
    let homeCollectionFee = 0;
    if (dto.collectionMode === LabCollectionMode.HOME) {
      if (branchLocation?.homeCollectionFee) {
        homeCollectionFee = Number(branchLocation.homeCollectionFee);
      }
    }
    const totalPrice = basePrice + homeCollectionFee;

    // 6. Calculate connection expiration (TTL)
    const ttlHours = dto.ttlHours || 72;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const orderNumber = await this.generateOrderNumber();

    // 7. Atomic transaction: create LabOrder + LabCareConnection + update Investigation
    const result = await this.prisma.$transaction(async (tx) => {
      // Create Lab Order
      const createdOrder = await tx.labOrder.create({
        data: {
          orderNumber,
          patientId: patient.id,
          prescribedDoctorId: investigation.doctorId,
          investigationRequestId: investigation.id,
          labId: lab.id,
          labLocationId: branchLocation?.id || null,
          canonicalTestId: test.canonicalTestId || null,
          status: LabOrderStatus.PENDING,
          collectionMode: dto.collectionMode,
          collectionAddress: dto.collectionAddress || null,
          scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
          priority: investigation.priority || 'ROUTINE',
          notes: dto.notes || investigation.notes || null,
          basePrice,
          homeCollectionFee,
          discount: 0,
          totalPrice,
          currency: 'INR',
          items: {
            create: [
              {
                testId: test.id,
                testName: test.name,
                testCode: test.testCode,
                price: test.price,
                notes: test.preparationNotes,
              },
            ],
          },
        },
        include: { items: true },
      });

      // Create Purpose-Bound Temporary Clinical Connection
      const connection = await tx.labCareConnection.create({
        data: {
          patientId: patient.id,
          doctorId: investigation.doctorId,
          labId: lab.id,
          investigationRequestId: investigation.id,
          labOrderId: createdOrder.id,
          status: LabCareConnectionStatus.ACTIVE,
          purpose: 'INVESTIGATION_FULFILLMENT',
          scopes: [
            LabCareAccessScope.PATIENT_BASIC_PROFILE,
            LabCareAccessScope.INVESTIGATION_REQUEST,
            LabCareAccessScope.SAMPLE_INFORMATION,
          ],
          accessGrantedAt: new Date(),
          expiresAt,
        },
      });

      // Update Investigation Request status
      await tx.investigationRequest.update({
        where: { id: investigation.id },
        data: { status: 'ORDERED' },
      });

      return { order: createdOrder, connection };
    });

    // 8. Project timeline event
    try {
      await this.timelineService.projectLabOrder(result.order.id);
    } catch (err: any) {
      this.logger.warn(`Failed to project lab order to timeline: ${err.message}`);
    }

    // 9. Audit logs
    await this.auditService.log({
      actorId: patient.id,
      actorEmail: patient.email,
      actorRole: Role.PATIENT,
      action: AuditAction.LAB_SELECTED,
      resourceType: 'LAB_ORGANIZATION',
      resourceId: lab.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        investigationRequestId,
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        totalPrice,
      },
    });

    await this.auditService.log({
      actorId: patient.id,
      actorEmail: patient.email,
      actorRole: Role.PATIENT,
      action: AuditAction.LAB_CARE_CONNECTION_CREATED,
      resourceType: 'LAB_CARE_CONNECTION',
      resourceId: result.connection.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        labId: lab.id,
        expiresAt: expiresAt.toISOString(),
        ttlHours,
        scopes: result.connection.scopes,
      },
    });

    // 10. Notifications
    await this.notificationsService.sendNotification({
      userId: patient.id,
      type: NotificationType.LAB_CARE_CONNECTION_CREATED,
      title: 'Lab Care Connection Established',
      message: `Your temporary clinical connection with ${lab.name} has been created for ${test.name}. Order #${result.order.orderNumber}.`,
      metadata: {
        orderId: result.order.id,
        connectionId: result.connection.id,
        orderNumber: result.order.orderNumber,
        labName: lab.name,
      },
    });

    // Notify lab admin staff
    const labMembers = await this.prisma.labMembership.findMany({
      where: { labId: lab.id, status: 'ACTIVE' },
    });
    for (const member of labMembers) {
      await this.notificationsService.sendNotification({
        userId: member.userId,
        type: NotificationType.LAB_ORDER_CREATED,
        title: 'New Diagnostic Order Received',
        message: `New order #${result.order.orderNumber} for ${test.name}. Mode: ${dto.collectionMode}. Priority: ${result.order.priority}.`,
        metadata: {
          orderId: result.order.id,
          connectionId: result.connection.id,
          orderNumber: result.order.orderNumber,
        },
      });
    }

    return {
      message: 'Laboratory selected and temporary clinical connection established successfully',
      order: result.order,
      connection: result.connection,
      pricing: {
        basePrice,
        homeCollectionFee,
        totalPrice,
        currency: 'INR',
      },
    };
  }

  // -------------------------------------------------------------
  // 2. Controlled State Transitions & Lifecycle Management
  // -------------------------------------------------------------

  /**
   * Validate and apply state transitions on the clinical connection
   */
  async transitionConnectionStatus(
    connectionId: string,
    newStatus: LabCareConnectionStatus,
    details?: {
      sampleCollectedAt?: Date;
      testCompletedAt?: Date;
      reportFinalizedAt?: Date;
      reason?: string;
    },
  ) {
    const connection = await this.prisma.labCareConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException(`Lab care connection "${connectionId}" not found`);
    }

    const currentStatus = connection.status;
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Illegal connection state transition from ${currentStatus} to ${newStatus}. Allowed transitions: [${allowed.join(', ')}]`,
      );
    }

    const updateData: any = { status: newStatus };

    if (newStatus === LabCareConnectionStatus.SAMPLE_COLLECTED) {
      updateData.sampleCollectedAt = details?.sampleCollectedAt || new Date();
    } else if (newStatus === LabCareConnectionStatus.TEST_COMPLETED) {
      updateData.testCompletedAt = details?.testCompletedAt || new Date();
    } else if (newStatus === LabCareConnectionStatus.REPORT_READY) {
      updateData.reportFinalizedAt = details?.reportFinalizedAt || new Date();
    } else if (newStatus === LabCareConnectionStatus.COMPLETED) {
      // Final delivery to patient: clinical access revoked!
      const now = new Date();
      updateData.reportDeliveredAt = now;
      updateData.revokedAt = now;
      updateData.revocationReason = 'Investigation completed: Final diagnostic report delivered to patient vault';
    } else if (newStatus === LabCareConnectionStatus.REVOKED) {
      updateData.revokedAt = new Date();
      updateData.revocationReason = details?.reason || 'Manually revoked by patient';
    }

    const updated = await this.prisma.labCareConnection.update({
      where: { id: connectionId },
      data: updateData,
    });

    if (newStatus === LabCareConnectionStatus.COMPLETED || newStatus === LabCareConnectionStatus.REVOKED) {
      await this.auditService.log({
        actorId: connection.patientId,
        actorRole: Role.PATIENT,
        action: AuditAction.LAB_CARE_ACCESS_REVOKED,
        resourceType: 'LAB_CARE_CONNECTION',
        resourceId: connectionId,
        result: AuditResult.SUCCESS,
        details: {
          previousStatus: currentStatus,
          newStatus,
          reason: updateData.revocationReason,
        },
      });
    }

    return updated;
  }

  /**
   * Patient manually revokes a temporary clinical connection
   */
  async revokeConnection(
    patient: AuthenticatedUser,
    connectionId: string,
    dto?: RevokeLabCareConnectionDto,
    ip?: string,
    userAgent?: string,
  ) {
    const connection = await this.prisma.labCareConnection.findUnique({
      where: { id: connectionId },
      include: { labOrder: true },
    });

    if (!connection) {
      throw new NotFoundException(`Lab care connection "${connectionId}" not found`);
    }

    if (patient.role !== Role.ADMIN && connection.patientId !== patient.id) {
      throw new ForbiddenException('Access denied: You can only revoke your own laboratory connections');
    }

    if (
      connection.status === LabCareConnectionStatus.COMPLETED ||
      connection.status === LabCareConnectionStatus.REVOKED ||
      connection.status === LabCareConnectionStatus.EXPIRED
    ) {
      throw new BadRequestException(`Connection is already in terminal state: ${connection.status}`);
    }

    const revoked = await this.transitionConnectionStatus(
      connectionId,
      LabCareConnectionStatus.REVOKED,
      { reason: dto?.reason || 'Revoked by patient' },
    );

    // Cancel order if still pending
    if (connection.labOrder.status === LabOrderStatus.PENDING) {
      await this.prisma.labOrder.update({
        where: { id: connection.labOrderId },
        data: {
          status: LabOrderStatus.CANCELLED,
          cancelledReason: dto?.reason || 'Clinical connection revoked by patient',
        },
      });
    }

    // Notify lab members
    const labMembers = await this.prisma.labMembership.findMany({
      where: { labId: connection.labId, status: 'ACTIVE' },
    });
    for (const member of labMembers) {
      await this.notificationsService.sendNotification({
        userId: member.userId,
        type: NotificationType.LAB_ORDER_CANCELLED,
        title: 'Clinical Access Revoked',
        message: `Clinical access for order #${connection.labOrder.orderNumber} has been revoked by the patient.`,
        metadata: { connectionId, orderId: connection.labOrderId },
      });
    }

    return {
      message: 'Laboratory clinical connection revoked successfully',
      connection: revoked,
    };
  }

  // -------------------------------------------------------------
  // 3. Minimum-Necessary Clinical Context Retrieval
  // -------------------------------------------------------------

  /**
   * Retrieve clinical connection context with minimum-necessary scoping
   */
  async getConnectionDetails(
    user: AuthenticatedUser,
    connectionId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const connection = await this.prisma.labCareConnection.findUnique({
      where: { id: connectionId },
      include: {
        patient: {
          select: {
            id: true,
            email: true,
            phoneNumber: true,
            patientProfile: true,
          },
        },
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: true,
          },
        },
        lab: true,
        investigationRequest: true,
        labOrder: {
          include: {
            items: true,
            samples: true,
            reports: true,
          },
        },
      },
    });

    if (!connection) {
      throw new NotFoundException(`Lab care connection "${connectionId}" not found`);
    }

    // 1. If Patient or Admin
    if (user.role === Role.ADMIN || (user.role === Role.PATIENT && connection.patientId === user.id)) {
      return connection;
    }

    // 2. If Doctor (prescribing doctor)
    if (user.role === Role.DOCTOR && connection.doctorId === user.id) {
      return connection;
    }

    // 3. If Laboratory Actor: Enforce Strict Minimum-Necessary Authorization
    if (user.role === Role.LAB) {
      const membership = await this.prisma.labMembership.findFirst({
        where: { userId: user.id, labId: connection.labId, status: 'ACTIVE' },
      });

      if (!membership) {
        await this.auditService.log({
          actorId: user.id,
          actorRole: Role.LAB,
          action: AuditAction.LAB_CARE_ACCESS_DENIED,
          resourceType: 'LAB_CARE_CONNECTION',
          resourceId: connectionId,
          result: AuditResult.DENIED,
          ipAddress: ip,
          userAgent,
          details: { reason: 'LAB_TENANT_MISMATCH' },
        });
        throw new ForbiddenException('Access denied: You do not belong to the laboratory assigned to this connection');
      }

      // Check TTL / Expiration
      const now = new Date();
      if (connection.expiresAt < now && connection.status !== LabCareConnectionStatus.COMPLETED) {
        if (connection.status !== LabCareConnectionStatus.EXPIRED) {
          await this.prisma.labCareConnection.update({
            where: { id: connectionId },
            data: { status: LabCareConnectionStatus.EXPIRED },
          });
        }
        await this.auditService.log({
          actorId: user.id,
          actorRole: Role.LAB,
          action: AuditAction.LAB_CARE_ACCESS_EXPIRED,
          resourceType: 'LAB_CARE_CONNECTION',
          resourceId: connectionId,
          result: AuditResult.DENIED,
          ipAddress: ip,
          userAgent,
          details: { expiredAt: connection.expiresAt.toISOString() },
        });
        throw new ForbiddenException('Access denied: The temporary clinical access window for this order has expired');
      }

      // Check Terminal / Revoked / Completed states
      if (
        connection.status === LabCareConnectionStatus.EXPIRED ||
        connection.status === LabCareConnectionStatus.REVOKED ||
        connection.status === LabCareConnectionStatus.CANCELLED
      ) {
        await this.auditService.log({
          actorId: user.id,
          actorRole: Role.LAB,
          action: AuditAction.LAB_CARE_ACCESS_DENIED,
          resourceType: 'LAB_CARE_CONNECTION',
          resourceId: connectionId,
          result: AuditResult.DENIED,
          ipAddress: ip,
          userAgent,
          details: { status: connection.status },
        });
        throw new ForbiddenException(`Access denied: Clinical connection is ${connection.status}`);
      }

      // Audit Granted Access
      await this.auditService.log({
        actorId: user.id,
        actorRole: Role.LAB,
        action: AuditAction.LAB_CARE_ACCESS_GRANTED,
        resourceType: 'LAB_CARE_CONNECTION',
        resourceId: connectionId,
        result: AuditResult.SUCCESS,
        ipAddress: ip,
        userAgent,
        details: { scopes: connection.scopes },
      });

      // Construct STRICT Minimum-Necessary Response
      // (NO medical vault, NO past consultations, NO longitudinal timeline, NO unrelated records)
      const patientProfile = connection.patient.patientProfile;
      return {
        id: connection.id,
        status: connection.status,
        purpose: connection.purpose,
        scopes: connection.scopes,
        accessGrantedAt: connection.accessGrantedAt,
        expiresAt: connection.expiresAt,
        patientContext: {
          id: connection.patientId,
          fullName: patientProfile?.fullName || 'Patient',
          gender: patientProfile?.gender,
          dateOfBirth: patientProfile?.dateOfBirth,
          age: this.calculateAge(patientProfile?.dateOfBirth),
          contactPhone: connection.patient.phoneNumber || patientProfile?.mobile,
          collectionAddress: connection.labOrder.collectionAddress,
        },
        investigationContext: connection.investigationRequest
          ? {
              id: connection.investigationRequest.id,
              investigationName: connection.investigationRequest.investigationName,
              category: connection.investigationRequest.category,
              priority: connection.investigationRequest.priority,
              clinicalNotes: connection.investigationRequest.notes,
              reason: connection.investigationRequest.reason,
            }
          : null,
        prescribingDoctorContext: connection.doctor
          ? {
              id: connection.doctor.id,
              fullName: connection.doctor.doctorProfile?.fullName,
              clinicName: connection.doctor.doctorProfile?.clinicName,
            }
          : null,
        order: {
          id: connection.labOrder.id,
          orderNumber: connection.labOrder.orderNumber,
          status: connection.labOrder.status,
          collectionMode: connection.labOrder.collectionMode,
          scheduledDate: connection.labOrder.scheduledDate,
          priority: connection.labOrder.priority,
          items: connection.labOrder.items,
          samples: connection.labOrder.samples,
        },
      };
    }

    throw new ForbiddenException('Access denied: Unauthorized to view clinical connection details');
  }

  /**
   * Find connection by order ID
   */
  async getConnectionByOrderId(user: AuthenticatedUser, orderId: string) {
    const connection = await this.prisma.labCareConnection.findUnique({
      where: { labOrderId: orderId },
    });

    if (!connection) {
      throw new NotFoundException(`No clinical connection found for order "${orderId}"`);
    }

    return this.getConnectionDetails(user, connection.id);
  }

  // -------------------------------------------------------------
  // 4. Patient-Controlled Report Sharing with Doctor
  // -------------------------------------------------------------

  /**
   * Finalized report delivery & patient explicit decision to share with prescribing doctor.
   * Doctor does NOT automatically receive reports; patient must explicitly consent.
   */
  async shareReportWithDoctor(
    patient: AuthenticatedUser,
    reportId: string,
    dto: ShareLabReportWithDoctorDto,
    ip?: string,
    userAgent?: string,
  ) {
    if (patient.role !== Role.PATIENT) {
      throw new ForbiddenException('Only patients can authorize diagnostic report sharing with clinicians');
    }

    // 1. Fetch report and verify ownership
    const report = await this.prisma.labReport.findUnique({
      where: { id: reportId },
      include: {
        order: {
          include: {
            items: true,
            lab: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException(`Lab report "${reportId}" not found`);
    }

    if (report.order.patientId !== patient.id) {
      throw new ForbiddenException('Access denied: You can only share your own diagnostic reports');
    }

    // 2. Validate Doctor
    const doctor = await this.prisma.user.findUnique({
      where: { id: dto.doctorId },
      include: { doctorProfile: true },
    });

    if (!doctor || doctor.role !== Role.DOCTOR) {
      throw new NotFoundException(`Physician with ID "${dto.doctorId}" not found`);
    }

    // 3. Compute Consent Expiration
    const days = dto.expiresInDays || 30;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    // 4. Create Scoped Consent Grant
    const scopesToCreate: Array<{
      resourceType: ConsentResourceType;
      resourceId: string;
      accessLevel: ConsentAccessLevel;
    }> = [
      {
        resourceType: ConsentResourceType.LAB_REPORT,
        resourceId: report.id,
        accessLevel: ConsentAccessLevel.VIEW,
      },
      {
        resourceType: ConsentResourceType.LAB_ORDER,
        resourceId: report.orderId,
        accessLevel: ConsentAccessLevel.VIEW,
      },
    ];

    if (report.documentId) {
      scopesToCreate.push({
        resourceType: ConsentResourceType.DOCUMENT,
        resourceId: report.documentId,
        accessLevel: ConsentAccessLevel.VIEW,
      });
    }

    const consent = await this.prisma.consent.create({
      data: {
        patientId: patient.id,
        requesterId: doctor.id,
        status: ConsentStatus.APPROVED,
        purpose: ConsentPurpose.INVESTIGATION_REVIEW,
        purposeDescription: dto.notes || `Patient shared lab report #${report.reportNumber} for clinical review`,
        expiresAt,
        approvedAt: new Date(),
        scopes: {
          create: scopesToCreate,
        },
      },
      include: { scopes: true },
    });

    // 5. Emit timeline event
    try {
      await this.prisma.healthTimelineEvent.create({
        data: {
          patientId: patient.id,
          eventType: TimelineEventType.LAB_REPORT_SHARED,
          eventDate: new Date(),
          title: `Diagnostic Report Shared: ${report.reportNumber}`,
          description: `Shared with Dr. ${doctor.doctorProfile?.fullName || doctor.email} for investigation review.`,
          metadata: {
            reportId: report.id,
            reportNumber: report.reportNumber,
            doctorId: doctor.id,
            doctorName: doctor.doctorProfile?.fullName,
            consentId: consent.id,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to log timeline event for report sharing: ${err.message}`);
    }

    // 6. Audit log
    await this.auditService.log({
      actorId: patient.id,
      actorEmail: patient.email,
      actorRole: Role.PATIENT,
      action: AuditAction.LAB_REPORT_SHARED_WITH_DOCTOR,
      resourceType: 'LAB_REPORT',
      resourceId: report.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        doctorId: doctor.id,
        consentId: consent.id,
        reportNumber: report.reportNumber,
        expiresAt: expiresAt.toISOString(),
      },
    });

    // 7. Notify Doctor
    await this.notificationsService.sendNotification({
      userId: doctor.id,
      type: NotificationType.LAB_REPORT_SHARED,
      title: 'Diagnostic Report Shared by Patient',
      message: `Patient has shared diagnostic report #${report.reportNumber} (${report.order.items.map((i) => i.testName).join(', ')}) with you for clinical review.`,
      metadata: {
        reportId: report.id,
        orderId: report.orderId,
        reportNumber: report.reportNumber,
        consentId: consent.id,
        action: 'VIEW_LAB_REPORT',
      },
    });

    return {
      message: `Diagnostic report ${report.reportNumber} shared successfully with Dr. ${doctor.doctorProfile?.fullName || doctor.email}`,
      consent,
    };
  }
}
