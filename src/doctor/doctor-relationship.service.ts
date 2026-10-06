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
import {
  Role,
  UserStatus,
  DoctorVerificationStatus,
  RelationshipStatus,
  RelationshipEventType,
  ConnectionSource,
  NotificationType,
  AuditAction,
  AuditResult,
  AccessStatus,
} from '@prisma/client';
import { ConnectDoctorDto } from './dto/connect-doctor.dto';
import { DisconnectDoctorDto } from './dto/disconnect-doctor.dto';
import { BlockDoctorDto } from './dto/block-doctor.dto';

@Injectable()
export class DoctorRelationshipService {
  private readonly logger = new Logger(DoctorRelationshipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Connect patient to a verified doctor
   */
  async connectDoctor(
    patientId: string,
    doctorId: string,
    dto?: ConnectDoctorDto,
    clientIp?: string,
    userAgent?: string,
  ) {
    if (patientId === doctorId) {
      throw new BadRequestException('Cannot connect with yourself');
    }

    // Verify doctor exists, is active and verified
    const doctor = await this.prisma.user.findFirst({
      where: {
        id: doctorId,
        role: Role.DOCTOR,
        status: UserStatus.ACTIVE,
        doctorProfile: {
          verificationStatus: DoctorVerificationStatus.VERIFIED,
        },
      },
      include: { doctorProfile: true },
    });

    if (!doctor || !doctor.doctorProfile) {
      throw new NotFoundException(`Doctor with ID "${doctorId}" not found or is not a verified active physician`);
    }

    const patient = await this.prisma.user.findUnique({
      where: { id: patientId },
      include: { patientProfile: true },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID "${patientId}" not found`);
    }

    const patientName = patient.patientProfile?.fullName || patient.email;
    const doctorName = doctor.doctorProfile?.fullName || 'Doctor';

    // Check existing relationship
    const existing = await this.prisma.patientDoctorRelationship.findUnique({
      where: {
        patientId_doctorId: {
          patientId,
          doctorId,
        },
      },
    });

    let relationship;
    let eventType: RelationshipEventType = RelationshipEventType.CONNECTED;

    if (existing) {
      if (existing.status === RelationshipStatus.ACTIVE) {
        // Idempotent: already active
        return {
          ...existing,
          message: 'Already connected to this doctor',
        };
      }

      if (existing.status === RelationshipStatus.BLOCKED) {
        throw new BadRequestException('Doctor is currently blocked. Please unblock before connecting.');
      }

      // Reconnect from INACTIVE
      eventType = RelationshipEventType.RECONNECTED;
      relationship = await this.prisma.patientDoctorRelationship.update({
        where: { id: existing.id },
        data: {
          status: RelationshipStatus.ACTIVE,
          connectedAt: new Date(),
          disconnectedAt: null,
          lastInteractionAt: new Date(),
          connectionSource: dto?.source || existing.connectionSource,
          notes: dto?.notes !== undefined ? dto.notes : existing.notes,
        },
      });
    } else {
      // Create new active relationship
      relationship = await this.prisma.patientDoctorRelationship.create({
        data: {
          patientId,
          doctorId,
          status: RelationshipStatus.ACTIVE,
          connectionSource: dto?.source || ConnectionSource.SEARCH,
          notes: dto?.notes,
          connectedAt: new Date(),
          lastInteractionAt: new Date(),
        },
      });
    }

    // Record relationship event
    await this.prisma.patientDoctorRelationshipEvent.create({
      data: {
        relationshipId: relationship.id,
        eventType,
        actorId: patientId,
        metadata: {
          source: dto?.source || ConnectionSource.SEARCH,
        },
      },
    });

    // Send notification to doctor
    await this.notificationsService.sendNotification({
      userId: doctorId,
      type: NotificationType.DOCTOR_CONNECTED,
      title: 'New Patient Connection',
      message: `${patientName} has connected with your practice profile.`,
      metadata: {
        patientId,
        relationshipId: relationship.id,
      },
    });

    // Send notification to patient
    await this.notificationsService.sendNotification({
      userId: patientId,
      type: NotificationType.DOCTOR_CONNECTED,
      title: 'Doctor Connected',
      message: `You are now connected with Dr. ${doctorName}.`,
      metadata: {
        doctorId,
        relationshipId: relationship.id,
      },
    });

    // Audit log
    await this.auditService.log({
      actorId: patientId,
      actorEmail: patient.email,
      actorRole: Role.PATIENT,
      action: eventType === RelationshipEventType.RECONNECTED ? AuditAction.DOCTOR_RECONNECT : AuditAction.DOCTOR_CONNECT,
      resourceType: 'PATIENT_DOCTOR_RELATIONSHIP',
      resourceId: relationship.id,
      result: AuditResult.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      details: {
        doctorId,
        doctorName,
        source: dto?.source || ConnectionSource.SEARCH,
      },
    });

    return relationship;
  }

  /**
   * Reconnect patient with a previously disconnected doctor
   */
  async reconnectDoctor(
    patientId: string,
    doctorId: string,
    clientIp?: string,
    userAgent?: string,
  ) {
    const existing = await this.prisma.patientDoctorRelationship.findUnique({
      where: {
        patientId_doctorId: {
          patientId,
          doctorId,
        },
      },
      include: {
        doctor: { include: { doctorProfile: true } },
        patient: { include: { patientProfile: true } },
      },
    });

    if (!existing) {
      // Connect fresh if no prior relationship exists
      return this.connectDoctor(patientId, doctorId, undefined, clientIp, userAgent);
    }

    if (existing.status === RelationshipStatus.ACTIVE) {
      return {
        ...existing,
        message: 'Already connected to this doctor',
      };
    }

    if (existing.status === RelationshipStatus.BLOCKED) {
      throw new BadRequestException('Doctor is blocked. Please unblock before reconnecting.');
    }

    const relationship = await this.prisma.patientDoctorRelationship.update({
      where: { id: existing.id },
      data: {
        status: RelationshipStatus.ACTIVE,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastInteractionAt: new Date(),
      },
    });

    await this.prisma.patientDoctorRelationshipEvent.create({
      data: {
        relationshipId: relationship.id,
        eventType: RelationshipEventType.RECONNECTED,
        actorId: patientId,
      },
    });

    const patientName = existing.patient.patientProfile?.fullName || existing.patient.email;
    const doctorName = existing.doctor.doctorProfile?.fullName || 'Doctor';

    // Notifications
    await this.notificationsService.sendNotification({
      userId: doctorId,
      type: NotificationType.DOCTOR_RECONNECTED,
      title: 'Patient Reconnected',
      message: `${patientName} has reconnected with your practice.`,
      metadata: { patientId, relationshipId: relationship.id },
    });

    await this.notificationsService.sendNotification({
      userId: patientId,
      type: NotificationType.DOCTOR_RECONNECTED,
      title: 'Reconnected with Doctor',
      message: `You have reconnected with Dr. ${doctorName}.`,
      metadata: { doctorId, relationshipId: relationship.id },
    });

    // Audit log
    await this.auditService.log({
      actorId: patientId,
      actorEmail: existing.patient.email,
      actorRole: Role.PATIENT,
      action: AuditAction.DOCTOR_RECONNECT,
      resourceType: 'PATIENT_DOCTOR_RELATIONSHIP',
      resourceId: relationship.id,
      result: AuditResult.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      details: { doctorId, doctorName },
    });

    return relationship;
  }

  /**
   * Disconnect patient from doctor (sets status to INACTIVE)
   * Preserves all consultation and medical record histories!
   */
  async disconnectDoctor(
    patientId: string,
    doctorId: string,
    dto?: DisconnectDoctorDto,
    clientIp?: string,
    userAgent?: string,
  ) {
    const existing = await this.prisma.patientDoctorRelationship.findUnique({
      where: {
        patientId_doctorId: {
          patientId,
          doctorId,
        },
      },
      include: {
        doctor: { include: { doctorProfile: true } },
        patient: { include: { patientProfile: true } },
      },
    });

    if (!existing || existing.status !== RelationshipStatus.ACTIVE) {
      throw new BadRequestException('No active connection exists with this doctor');
    }

    const relationship = await this.prisma.patientDoctorRelationship.update({
      where: { id: existing.id },
      data: {
        status: RelationshipStatus.INACTIVE,
        disconnectedAt: new Date(),
        lastInteractionAt: new Date(),
      },
    });

    await this.prisma.patientDoctorRelationshipEvent.create({
      data: {
        relationshipId: relationship.id,
        eventType: RelationshipEventType.DISCONNECTED,
        actorId: patientId,
        reason: dto?.reason,
      },
    });

    const doctorName = existing.doctor.doctorProfile?.fullName || 'Doctor';

    // Notifications
    await this.notificationsService.sendNotification({
      userId: doctorId,
      type: NotificationType.DOCTOR_DISCONNECTED,
      title: 'Patient Disconnected',
      message: 'A patient has ended their connection with your practice.',
      metadata: { patientId, relationshipId: relationship.id },
    });

    await this.notificationsService.sendNotification({
      userId: patientId,
      type: NotificationType.DOCTOR_DISCONNECTED,
      title: 'Disconnected from Doctor',
      message: `You have ended your connection with Dr. ${doctorName}.`,
      metadata: { doctorId, relationshipId: relationship.id },
    });

    // Audit log
    await this.auditService.log({
      actorId: patientId,
      actorEmail: existing.patient.email,
      actorRole: Role.PATIENT,
      action: AuditAction.DOCTOR_DISCONNECT,
      resourceType: 'PATIENT_DOCTOR_RELATIONSHIP',
      resourceId: relationship.id,
      result: AuditResult.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      details: { doctorId, reason: dto?.reason },
    });

    return relationship;
  }

  /**
   * Block a doctor
   */
  async blockDoctor(
    patientId: string,
    doctorId: string,
    dto?: BlockDoctorDto,
    clientIp?: string,
    userAgent?: string,
  ) {
    const existing = await this.prisma.patientDoctorRelationship.findUnique({
      where: {
        patientId_doctorId: {
          patientId,
          doctorId,
        },
      },
      include: { patient: true },
    });

    let relationship;
    if (existing) {
      relationship = await this.prisma.patientDoctorRelationship.update({
        where: { id: existing.id },
        data: {
          status: RelationshipStatus.BLOCKED,
          blockedAt: new Date(),
          lastInteractionAt: new Date(),
        },
      });
    } else {
      relationship = await this.prisma.patientDoctorRelationship.create({
        data: {
          patientId,
          doctorId,
          status: RelationshipStatus.BLOCKED,
          blockedAt: new Date(),
          lastInteractionAt: new Date(),
        },
      });
    }

    await this.prisma.patientDoctorRelationshipEvent.create({
      data: {
        relationshipId: relationship.id,
        eventType: RelationshipEventType.BLOCKED,
        actorId: patientId,
        reason: dto?.reason,
      },
    });

    // Audit log
    await this.auditService.log({
      actorId: patientId,
      actorRole: Role.PATIENT,
      action: AuditAction.DOCTOR_BLOCK,
      resourceType: 'PATIENT_DOCTOR_RELATIONSHIP',
      resourceId: relationship.id,
      result: AuditResult.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      details: { doctorId, reason: dto?.reason },
    });

    return relationship;
  }

  /**
   * Unblock a doctor (reverts status to INACTIVE)
   */
  async unblockDoctor(
    patientId: string,
    doctorId: string,
    clientIp?: string,
    userAgent?: string,
  ) {
    const existing = await this.prisma.patientDoctorRelationship.findUnique({
      where: {
        patientId_doctorId: {
          patientId,
          doctorId,
        },
      },
    });

    if (!existing || existing.status !== RelationshipStatus.BLOCKED) {
      throw new BadRequestException('Doctor is not currently blocked');
    }

    const relationship = await this.prisma.patientDoctorRelationship.update({
      where: { id: existing.id },
      data: {
        status: RelationshipStatus.INACTIVE,
        blockedAt: null,
        lastInteractionAt: new Date(),
      },
    });

    await this.prisma.patientDoctorRelationshipEvent.create({
      data: {
        relationshipId: relationship.id,
        eventType: RelationshipEventType.UNBLOCKED,
        actorId: patientId,
      },
    });

    // Audit log
    await this.auditService.log({
      actorId: patientId,
      actorRole: Role.PATIENT,
      action: AuditAction.DOCTOR_UNBLOCK,
      resourceType: 'PATIENT_DOCTOR_RELATIONSHIP',
      resourceId: relationship.id,
      result: AuditResult.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      details: { doctorId },
    });

    return relationship;
  }

  /**
   * List doctors connected to patient (filter by status: ACTIVE, INACTIVE, BLOCKED, or all)
   */
  async getPatientDoctors(
    patientId: string,
    status?: RelationshipStatus,
    clientIp?: string,
    userAgent?: string,
  ) {
    const whereClause: any = { patientId };
    if (status) {
      whereClause.status = status;
    }

    const relationships = await this.prisma.patientDoctorRelationship.findMany({
      where: whereClause,
      include: {
        doctor: {
          include: {
            doctorProfile: true,
            doctorPracticeLocations: {
              where: { active: true },
              orderBy: { isPrimary: 'desc' },
            },
          },
        },
      },
      orderBy: { lastInteractionAt: 'desc' },
    });

    // Fetch consultations count and latest consultation for each doctor
    const doctorIds = relationships.map((r) => r.doctorId);
    const consultStats = await this.prisma.consultation.findMany({
      where: {
        patientId,
        doctorId: { in: doctorIds },
      },
      select: {
        doctorId: true,
        consultationDate: true,
      },
      orderBy: { consultationDate: 'desc' },
    });

    const consultMap = new Map<string, { count: number; lastDate: Date | null }>();
    for (const c of consultStats) {
      const existing = consultMap.get(c.doctorId);
      if (existing) {
        existing.count += 1;
      } else {
        consultMap.set(c.doctorId, { count: 1, lastDate: c.consultationDate });
      }
    }

    // Audit log
    await this.auditService.log({
      actorId: patientId,
      actorRole: Role.PATIENT,
      action: AuditAction.DOCTOR_RELATIONSHIP_VIEW,
      resourceType: 'PATIENT_DOCTOR_RELATIONSHIP',
      result: AuditResult.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      details: { count: relationships.length },
    });

    return relationships.map((rel) => {
      const profile = rel.doctor.doctorProfile;
      const stats = consultMap.get(rel.doctorId) || { count: 0, lastDate: null };

      return {
        id: rel.id,
        doctorId: rel.doctorId,
        status: rel.status,
        connectedAt: rel.connectedAt,
        disconnectedAt: rel.disconnectedAt,
        lastInteractionAt: rel.lastInteractionAt,
        connectionSource: rel.connectionSource,
        notes: rel.notes,
        consultationCount: stats.count,
        lastConsultationAt: stats.lastDate,
        doctor: {
          id: rel.doctor.id,
          fullName: profile?.fullName || 'Doctor',
          profilePhoto: profile?.profilePhoto || null,
          specialization: profile?.specialization || null,
          subSpecialty: profile?.subSpecialty || null,
          qualifications: profile?.qualifications || null,
          languages: profile?.languages || [],
          yearsOfExperience: profile?.yearsOfExperience || 0,
          clinicName: profile?.clinicName || null,
          clinicAddress: profile?.clinicAddress || null,
          city: profile?.city || null,
          consultationMode: profile?.consultationMode || null,
          consultationFee: profile?.consultationFee || null,
          workingHours: profile?.workingHours || null,
          hospitalAffiliation: profile?.hospitalAffiliation || null,
          practiceLocations: rel.doctor.doctorPracticeLocations.map((loc) => ({
            id: loc.id,
            practiceName: loc.practiceName,
            addressLine1: loc.addressLine1,
            addressLine2: loc.addressLine2,
            area: loc.area,
            city: loc.city,
            state: loc.state,
            pincode: loc.pincode,
            phone: loc.phone,
            isPrimary: loc.isPrimary,
          })),
        },
      };
    });
  }

  /**
   * Complete relationship history for patient (all events and audit transitions)
   */
  async getPatientRelationshipHistory(patientId: string) {
    const relationships = await this.prisma.patientDoctorRelationship.findMany({
      where: { patientId },
      include: {
        doctor: {
          include: { doctorProfile: true },
        },
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return relationships.map((rel) => ({
      relationshipId: rel.id,
      doctorId: rel.doctorId,
      doctorName: rel.doctor.doctorProfile?.fullName || 'Doctor',
      specialization: rel.doctor.doctorProfile?.specialization || null,
      status: rel.status,
      connectedAt: rel.connectedAt,
      disconnectedAt: rel.disconnectedAt,
      lastInteractionAt: rel.lastInteractionAt,
      connectionSource: rel.connectionSource,
      notes: rel.notes,
      events: rel.events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        actorId: e.actorId,
        reason: e.reason,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
    }));
  }

  /**
   * Distinct doctors previously consulted by patient (from Consultation records)
   * Explicitly distinguishes Consultation History from Relationship status!
   */
  async getPreviouslyConsultedDoctors(patientId: string) {
    const consultations = await this.prisma.consultation.findMany({
      where: { patientId },
      include: {
        doctor: {
          include: {
            doctorProfile: true,
            doctorPracticeLocations: {
              where: { active: true },
              orderBy: { isPrimary: 'desc' },
            },
          },
        },
      },
      orderBy: { consultationDate: 'desc' },
    });

    // Group by doctorId
    const doctorMap = new Map<
      string,
      {
        doctor: any;
        count: number;
        firstConsultationAt: Date;
        lastConsultationAt: Date;
        consultationIds: string[];
      }
    >();

    for (const c of consultations) {
      const existing = doctorMap.get(c.doctorId);
      if (existing) {
        existing.count += 1;
        if (c.consultationDate < existing.firstConsultationAt) {
          existing.firstConsultationAt = c.consultationDate;
        }
        if (c.consultationDate > existing.lastConsultationAt) {
          existing.lastConsultationAt = c.consultationDate;
        }
        existing.consultationIds.push(c.id);
      } else {
        doctorMap.set(c.doctorId, {
          doctor: c.doctor,
          count: 1,
          firstConsultationAt: c.consultationDate,
          lastConsultationAt: c.consultationDate,
          consultationIds: [c.id],
        });
      }
    }

    const doctorIds = Array.from(doctorMap.keys());
    const relationships = await this.prisma.patientDoctorRelationship.findMany({
      where: {
        patientId,
        doctorId: { in: doctorIds },
      },
    });

    const relMap = new Map<string, RelationshipStatus>();
    for (const r of relationships) {
      relMap.set(r.doctorId, r.status);
    }

    const result = Array.from(doctorMap.values()).map((entry) => {
      const doc = entry.doctor;
      const profile = doc.doctorProfile;
      const relStatus = relMap.get(doc.id) || null;

      return {
        doctorId: doc.id,
        doctorName: profile?.fullName || 'Doctor',
        profilePhoto: profile?.profilePhoto || null,
        specialization: profile?.specialization || null,
        subSpecialty: profile?.subSpecialty || null,
        qualifications: profile?.qualifications || null,
        city: profile?.city || null,
        clinicName: profile?.clinicName || null,
        consultationCount: entry.count,
        firstConsultationAt: entry.firstConsultationAt,
        lastConsultationAt: entry.lastConsultationAt,
        relationshipStatus: relStatus,
        isConnected: relStatus === RelationshipStatus.ACTIVE,
      };
    });

    // Sort by latest consultation date desc
    result.sort((a, b) => b.lastConsultationAt.getTime() - a.lastConsultationAt.getTime());

    return result;
  }

  /**
   * Doctor workspace: list patients connected to this doctor
   */
  async getDoctorConnectedPatients(doctorId: string, search?: string) {
    const whereClause: any = {
      doctorId,
      status: RelationshipStatus.ACTIVE,
    };

    if (search && search.trim()) {
      const q = search.trim();
      whereClause.patient = {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { patientProfile: { fullName: { contains: q, mode: 'insensitive' } } },
          { patientProfile: { city: { contains: q, mode: 'insensitive' } } },
        ],
      };
    }

    const relationships = await this.prisma.patientDoctorRelationship.findMany({
      where: whereClause,
      include: {
        patient: {
          include: {
            patientProfile: true,
          },
        },
      },
      orderBy: { lastInteractionAt: 'desc' },
    });

    // Check if each patient has granted active consent or access
    const patientIds = relationships.map((r) => r.patientId);
    const [accessList, consultList] = await Promise.all([
      this.prisma.doctorPatientAccess.findMany({
        where: {
          doctorId,
          patientId: { in: patientIds },
          status: AccessStatus.APPROVED,
        },
      }),
      this.prisma.consultation.findMany({
        where: {
          doctorId,
          patientId: { in: patientIds },
        },
        select: { patientId: true, consultationDate: true },
        orderBy: { consultationDate: 'desc' },
      }),
    ]);

    const accessMap = new Set<string>(accessList.map((a) => a.patientId));
    const consultMap = new Map<string, { count: number; lastDate: Date | null }>();

    for (const c of consultList) {
      const existing = consultMap.get(c.patientId);
      if (existing) {
        existing.count += 1;
      } else {
        consultMap.set(c.patientId, { count: 1, lastDate: c.consultationDate });
      }
    }

    return relationships.map((rel) => {
      const profile = rel.patient.patientProfile;
      const stats = consultMap.get(rel.patientId) || { count: 0, lastDate: null };

      return {
        relationshipId: rel.id,
        patientId: rel.patientId,
        patientName: profile?.fullName || rel.patient.email,
        email: rel.patient.email,
        gender: profile?.gender || null,
        dateOfBirth: profile?.dateOfBirth || null,
        city: profile?.city || null,
        bloodGroup: profile?.bloodGroup || null,
        connectedAt: rel.connectedAt,
        lastInteractionAt: rel.lastInteractionAt,
        connectionSource: rel.connectionSource,
        notes: rel.notes,
        hasGrantedAccess: accessMap.has(rel.patientId),
        consultationCount: stats.count,
        lastConsultationAt: stats.lastDate,
      };
    });
  }

  /**
   * Patient search history
   */
  async getPatientSearchHistory(patientId: string) {
    return this.prisma.doctorSearchHistory.findMany({
      where: { patientId },
      include: {
        doctor: {
          include: { doctorProfile: true },
        },
      },
      orderBy: { searchedAt: 'desc' },
      take: 30,
    });
  }

  /**
   * Clear patient search history item or all
   */
  async clearPatientSearchHistory(patientId: string, historyId?: string) {
    if (historyId) {
      const item = await this.prisma.doctorSearchHistory.findFirst({
        where: { id: historyId, patientId },
      });
      if (!item) {
        throw new NotFoundException(`Search history item "${historyId}" not found`);
      }
      await this.prisma.doctorSearchHistory.delete({
        where: { id: historyId },
      });
      return { message: 'Search history entry deleted' };
    }

    await this.prisma.doctorSearchHistory.deleteMany({
      where: { patientId },
    });
    return { message: 'Search history cleared' };
  }
}
