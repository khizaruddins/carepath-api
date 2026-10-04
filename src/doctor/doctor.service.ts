import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequestAccessDto } from './dto/request-access.dto';
import { RespondAccessDto } from './dto/respond-access.dto';
import { DoctorFeedbackDto } from './dto/doctor-feedback.dto';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { CreateInvestigationDto } from './dto/create-investigation.dto';
import { CreateReferralDto } from './dto/create-referral.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import {
  AccessStatus,
  AuditAction,
  AuditResult,
  DoctorVerificationStatus,
  FollowUpStatus,
  Role,
  TimelineEventType,
  ConsentResourceType,
  NotificationType,
} from '@prisma/client';
import { ConsentAuthorizationService } from '../common/services/consent-authorization.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HealthcareTimelineService } from '../timeline/healthcare-timeline.service';

@Injectable()
export class DoctorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    @Optional() private readonly consentAuthService?: ConsentAuthorizationService,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly timelineService?: HealthcareTimelineService,
  ) {}

  // -------------------------------------------------------------
  // Doctor Access & Patient Consent Management
  // -------------------------------------------------------------

  /**
   * Doctor requests vault access from a patient by email
   */
  async requestAccess(doctor: AuthenticatedUser, dto: RequestAccessDto) {
    if (doctor.role !== Role.DOCTOR) {
      throw new ForbiddenException('Only verified doctors can request patient record access');
    }

    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId: doctor.id },
    });

    if (!profile || profile.verificationStatus !== DoctorVerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        'Access denied: Only administratively verified physicians can request patient record access',
      );
    }

    const patient = await this.prisma.user.findUnique({
      where: { email: dto.patientEmail.toLowerCase().trim() },
      include: { patientProfile: true },
    });

    if (!patient || patient.role !== Role.PATIENT) {
      throw new NotFoundException(`No registered patient found with email "${dto.patientEmail}"`);
    }

    // Check existing access record
    const existing = await this.prisma.doctorPatientAccess.findUnique({
      where: {
        patientId_doctorId: {
          patientId: patient.id,
          doctorId: doctor.id,
        },
      },
    });

    if (existing && existing.status === AccessStatus.APPROVED) {
      throw new ConflictException('You already have active approved access to this patient’s records');
    }

    const record = await this.prisma.doctorPatientAccess.upsert({
      where: {
        patientId_doctorId: {
          patientId: patient.id,
          doctorId: doctor.id,
        },
      },
      update: {
        status: AccessStatus.PENDING,
        notes: dto.notes || 'Physician requested access to medical vault for clinical consultation',
        requestedBy: Role.DOCTOR,
        requestedAt: new Date(),
        respondedAt: null,
      },
      create: {
        patientId: patient.id,
        doctorId: doctor.id,
        status: AccessStatus.PENDING,
        notes: dto.notes || 'Physician requested access to medical vault for clinical consultation',
        requestedBy: Role.DOCTOR,
      },
      include: {
        patient: {
          select: {
            id: true,
            email: true,
            patientProfile: true,
          },
        },
      },
    });

    await this.auditService.log({
      actorId: doctor.id,
      actorEmail: doctor.email,
      actorRole: doctor.role,
      action: AuditAction.SECURITY_EVENT,
      resourceType: 'CONSENT_REQUEST',
      resourceId: record.id,
      result: AuditResult.SUCCESS,
      details: {
        patientId: patient.id,
        patientEmail: patient.email,
      },
    });

    if (this.notificationsService) {
      await this.notificationsService.sendNotification({
        userId: patient.id,
        type: NotificationType.ACCESS_REQUESTED,
        title: 'Doctor Access Request',
        message: `Dr. ${profile.fullName || doctor.email} has requested access to your CarePath health vault.`,
        metadata: {
          requestId: record.id,
          doctorId: doctor.id,
          doctorName: profile.fullName || doctor.email,
          specialization: profile.specialization,
          action: 'REVIEW_ACCESS',
        },
      });
      this.notificationsService.sendRealtimeAction(patient.id, 'access:requested', {
        requestId: record.id,
        doctorId: doctor.id,
      });
    }

    return {
      message: 'Access request sent to patient for authorization',
      request: record,
    };
  }

  /**
   * Doctor lists all sent access requests
   */
  async getDoctorAccessRequests(doctorId: string) {
    return this.prisma.doctorPatientAccess.findMany({
      where: { doctorId },
      include: {
        patient: {
          select: {
            id: true,
            email: true,
            patientProfile: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Patient lists all incoming access requests
   */
  async getPatientAccessRequests(patientId: string) {
    return this.prisma.doctorPatientAccess.findMany({
      where: { patientId },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Patient responds to an access request (APPROVE, REJECT, REVOKE)
   */
  async respondAccessRequest(patientId: string, requestId: string, dto: RespondAccessDto) {
    const access = await this.prisma.doctorPatientAccess.findUnique({
      where: { id: requestId },
      include: { patient: true, doctor: true },
    });

    if (!access) {
      throw new NotFoundException('Access request record not found');
    }

    if (access.patientId !== patientId) {
      throw new ForbiddenException('You are not authorized to respond to this consent request');
    }

    const updated = await this.prisma.doctorPatientAccess.update({
      where: { id: requestId },
      data: {
        status: dto.status,
        respondedAt: new Date(),
      },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: true,
          },
        },
      },
    });

    await this.auditService.log({
      actorId: patientId,
      actorEmail: access.patient.email,
      actorRole: Role.PATIENT,
      action: AuditAction.SECURITY_EVENT,
      resourceType: 'CONSENT_RESPONSE',
      resourceId: updated.id,
      result: AuditResult.SUCCESS,
      details: {
        doctorId: access.doctorId,
        doctorEmail: access.doctor.email,
        newStatus: dto.status,
      },
    });

    if (this.notificationsService) {
      const patientUser = await this.prisma.user.findUnique({
        where: { id: patientId },
        include: { patientProfile: true },
      });
      const patientName = patientUser?.patientProfile?.fullName || patientUser?.email || 'A patient';
      const isApproved = dto.status === AccessStatus.APPROVED;
      const isDeclined = dto.status === AccessStatus.REJECTED;
      const actionText = isApproved ? 'granted' : isDeclined ? 'declined' : 'revoked';
      const notifType = isApproved
        ? NotificationType.ACCESS_GRANTED
        : isDeclined
        ? NotificationType.CONSENT_DECLINED
        : NotificationType.CONSENT_REVOKED;

      await this.notificationsService.sendNotification({
        userId: access.doctorId,
        type: notifType,
        title: `Patient ${isApproved ? 'Granted' : isDeclined ? 'Declined' : 'Revoked'} Access`,
        message: `${patientName} has ${actionText} your request to access their health vault.`,
        metadata: {
          requestId: updated.id,
          patientId: access.patientId,
          patientName,
          status: dto.status,
          action: 'VIEW_PATIENTS',
        },
      });
      this.notificationsService.sendRealtimeAction(access.doctorId, 'access:updated', {
        requestId: updated.id,
        patientId: access.patientId,
        status: dto.status,
      });
    }

    return {
      message: `Access permission successfully ${dto.status.toLowerCase()}`,
      access: updated,
    };
  }

  /**
   * Patient directly assigns a doctor to their CarePath care team
   */
  async assignDoctorByPatient(patientId: string, doctorId: string, notes?: string) {
    const doctor = await this.prisma.user.findUnique({
      where: { id: doctorId },
      include: { doctorProfile: true },
    });

    if (!doctor || doctor.role !== Role.DOCTOR) {
      throw new NotFoundException('Doctor not found');
    }

    const access = await this.prisma.doctorPatientAccess.upsert({
      where: {
        patientId_doctorId: {
          patientId,
          doctorId,
        },
      },
      update: {
        status: AccessStatus.APPROVED,
        notes: notes || 'Assigned directly by patient to care team',
        requestedBy: Role.PATIENT,
        respondedAt: new Date(),
      },
      create: {
        patientId,
        doctorId,
        status: AccessStatus.APPROVED,
        notes: notes || 'Assigned directly by patient to care team',
        requestedBy: Role.PATIENT,
        respondedAt: new Date(),
      },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: true,
          },
        },
      },
    });

    await this.auditService.log({
      actorId: patientId,
      actorRole: Role.PATIENT,
      action: AuditAction.SECURITY_EVENT,
      resourceType: 'CARE_TEAM_ASSIGNMENT',
      resourceId: access.id,
      result: AuditResult.SUCCESS,
      details: { doctorId },
    });

    if (this.notificationsService) {
      const patientUser = await this.prisma.user.findUnique({
        where: { id: patientId },
        include: { patientProfile: true },
      });
      const patientName = patientUser?.patientProfile?.fullName || patientUser?.email || 'A patient';

      await this.notificationsService.sendNotification({
        userId: doctorId,
        type: NotificationType.DOCTOR_ASSIGNED,
        title: 'Assigned as Primary Physician',
        message: `${patientName} assigned you to their care team with health record access.`,
        metadata: {
          patientId,
          accessId: access.id,
          patientName,
          action: 'VIEW_PATIENTS',
        },
      });
      this.notificationsService.sendRealtimeAction(doctorId, 'doctor:assigned', {
        patientId,
        accessId: access.id,
      });
    }

    return {
      message: 'Physician assigned to your CarePath team with approved vault access',
      access,
    };
  }

  // -------------------------------------------------------------
  // Doctor Onboarding & Verification Workflow
  // -------------------------------------------------------------

  /**
   * Doctor gets their profile & verification state
   */
  async getDoctorProfile(doctorId: string) {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId: doctorId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phoneNumber: true,
            status: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Doctor profile not found');
    }

    return profile;
  }

  /**
   * Doctor updates their profile (identity, credentials, practice details)
   */
  async updateDoctorProfile(doctorId: string, dto: UpdateDoctorProfileDto) {
    const existing = await this.prisma.doctorProfile.findUnique({
      where: { userId: doctorId },
    });

    if (!existing) {
      throw new NotFoundException('Doctor profile not found');
    }

    const updated = await this.prisma.doctorProfile.update({
      where: { userId: doctorId },
      data: {
        fullName: dto.fullName !== undefined ? dto.fullName : existing.fullName,
        profilePhoto: dto.profilePhoto !== undefined ? dto.profilePhoto : existing.profilePhoto,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : existing.dateOfBirth,
        gender: dto.gender !== undefined ? dto.gender : existing.gender,
        mobile: dto.mobile !== undefined ? dto.mobile : existing.mobile,
        specialization: dto.specialization !== undefined ? dto.specialization : existing.specialization,
        subSpecialty: dto.subSpecialty !== undefined ? dto.subSpecialty : existing.subSpecialty,
        qualifications: dto.qualifications !== undefined ? dto.qualifications : existing.qualifications,
        languages: dto.languages !== undefined ? dto.languages : existing.languages,
        yearsOfExperience: dto.yearsOfExperience !== undefined ? dto.yearsOfExperience : existing.yearsOfExperience,
        licenseNumber: dto.licenseNumber !== undefined ? dto.licenseNumber : existing.licenseNumber,
        registrationNumber: dto.registrationNumber !== undefined ? dto.registrationNumber : existing.registrationNumber,
        registrationAuthority: dto.registrationAuthority !== undefined ? dto.registrationAuthority : existing.registrationAuthority,
        registrationState: dto.registrationState !== undefined ? dto.registrationState : existing.registrationState,
        registrationCountry: dto.registrationCountry !== undefined ? dto.registrationCountry : existing.registrationCountry,
        clinicName: dto.clinicName !== undefined ? dto.clinicName : existing.clinicName,
        clinicAddress: dto.clinicAddress !== undefined ? dto.clinicAddress : existing.clinicAddress,
        city: dto.city !== undefined ? dto.city : existing.city,
        consultationMode: dto.consultationMode !== undefined ? dto.consultationMode : existing.consultationMode,
        consultationFee: dto.consultationFee !== undefined ? dto.consultationFee : existing.consultationFee,
        workingHours: dto.workingHours !== undefined ? dto.workingHours : existing.workingHours,
        hospitalAffiliation: dto.hospitalAffiliation !== undefined ? dto.hospitalAffiliation : existing.hospitalAffiliation,
        bio: dto.bio !== undefined ? dto.bio : existing.bio,
        medicalCertificate: dto.medicalCertificate !== undefined ? dto.medicalCertificate : existing.medicalCertificate,
        education: dto.education !== undefined ? dto.education : existing.education,
      },
    });

    await this.auditService.log({
      actorId: doctorId,
      actorRole: Role.DOCTOR,
      action: AuditAction.PROFILE_UPDATE,
      resourceType: 'DOCTOR_PROFILE',
      resourceId: updated.id,
      result: AuditResult.SUCCESS,
    });

    return {
      message: 'Professional profile updated successfully',
      profile: updated,
    };
  }

  /**
   * Doctor submits their profile for administrative verification review
   */
  async submitForVerification(doctorId: string) {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId: doctorId },
    });

    if (!profile) {
      throw new NotFoundException('Doctor profile not found');
    }

    if (!profile.registrationNumber && !profile.licenseNumber) {
      throw new BadRequestException('Please provide your professional medical registration or license number before submitting');
    }

    const updated = await this.prisma.doctorProfile.update({
      where: { userId: doctorId },
      data: {
        verificationStatus: DoctorVerificationStatus.PENDING,
        verificationSubmittedAt: new Date(),
        rejectionReason: null,
      },
    });

    await this.auditService.log({
      actorId: doctorId,
      actorRole: Role.DOCTOR,
      action: AuditAction.DOCTOR_VERIFICATION_SUBMIT,
      resourceType: 'DOCTOR_VERIFICATION',
      resourceId: updated.id,
      result: AuditResult.SUCCESS,
      details: { action: 'SUBMITTED_FOR_REVIEW' },
    });

    return {
      message: 'Your professional credentials have been submitted for verification',
      profile: updated,
    };
  }

  /**
   * Admin reviews doctor verification (VERIFIED, REJECTED, SUSPENDED)
   */
  async reviewVerification(
    doctorId: string,
    status: DoctorVerificationStatus,
    notes?: string,
    reason?: string,
  ) {
    const updated = await this.prisma.doctorProfile.update({
      where: { userId: doctorId },
      data: {
        verificationStatus: status,
        verificationNotes: notes || null,
        rejectionReason: status === DoctorVerificationStatus.REJECTED ? reason || 'Credentials could not be verified' : null,
        verifiedAt: status === DoctorVerificationStatus.VERIFIED ? new Date() : null,
      },
    });

    // If verified, activate user status
    if (status === DoctorVerificationStatus.VERIFIED) {
      await this.prisma.user.update({
        where: { id: doctorId },
        data: { status: 'ACTIVE' },
      });
    }

    await this.auditService.log({
      actorRole: Role.ADMIN,
      action: AuditAction.DOCTOR_VERIFICATION_REVIEW,
      resourceType: 'DOCTOR_PROFILE',
      resourceId: updated.id,
      result: AuditResult.SUCCESS,
      details: {
        doctorId,
        status,
        notes: notes || null,
        rejectionReason: reason || null,
      },
    });

    if (this.notificationsService) {
      const isApproved = status === DoctorVerificationStatus.VERIFIED;
      await this.notificationsService.sendNotification({
        userId: doctorId,
        type: NotificationType.DOCTOR_VERIFIED,
        title: `Physician Verification: ${status}`,
        message: isApproved
          ? 'Congratulations! Your medical credentials have been verified. You now have full access to patient records and clinical tools.'
          : `Your physician credential verification was updated to ${status}.${reason ? ` Reason: ${reason}` : ''}`,
        metadata: {
          status,
          notes,
          reason,
          action: 'VIEW_PROFILE',
        },
      });
      this.notificationsService.sendRealtimeAction(doctorId, 'doctor:verification:updated', {
        status,
        notes,
        reason,
      });
    }

    return {
      message: `Doctor verification updated to ${status}`,
      profile: updated,
    };
  }

  /**
   * Admin lists doctor verification submissions
   */
  async listDoctorVerifications(status?: DoctorVerificationStatus) {
    const where: any = {
      role: Role.DOCTOR,
    };

    if (status) {
      where.doctorProfile = { verificationStatus: status };
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        status: true,
        phoneNumber: true,
        createdAt: true,
        doctorProfile: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // -------------------------------------------------------------
  // Doctor Clinical Dashboard
  // -------------------------------------------------------------

  /**
   * Actionable Clinical Dashboard:
   * "What requires my attention in my patient journey today?"
   */
  async getDoctorDashboard(doctorId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // 1. Approved connected patient accesses
    const approvedAccesses = await this.prisma.doctorPatientAccess.findMany({
      where: {
        doctorId,
        status: AccessStatus.APPROVED,
      },
      include: {
        patient: {
          select: {
            id: true,
            email: true,
            patientProfile: true,
            documents: {
              where: { isArchived: false },
              select: { id: true, createdAt: true, feedbacks: { where: { doctorId }, select: { id: true } } },
            },
          },
        },
      },
    });

    const connectedPatientIds = approvedAccesses.map((a) => a.patientId);

    // 2. Consultations recorded / scheduled today
    const todayConsultations = await this.prisma.consultation.findMany({
      where: {
        doctorId,
        consultationDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        patient: {
          select: { id: true, email: true, patientProfile: true },
        },
      },
      orderBy: { consultationDate: 'desc' },
    });

    // 3. Follow-ups due today or overdue
    const followUpsDue = await this.prisma.followUp.findMany({
      where: {
        doctorId,
        status: FollowUpStatus.UPCOMING,
        dueDate: {
          lte: endOfDay,
        },
      },
      include: {
        patient: {
          select: { id: true, email: true, patientProfile: true },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    // 4. Pending connection requests (outgoing or incoming)
    const pendingRequests = await this.prisma.doctorPatientAccess.findMany({
      where: {
        doctorId,
        status: AccessStatus.PENDING,
      },
      include: {
        patient: {
          select: { id: true, email: true, patientProfile: true },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });

    // 5. Reports awaiting review (documents uploaded by consented patients with NO feedback from this doctor)
    const reportsAwaitingReview = await this.prisma.document.findMany({
      where: {
        patientId: { in: connectedPatientIds },
        isArchived: false,
        feedbacks: {
          none: { doctorId },
        },
      },
      include: {
        patient: {
          select: { id: true, email: true, patientProfile: true },
        },
        metadata: true,
        versions: {
          take: 1,
          orderBy: { versionNumber: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // 6. Recent patient activity from consented patients
    const recentActivity = await this.prisma.healthTimelineEvent.findMany({
      where: {
        patientId: { in: connectedPatientIds },
      },
      include: {
        patient: {
          select: { id: true, email: true, patientProfile: true },
        },
      },
      orderBy: { eventDate: 'desc' },
      take: 8,
    });

    // Build synthesized pending actions
    const pendingActions: Array<{
      id: string;
      type: 'REVIEW_REPORT' | 'FOLLOW_UP_DUE' | 'RESPOND_REQUEST' | 'CONSULTATION_INCOMPLETE';
      title: string;
      description: string;
      patientName: string;
      patientId: string;
      targetId?: string;
      dueDate?: string;
    }> = [];

    reportsAwaitingReview.slice(0, 5).forEach((doc) => {
      pendingActions.push({
        id: `report-${doc.id}`,
        type: 'REVIEW_REPORT',
        title: `Review ${doc.metadata?.reportTitle || doc.category.replace('_', ' ')}`,
        description: `Uploaded ${doc.createdAt.toLocaleDateString()} — requires clinical assessment`,
        patientName: doc.patient.patientProfile?.fullName || doc.patient.email,
        patientId: doc.patientId,
        targetId: doc.id,
      });
    });

    followUpsDue.slice(0, 5).forEach((fu) => {
      pendingActions.push({
        id: `fu-${fu.id}`,
        type: 'FOLLOW_UP_DUE',
        title: `Follow-up Due: ${fu.reason}`,
        description: fu.instructions || 'Routine clinical follow-up due',
        patientName: fu.patient.patientProfile?.fullName || fu.patient.email,
        patientId: fu.patientId,
        targetId: fu.id,
        dueDate: fu.dueDate.toISOString(),
      });
    });

    pendingRequests.slice(0, 3).forEach((req) => {
      pendingActions.push({
        id: `req-${req.id}`,
        type: 'RESPOND_REQUEST',
        title: 'Consent Request Pending',
        description: req.notes || 'Awaiting patient authorization',
        patientName: req.patient.patientProfile?.fullName || req.patient.email,
        patientId: req.patientId,
        targetId: req.id,
      });
    });

    return {
      metrics: {
        activePatientsCount: connectedPatientIds.length,
        todayConsultationsCount: todayConsultations.length,
        reportsAwaitingReviewCount: reportsAwaitingReview.length,
        followUpsDueCount: followUpsDue.length,
        pendingRequestsCount: pendingRequests.length,
      },
      todayConsultations,
      followUpsDue,
      reportsAwaitingReview,
      recentActivity,
      pendingActions,
    };
  }

  // -------------------------------------------------------------
  // Doctor Connected Patients List (`/app/patients`)
  // -------------------------------------------------------------

  /**
   * Doctor lists all connected patients with search, activity, and clinical status
   */
  async getDoctorAssignedPatients(doctorId: string, search?: string) {
    const accesses = await this.prisma.doctorPatientAccess.findMany({
      where: {
        doctorId,
        status: AccessStatus.APPROVED,
        ...(search
          ? {
              patient: {
                OR: [
                  { email: { contains: search, mode: 'insensitive' } },
                  { patientProfile: { fullName: { contains: search, mode: 'insensitive' } } },
                  { patientProfile: { city: { contains: search, mode: 'insensitive' } } },
                ],
              },
            }
          : {}),
      },
      include: {
        patient: {
          select: {
            id: true,
            email: true,
            phoneNumber: true,
            patientProfile: true,
            _count: {
              select: { documents: true },
            },
            documents: {
              where: { isArchived: false },
              select: {
                id: true,
                createdAt: true,
                feedbacks: {
                  where: { doctorId },
                  select: { id: true },
                },
              },
            },
            patientConsultations: {
              where: { doctorId },
              orderBy: { consultationDate: 'desc' },
              take: 1,
              select: { consultationDate: true, reasonForVisit: true },
            },
            patientFollowUps: {
              where: { doctorId, status: FollowUpStatus.UPCOMING },
              orderBy: { dueDate: 'asc' },
              take: 1,
              select: { dueDate: true, reason: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return accesses.map((a) => {
      const docs = a.patient.documents || [];
      const unreviewedCount = docs.filter((d) => d.feedbacks.length === 0).length;
      const lastConsult = a.patient.patientConsultations[0];
      const nextFollowUp = a.patient.patientFollowUps[0];

      return {
        accessId: a.id,
        patientId: a.patientId,
        relationshipType: a.relationshipType,
        accessScope: a.accessScope,
        expiresAt: a.expiresAt,
        grantedAt: a.respondedAt || a.updatedAt,
        patient: {
          ...a.patient.patientProfile,
          email: a.patient.email,
          phone: a.patient.phoneNumber,
          totalDocuments: a.patient._count.documents,
        },
        clinicalSnapshot: {
          pendingReportsCount: unreviewedCount,
          lastConsultationDate: lastConsult?.consultationDate || null,
          lastConsultationReason: lastConsult?.reasonForVisit || null,
          nextFollowUpDate: nextFollowUp?.dueDate || null,
          nextFollowUpReason: nextFollowUp?.reason || null,
        },
      };
    });
  }

  // -------------------------------------------------------------
  // Patient Workspace Deep-Dive (`/app/patients/:patientId`)
  // -------------------------------------------------------------

  /**
   * Doctor views the complete authorized workspace of a consented patient
   * Enforces backend authorization and generates audit logs.
   */
  async getPatientWorkspace(doctorId: string, patientId: string) {
    // 1. Verify doctor-patient access relationship
    const access = await this.prisma.doctorPatientAccess.findFirst({
      where: {
        doctorId,
        patientId,
        status: AccessStatus.APPROVED,
      },
    });

    if (!access) {
      throw new ForbiddenException(
        'Access denied: You do not have approved consent to view this patient’s medical records',
      );
    }

    // Check expiration if set
    if (access.expiresAt && new Date() > access.expiresAt) {
      throw new ForbiddenException(
        'Access expired: The patient’s consent grant has expired. Please request renewed access.',
      );
    }

    // 2. Fetch patient demographics & medical profile
    const patientUser = await this.prisma.user.findUnique({
      where: { id: patientId },
      include: {
        patientProfile: true,
      },
    });

    if (!patientUser) {
      throw new NotFoundException('Patient record not found');
    }

    // 3. Fetch authorized documents (filtered by accessScope if restricted)
    const documents = await this.prisma.document.findMany({
      where: {
        patientId,
        isArchived: false,
        category: { in: access.accessScope as any },
      },
      include: {
        metadata: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        feedbacks: {
          include: {
            doctor: {
              select: {
                id: true,
                doctorProfile: {
                  select: { fullName: true, specialization: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Clinician view-only: Server refuses to generate signed download URLs for doctors
    const documentsViewOnly = documents.map((doc) => {
      return {
        ...doc,
        signedUrl: null,
        signedUrlExpiresInSeconds: null,
        downloadProhibited: true,
        accessMode: 'VIEW_ONLY',
      };
    });

    // 4. Fetch Consultations, Prescriptions, Investigations, Referrals, and FollowUps
    const [consultations, prescriptions, investigations, referrals, followUps, timelineEvents] =
      await Promise.all([
        this.prisma.consultation.findMany({
          where: { patientId, doctorId },
          orderBy: { consultationDate: 'desc' },
        }),
        this.prisma.prescription.findMany({
          where: { patientId, doctorId },
          include: { items: true },
          orderBy: { prescriptionDate: 'desc' },
        }),
        this.prisma.investigationRequest.findMany({
          where: { patientId, doctorId },
          orderBy: { requestedDate: 'desc' },
        }),
        this.prisma.referral.findMany({
          where: { patientId, doctorId },
          orderBy: { referralDate: 'desc' },
        }),
        this.prisma.followUp.findMany({
          where: { patientId, doctorId },
          orderBy: { dueDate: 'asc' },
        }),
        this.prisma.healthTimelineEvent.findMany({
          where: { patientId },
          orderBy: { eventDate: 'desc' },
          take: 30,
        }),
      ]);

    // 5. Immutable Audit Log for sensitive medical record access
    await this.auditService.log({
      actorId: doctorId,
      actorRole: Role.DOCTOR,
      action: AuditAction.VIEW_PATIENT,
      resourceType: 'PATIENT_WORKSPACE',
      resourceId: patientId,
      result: AuditResult.SUCCESS,
      details: {
        consentId: access.id,
        relationshipType: access.relationshipType,
        scope: access.accessScope,
      },
    });

    return {
      patient: {
        id: patientUser.id,
        email: patientUser.email,
        phone: patientUser.phoneNumber,
        ...patientUser.patientProfile,
      },
      access: {
        id: access.id,
        status: access.status,
        relationshipType: access.relationshipType,
        accessScope: access.accessScope,
        expiresAt: access.expiresAt,
        grantedAt: access.respondedAt || access.updatedAt,
      },
      documents: documentsViewOnly,
      consultations,
      prescriptions,
      investigations,
      referrals,
      followUps,
      timeline: timelineEvents,
    };
  }

  // -------------------------------------------------------------
  // Consultation Module
  // -------------------------------------------------------------

  /**
   * Doctor creates a new consultation record for a consented patient
   */
  async createConsultation(doctor: AuthenticatedUser, patientId: string, dto: CreateConsultationDto) {
    // Assert approved access
    await this.assertCanAccessPatient(doctor.id, patientId);

    const consult = await this.prisma.consultation.create({
      data: {
        patientId,
        doctorId: doctor.id,
        consultationDate: dto.consultationDate ? new Date(dto.consultationDate) : new Date(),
        reasonForVisit: dto.reasonForVisit,
        chiefComplaint: dto.chiefComplaint,
        clinicalNotes: dto.clinicalNotes,
        assessment: dto.assessment,
        plan: dto.plan,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
        followUpInstructions: dto.followUpInstructions || null,
        attachments: dto.attachments || [],
      },
    });

    // If follow-up date is provided, create linked follow-up automatically
    if (dto.followUpDate) {
      await this.prisma.followUp.create({
        data: {
          patientId,
          doctorId: doctor.id,
          dueDate: new Date(dto.followUpDate),
          reason: `Follow-up: ${dto.reasonForVisit}`,
          instructions: dto.followUpInstructions || 'Review response to treatment plan',
          status: FollowUpStatus.UPCOMING,
        },
      });
    }

    // Project event to patient's longitudinal healthcare timeline
    if (this.timelineService) {
      await this.timelineService.projectConsultation(consult.id);
    } else {
      await this.prisma.healthTimelineEvent.create({
        data: {
          patientId,
          eventType: TimelineEventType.CONSULTATION_ADDED,
          eventDate: consult.consultationDate,
          title: `Consultation: ${dto.reasonForVisit}`,
          description: `Assessment: ${dto.assessment}`,
          metadata: {
            consultationId: consult.id,
            doctorId: doctor.id,
            doctorName: doctor.email,
          },
        },
      });
    }

    // Audit log
    await this.auditService.log({
      actorId: doctor.id,
      actorEmail: doctor.email,
      actorRole: Role.DOCTOR,
      action: AuditAction.CREATE_CONSULTATION,
      resourceType: 'CONSULTATION',
      resourceId: consult.id,
      result: AuditResult.SUCCESS,
      details: { patientId, reasonForVisit: dto.reasonForVisit },
    });

    if (this.notificationsService) {
      const doctorProfile = await this.prisma.doctorProfile.findUnique({
        where: { userId: doctor.id },
      });
      const doctorName = doctorProfile?.fullName || doctor.email;

      await this.notificationsService.sendNotification({
        userId: patientId,
        type: NotificationType.CONSULTATION_CREATED,
        title: 'New Consultation Recorded',
        message: `Dr. ${doctorName} recorded notes for your consultation: "${dto.reasonForVisit}".`,
        metadata: {
          consultationId: consult.id,
          doctorId: doctor.id,
          doctorName,
          reasonForVisit: dto.reasonForVisit,
          action: 'VIEW_CONSULTATIONS',
        },
      });
      this.notificationsService.sendRealtimeAction(patientId, 'consultation:created', {
        consultationId: consult.id,
        doctorId: doctor.id,
      });
    }

    return {
      message: 'Consultation note recorded successfully',
      consultation: consult,
    };
  }

  async getPatientConsultations(doctorId: string, patientId: string) {
    await this.assertCanAccessPatient(doctorId, patientId);
    return this.prisma.consultation.findMany({
      where: { patientId, doctorId },
      include: { prescriptions: { include: { items: true } } },
      orderBy: { consultationDate: 'desc' },
    });
  }

  async getConsultationById(doctorId: string, consultationId: string) {
    const consult = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        patient: { select: { id: true, email: true, patientProfile: true } },
        prescriptions: { include: { items: true } },
      },
    });

    if (!consult || consult.doctorId !== doctorId) {
      throw new NotFoundException('Consultation record not found');
    }

    return consult;
  }

  async updateConsultation(doctorId: string, consultationId: string, dto: UpdateConsultationDto) {
    const existing = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
    });

    if (!existing || existing.doctorId !== doctorId) {
      throw new NotFoundException('Consultation record not found or unauthorized');
    }

    const updated = await this.prisma.consultation.update({
      where: { id: consultationId },
      data: {
        reasonForVisit: dto.reasonForVisit !== undefined ? dto.reasonForVisit : existing.reasonForVisit,
        chiefComplaint: dto.chiefComplaint !== undefined ? dto.chiefComplaint : existing.chiefComplaint,
        clinicalNotes: dto.clinicalNotes !== undefined ? dto.clinicalNotes : existing.clinicalNotes,
        assessment: dto.assessment !== undefined ? dto.assessment : existing.assessment,
        plan: dto.plan !== undefined ? dto.plan : existing.plan,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : existing.followUpDate,
        followUpInstructions: dto.followUpInstructions !== undefined ? dto.followUpInstructions : existing.followUpInstructions,
        attachments: dto.attachments !== undefined ? dto.attachments : existing.attachments,
      },
    });

    await this.auditService.log({
      actorId: doctorId,
      actorRole: Role.DOCTOR,
      action: AuditAction.UPDATE_CONSULTATION,
      resourceType: 'CONSULTATION',
      resourceId: consultationId,
      result: AuditResult.SUCCESS,
    });

    return {
      message: 'Consultation note updated successfully',
      consultation: updated,
    };
  }

  // -------------------------------------------------------------
  // Prescription Module
  // -------------------------------------------------------------

  /**
   * Doctor issues a prescription for a consented patient
   */
  async createPrescription(doctor: AuthenticatedUser, patientId: string, dto: CreatePrescriptionDto) {
    await this.assertCanAccessPatient(doctor.id, patientId);

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Prescription must contain at least one medication item');
    }

    const prescription = await this.prisma.prescription.create({
      data: {
        patientId,
        doctorId: doctor.id,
        consultationId: dto.consultationId || null,
        prescriptionDate: dto.prescriptionDate ? new Date(dto.prescriptionDate) : new Date(),
        notes: dto.notes || null,
        items: {
          create: dto.items.map((item) => ({
            medicineName: item.medicineName,
            dosage: item.dosage,
            frequency: item.frequency,
            duration: item.duration,
            instructions: item.instructions || null,
            additionalNotes: item.additionalNotes || null,
          })),
        },
      },
      include: { items: true },
    });

    // Project event to patient's longitudinal healthcare timeline
    if (this.timelineService) {
      await this.timelineService.projectPrescription(prescription.id);
    } else {
      await this.prisma.healthTimelineEvent.create({
        data: {
          patientId,
          eventType: TimelineEventType.PRESCRIPTION_ADDED,
          eventDate: prescription.prescriptionDate,
          title: `Prescription Issued (${dto.items.length} medications)`,
          description: dto.items.map((i) => `${i.medicineName} ${i.dosage}`).join(', '),
          metadata: {
            prescriptionId: prescription.id,
            doctorId: doctor.id,
          },
        },
      });
    }

    // Audit log
    await this.auditService.log({
      actorId: doctor.id,
      actorEmail: doctor.email,
      actorRole: Role.DOCTOR,
      action: AuditAction.CREATE_PRESCRIPTION,
      resourceType: 'PRESCRIPTION',
      resourceId: prescription.id,
      result: AuditResult.SUCCESS,
      details: { patientId, itemCount: dto.items.length },
    });

    if (this.notificationsService) {
      const doctorProfile = await this.prisma.doctorProfile.findUnique({
        where: { userId: doctor.id },
      });
      const doctorName = doctorProfile?.fullName || doctor.email;

      await this.notificationsService.sendNotification({
        userId: patientId,
        type: NotificationType.PRESCRIPTION_ISSUED,
        title: 'New Prescription Issued',
        message: `Dr. ${doctorName} issued a new prescription with ${dto.items.length} medication(s).`,
        metadata: {
          prescriptionId: prescription.id,
          doctorId: doctor.id,
          doctorName,
          medicationsCount: dto.items.length,
          action: 'VIEW_PRESCRIPTIONS',
        },
      });
      this.notificationsService.sendRealtimeAction(patientId, 'prescription:created', {
        prescriptionId: prescription.id,
        doctorId: doctor.id,
      });
    }

    return {
      message: 'Prescription recorded successfully',
      prescription,
    };
  }

  async getPatientPrescriptions(doctorId: string, patientId: string) {
    await this.assertCanAccessPatient(doctorId, patientId);
    return this.prisma.prescription.findMany({
      where: { patientId, doctorId },
      include: { items: true },
      orderBy: { prescriptionDate: 'desc' },
    });
  }

  async getPrescriptionById(doctorId: string, prescriptionId: string) {
    const rx = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        items: true,
        patient: { select: { id: true, email: true, patientProfile: true } },
      },
    });

    if (!rx || rx.doctorId !== doctorId) {
      throw new NotFoundException('Prescription record not found');
    }

    return rx;
  }

  // -------------------------------------------------------------
  // Investigation Request Module
  // -------------------------------------------------------------

  /**
   * Doctor requests a laboratory or imaging investigation
   */
  async createInvestigation(doctor: AuthenticatedUser, patientId: string, dto: CreateInvestigationDto) {
    await this.assertCanAccessPatient(doctor.id, patientId);

    const investigation = await this.prisma.investigationRequest.create({
      data: {
        patientId,
        doctorId: doctor.id,
        investigationName: dto.investigationName,
        category: dto.category || 'LABORATORY',
        reason: dto.reason,
        priority: dto.priority || 'ROUTINE',
        notes: dto.notes || null,
      },
    });

    // Project event to patient's longitudinal healthcare timeline
    if (this.timelineService) {
      await this.timelineService.projectInvestigation(investigation.id);
    } else {
      await this.prisma.healthTimelineEvent.create({
        data: {
          patientId,
          eventType: TimelineEventType.INVESTIGATION_REQUESTED,
          eventDate: investigation.requestedDate,
          title: `Investigation Requested: ${dto.investigationName}`,
          description: `Reason: ${dto.reason}`,
          metadata: {
            investigationId: investigation.id,
            priority: dto.priority || 'ROUTINE',
            category: dto.category || 'LABORATORY',
          },
        },
      });
    }

    // Audit log
    await this.auditService.log({
      actorId: doctor.id,
      actorEmail: doctor.email,
      actorRole: Role.DOCTOR,
      action: AuditAction.CREATE_INVESTIGATION,
      resourceType: 'INVESTIGATION_REQUEST',
      resourceId: investigation.id,
      result: AuditResult.SUCCESS,
      details: { patientId, investigation: dto.investigationName },
    });

    if (this.notificationsService) {
      const doctorProfile = await this.prisma.doctorProfile.findUnique({
        where: { userId: doctor.id },
      });
      const doctorName = doctorProfile?.fullName || doctor.email;

      await this.notificationsService.sendNotification({
        userId: patientId,
        type: NotificationType.INVESTIGATION_ORDERED,
        title: 'Diagnostic Test Ordered',
        message: `Dr. ${doctorName} ordered a test: "${dto.investigationName}".`,
        metadata: {
          investigationId: investigation.id,
          doctorId: doctor.id,
          doctorName,
          investigationName: dto.investigationName,
          category: dto.category,
          priority: dto.priority,
          action: 'VIEW_INVESTIGATIONS',
        },
      });
      this.notificationsService.sendRealtimeAction(patientId, 'investigation:ordered', {
        investigationId: investigation.id,
        doctorId: doctor.id,
      });
    }

    return {
      message: 'Investigation request recorded',
      investigation,
    };
  }

  async getPatientInvestigations(doctorId: string, patientId: string) {
    await this.assertCanAccessPatient(doctorId, patientId);
    return this.prisma.investigationRequest.findMany({
      where: { patientId, doctorId },
      orderBy: { requestedDate: 'desc' },
    });
  }

  async updateInvestigationStatus(doctorId: string, investigationId: string, status: string) {
    const inv = await this.prisma.investigationRequest.findUnique({
      where: { id: investigationId },
    });

    if (!inv || inv.doctorId !== doctorId) {
      throw new NotFoundException('Investigation request not found or unauthorized');
    }

    const updated = await this.prisma.investigationRequest.update({
      where: { id: investigationId },
      data: { status },
    });

    return {
      message: `Investigation status updated to ${status}`,
      investigation: updated,
    };
  }

  // -------------------------------------------------------------
  // Referral Module
  // -------------------------------------------------------------

  /**
   * Doctor creates a specialist referral
   */
  async createReferral(doctor: AuthenticatedUser, patientId: string, dto: CreateReferralDto) {
    await this.assertCanAccessPatient(doctor.id, patientId);

    const referral = await this.prisma.referral.create({
      data: {
        patientId,
        doctorId: doctor.id,
        specialty: dto.specialty,
        referredProvider: dto.referredProvider || null,
        reason: dto.reason,
        notes: dto.notes || null,
        priority: dto.priority || 'ROUTINE',
      },
    });

    // Project event to patient's longitudinal healthcare timeline
    if (this.timelineService) {
      await this.timelineService.projectReferral(referral.id);
    } else {
      await this.prisma.healthTimelineEvent.create({
        data: {
          patientId,
          eventType: TimelineEventType.REFERRAL_CREATED,
          eventDate: referral.referralDate,
          title: `Specialist Referral: ${dto.specialty}`,
          description: `Reason: ${dto.reason}`,
          metadata: {
            referralId: referral.id,
            priority: dto.priority || 'ROUTINE',
          },
        },
      });
    }

    // Audit log
    await this.auditService.log({
      actorId: doctor.id,
      actorEmail: doctor.email,
      actorRole: Role.DOCTOR,
      action: AuditAction.CREATE_REFERRAL,
      resourceType: 'REFERRAL',
      resourceId: referral.id,
      result: AuditResult.SUCCESS,
      details: { patientId, specialty: dto.specialty },
    });

    return {
      message: 'Referral created successfully',
      referral,
    };
  }

  async getPatientReferrals(doctorId: string, patientId: string) {
    await this.assertCanAccessPatient(doctorId, patientId);
    return this.prisma.referral.findMany({
      where: { patientId, doctorId },
      orderBy: { referralDate: 'desc' },
    });
  }

  // -------------------------------------------------------------
  // Follow-up Module
  // -------------------------------------------------------------

  /**
   * Doctor schedules a clinical follow-up for a consented patient
   */
  async createFollowUp(doctor: AuthenticatedUser, patientId: string, dto: CreateFollowUpDto) {
    await this.assertCanAccessPatient(doctor.id, patientId);

    const followUp = await this.prisma.followUp.create({
      data: {
        patientId,
        doctorId: doctor.id,
        dueDate: new Date(dto.dueDate),
        reason: dto.reason,
        instructions: dto.instructions || null,
        status: FollowUpStatus.UPCOMING,
      },
    });

    // Project event to patient's longitudinal healthcare timeline
    if (this.timelineService) {
      await this.timelineService.projectFollowUp(followUp.id);
    } else {
      await this.prisma.healthTimelineEvent.create({
        data: {
          patientId,
          eventType: TimelineEventType.FOLLOW_UP_SCHEDULED,
          eventDate: followUp.dueDate,
          title: `Clinical Follow-up Scheduled`,
          description: dto.reason,
          metadata: {
            followUpId: followUp.id,
            dueDate: followUp.dueDate.toISOString(),
          },
        },
      });
    }

    // Audit log
    await this.auditService.log({
      actorId: doctor.id,
      actorEmail: doctor.email,
      actorRole: Role.DOCTOR,
      action: AuditAction.CREATE_FOLLOW_UP,
      resourceType: 'FOLLOW_UP',
      resourceId: followUp.id,
      result: AuditResult.SUCCESS,
      details: { patientId, dueDate: dto.dueDate },
    });

    if (this.notificationsService) {
      const doctorProfile = await this.prisma.doctorProfile.findUnique({
        where: { userId: doctor.id },
      });
      const doctorName = doctorProfile?.fullName || doctor.email;
      const formattedDate = new Date(dto.dueDate).toLocaleDateString();

      await this.notificationsService.sendNotification({
        userId: patientId,
        type: NotificationType.FOLLOW_UP_SCHEDULED,
        title: 'Clinical Follow-Up Scheduled',
        message: `Dr. ${doctorName} scheduled a follow-up for ${formattedDate}: "${dto.reason}".`,
        metadata: {
          followUpId: followUp.id,
          doctorId: doctor.id,
          doctorName,
          dueDate: followUp.dueDate,
          reason: dto.reason,
          action: 'VIEW_FOLLOWUPS',
        },
      });
      this.notificationsService.sendRealtimeAction(patientId, 'followup:scheduled', {
        followUpId: followUp.id,
        doctorId: doctor.id,
      });
    }

    return {
      message: 'Follow-up scheduled successfully',
      followUp,
    };
  }

  async getPatientFollowUps(doctorId: string, patientId: string) {
    await this.assertCanAccessPatient(doctorId, patientId);
    return this.prisma.followUp.findMany({
      where: { patientId, doctorId },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getDoctorFollowUps(doctorId: string) {
    return this.prisma.followUp.findMany({
      where: { doctorId },
      include: {
        patient: { select: { id: true, email: true, patientProfile: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async updateFollowUpStatus(doctorId: string, followUpId: string, status: FollowUpStatus) {
    const fu = await this.prisma.followUp.findUnique({
      where: { id: followUpId },
    });

    if (!fu || fu.doctorId !== doctorId) {
      throw new NotFoundException('Follow-up record not found or unauthorized');
    }

    const updated = await this.prisma.followUp.update({
      where: { id: followUpId },
      data: {
        status,
        completedAt: status === FollowUpStatus.COMPLETED ? new Date() : null,
      },
    });

    await this.auditService.log({
      actorId: doctorId,
      actorRole: Role.DOCTOR,
      action: AuditAction.UPDATE_FOLLOW_UP,
      resourceType: 'FOLLOW_UP',
      resourceId: followUpId,
      result: AuditResult.SUCCESS,
      details: { status },
    });

    return {
      message: `Follow-up status marked as ${status}`,
      followUp: updated,
    };
  }

  // -------------------------------------------------------------
  // Document Review & Clinical Assessment Module
  // -------------------------------------------------------------

  /**
   * Doctor lists reports awaiting review across all consented patients
   */
  async getReportsAwaitingReview(doctorId: string) {
    const accesses = await this.prisma.doctorPatientAccess.findMany({
      where: { doctorId, status: AccessStatus.APPROVED },
      select: { patientId: true },
    });

    const patientIds = accesses.map((a) => a.patientId);

    const documents = await this.prisma.document.findMany({
      where: {
        patientId: { in: patientIds },
        isArchived: false,
        feedbacks: {
          none: { doctorId },
        },
      },
      include: {
        patient: {
          select: { id: true, email: true, patientProfile: true },
        },
        metadata: true,
        versions: {
          take: 1,
          orderBy: { versionNumber: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return documents;
  }

  /**
   * Doctor views single authorized document with short-lived signed URL and audits access
   */
  async getAuthorizedDocument(doctor: AuthenticatedUser, documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        metadata: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
        patient: {
          select: { id: true, email: true, patientProfile: true },
        },
        feedbacks: {
          include: {
            doctor: {
              select: {
                id: true,
                doctorProfile: { select: { fullName: true, specialization: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Medical document not found');
    }

    // Centralized effective authorization (Section 14 & 15)
    if (this.consentAuthService) {
      await this.consentAuthService.authorize({
        actorId: doctor.id,
        actorRole: doctor.role,
        actorEmail: doctor.email,
        patientId: document.patientId,
        resourceType: ConsentResourceType.DOCUMENT,
        resourceId: document.id,
        action: 'VIEW',
      });
    } else {
      await this.assertCanAccessPatient(doctor.id, document.patientId);
    }

    // Clinician view-only policy: Server refuses to generate signed download URLs for clinicians
    const signedUrl: string | null = null;
    const downloadProhibited = true;
    const accessMode = 'VIEW_ONLY';

    // Log document view audit event
    await this.auditService.log({
      actorId: doctor.id,
      actorEmail: doctor.email,
      actorRole: Role.DOCTOR,
      action: AuditAction.DOCUMENT_VIEW,
      resourceType: 'DOCUMENT',
      resourceId: documentId,
      result: AuditResult.SUCCESS,
      details: {
        patientId: document.patientId,
        category: document.category,
        accessMode,
        downloadProhibited,
      },
    });

    return {
      ...document,
      signedUrl,
      signedUrlExpiresInSeconds: null,
      downloadProhibited,
      accessMode,
    };
  }

  /**
   * Doctor submits clinical assessment/feedback on a patient document
   */
  async addDoctorFeedback(doctorId: string, documentId: string, dto: DoctorFeedbackDto) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { patient: true, metadata: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    await this.assertCanAccessPatient(doctorId, document.patientId);

    const feedback = await this.prisma.doctorFeedback.create({
      data: {
        documentId,
        doctorId,
        notes: dto.notes,
        recommendations: dto.recommendations || null,
        isReviewed: true,
        reviewedAt: new Date(),
      },
      include: {
        doctor: {
          select: {
            id: true,
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

    await this.auditService.log({
      actorId: doctorId,
      actorRole: Role.DOCTOR,
      action: AuditAction.DOCUMENT_UPDATE,
      resourceType: 'DOCTOR_FEEDBACK',
      resourceId: feedback.id,
      result: AuditResult.SUCCESS,
      details: {
        documentId,
        patientId: document.patientId,
      },
    });

    if (this.notificationsService) {
      const doctorName = feedback.doctor?.doctorProfile?.fullName || 'Your physician';
      const docTitle = document.metadata?.reportTitle || document.category || 'Medical Report';

      await this.notificationsService.sendNotification({
        userId: document.patientId,
        type: NotificationType.CLINICAL_FEEDBACK_ADDED,
        title: 'Physician Feedback Added',
        message: `Dr. ${doctorName} added clinical feedback & observations for "${docTitle}".`,
        metadata: {
          documentId,
          feedbackId: feedback.id,
          doctorId,
          doctorName,
          docTitle,
          notes: dto.notes,
          recommendations: dto.recommendations || null,
          action: 'VIEW_DOCUMENT',
        },
      });
      this.notificationsService.sendRealtimeAction(document.patientId, 'document:feedback:added', {
        documentId,
        feedbackId: feedback.id,
        doctorId,
      });
    }

    return {
      message: 'Clinical assessment saved and attached to record',
      feedback,
    };
  }

  /**
   * Get all clinician feedback on a document
   */
  async getDocumentFeedback(documentId: string) {
    return this.prisma.doctorFeedback.findMany({
      where: { documentId },
      include: {
        doctor: {
          select: {
            id: true,
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
      orderBy: { createdAt: 'desc' },
    });
  }

  // -------------------------------------------------------------
  // Doctor Activity Log (`/app/activity`)
  // -------------------------------------------------------------

  /**
   * Doctor views their own clinical and security audit trail
   */
  async getDoctorActivity(doctorId: string, limit = 50, offset = 0) {
    return this.auditService.getMyAuditLogs(doctorId, limit, offset);
  }

  // -------------------------------------------------------------
  // Public Doctor Directory & Showcase
  // -------------------------------------------------------------

  async listDoctors() {
    const doctors = await this.prisma.user.findMany({
      where: {
        role: Role.DOCTOR,
        status: 'ACTIVE',
        doctorProfile: {
          verificationStatus: DoctorVerificationStatus.VERIFIED,
        },
      },
      include: {
        doctorProfile: true,
        receivedReviews: {
          select: {
            rating: true,
          },
        },
      },
    });

    return doctors
      .filter((d) => d.doctorProfile)
      .map((d) => {
        const ratings = d.receivedReviews.map((r) => r.rating);
        const avgRating = ratings.length
          ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1))
          : 5.0;

        return {
          id: d.id,
          email: d.email,
          fullName: d.doctorProfile?.fullName,
          specialization: d.doctorProfile?.specialization,
          hospitalAffiliation: d.doctorProfile?.hospitalAffiliation,
          bio: d.doctorProfile?.bio,
          yearsOfExperience: d.doctorProfile?.yearsOfExperience || 0,
          medicalCertificate: d.doctorProfile?.medicalCertificate,
          education: d.doctorProfile?.education,
          consultationFee: d.doctorProfile?.consultationFee,
          clinicName: d.doctorProfile?.clinicName,
          city: d.doctorProfile?.city,
          averageRating: avgRating,
          reviewCount: ratings.length,
        };
      });
  }

  async getDoctorShowcase(doctorId: string) {
    const doctor = await this.prisma.user.findUnique({
      where: { id: doctorId },
      include: {
        doctorProfile: true,
        receivedReviews: {
          include: {
            patient: {
              select: {
                patientProfile: {
                  select: {
                    fullName: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!doctor || doctor.role !== Role.DOCTOR || !doctor.doctorProfile) {
      throw new NotFoundException('Doctor not found');
    }

    const ratings = doctor.receivedReviews.map((r) => r.rating);
    const avgRating = ratings.length
      ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1))
      : 5.0;

    return {
      id: doctor.id,
      email: doctor.email,
      ...doctor.doctorProfile,
      averageRating: avgRating,
      reviewCount: ratings.length,
      reviews: doctor.receivedReviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        patientName: r.patient.patientProfile?.fullName || 'Verified Patient',
      })),
    };
  }

  async addDoctorReview(patientId: string, doctorId: string, dto: CreateReviewDto) {
    const access = await this.prisma.doctorPatientAccess.findFirst({
      where: {
        patientId,
        doctorId,
        status: AccessStatus.APPROVED,
      },
    });

    if (!access) {
      throw new ForbiddenException(
        'You can only review doctors who are on your assigned CarePath team',
      );
    }

    const review = await this.prisma.doctorReview.create({
      data: {
        patientId,
        doctorId,
        rating: dto.rating,
        comment: dto.comment || null,
      },
    });

    return {
      message: 'Review submitted successfully',
      review,
    };
  }

  // -------------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------------

  private async assertCanAccessPatient(doctorId: string, patientId: string) {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId: doctorId },
    });

    if (!profile || profile.verificationStatus !== DoctorVerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        'Access denied: Only administratively verified physicians can access patient medical records',
      );
    }

    const access = await this.prisma.doctorPatientAccess.findFirst({
      where: {
        doctorId,
        patientId,
        status: AccessStatus.APPROVED,
      },
    });

    if (!access) {
      throw new ForbiddenException(
        'Access denied: You do not have approved consent to view or modify this patient’s medical records',
      );
    }

    if (access.expiresAt && new Date() > access.expiresAt) {
      throw new ForbiddenException(
        'Access expired: The patient’s consent grant has expired. Please request renewed access.',
      );
    }

    return access;
  }
}
