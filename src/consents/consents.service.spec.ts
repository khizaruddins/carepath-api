import { Test, TestingModule } from '@nestjs/testing';
import { ConsentsService } from './consents.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  Role,
  ConsentStatus,
  ConsentPurpose,
  ConsentResourceType,
  ConsentAccessLevel,
  DoctorVerificationStatus,
  AccessStatus,
  AuditAction,
  NotificationType,
} from '@prisma/client';

describe('ConsentsService (M3 Consent Lifecycle & State Machine)', () => {
  let service: ConsentsService;
  let prisma: PrismaService;
  let auditService: AuditService;
  let notificationsService: NotificationsService;

  const mockPrisma = {
    doctorProfile: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    doctorPatientAccess: {
      findFirst: jest.fn(),
    },
    document: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    consent: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    healthTimelineEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrisma)),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
  };

  const mockNotificationsService = {
    sendNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<ConsentsService>(ConsentsService);
    prisma = module.get<PrismaService>(PrismaService);
    auditService = module.get<AuditService>(AuditService);
    notificationsService = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  const doctorUser = {
    id: 'doc-uuid-1',
    email: 'dr.ali@example.com',
    role: Role.DOCTOR,
    status: 'ACTIVE',
  };

  const patientUser = {
    id: 'pat-uuid-1',
    email: 'patient@example.com',
    role: Role.PATIENT,
    status: 'ACTIVE',
  };

  const otherPatientUser = {
    id: 'pat-uuid-2',
    email: 'other@example.com',
    role: Role.PATIENT,
    status: 'ACTIVE',
  };

  describe('createConsentRequest', () => {
    const validDto = {
      patientId: 'pat-uuid-1',
      purpose: ConsentPurpose.REVIEW_RECENT_REPORTS,
      purposeDescription: 'Need to review recent CBC before follow-up',
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      scopes: [
        {
          resourceType: ConsentResourceType.DOCUMENT,
          resourceId: 'doc-1',
          accessLevel: ConsentAccessLevel.VIEW,
        },
      ],
    };

    it('requires verified doctor status', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValue({
        verificationStatus: DoctorVerificationStatus.PENDING,
      });

      await expect(
        service.createConsentRequest(doctorUser, validDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('requires active doctor-patient relationship', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValue({
        verificationStatus: DoctorVerificationStatus.VERIFIED,
      });
      mockPrisma.user.findUnique.mockResolvedValue(patientUser);
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue(null);

      await expect(
        service.createConsentRequest(doctorUser, validDto),
      ).rejects.toThrow(/You must be on the patient’s clinical care team/);
    });

    it('rejects past expiration date', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValue({
        verificationStatus: DoctorVerificationStatus.VERIFIED,
      });
      mockPrisma.user.findUnique.mockResolvedValue(patientUser);
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'rel-1',
        status: AccessStatus.APPROVED,
      });

      const pastDto = {
        ...validDto,
        expiresAt: new Date(Date.now() - 3600000).toISOString(),
      };

      await expect(
        service.createConsentRequest(doctorUser, pastDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates consent request with audit log and notification on valid input', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValue({
        verificationStatus: DoctorVerificationStatus.VERIFIED,
      });
      mockPrisma.user.findUnique.mockResolvedValue(patientUser);
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'rel-1',
        status: AccessStatus.APPROVED,
      });
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        patientId: 'pat-uuid-1',
        isArchived: false,
      });
      mockPrisma.consent.findFirst.mockResolvedValue(null);

      const createdConsent = {
        id: 'consent-created-1',
        patientId: 'pat-uuid-1',
        requesterId: 'doc-uuid-1',
        status: ConsentStatus.PENDING,
        purpose: ConsentPurpose.REVIEW_RECENT_REPORTS,
        scopes: validDto.scopes,
        requester: { doctorProfile: { fullName: 'Dr. Ali' } },
      };
      mockPrisma.consent.create.mockResolvedValue(createdConsent);

      const result = await service.createConsentRequest(doctorUser, validDto);

      expect(result.consent).toBeDefined();
      expect(result.consent.id).toBe('consent-created-1');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CREATE_CONSENT,
          actorId: doctorUser.id,
        }),
      );
      expect(mockNotificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: patientUser.id,
          type: NotificationType.CONSENT_REQUESTED,
        }),
      );
    });
  });

  describe('approveConsent', () => {
    it('only patient can approve their consent', async () => {
      mockPrisma.consent.findUnique.mockResolvedValue({
        id: 'c-1',
        patientId: patientUser.id,
        status: ConsentStatus.PENDING,
        expiresAt: new Date(Date.now() + 86400000),
      });

      await expect(
        service.approveConsent(otherPatientUser, 'c-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('state machine: CANNOT approve if not PENDING', async () => {
      mockPrisma.consent.findUnique.mockResolvedValue({
        id: 'c-1',
        patientId: patientUser.id,
        status: ConsentStatus.DECLINED, // Already declined
        expiresAt: new Date(Date.now() + 86400000),
        requester: { doctorProfile: { fullName: 'Dr. Ali' } },
        patient: { patientProfile: { fullName: 'John' } },
      });

      await expect(
        service.approveConsent(patientUser, 'c-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('approves pending consent, creates timeline event, audits and notifies doctor', async () => {
      const mockConsent = {
        id: 'c-1',
        patientId: patientUser.id,
        requesterId: doctorUser.id,
        status: ConsentStatus.PENDING,
        expiresAt: new Date(Date.now() + 86400000),
        purpose: ConsentPurpose.REVIEW_RECENT_REPORTS,
        purposeDescription: 'Check reports',
        scopes: [{ id: 's-1' }],
        requester: { doctorProfile: { fullName: 'Dr. Ali' } },
        patient: { patientProfile: { fullName: 'John' } },
      };

      mockPrisma.consent.findUnique.mockResolvedValue(mockConsent);
      mockPrisma.consent.update.mockResolvedValue({
        ...mockConsent,
        status: ConsentStatus.APPROVED,
        approvedAt: new Date(),
      });

      const result = await service.approveConsent(patientUser, 'c-1');

      expect(result.consent.status).toBe(ConsentStatus.APPROVED);
      expect(mockPrisma.healthTimelineEvent.create).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.APPROVE_CONSENT,
          actorId: patientUser.id,
        }),
      );
      expect(mockNotificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: doctorUser.id,
          type: NotificationType.CONSENT_APPROVED,
        }),
      );
    });
  });

  describe('declineConsent', () => {
    it('declines pending consent and records optional reason', async () => {
      const mockConsent = {
        id: 'c-1',
        patientId: patientUser.id,
        requesterId: doctorUser.id,
        status: ConsentStatus.PENDING,
        patient: { patientProfile: { fullName: 'John' } },
      };

      mockPrisma.consent.findUnique.mockResolvedValue(mockConsent);
      mockPrisma.consent.update.mockResolvedValue({
        ...mockConsent,
        status: ConsentStatus.DECLINED,
      });

      const result = await service.declineConsent(patientUser, 'c-1', {
        reason: 'Prefer in-person review',
      });

      expect(result.consent.status).toBe(ConsentStatus.DECLINED);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DECLINE_CONSENT,
        }),
      );
      expect(mockNotificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: doctorUser.id,
          type: NotificationType.CONSENT_DECLINED,
        }),
      );
    });
  });

  describe('revokeConsent', () => {
    it('state machine: CANNOT revoke if not APPROVED', async () => {
      mockPrisma.consent.findUnique.mockResolvedValue({
        id: 'c-1',
        patientId: patientUser.id,
        status: ConsentStatus.PENDING, // Cannot revoke PENDING
        requester: { doctorProfile: { fullName: 'Dr. Ali' } },
        patient: { patientProfile: { fullName: 'John' } },
      });

      await expect(
        service.revokeConsent(patientUser, 'c-1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('revokes active approved consent and logs timeline event', async () => {
      const mockConsent = {
        id: 'c-1',
        patientId: patientUser.id,
        requesterId: doctorUser.id,
        status: ConsentStatus.APPROVED,
        requester: { doctorProfile: { fullName: 'Dr. Ali' } },
        patient: { patientProfile: { fullName: 'John' } },
      };

      mockPrisma.consent.findUnique.mockResolvedValue(mockConsent);
      mockPrisma.consent.update.mockResolvedValue({
        ...mockConsent,
        status: ConsentStatus.REVOKED,
      });

      const result = await service.revokeConsent(patientUser, 'c-1', {
        reason: 'Treatment plan finished',
      });

      expect(result.consent.status).toBe(ConsentStatus.REVOKED);
      expect(mockPrisma.healthTimelineEvent.create).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.REVOKE_CONSENT,
        }),
      );
      expect(mockNotificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: doctorUser.id,
          type: NotificationType.CONSENT_REVOKED,
        }),
      );
    });
  });

  describe('cancelConsent', () => {
    it('doctor can cancel their own pending consent request', async () => {
      const mockConsent = {
        id: 'c-1',
        requesterId: doctorUser.id,
        status: ConsentStatus.PENDING,
      };

      mockPrisma.consent.findUnique.mockResolvedValue(mockConsent);
      mockPrisma.consent.update.mockResolvedValue({
        ...mockConsent,
        status: ConsentStatus.CANCELLED,
      });

      const result = await service.cancelConsent(doctorUser, 'c-1');
      expect(result.consent.status).toBe(ConsentStatus.CANCELLED);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CANCEL_CONSENT,
        }),
      );
    });
  });

  describe('sweepExpiredConsents', () => {
    it('sweeps expired approved consents to EXPIRED status with audits and notifications', async () => {
      mockPrisma.consent.findMany.mockResolvedValue([
        {
          id: 'exp-1',
          patientId: 'pat-1',
          requesterId: 'doc-1',
        },
      ]);
      mockPrisma.consent.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.sweepExpiredConsents();

      expect(result.expiredCount).toBe(1);
      expect(mockPrisma.consent.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['exp-1'] } },
        data: { status: ConsentStatus.EXPIRED },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.EXPIRE_CONSENT,
          resourceId: 'exp-1',
        }),
      );
      expect(mockNotificationsService.sendNotification).toHaveBeenCalledTimes(2);
    });
  });
});
