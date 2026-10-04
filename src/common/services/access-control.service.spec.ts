import { Test, TestingModule } from '@nestjs/testing';
import { AccessControlService } from './access-control.service';
import { PrismaService } from '../../database/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';

describe('AccessControlService (Authorization & Ownership)', () => {
  let service: AccessControlService;
  let prisma: PrismaService;

  const mockPrisma = {
    document: {
      findUnique: jest.fn(),
    },
    doctorPatientAccess: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessControlService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AccessControlService>(AccessControlService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('assertCanAccessDocument', () => {
    const patientA = {
      id: 'patient-user-uuid-1',
      email: 'patientA@example.com',
      role: Role.PATIENT,
      status: 'ACTIVE',
    };

    const patientB = {
      id: 'patient-user-uuid-2',
      email: 'patientB@example.com',
      role: Role.PATIENT,
      status: 'ACTIVE',
    };

    const doctorUser = {
      id: 'doctor-user-uuid-3',
      email: 'doctor@example.com',
      role: Role.DOCTOR,
      status: 'ACTIVE',
    };

    const adminUser = {
      id: 'admin-user-uuid-4',
      email: 'admin@example.com',
      role: Role.ADMIN,
      status: 'ACTIVE',
    };

    const documentOfPatientA = {
      id: 'doc-uuid-101',
      patientId: 'patient-user-uuid-1',
      uploadedById: 'patient-user-uuid-1',
      category: 'LAB_REPORT',
      versions: [{ storageKey: 'vault/patient-user-uuid-1/doc-uuid-101/cbc.pdf' }],
      metadata: { reportTitle: 'CBC Report' },
    };

    it('Requirement 1: Patient cannot access another patient’s document', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(documentOfPatientA);

      // Patient B tries to access Patient A's document
      await expect(
        service.assertCanAccessDocument(patientB, 'doc-uuid-101'),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.assertCanAccessDocument(patientB, 'doc-uuid-101'),
      ).rejects.toThrow('Access denied: You do not own this document');
    });

    it('Patient CAN access their own document', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(documentOfPatientA);

      const result = await service.assertCanAccessDocument(patientA, 'doc-uuid-101');
      expect(result).toBeDefined();
      expect(result.id).toEqual('doc-uuid-101');
    });

    it('Doctor cannot access patient document without explicit consent in M1', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(documentOfPatientA);

      await expect(
        service.assertCanAccessDocument(doctorUser, 'doc-uuid-101'),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.assertCanAccessDocument(doctorUser, 'doc-uuid-101'),
      ).rejects.toThrow(/consent/);
    });

    it('Doctor CAN access patient document when approved consent exists', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(documentOfPatientA);
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'access-1',
        status: 'APPROVED',
      });

      const result = await service.assertCanAccessDocument(doctorUser, 'doc-uuid-101');
      expect(result).toBeDefined();
      expect(result.id).toEqual('doc-uuid-101');
    });

    it('Admin can access document for system oversight', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(documentOfPatientA);

      const result = await service.assertCanAccessDocument(adminUser, 'doc-uuid-101');
      expect(result).toBeDefined();
    });

    it('Throws NotFoundException if document does not exist', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(null);

      await expect(
        service.assertCanAccessDocument(patientA, 'non-existent-doc'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertCanModifyProfile', () => {
    it('Requirement 2: Patient cannot modify another patient’s profile', () => {
      const patientA = {
        id: 'user-a-uuid',
        email: 'a@example.com',
        role: Role.PATIENT,
        status: 'ACTIVE',
      };

      const targetUserBId = 'user-b-uuid';

      expect(() =>
        service.assertCanModifyProfile(patientA, targetUserBId),
      ).toThrow(ForbiddenException);

      expect(() =>
        service.assertCanModifyProfile(patientA, targetUserBId),
      ).toThrow('Access denied: You cannot modify another user’s profile');
    });

    it('Patient can modify their own profile', () => {
      const patientA = {
        id: 'user-a-uuid',
        email: 'a@example.com',
        role: Role.PATIENT,
        status: 'ACTIVE',
      };

      expect(service.assertCanModifyProfile(patientA, 'user-a-uuid')).toBe(true);
    });

    it('Admin can modify profiles for compliance administration', () => {
      const admin = {
        id: 'admin-uuid',
        email: 'admin@example.com',
        role: Role.ADMIN,
        status: 'ACTIVE',
      };

      expect(service.assertCanModifyProfile(admin, 'any-user-uuid')).toBe(true);
    });
  });
});
