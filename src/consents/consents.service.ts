import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreateConsentDto } from './dto/create-consent.dto';
import { DeclineConsentDto } from './dto/decline-consent.dto';
import { RevokeConsentDto } from './dto/revoke-consent.dto';
import { QueryConsentsDto } from './dto/query-consents.dto';
import {
  Role,
  ConsentStatus,
  ConsentResourceType,
  ConsentAccessLevel,
  AuditAction,
  AuditResult,
  TimelineEventType,
  NotificationType,
  AccessStatus,
  DoctorVerificationStatus,
} from '@prisma/client';

@Injectable()
export class ConsentsService {
  private readonly logger = new Logger(ConsentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Doctor requests explicit, scoped consent to access patient medical records
   */
  async createConsentRequest(
    doctor: AuthenticatedUser,
    dto: CreateConsentDto,
    ip?: string,
    userAgent?: string,
  ) {
    // 1. Role validation
    if (doctor.role !== Role.DOCTOR) {
      throw new ForbiddenException('Only verified clinicians can request consent');
    }

    // 2. Doctor verification status check
    const doctorProfile = await this.prisma.doctorProfile.findUnique({
      where: { userId: doctor.id },
    });

    if (!doctorProfile || doctorProfile.verificationStatus !== DoctorVerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        'Access denied: Only administratively verified physicians can request patient record access',
      );
    }

    // 3. Patient existence check
    const patient = await this.prisma.user.findUnique({
      where: { id: dto.patientId },
      include: { patientProfile: true },
    });

    if (!patient || patient.role !== Role.PATIENT) {
      throw new NotFoundException('Patient record not found');
    }

    // 4. Clinical relationship requirement (Doctor ↔ Patient connection)
    const relationship = await this.prisma.doctorPatientAccess.findFirst({
      where: {
        doctorId: doctor.id,
        patientId: dto.patientId,
        status: AccessStatus.APPROVED,
      },
    });

    if (!relationship) {
      throw new ForbiddenException(
        'Access denied: You must be on the patient’s clinical care team to request record access',
      );
    }

    // 5. Expiration validation
    const expiresAt = new Date(dto.expiresAt);
    const now = new Date();

    if (isNaN(expiresAt.getTime()) || expiresAt <= now) {
      throw new BadRequestException('Expiration date must be a valid future date');
    }

    const maxExpiry = new Date();
    maxExpiry.setFullYear(maxExpiry.getFullYear() + 1);
    if (expiresAt > maxExpiry) {
      throw new BadRequestException('Consent duration cannot exceed 365 days');
    }

    // 6. Validate that requested resource IDs exist and belong to the patient
    for (const scope of dto.scopes) {
      if (scope.resourceId) {
        if (scope.resourceType === ConsentResourceType.DOCUMENT) {
          const doc = await this.prisma.document.findUnique({
            where: { id: scope.resourceId },
          });
          if (!doc || doc.patientId !== dto.patientId || doc.isArchived) {
            throw new BadRequestException(
              `Requested document "${scope.resourceId}" is invalid or does not belong to patient`,
            );
          }
        }
      }
    }

    // 7. Check for duplicate pending requests
    const existingPending = await this.prisma.consent.findFirst({
      where: {
        patientId: dto.patientId,
        requesterId: doctor.id,
        status: ConsentStatus.PENDING,
        purpose: dto.purpose,
      },
    });

    if (existingPending) {
      throw new BadRequestException(
        'A pending consent request with the same clinical purpose is already awaiting patient review',
      );
    }

    // 8. Create Consent and Scopes in database transaction
    const consent = await this.prisma.$transaction(async (tx) => {
      const created = await tx.consent.create({
        data: {
          patientId: dto.patientId,
          requesterId: doctor.id,
          requesterRole: Role.DOCTOR,
          purpose: dto.purpose,
          purposeDescription: dto.purposeDescription,
          status: ConsentStatus.PENDING,
          expiresAt,
          scopes: {
            create: dto.scopes.map((s) => ({
              resourceType: s.resourceType,
              resourceId: s.resourceId || null,
              resourceCategory: s.resourceCategory || null,
              accessLevel: s.accessLevel || ConsentAccessLevel.VIEW,
            })),
          },
        },
        include: {
          scopes: true,
          requester: {
            select: {
              id: true,
              email: true,
              doctorProfile: {
                select: {
                  fullName: true,
                  specialization: true,
                  hospitalAffiliation: true,
                },
              },
            },
          },
        },
      });

      return created;
    });

    // 9. Immutable Audit Logging
    await this.auditService.log({
      actorId: doctor.id,
      actorEmail: doctor.email,
      actorRole: doctor.role,
      action: AuditAction.CREATE_CONSENT,
      resourceType: 'CONSENT',
      resourceId: consent.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        patientId: dto.patientId,
        purpose: dto.purpose,
        expiresAt: dto.expiresAt,
        scopeCount: dto.scopes.length,
      },
    });

    // 10. Notification Dispatch to Patient
    const doctorName = consent.requester.doctorProfile?.fullName || 'Your physician';
    await this.notificationsService.sendNotification({
      userId: dto.patientId,
      type: NotificationType.CONSENT_REQUESTED,
      title: 'New Medical Record Access Request',
      message: `${doctorName} has requested access to your medical records for: "${dto.purposeDescription}".`,
      metadata: {
        consentId: consent.id,
        doctorId: doctor.id,
        purpose: dto.purpose,
      },
    });

    return {
      message: 'Consent request submitted to patient for review',
      consent,
    };
  }

  /**
   * Patient reviews and approves a pending consent request
   */
  async approveConsent(
    patient: AuthenticatedUser,
    consentId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const consent = await this.prisma.consent.findUnique({
      where: { id: consentId },
      include: {
        scopes: true,
        requester: {
          select: {
            id: true,
            email: true,
            doctorProfile: { select: { fullName: true, specialization: true } },
          },
        },
        patient: {
          select: {
            id: true,
            email: true,
            patientProfile: { select: { fullName: true } },
          },
        },
      },
    });

    if (!consent) {
      throw new NotFoundException('Consent request not found');
    }

    // Security check: Only the consented patient can approve
    if (consent.patientId !== patient.id) {
      throw new ForbiddenException(
        'Access denied: You can only approve consent requests directed to your own health vault',
      );
    }

    // Controlled State Machine validation (Section 13)
    if (consent.status !== ConsentStatus.PENDING) {
      throw new BadRequestException(
        `Cannot approve consent: Current status is "${consent.status}". Only PENDING requests can be approved.`,
      );
    }

    // Validate expiration
    if (new Date() >= consent.expiresAt) {
      throw new BadRequestException('Cannot approve consent: The requested access period has expired');
    }

    // Transactional status transition, audit log, and timeline event
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.consent.update({
        where: { id: consentId },
        data: {
          status: ConsentStatus.APPROVED,
          approvedAt: new Date(),
        },
        include: { scopes: true },
      });

      // Health Timeline event
      await tx.healthTimelineEvent.create({
        data: {
          patientId: patient.id,
          eventType: TimelineEventType.CONSENT_GRANTED,
          eventDate: new Date(),
          title: 'Record Access Consent Granted',
          description: `Authorized medical record sharing with ${
            consent.requester.doctorProfile?.fullName || 'Physician'
          } for "${consent.purposeDescription}".`,
          metadata: {
            consentId: consent.id,
            doctorId: consent.requesterId,
            expiresAt: consent.expiresAt.toISOString(),
            scopeCount: consent.scopes.length,
          },
        },
      });

      return result;
    });

    // Audit Log
    await this.auditService.log({
      actorId: patient.id,
      actorEmail: patient.email,
      actorRole: Role.PATIENT,
      action: AuditAction.APPROVE_CONSENT,
      resourceType: 'CONSENT',
      resourceId: consent.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        requesterId: consent.requesterId,
        approvedAt: updated.approvedAt,
        expiresAt: consent.expiresAt,
      },
    });

    // Notification to Clinician
    const patientName = consent.patient.patientProfile?.fullName || 'Patient';
    await this.notificationsService.sendNotification({
      userId: consent.requesterId,
      type: NotificationType.CONSENT_APPROVED,
      title: 'Patient Consent Approved',
      message: `${patientName} approved your access request for medical records.`,
      metadata: { consentId: consent.id, patientId: patient.id },
    });

    return {
      message: 'Consent approved successfully. Clinician granted scoped access.',
      consent: updated,
    };
  }

  /**
   * Patient declines a pending consent request
   */
  async declineConsent(
    patient: AuthenticatedUser,
    consentId: string,
    dto: DeclineConsentDto,
    ip?: string,
    userAgent?: string,
  ) {
    const consent = await this.prisma.consent.findUnique({
      where: { id: consentId },
      include: {
        patient: { select: { patientProfile: { select: { fullName: true } } } },
      },
    });

    if (!consent) {
      throw new NotFoundException('Consent request not found');
    }

    if (consent.patientId !== patient.id) {
      throw new ForbiddenException('Access denied: You can only decline requests for your account');
    }

    if (consent.status !== ConsentStatus.PENDING) {
      throw new BadRequestException(
        `Cannot decline consent: Current status is "${consent.status}". Only PENDING requests can be declined.`,
      );
    }

    const updated = await this.prisma.consent.update({
      where: { id: consentId },
      data: {
        status: ConsentStatus.DECLINED,
        declinedAt: new Date(),
        declineReason: dto.reason || null,
      },
    });

    await this.auditService.log({
      actorId: patient.id,
      actorEmail: patient.email,
      actorRole: Role.PATIENT,
      action: AuditAction.DECLINE_CONSENT,
      resourceType: 'CONSENT',
      resourceId: consent.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: { requesterId: consent.requesterId, reason: dto.reason },
    });

    const patientName = consent.patient?.patientProfile?.fullName || 'The patient';
    await this.notificationsService.sendNotification({
      userId: consent.requesterId,
      type: NotificationType.CONSENT_DECLINED,
      title: 'Consent Request Declined',
      message: `${patientName} declined your request for record access.${
        dto.reason ? ` Note: "${dto.reason}"` : ''
      }`,
      metadata: { consentId: consent.id, patientId: patient.id },
    });

    return {
      message: 'Consent request declined',
      consent: updated,
    };
  }

  /**
   * Patient revokes an active approved consent
   */
  async revokeConsent(
    patient: AuthenticatedUser,
    consentId: string,
    dto: RevokeConsentDto,
    ip?: string,
    userAgent?: string,
  ) {
    const consent = await this.prisma.consent.findUnique({
      where: { id: consentId },
      include: {
        requester: {
          select: {
            doctorProfile: { select: { fullName: true } },
          },
        },
        patient: {
          select: {
            patientProfile: { select: { fullName: true } },
          },
        },
      },
    });

    if (!consent) {
      throw new NotFoundException('Consent grant not found');
    }

    if (consent.patientId !== patient.id) {
      throw new ForbiddenException(
        'Access denied: You can only revoke consent granted from your own account',
      );
    }

    // State machine: Only APPROVED consents can be REVOKED
    if (consent.status !== ConsentStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot revoke consent: Current status is "${consent.status}". Only active APPROVED consents can be revoked.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.consent.update({
        where: { id: consentId },
        data: {
          status: ConsentStatus.REVOKED,
          revokedAt: new Date(),
          revokeReason: dto.reason || null,
        },
      });

      // Health Timeline event
      await tx.healthTimelineEvent.create({
        data: {
          patientId: patient.id,
          eventType: TimelineEventType.CONSENT_REVOKED,
          eventDate: new Date(),
          title: 'Record Access Consent Revoked',
          description: `Revoked medical record access from ${
            consent.requester.doctorProfile?.fullName || 'Physician'
          }.${dto.reason ? ` Reason: "${dto.reason}"` : ''}`,
          metadata: {
            consentId: consent.id,
            doctorId: consent.requesterId,
          },
        },
      });

      return result;
    });

    // Audit Log
    await this.auditService.log({
      actorId: patient.id,
      actorEmail: patient.email,
      actorRole: Role.PATIENT,
      action: AuditAction.REVOKE_CONSENT,
      resourceType: 'CONSENT',
      resourceId: consent.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: { requesterId: consent.requesterId, reason: dto.reason },
    });

    // Notify Clinician
    const patientName = consent.patient.patientProfile?.fullName || 'Patient';
    await this.notificationsService.sendNotification({
      userId: consent.requesterId,
      type: NotificationType.CONSENT_REVOKED,
      title: 'Consent Access Revoked',
      message: `${patientName} has revoked access to their medical records.${
        dto.reason ? ` Reason: "${dto.reason}"` : ''
      }`,
      metadata: { consentId: consent.id, patientId: patient.id },
    });

    return {
      message: 'Consent revoked. Clinician access terminated immediately.',
      consent: updated,
    };
  }

  /**
   * Clinician cancels their own pending consent request
   */
  async cancelConsent(
    doctor: AuthenticatedUser,
    consentId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const consent = await this.prisma.consent.findUnique({
      where: { id: consentId },
    });

    if (!consent) {
      throw new NotFoundException('Consent request not found');
    }

    if (consent.requesterId !== doctor.id) {
      throw new ForbiddenException(
        'Access denied: You can only cancel consent requests you created',
      );
    }

    if (consent.status !== ConsentStatus.PENDING) {
      throw new BadRequestException(
        `Cannot cancel consent: Current status is "${consent.status}". Only PENDING requests can be cancelled.`,
      );
    }

    const updated = await this.prisma.consent.update({
      where: { id: consentId },
      data: {
        status: ConsentStatus.CANCELLED,
      },
    });

    await this.auditService.log({
      actorId: doctor.id,
      actorEmail: doctor.email,
      actorRole: Role.DOCTOR,
      action: AuditAction.CANCEL_CONSENT,
      resourceType: 'CONSENT',
      resourceId: consent.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
    });

    return {
      message: 'Consent request cancelled',
      consent: updated,
    };
  }

  /**
   * List consents with role-based filtering and pagination
   */
  async getConsents(user: AuthenticatedUser, query: QueryConsentsDto) {
    const where: any = {};

    if (user.role === Role.PATIENT) {
      where.patientId = user.id;
    } else if (user.role === Role.DOCTOR) {
      where.requesterId = user.id;
    } else if (user.role === Role.ADMIN) {
      if (query.patientId) where.patientId = query.patientId;
      if (query.requesterId) where.requesterId = query.requesterId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const take = query.limit || 20;
    const skip = query.offset || 0;

    const [total, consents] = await Promise.all([
      this.prisma.consent.count({ where }),
      this.prisma.consent.findMany({
        where,
        include: {
          scopes: true,
          requester: {
            select: {
              id: true,
              email: true,
              doctorProfile: {
                select: {
                  fullName: true,
                  specialization: true,
                  hospitalAffiliation: true,
                  city: true,
                },
              },
            },
          },
          patient: {
            select: {
              id: true,
              email: true,
              patientProfile: {
                select: {
                  fullName: true,
                  city: true,
                  bloodGroup: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
    ]);

    return {
      total,
      limit: take,
      offset: skip,
      consents,
    };
  }

  /**
   * Get single consent detail with resolved security metadata
   */
  async getConsentById(user: AuthenticatedUser, consentId: string) {
    const consent = await this.prisma.consent.findUnique({
      where: { id: consentId },
      include: {
        scopes: true,
        requester: {
          select: {
            id: true,
            email: true,
            doctorProfile: {
              select: {
                fullName: true,
                specialization: true,
                hospitalAffiliation: true,
                clinicName: true,
                city: true,
                registrationNumber: true,
              },
            },
          },
        },
        patient: {
          select: {
            id: true,
            email: true,
            patientProfile: {
              select: {
                fullName: true,
                city: true,
                bloodGroup: true,
              },
            },
          },
        },
      },
    });

    if (!consent) {
      throw new NotFoundException('Consent record not found');
    }

    // Security check: Only patient, requester, or administrative auditor
    if (
      user.role !== Role.ADMIN &&
      consent.patientId !== user.id &&
      consent.requesterId !== user.id
    ) {
      throw new ForbiddenException('Access denied: You are not authorized to view this consent');
    }

    // Audit consent view
    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.VIEW_CONSENT,
      resourceType: 'CONSENT',
      resourceId: consent.id,
      result: AuditResult.SUCCESS,
    });

    return consent;
  }

  /**
   * Resolves the concrete resources (documents, reports) encompassed by a consent grant
   */
  async getConsentResources(user: AuthenticatedUser, consentId: string) {
    const consent = await this.getConsentById(user, consentId);

    const documentScopeIds = consent.scopes
      .filter((s) => s.resourceType === ConsentResourceType.DOCUMENT && s.resourceId)
      .map((s) => s.resourceId as string);

    const categoryScopes = consent.scopes
      .filter((s) => s.resourceType === ConsentResourceType.DOCUMENT && !s.resourceId)
      .map((s) => s.resourceCategory)
      .filter(Boolean);

    const docWhere: any = {
      patientId: consent.patientId,
      isArchived: false,
    };

    if (documentScopeIds.length > 0 && categoryScopes.length > 0) {
      docWhere.OR = [
        { id: { in: documentScopeIds } },
        { category: { in: categoryScopes } },
      ];
    } else if (documentScopeIds.length > 0) {
      docWhere.id = { in: documentScopeIds };
    } else if (categoryScopes.length > 0) {
      docWhere.category = { in: categoryScopes };
    }

    const documents = await this.prisma.document.findMany({
      where: docWhere,
      include: {
        metadata: true,
        versions: {
          take: 1,
          orderBy: { versionNumber: 'desc' },
          select: {
            originalFileName: true,
            mimeType: true,
            fileSizeBytes: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      consentId: consent.id,
      status: consent.status,
      expiresAt: consent.expiresAt,
      isEffective: consent.status === ConsentStatus.APPROVED && new Date() < consent.expiresAt,
      scopes: consent.scopes,
      resolvedDocuments: documents,
    };
  }

  /**
   * Sweeps expired approved consents (APPROVED -> EXPIRED)
   */
  async sweepExpiredConsents() {
    const now = new Date();

    const expiredConsents = await this.prisma.consent.findMany({
      where: {
        status: ConsentStatus.APPROVED,
        expiresAt: { lte: now },
      },
      select: {
        id: true,
        patientId: true,
        requesterId: true,
      },
    });

    if (expiredConsents.length === 0) {
      return { expiredCount: 0 };
    }

    const consentIds = expiredConsents.map((c) => c.id);

    await this.prisma.consent.updateMany({
      where: { id: { in: consentIds } },
      data: { status: ConsentStatus.EXPIRED },
    });

    for (const c of expiredConsents) {
      // Audit
      await this.auditService.log({
        action: AuditAction.EXPIRE_CONSENT,
        resourceType: 'CONSENT',
        resourceId: c.id,
        result: AuditResult.SUCCESS,
        details: { patientId: c.patientId, requesterId: c.requesterId },
      });

      // Notify
      await this.notificationsService.sendNotification({
        userId: c.patientId,
        type: NotificationType.CONSENT_EXPIRED,
        title: 'Consent Window Expired',
        message: 'A medical record sharing consent grant has reached its scheduled expiration date.',
        metadata: { consentId: c.id },
      });

      await this.notificationsService.sendNotification({
        userId: c.requesterId,
        type: NotificationType.CONSENT_EXPIRED,
        title: 'Patient Consent Expired',
        message: 'Your authorized access window for patient medical records has expired.',
        metadata: { consentId: c.id, patientId: c.patientId },
      });
    }

    this.logger.log(`Swept ${expiredConsents.length} expired consents.`);
    return { expiredCount: expiredConsents.length };
  }

  /**
   * Sends expiry reminders for consents nearing expiration (e.g., within 24 hours)
   */
  async sendExpiryReminders() {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const expiringConsents = await this.prisma.consent.findMany({
      where: {
        status: ConsentStatus.APPROVED,
        expiresAt: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      select: {
        id: true,
        patientId: true,
        requesterId: true,
        expiresAt: true,
      },
    });

    for (const c of expiringConsents) {
      await this.notificationsService.sendNotification({
        userId: c.patientId,
        type: NotificationType.CONSENT_EXPIRING_SOON,
        title: 'Consent Expiring Soon',
        message: `Your medical record consent is scheduled to expire on ${c.expiresAt.toLocaleDateString()}.`,
        metadata: { consentId: c.id },
      });

      await this.notificationsService.sendNotification({
        userId: c.requesterId,
        type: NotificationType.CONSENT_EXPIRING_SOON,
        title: 'Patient Access Expiring in 24 Hours',
        message: `Your authorized access grant for patient records will expire in 24 hours.`,
        metadata: { consentId: c.id, patientId: c.patientId },
      });
    }

    return { remindedCount: expiringConsents.length };
  }
}
