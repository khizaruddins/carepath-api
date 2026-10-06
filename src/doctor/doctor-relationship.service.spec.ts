import { Test, TestingModule } from '@nestjs/testing';
import { DoctorRelationshipService } from './doctor-relationship.service';
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
  AccessStatus,
} from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('DoctorRelationshipService', () => {
  let service: DoctorRelationshipService;
  let prisma: PrismaService;
  let audit: AuditService;
  let notifications: NotificationsService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    patientDoctorRelationship: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    patientDoctorRelationshipEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    consultation: {
      findMany: jest.fn(),
    },
    doctorPatientAccess: {
      findMany: jest.fn(),
    },
    doctorSearchHistory: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockAudit = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockNotifications = {
    sendNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
  };

  const mockDoctor = {
    id: 'doc-1',
    email: 'doctor@carepath.test',
    role: Role.DOCTOR,
    status: UserStatus.ACTIVE,
    doctorProfile: {
      fullName: 'Dr. Robert Chen',
      verificationStatus: DoctorVerificationStatus.VERIFIED,
      specialization: 'Neurology',
    },
  };

  const mockPatient = {
    id: 'pat-1',
    email: 'patient@carepath.test',
    role: Role.PATIENT,
    status: UserStatus.ACTIVE,
    patientProfile: {
      fullName: 'Alice Walker',
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorRelationshipService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<DoctorRelationshipService>(DoctorRelationshipService);
    prisma = module.get<PrismaService>(PrismaService);
    audit = module.get<AuditService>(AuditService);
    notifications = module.get<NotificationsService>(NotificationsService);
  });

  describe('connectDoctor', () => {
    it('should connect a patient to a verified doctor and emit notifications and audit logs', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrisma.user.findUnique.mockResolvedValue(mockPatient);
      mockPrisma.patientDoctorRelationship.findUnique.mockResolvedValue(null);

      const createdRelationship = {
        id: 'rel-1',
        patientId: 'pat-1',
        doctorId: 'doc-1',
        status: RelationshipStatus.ACTIVE,
        connectionSource: ConnectionSource.SEARCH,
        connectedAt: new Date(),
        lastInteractionAt: new Date(),
      };
      mockPrisma.patientDoctorRelationship.create.mockResolvedValue(createdRelationship);
      mockPrisma.patientDoctorRelationshipEvent.create.mockResolvedValue({ id: 'evt-1' });

      const result = await service.connectDoctor(
        'pat-1',
        'doc-1',
        { source: ConnectionSource.SEARCH, notes: 'Follow-up for migraine' },
        '127.0.0.1',
        'Jest/Test',
      );

      expect(result.id).toBe('rel-1');
      expect(result.status).toBe(RelationshipStatus.ACTIVE);

      expect(mockPrisma.patientDoctorRelationship.create).toHaveBeenCalled();
      expect(mockPrisma.patientDoctorRelationshipEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          relationshipId: 'rel-1',
          eventType: RelationshipEventType.CONNECTED,
          actorId: 'pat-1',
        }),
      });

      // Both doctor and patient receive notifications
      expect(mockNotifications.sendNotification).toHaveBeenCalledTimes(2);
      expect(mockNotifications.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'doc-1',
          type: NotificationType.DOCTOR_CONNECTED,
        }),
      );
      expect(mockNotifications.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'pat-1',
          type: NotificationType.DOCTOR_CONNECTED,
        }),
      );

      // Audit log logged
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DOCTOR_CONNECT,
          resourceId: 'rel-1',
        }),
      );
    });

    it('should be idempotent if relationship is already active', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrisma.user.findUnique.mockResolvedValue(mockPatient);
      mockPrisma.patientDoctorRelationship.findUnique.mockResolvedValue({
        id: 'rel-1',
        patientId: 'pat-1',
        doctorId: 'doc-1',
        status: RelationshipStatus.ACTIVE,
      });

      const result = await service.connectDoctor('pat-1', 'doc-1');
      expect(result.id).toBe('rel-1');
      expect(mockPrisma.patientDoctorRelationship.create).not.toHaveBeenCalled();
    });

    it('should reject connection if doctor is blocked', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockDoctor);
      mockPrisma.user.findUnique.mockResolvedValue(mockPatient);
      mockPrisma.patientDoctorRelationship.findUnique.mockResolvedValue({
        id: 'rel-1',
        status: RelationshipStatus.BLOCKED,
      });

      await expect(service.connectDoctor('pat-1', 'doc-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject connecting to self', async () => {
      await expect(service.connectDoctor('same-id', 'same-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject if doctor is unverified or does not exist', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.connectDoctor('pat-1', 'doc-unverified')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reconnectDoctor', () => {
    it('should reconnect an inactive relationship', async () => {
      const existingRel = {
        id: 'rel-1',
        patientId: 'pat-1',
        doctorId: 'doc-1',
        status: RelationshipStatus.INACTIVE,
        patient: mockPatient,
        doctor: mockDoctor,
      };
      mockPrisma.patientDoctorRelationship.findUnique.mockResolvedValue(existingRel);
      mockPrisma.patientDoctorRelationship.update.mockResolvedValue({
        ...existingRel,
        status: RelationshipStatus.ACTIVE,
      });
      mockPrisma.patientDoctorRelationshipEvent.create.mockResolvedValue({ id: 'evt-2' });

      const res = await service.reconnectDoctor('pat-1', 'doc-1');
      expect(res.status).toBe(RelationshipStatus.ACTIVE);
      expect(mockPrisma.patientDoctorRelationshipEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: RelationshipEventType.RECONNECTED,
        }),
      });
    });
  });

  describe('disconnectDoctor', () => {
    it('should disconnect active doctor and preserve records', async () => {
      const existingRel = {
        id: 'rel-1',
        patientId: 'pat-1',
        doctorId: 'doc-1',
        status: RelationshipStatus.ACTIVE,
        patient: mockPatient,
        doctor: mockDoctor,
      };
      mockPrisma.patientDoctorRelationship.findUnique.mockResolvedValue(existingRel);
      mockPrisma.patientDoctorRelationship.update.mockResolvedValue({
        ...existingRel,
        status: RelationshipStatus.INACTIVE,
      });
      mockPrisma.patientDoctorRelationshipEvent.create.mockResolvedValue({ id: 'evt-3' });

      const res = await service.disconnectDoctor('pat-1', 'doc-1', {
        reason: 'Relocated to another city',
      });

      expect(res.status).toBe(RelationshipStatus.INACTIVE);
      expect(mockPrisma.patientDoctorRelationshipEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: RelationshipEventType.DISCONNECTED,
          reason: 'Relocated to another city',
        }),
      });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DOCTOR_DISCONNECT,
        }),
      );
    });

    it('should throw BadRequestException if no active connection exists', async () => {
      mockPrisma.patientDoctorRelationship.findUnique.mockResolvedValue(null);
      await expect(service.disconnectDoctor('pat-1', 'doc-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('blockDoctor & unblockDoctor', () => {
    it('should block a doctor', async () => {
      mockPrisma.patientDoctorRelationship.findUnique.mockResolvedValue({
        id: 'rel-1',
        patient: mockPatient,
      });
      mockPrisma.patientDoctorRelationship.update.mockResolvedValue({
        id: 'rel-1',
        status: RelationshipStatus.BLOCKED,
      });
      mockPrisma.patientDoctorRelationshipEvent.create.mockResolvedValue({ id: 'evt-4' });

      const res = await service.blockDoctor('pat-1', 'doc-1', { reason: 'Spam' });
      expect(res.status).toBe(RelationshipStatus.BLOCKED);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DOCTOR_BLOCK,
        }),
      );
    });

    it('should unblock a blocked doctor into INACTIVE status', async () => {
      mockPrisma.patientDoctorRelationship.findUnique.mockResolvedValue({
        id: 'rel-1',
        status: RelationshipStatus.BLOCKED,
      });
      mockPrisma.patientDoctorRelationship.update.mockResolvedValue({
        id: 'rel-1',
        status: RelationshipStatus.INACTIVE,
      });
      mockPrisma.patientDoctorRelationshipEvent.create.mockResolvedValue({ id: 'evt-5' });

      const res = await service.unblockDoctor('pat-1', 'doc-1');
      expect(res.status).toBe(RelationshipStatus.INACTIVE);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DOCTOR_UNBLOCK,
        }),
      );
    });
  });

  describe('getPatientDoctors', () => {
    it('should list patient connected doctors with practice locations and consultation summaries', async () => {
      mockPrisma.patientDoctorRelationship.findMany.mockResolvedValue([
        {
          id: 'rel-1',
          doctorId: 'doc-1',
          status: RelationshipStatus.ACTIVE,
          connectedAt: new Date(),
          doctor: {
            ...mockDoctor,
            doctorPracticeLocations: [],
          },
        },
      ]);
      mockPrisma.consultation.findMany.mockResolvedValue([
        { doctorId: 'doc-1', consultationDate: new Date('2026-08-01') },
      ]);

      const res = await service.getPatientDoctors('pat-1');
      expect(res).toHaveLength(1);
      expect(res[0].doctorId).toBe('doc-1');
      expect(res[0].consultationCount).toBe(1);
      expect(res[0].doctor.fullName).toBe('Dr. Robert Chen');
    });
  });

  describe('getPreviouslyConsultedDoctors', () => {
    it('should return distinct doctors from actual consultation records and show relationship status', async () => {
      mockPrisma.consultation.findMany.mockResolvedValue([
        {
          id: 'c-1',
          doctorId: 'doc-1',
          consultationDate: new Date('2026-07-01'),
          doctor: {
            ...mockDoctor,
            doctorPracticeLocations: [],
          },
        },
        {
          id: 'c-2',
          doctorId: 'doc-1',
          consultationDate: new Date('2026-08-15'),
          doctor: {
            ...mockDoctor,
            doctorPracticeLocations: [],
          },
        },
      ]);

      mockPrisma.patientDoctorRelationship.findMany.mockResolvedValue([
        { doctorId: 'doc-1', status: RelationshipStatus.ACTIVE },
      ]);

      const result = await service.getPreviouslyConsultedDoctors('pat-1');
      expect(result).toHaveLength(1);
      expect(result[0].doctorId).toBe('doc-1');
      expect(result[0].consultationCount).toBe(2);
      expect(result[0].relationshipStatus).toBe(RelationshipStatus.ACTIVE);
      expect(result[0].isConnected).toBe(true);
    });
  });

  describe('getDoctorConnectedPatients', () => {
    it('should list connected patients for doctor and check consent access status', async () => {
      mockPrisma.patientDoctorRelationship.findMany.mockResolvedValue([
        {
          id: 'rel-1',
          patientId: 'pat-1',
          patient: mockPatient,
          connectedAt: new Date(),
          connectionSource: ConnectionSource.SEARCH,
        },
      ]);
      mockPrisma.doctorPatientAccess.findMany.mockResolvedValue([
        { patientId: 'pat-1', status: AccessStatus.APPROVED },
      ]);
      mockPrisma.consultation.findMany.mockResolvedValue([]);

      const result = await service.getDoctorConnectedPatients('doc-1');
      expect(result).toHaveLength(1);
      expect(result[0].patientId).toBe('pat-1');
      expect(result[0].patientName).toBe('Alice Walker');
      expect(result[0].hasGrantedAccess).toBe(true);
    });
  });

  describe('search history management', () => {
    it('should retrieve and clear search history', async () => {
      mockPrisma.doctorSearchHistory.findMany.mockResolvedValue([
        { id: 'sh-1', patientId: 'pat-1', searchQuery: 'Cardiologist' },
      ]);
      const history = await service.getPatientSearchHistory('pat-1');
      expect(history).toHaveLength(1);

      mockPrisma.doctorSearchHistory.deleteMany.mockResolvedValue({ count: 1 });
      const clearRes = await service.clearPatientSearchHistory('pat-1');
      expect(clearRes.message).toBe('Search history cleared');
    });
  });
});
