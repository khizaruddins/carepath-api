import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  Role,
  ConsentStatus,
  ConsentResourceType,
  ConsentAccessLevel,
  AuditAction,
  AuditResult,
} from '@prisma/client';

export interface AuthorizeParams {
  actorId: string;
  actorRole: Role | string;
  actorEmail?: string;
  patientId: string;
  resourceType: ConsentResourceType;
  resourceId?: string;
  action: 'VIEW' | 'DOWNLOAD' | 'CREATE' | 'UPDATE' | 'DELETE';
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthorizationResult {
  authorized: boolean;
  authorizationSource: 'PATIENT_OWNER' | 'CLINICAL_AUTHOR' | 'CONSENT_GRANT';
  consentId?: string;
  scopeId?: string;
  patientId: string;
}

@Injectable()
export class ConsentAuthorizationService {
  private readonly logger = new Logger(ConsentAuthorizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Centralized security decision point for all protected medical resource access
   */
  async authorize(params: AuthorizeParams): Promise<AuthorizationResult> {
    const {
      actorId,
      actorRole,
      actorEmail,
      patientId,
      resourceType,
      resourceId,
      action,
      ipAddress,
      userAgent,
    } = params;

    // 1. Patient Self-Access (Section 18)
    if (actorRole === Role.PATIENT) {
      if (actorId === patientId) {
        return {
          authorized: true,
          authorizationSource: 'PATIENT_OWNER',
          patientId,
        };
      }

      // Patient attempting cross-patient access (IDOR attempt)
      await this.auditDeniedAccess(params, 'CROSS_PATIENT_ACCESS_ATTEMPT');
      throw new ForbiddenException(
        'Access denied: You cannot access or modify records belonging to another patient',
      );
    }

    // 2. Admin Oversight Boundary (Section 37)
    if (actorRole === Role.ADMIN) {
      await this.auditDeniedAccess(params, 'ADMIN_MEDICAL_VAULT_RESTRICTION');
      throw new ForbiddenException(
        'Access denied: Administrative accounts do not have direct access to patient medical records without explicit clinical authorization',
      );
    }

    // 3. Clinician Access (Sections 14, 15, 16, 17, 19, 25)
    if (actorRole === Role.DOCTOR) {
      // 3a. Clinician download prohibition: Downloading/exporting patient records is prohibited on the server
      if (action === 'DOWNLOAD') {
        await this.auditDeniedAccess(params, 'DOCTOR_DOWNLOAD_PROHIBITED');
        throw new ForbiddenException(
          'Access denied: Downloading patient records is strictly prohibited for clinicians. Clinician access is view-only.',
        );
      }

      // 3b. Disallow destructive actions on patient vault (Section 17)
      if (action === 'DELETE') {
        await this.auditDeniedAccess(params, 'DOCTOR_DELETE_DISALLOWED');
        throw new ForbiddenException(
          'Access denied: Clinicians cannot delete patient health vault records',
        );
      }

      // 3c. Verify doctor is administratively verified
      const docProfile = await this.prisma.doctorProfile.findUnique({
        where: { userId: actorId },
      });
      if (!docProfile || docProfile.verificationStatus !== 'VERIFIED') {
        await this.auditDeniedAccess(params, 'DOCTOR_NOT_VERIFIED');
        throw new ForbiddenException(
          'Access denied: Only administratively verified physicians can access patient medical records',
        );
      }

      // 3d. Verify doctor-patient clinical relationship exists
      const relationship = await this.prisma.doctorPatientAccess.findFirst({
        where: {
          doctorId: actorId,
          patientId,
          status: 'APPROVED',
        },
      });

      if (!relationship) {
        await this.auditDeniedAccess(params, 'NO_ESTABLISHED_DOCTOR_PATIENT_RELATIONSHIP');
        throw new ForbiddenException(
          'Access denied: You do not have an active clinical relationship with this patient',
        );
      }

      // 3e. If Doctor is authoring or managing their own clinical notes (Section 19)
      if (
        (action === 'CREATE' || action === 'UPDATE') &&
        ['CONSULTATION', 'PRESCRIPTION', 'INVESTIGATION', 'REFERRAL', 'FOLLOW_UP'].includes(
          resourceType,
        )
      ) {
        // Author check on UPDATE
        if (action === 'UPDATE' && resourceId) {
          await this.assertDoctorIsAuthor(actorId, resourceType, resourceId);
        }

        return {
          authorized: true,
          authorizationSource: 'CLINICAL_AUTHOR',
          patientId,
        };
      }

      // Prescribing clinician access to LabOrder or LabReport
      if (resourceType === ConsentResourceType.LAB_ORDER && resourceId) {
        const order = await this.prisma.labOrder.findUnique({
          where: { id: resourceId },
          select: { prescribedDoctorId: true },
        });
        if (order && order.prescribedDoctorId === actorId) {
          return {
            authorized: true,
            authorizationSource: 'CLINICAL_AUTHOR',
            patientId,
          };
        }
      }

      if (resourceType === ConsentResourceType.LAB_REPORT && resourceId) {
        const report = await this.prisma.labReport.findUnique({
          where: { id: resourceId },
          select: { order: { select: { prescribedDoctorId: true } } },
        });
        if (report && report.order?.prescribedDoctorId === actorId) {
          return {
            authorized: true,
            authorizationSource: 'CLINICAL_AUTHOR',
            patientId,
          };
        }
      }

      // 3d. Delegated Access via Active, Scoped Consent (Section 1, 4, 5, 12, 16)
      const now = new Date();

      // Query active, non-expired approved consents for this doctor and patient
      const activeConsents = await this.prisma.consent.findMany({
        where: {
          patientId,
          requesterId: actorId,
          status: ConsentStatus.APPROVED,
          expiresAt: { gt: now },
        },
        include: {
          scopes: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!activeConsents || activeConsents.length === 0) {
        await this.auditDeniedAccess(params, 'NO_ACTIVE_APPROVED_CONSENT');
        throw new ForbiddenException(
          'Access denied: Patient has not granted active, approved consent for medical record access',
        );
      }

      // 3e. Evaluate Scope Match & Resource Ownership
      for (const consent of activeConsents) {
        const matchingScope = await this.findMatchingScope(
          consent.scopes,
          resourceType,
          resourceId,
          patientId,
          action,
        );

        if (matchingScope) {
          // Log authorized access event (Section 23)
          await this.auditAuthorizedAccess(params, consent.id);

          return {
            authorized: true,
            authorizationSource: 'CONSENT_GRANT',
            consentId: consent.id,
            scopeId: matchingScope.id,
            patientId,
          };
        }
      }

      // Scopes checked but none authorized this specific resource/action
      await this.auditDeniedAccess(params, 'OUT_OF_CONSENT_SCOPE');
      throw new ForbiddenException(
        'Access denied: This resource or action is outside the authorized patient consent scope',
      );
    }

    // 4. Laboratory Organization Access
    if (actorRole === Role.LAB) {
      return this.authorizeLabActor(params);
    }

    throw new ForbiddenException('Access denied: Unrecognized actor role');
  }

  /**
   * Evaluates if any scope item covers the requested resource
   */
  private async findMatchingScope(
    scopes: any[],
    resourceType: ConsentResourceType,
    resourceId?: string,
    patientId?: string,
    action?: 'VIEW' | 'DOWNLOAD' | 'CREATE' | 'UPDATE' | 'DELETE',
  ) {
    for (const scope of scopes) {
      if (scope.resourceType !== resourceType) {
        continue;
      }

      // Check access level (Section 17: DOWNLOAD requires DOWNLOAD level)
      if (action === 'DOWNLOAD' && scope.accessLevel !== ConsentAccessLevel.DOWNLOAD) {
        continue;
      }

      // 1. Explicit resource ID match
      if (scope.resourceId && resourceId) {
        if (scope.resourceId === resourceId) {
          // Verify resource ownership matches patientId (Section 16)
          await this.assertResourceBelongsToPatient(resourceType, resourceId, patientId);
          return scope;
        }
        continue;
      }

      // 2. Document category match
      if (resourceType === ConsentResourceType.DOCUMENT && resourceId) {
        const document = await this.prisma.document.findUnique({
          where: { id: resourceId },
          select: { id: true, category: true, patientId: true, isArchived: true },
        });

        if (!document || document.isArchived) {
          continue;
        }

        // Verify document belongs to patient (Section 16)
        if (document.patientId !== patientId) {
          continue;
        }

        // Category-level or wildcard match
        if (!scope.resourceCategory || scope.resourceCategory === document.category) {
          return scope;
        }
        continue;
      }

      // 3. Module-level access (e.g. CONSULTATION, PRESCRIPTION, TIMELINE, PROFILE)
      if (!scope.resourceId) {
        if (resourceId) {
          await this.assertResourceBelongsToPatient(resourceType, resourceId, patientId);
        }
        return scope;
      }
    }

    return null;
  }

  /**
   * Verifies that the resource belongs to the patient (Section 16)
   */
  private async assertResourceBelongsToPatient(
    resourceType: ConsentResourceType,
    resourceId: string,
    patientId?: string,
  ) {
    if (!patientId) return;

    let resourceOwnerId: string | null = null;

    switch (resourceType) {
      case ConsentResourceType.DOCUMENT: {
        const doc = await this.prisma.document.findUnique({
          where: { id: resourceId },
          select: { patientId: true },
        });
        resourceOwnerId = doc?.patientId || null;
        break;
      }
      case ConsentResourceType.CONSULTATION: {
        const item = await this.prisma.consultation.findUnique({
          where: { id: resourceId },
          select: { patientId: true },
        });
        resourceOwnerId = item?.patientId || null;
        break;
      }
      case ConsentResourceType.PRESCRIPTION: {
        const item = await this.prisma.prescription.findUnique({
          where: { id: resourceId },
          select: { patientId: true },
        });
        resourceOwnerId = item?.patientId || null;
        break;
      }
      case ConsentResourceType.INVESTIGATION: {
        const item = await this.prisma.investigationRequest.findUnique({
          where: { id: resourceId },
          select: { patientId: true },
        });
        resourceOwnerId = item?.patientId || null;
        break;
      }
      case ConsentResourceType.REFERRAL: {
        const item = await this.prisma.referral.findUnique({
          where: { id: resourceId },
          select: { patientId: true },
        });
        resourceOwnerId = item?.patientId || null;
        break;
      }
      case ConsentResourceType.FOLLOW_UP: {
        const item = await this.prisma.followUp.findUnique({
          where: { id: resourceId },
          select: { patientId: true },
        });
        resourceOwnerId = item?.patientId || null;
        break;
      }
      case ConsentResourceType.LAB_ORDER: {
        const item = await this.prisma.labOrder.findUnique({
          where: { id: resourceId },
          select: { patientId: true },
        });
        resourceOwnerId = item?.patientId || null;
        break;
      }
      case ConsentResourceType.LAB_REPORT: {
        const item = await this.prisma.labReport.findUnique({
          where: { id: resourceId },
          select: { order: { select: { patientId: true } } },
        });
        resourceOwnerId = item?.order?.patientId || null;
        break;
      }
      default:
        return;
    }

    if (!resourceOwnerId) {
      throw new NotFoundException(`Requested ${resourceType.toLowerCase()} not found`);
    }

    if (resourceOwnerId !== patientId) {
      throw new ForbiddenException(
        `Access denied: Resource does not belong to the consented patient`,
      );
    }
  }

  /**
   * Ensures another doctor cannot edit another doctor's clinical records (Section 19)
   */
  private async assertDoctorIsAuthor(
    doctorId: string,
    resourceType: ConsentResourceType,
    resourceId: string,
  ) {
    let authorId: string | null = null;

    switch (resourceType) {
      case ConsentResourceType.CONSULTATION: {
        const c = await this.prisma.consultation.findUnique({
          where: { id: resourceId },
          select: { doctorId: true },
        });
        authorId = c?.doctorId || null;
        break;
      }
      case ConsentResourceType.PRESCRIPTION: {
        const p = await this.prisma.prescription.findUnique({
          where: { id: resourceId },
          select: { doctorId: true },
        });
        authorId = p?.doctorId || null;
        break;
      }
      case ConsentResourceType.INVESTIGATION: {
        const inv = await this.prisma.investigationRequest.findUnique({
          where: { id: resourceId },
          select: { doctorId: true },
        });
        authorId = inv?.doctorId || null;
        break;
      }
      case ConsentResourceType.REFERRAL: {
        const ref = await this.prisma.referral.findUnique({
          where: { id: resourceId },
          select: { doctorId: true },
        });
        authorId = ref?.doctorId || null;
        break;
      }
      case ConsentResourceType.FOLLOW_UP: {
        const fu = await this.prisma.followUp.findUnique({
          where: { id: resourceId },
          select: { doctorId: true },
        });
        authorId = fu?.doctorId || null;
        break;
      }
      default:
        return;
    }

    if (authorId && authorId !== doctorId) {
      throw new ForbiddenException(
        'Access denied: You cannot modify a clinical record authored by another clinician',
      );
    }
  }

  private async auditAuthorizedAccess(params: AuthorizeParams, consentId: string) {
    const actionMap: Record<string, AuditAction> = {
      VIEW: AuditAction.DOCUMENT_VIEW,
      DOWNLOAD: AuditAction.DOCUMENT_DOWNLOAD,
      CREATE: AuditAction.DOCUMENT_UPDATE,
      UPDATE: AuditAction.DOCUMENT_UPDATE,
      DELETE: AuditAction.DOCUMENT_DELETE,
    };

    await this.auditService.log({
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      action: actionMap[params.action] || AuditAction.DOCUMENT_VIEW,
      resourceType: params.resourceType,
      resourceId: params.resourceId || null,
      result: AuditResult.SUCCESS,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      details: {
        patientId: params.patientId,
        consentId,
        requestedAction: params.action,
        authorizationSource: 'CONSENT_GRANT',
      },
    });
  }

  private async authorizeLabActor(params: AuthorizeParams): Promise<AuthorizationResult> {
    const { actorId, patientId, resourceType, resourceId, action } = params;

    // Disallow destructive actions on medical records
    if (action === 'DELETE') {
      await this.auditDeniedAccess(params, 'LAB_DELETE_DISALLOWED');
      throw new ForbiddenException('Access denied: Laboratory personnel cannot delete records');
    }

    // Verify user is an active member of an active verified lab
    const membership = await this.prisma.labMembership.findFirst({
      where: {
        userId: actorId,
        status: 'ACTIVE',
        lab: {
          verificationStatus: 'VERIFIED',
          isActive: true,
        },
      },
      include: { lab: true },
    });

    if (!membership) {
      await this.auditDeniedAccess(params, 'LAB_NOT_VERIFIED_OR_ACTIVE');
      throw new ForbiddenException(
        'Access denied: You must be an active member of an administratively verified laboratory',
      );
    }

    // Only LAB_ORDER, LAB_REPORT, and linked DOCUMENT are accessible to labs
    if (resourceType === ConsentResourceType.LAB_ORDER) {
      if (resourceId) {
        const order = await this.prisma.labOrder.findUnique({
          where: { id: resourceId },
          include: { careConnection: true },
        });
        if (!order || order.labId !== membership.labId) {
          await this.auditDeniedAccess(params, 'LAB_ORDER_TENANT_MISMATCH');
          throw new ForbiddenException('Access denied: Lab order belongs to a different laboratory');
        }
        if (
          order.careConnection &&
          (order.careConnection.status === 'EXPIRED' ||
            order.careConnection.status === 'REVOKED' ||
            order.careConnection.status === 'CANCELLED')
        ) {
          await this.auditDeniedAccess(params, `LAB_CARE_CONNECTION_${order.careConnection.status}`);
          throw new ForbiddenException(`Access denied: Clinical connection is ${order.careConnection.status}`);
        }
      }
      return {
        authorized: true,
        authorizationSource: 'CLINICAL_AUTHOR',
        patientId,
      };
    }

    if (resourceType === ConsentResourceType.LAB_REPORT) {
      if (resourceId) {
        const report = await this.prisma.labReport.findUnique({
          where: { id: resourceId },
          include: { order: true },
        });
        if (!report || report.order.labId !== membership.labId) {
          await this.auditDeniedAccess(params, 'LAB_REPORT_TENANT_MISMATCH');
          throw new ForbiddenException('Access denied: Lab report belongs to a different laboratory');
        }
      }
      return {
        authorized: true,
        authorizationSource: 'CLINICAL_AUTHOR',
        patientId,
      };
    }

    if (resourceType === ConsentResourceType.DOCUMENT && resourceId) {
      const report = await this.prisma.labReport.findFirst({
        where: {
          documentId: resourceId,
          order: { labId: membership.labId },
        },
      });
      if (report) {
        return {
          authorized: true,
          authorizationSource: 'CLINICAL_AUTHOR',
          patientId,
        };
      }
      await this.auditDeniedAccess(params, 'LAB_DOCUMENT_TENANT_MISMATCH');
      throw new ForbiddenException(
        'Access denied: Laboratory personnel can only access documents linked to their own reports',
      );
    }

    // Attempting to access unauthorized patient records (vault/timeline/prescriptions/etc.)
    await this.auditDeniedAccess(params, 'LAB_UNAUTHORIZED_RESOURCE_ACCESS');
    throw new ForbiddenException(
      'Access denied: Laboratories are restricted to laboratory orders, reports, and linked documents',
    );
  }

  private async auditDeniedAccess(params: AuthorizeParams, failureReason: string) {
    const action =
      failureReason === 'DOCTOR_DOWNLOAD_PROHIBITED'
        ? AuditAction.DOWNLOAD_PROHIBITED_BLOCKED
        : AuditAction.SECURITY_EVENT;

    await this.auditService.log({
      actorId: params.actorId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      action,
      resourceType: params.resourceType,
      resourceId: params.resourceId || null,
      result: AuditResult.DENIED,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      details: {
        patientId: params.patientId,
        attemptedAction: params.action,
        reason: failureReason,
      },
    });
  }
}
