import { Test, TestingModule } from '@nestjs/testing';
import { DoctorService } from './doctor.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { AccessStatus, Role, FollowUpStatus } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('DoctorService', () => {
  let service: DoctorService;
  let prisma: PrismaService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    doctorProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    doctorPatientAccess: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    document: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    doctorFeedback: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    doctorReview: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    consultation: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    prescription: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    investigationRequest: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    referral: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    followUp: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    healthTimelineEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockAudit = {
    log: jest.fn().mockResolvedValue(undefined),
    getMyAuditLogs: jest.fn().mockResolvedValue([]),
  };

  const mockStorage = {
    getSignedDownloadUrl: jest.fn().mockResolvedValue('https://storage.carepath.com/signed-token-123'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<DoctorService>(DoctorService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
    mockPrisma.doctorProfile.findUnique.mockResolvedValue({
      id: 'doc-prof-1',
      userId: 'doctor-1',
      fullName: 'Dr. Test',
      verificationStatus: 'VERIFIED',
    });
  });

  const doctorUser = {
    id: 'doctor-1',
    email: 'doctor@example.com',
    role: Role.DOCTOR,
    status: 'ACTIVE',
  };

  describe('requestAccess', () => {
    it('successfully requests access from an existing patient', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'patient-1',
        email: 'patient@example.com',
        role: Role.PATIENT,
      });

      mockPrisma.doctorPatientAccess.findUnique.mockResolvedValue(null);
      mockPrisma.doctorPatientAccess.upsert.mockResolvedValue({
        id: 'access-req-1',
        patientId: 'patient-1',
        doctorId: 'doctor-1',
        status: AccessStatus.PENDING,
      });

      const result = await service.requestAccess(doctorUser, {
        patientEmail: 'patient@example.com',
        notes: 'Need access for routine cardiology consult',
      });

      expect(result.message).toContain('Access request sent');
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('throws NotFoundException if patient does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.requestAccess(doctorUser, { patientEmail: 'nonexistent@example.com' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('addDoctorFeedback', () => {
    it('allows doctor with approved consent to submit clinical feedback', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        patientId: 'patient-1',
      });

      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'access-1',
        status: AccessStatus.APPROVED,
      });

      mockPrisma.doctorFeedback.create.mockResolvedValue({
        id: 'feedback-1',
        documentId: 'doc-1',
        doctorId: 'doctor-1',
        notes: 'Fasting glucose elevated. Advise repeating in 4 weeks.',
      });

      const result = await service.addDoctorFeedback('doctor-1', 'doc-1', {
        notes: 'Fasting glucose elevated. Advise repeating in 4 weeks.',
      });

      expect(result.message).toContain('Clinical assessment saved');
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('rejects feedback if doctor does not have approved consent', async () => {
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        patientId: 'patient-1',
      });

      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue(null);

      await expect(
        service.addDoctorFeedback('doctor-1', 'doc-1', { notes: 'Review note' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createConsultation', () => {
    it('creates consultation and timeline event when consent is approved', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'access-1',
        status: AccessStatus.APPROVED,
      });

      mockPrisma.consultation.create.mockResolvedValue({
        id: 'consult-1',
        patientId: 'patient-1',
        doctorId: 'doctor-1',
        consultationDate: new Date(),
        reasonForVisit: 'Diabetes checkup',
        chiefComplaint: 'Fatigue',
        clinicalNotes: 'HbA1c slightly elevated',
        assessment: 'Type 2 Diabetes',
        plan: 'Dietary adjustments & Metformin',
      });

      mockPrisma.healthTimelineEvent.create.mockResolvedValue({});

      const result = await service.createConsultation(doctorUser, 'patient-1', {
        reasonForVisit: 'Diabetes checkup',
        chiefComplaint: 'Fatigue',
        clinicalNotes: 'HbA1c slightly elevated',
        assessment: 'Type 2 Diabetes',
        plan: 'Dietary adjustments & Metformin',
      });

      expect(result.message).toContain('Consultation note recorded');
      expect(mockPrisma.consultation.create).toHaveBeenCalled();
      expect(mockPrisma.healthTimelineEvent.create).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('denies consultation creation if consent is not approved', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue(null);

      await expect(
        service.createConsultation(doctorUser, 'patient-unconsented', {
          reasonForVisit: 'Checkup',
          chiefComplaint: 'None',
          clinicalNotes: 'Exam normal',
          assessment: 'Healthy',
          plan: 'Routine',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createPrescription', () => {
    it('creates prescription with items when consent is approved', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'access-1',
        status: AccessStatus.APPROVED,
      });

      mockPrisma.prescription.create.mockResolvedValue({
        id: 'rx-1',
        patientId: 'patient-1',
        doctorId: 'doctor-1',
        prescriptionDate: new Date(),
        items: [{ medicineName: 'Metformin', dosage: '500 mg', frequency: 'Twice daily', duration: '30 days' }],
      });

      mockPrisma.healthTimelineEvent.create.mockResolvedValue({});

      const result = await service.createPrescription(doctorUser, 'patient-1', {
        items: [{ medicineName: 'Metformin', dosage: '500 mg', frequency: 'Twice daily', duration: '30 days' }],
      });

      expect(result.message).toContain('Prescription recorded');
      expect(mockPrisma.prescription.create).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalled();
    });
  });

  describe('createFollowUp', () => {
    it('schedules follow up and creates timeline event', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'access-1',
        status: AccessStatus.APPROVED,
      });

      mockPrisma.followUp.create.mockResolvedValue({
        id: 'fu-1',
        patientId: 'patient-1',
        doctorId: 'doctor-1',
        dueDate: new Date('2026-10-15'),
        reason: 'Review glycemic control',
        status: FollowUpStatus.UPCOMING,
      });

      mockPrisma.healthTimelineEvent.create.mockResolvedValue({});

      const result = await service.createFollowUp(doctorUser, 'patient-1', {
        dueDate: '2026-10-15T10:00:00.000Z',
        reason: 'Review glycemic control',
      });

      expect(result.message).toContain('Follow-up scheduled');
      expect(mockPrisma.followUp.create).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalled();
    });
  });
});
