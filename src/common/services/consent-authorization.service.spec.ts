import { Test, TestingModule } from '@nestjs/testing';
import { ConsentAuthorizationService } from './consent-authorization.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  Role,
  ConsentStatus,
  ConsentResourceType,
  ConsentAccessLevel,
  AuditResult,
} from '@prisma/client';

describe('ConsentAuthorizationService (M3 Security & Effective Authorization)', () => {
  let service: ConsentAuthorizationService;
  let prisma: PrismaService;
  let auditService: AuditService;

  const mockPrisma = {
    doctorPatientAccess: {
      findFirst: jest.fn(),
    },
    consent: {
      findMany: jest.fn(),
    },
    document: {
      findUnique: jest.fn(),
    },
    consultation: {
      findUnique: jest.fn(),
    },
    prescription: {
      findUnique: jest.fn(),
    },
    investigationRequest: {
      findUnique: jest.fn(),
    },
    referral: {
      findUnique: jest.fn(),
    },
    followUp: {
      findUnique: jest.fn(),
    },
    doctorProfile: {
      findUnique: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsentAuthorizationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<ConsentAuthorizationService>(ConsentAuthorizationService);
    prisma = module.get<PrismaService>(PrismaService);
    auditService = module.get<AuditService>(AuditService);
    jest.clearAllMocks();
    mockPrisma.doctorProfile.findUnique.mockResolvedValue({
      id: 'doc-prof-1',
      userId: 'doctor-uuid-1',
      verificationStatus: 'VERIFIED',
    });
  });

  const patientAId = 'patient-uuid-1';
  const patientBId = 'patient-uuid-2';
  const doctorId = 'doctor-uuid-1';
  const doctorBId = 'doctor-uuid-2';
  const doc1Id = 'doc-cbc-101';
  const doc2Id = 'doc-mri-102';

  describe('1. Patient Self-Access & Anti-IDOR Protections', () => {
    it('Patient CAN access their own medical document', async () => {
      const result = await service.authorize({
        actorId: patientAId,
        actorRole: Role.PATIENT,
        patientId: patientAId,
        resourceType: ConsentResourceType.DOCUMENT,
        resourceId: doc1Id,
        action: 'VIEW',
      });

      expect(result.authorized).toBe(true);
      expect(result.authorizationSource).toBe('PATIENT_OWNER');
    });

    it('Security Test (IDOR): Patient A CANNOT access Patient B records', async () => {
      await expect(
        service.authorize({
          actorId: patientAId,
          actorRole: Role.PATIENT,
          patientId: patientBId,
          resourceType: ConsentResourceType.DOCUMENT,
          resourceId: doc1Id,
          action: 'VIEW',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: patientAId,
          result: AuditResult.DENIED,
        }),
      );
    });
  });

  describe('2. Administrative Oversight Boundaries', () => {
    it('Security Test: Admin CANNOT directly access patient medical document without clinical consent', async () => {
      await expect(
        service.authorize({
          actorId: 'admin-uuid',
          actorRole: Role.ADMIN,
          patientId: patientAId,
          resourceType: ConsentResourceType.DOCUMENT,
          resourceId: doc1Id,
          action: 'VIEW',
        }),
      ).rejects.toThrow(
        /Administrative accounts do not have direct access to patient medical records/,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          result: AuditResult.DENIED,
        }),
      );
    });
  });

  describe('3. Clinician Access & Consent Scope Enforcement', () => {
    it('Clinician CANNOT delete patient vault documents regardless of consent', async () => {
      await expect(
        service.authorize({
          actorId: doctorId,
          actorRole: Role.DOCTOR,
          patientId: patientAId,
          resourceType: ConsentResourceType.DOCUMENT,
          resourceId: doc1Id,
          action: 'DELETE',
        }),
      ).rejects.toThrow('Access denied: Clinicians cannot delete patient health vault records');
    });

    it('Clinician without doctor-patient relationship is DENIED access', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue(null);

      await expect(
        service.authorize({
          actorId: doctorId,
          actorRole: Role.DOCTOR,
          patientId: patientAId,
          resourceType: ConsentResourceType.DOCUMENT,
          resourceId: doc1Id,
          action: 'VIEW',
        }),
      ).rejects.toThrow(
        'Access denied: You do not have an active clinical relationship with this patient',
      );
    });

    it('Clinician with relationship but NO active approved consent is DENIED access', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'rel-1',
        status: 'APPROVED',
      });
      mockPrisma.consent.findMany.mockResolvedValue([]);

      await expect(
        service.authorize({
          actorId: doctorId,
          actorRole: Role.DOCTOR,
          patientId: patientAId,
          resourceType: ConsentResourceType.DOCUMENT,
          resourceId: doc1Id,
          action: 'VIEW',
        }),
      ).rejects.toThrow(
        'Access denied: Patient has not granted active, approved consent for medical record access',
      );
    });

    it('Clinician with specific document scope CAN access that document', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'rel-1',
        status: 'APPROVED',
      });

      const validFutureDate = new Date(Date.now() + 7 * 86400000);
      mockPrisma.consent.findMany.mockResolvedValue([
        {
          id: 'consent-1',
          patientId: patientAId,
          requesterId: doctorId,
          status: ConsentStatus.APPROVED,
          expiresAt: validFutureDate,
          scopes: [
            {
              id: 'scope-1',
              resourceType: ConsentResourceType.DOCUMENT,
              resourceId: doc1Id,
              accessLevel: ConsentAccessLevel.VIEW,
            },
          ],
        },
      ]);

      mockPrisma.document.findUnique.mockResolvedValue({
        id: doc1Id,
        patientId: patientAId,
        category: 'LAB_REPORT',
        isArchived: false,
      });

      const result = await service.authorize({
        actorId: doctorId,
        actorRole: Role.DOCTOR,
        patientId: patientAId,
        resourceType: ConsentResourceType.DOCUMENT,
        resourceId: doc1Id,
        action: 'VIEW',
      });

      expect(result.authorized).toBe(true);
      expect(result.authorizationSource).toBe('CONSENT_GRANT');
      expect(result.consentId).toBe('consent-1');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          result: AuditResult.SUCCESS,
        }),
      );
    });

    it('Security Test: Clinician with scope for Document 1 CANNOT access Document 2', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'rel-1',
        status: 'APPROVED',
      });

      const validFutureDate = new Date(Date.now() + 7 * 86400000);
      mockPrisma.consent.findMany.mockResolvedValue([
        {
          id: 'consent-1',
          patientId: patientAId,
          requesterId: doctorId,
          status: ConsentStatus.APPROVED,
          expiresAt: validFutureDate,
          scopes: [
            {
              id: 'scope-1',
              resourceType: ConsentResourceType.DOCUMENT,
              resourceId: doc1Id, // Only CBC is authorized
              accessLevel: ConsentAccessLevel.VIEW,
            },
          ],
        },
      ]);

      mockPrisma.document.findUnique.mockResolvedValue({
        id: doc2Id, // Attempting to access MRI
        patientId: patientAId,
        category: 'MRI',
        isArchived: false,
      });

      await expect(
        service.authorize({
          actorId: doctorId,
          actorRole: Role.DOCTOR,
          patientId: patientAId,
          resourceType: ConsentResourceType.DOCUMENT,
          resourceId: doc2Id,
          action: 'VIEW',
        }),
      ).rejects.toThrow(
        'Access denied: This resource or action is outside the authorized patient consent scope',
      );
    });

    it('Clinician with category scope LAB_REPORT CAN access any lab report of the patient', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'rel-1',
        status: 'APPROVED',
      });

      const validFutureDate = new Date(Date.now() + 7 * 86400000);
      mockPrisma.consent.findMany.mockResolvedValue([
        {
          id: 'consent-2',
          patientId: patientAId,
          requesterId: doctorId,
          status: ConsentStatus.APPROVED,
          expiresAt: validFutureDate,
          scopes: [
            {
              id: 'scope-cat-1',
              resourceType: ConsentResourceType.DOCUMENT,
              resourceId: null,
              resourceCategory: 'LAB_REPORT',
              accessLevel: ConsentAccessLevel.VIEW,
            },
          ],
        },
      ]);

      mockPrisma.document.findUnique.mockResolvedValue({
        id: doc1Id,
        patientId: patientAId,
        category: 'LAB_REPORT',
        isArchived: false,
      });

      const result = await service.authorize({
        actorId: doctorId,
        actorRole: Role.DOCTOR,
        patientId: patientAId,
        resourceType: ConsentResourceType.DOCUMENT,
        resourceId: doc1Id,
        action: 'VIEW',
      });

      expect(result.authorized).toBe(true);
      expect(result.consentId).toBe('consent-2');
    });

    it('Access Level Test: Doctor with VIEW level cannot DOWNLOAD', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'rel-1',
        status: 'APPROVED',
      });

      const validFutureDate = new Date(Date.now() + 7 * 86400000);
      mockPrisma.consent.findMany.mockResolvedValue([
        {
          id: 'consent-view-only',
          patientId: patientAId,
          requesterId: doctorId,
          status: ConsentStatus.APPROVED,
          expiresAt: validFutureDate,
          scopes: [
            {
              id: 'scope-1',
              resourceType: ConsentResourceType.DOCUMENT,
              resourceId: doc1Id,
              accessLevel: ConsentAccessLevel.VIEW, // Only VIEW
            },
          ],
        },
      ]);

      mockPrisma.document.findUnique.mockResolvedValue({
        id: doc1Id,
        patientId: patientAId,
        category: 'LAB_REPORT',
        isArchived: false,
      });

      await expect(
        service.authorize({
          actorId: doctorId,
          actorRole: Role.DOCTOR,
          patientId: patientAId,
          resourceType: ConsentResourceType.DOCUMENT,
          resourceId: doc1Id,
          action: 'DOWNLOAD', // Attempting DOWNLOAD
        }),
      ).rejects.toThrow(/Downloading patient records is strictly prohibited for clinicians/);
    });

    it('Security Test: Doctor CANNOT modify a clinical record authored by another doctor', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'rel-1',
        status: 'APPROVED',
      });

      mockPrisma.consultation.findUnique.mockResolvedValue({
        id: 'c-101',
        doctorId: doctorBId, // Authored by Doctor B
        patientId: patientAId,
      });

      await expect(
        service.authorize({
          actorId: doctorId, // Doctor A tries to modify
          actorRole: Role.DOCTOR,
          patientId: patientAId,
          resourceType: ConsentResourceType.CONSULTATION,
          resourceId: 'c-101',
          action: 'UPDATE',
        }),
      ).rejects.toThrow(
        'Access denied: You cannot modify a clinical record authored by another clinician',
      );
    });

    it('Doctor CAN modify a clinical record they authored', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'rel-1',
        status: 'APPROVED',
      });

      mockPrisma.consultation.findUnique.mockResolvedValue({
        id: 'c-101',
        doctorId: doctorId, // Authored by Doctor A
        patientId: patientAId,
      });

      const result = await service.authorize({
        actorId: doctorId,
        actorRole: Role.DOCTOR,
        patientId: patientAId,
        resourceType: ConsentResourceType.CONSULTATION,
        resourceId: 'c-101',
        action: 'UPDATE',
      });

      expect(result.authorized).toBe(true);
      expect(result.authorizationSource).toBe('CLINICAL_AUTHOR');
    });
  });
});
