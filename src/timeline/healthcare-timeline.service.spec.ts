import { Test, TestingModule } from '@nestjs/testing';
import { HealthcareTimelineService } from './healthcare-timeline.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TimelineEventResolverService } from './timeline-event-resolver.service';
import {
  TimelineEventType,
  TimelineSourceType,
  TimelineDatePrecision,
  TimelineVisibility,
  ConsentResourceType,
  ConsentStatus,
  Role,
  DocumentCategory,
  FollowUpStatus,
} from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

describe('HealthcareTimelineService', () => {
  let service: HealthcareTimelineService;
  let prisma: PrismaService;
  let auditService: AuditService;
  let resolverService: TimelineEventResolverService;

  const mockPrisma = {
    document: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    consultation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    prescription: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    investigationRequest: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    referral: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    followUp: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    labReport: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    healthTimelineEvent: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    doctorPatientAccess: {
      findFirst: jest.fn(),
    },
    consent: {
      findMany: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  const mockResolverService = {
    resolveSource: jest.fn(),
  };

  const patientUser: AuthenticatedUser = {
    id: 'patient-1',
    email: 'patient@example.com',
    role: Role.PATIENT,
    status: 'ACTIVE',
  };

  const otherPatientUser: AuthenticatedUser = {
    id: 'patient-2',
    email: 'other@example.com',
    role: Role.PATIENT,
    status: 'ACTIVE',
  };

  const doctorUser: AuthenticatedUser = {
    id: 'doctor-1',
    email: 'dr.smith@example.com',
    role: Role.DOCTOR,
    status: 'ACTIVE',
  };

  const adminUser: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@example.com',
    role: Role.ADMIN,
    status: 'ACTIVE',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthcareTimelineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: TimelineEventResolverService, useValue: mockResolverService },
      ],
    }).compile();

    service = module.get<HealthcareTimelineService>(HealthcareTimelineService);
    prisma = module.get<PrismaService>(PrismaService);
    auditService = module.get<AuditService>(AuditService);
    resolverService = module.get<TimelineEventResolverService>(TimelineEventResolverService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------
  // 1. Projections & Idempotent Upserts for all 6 sources
  // -------------------------------------------------------------
  describe('Projections for Sources', () => {
    it('projectDocument: projects document with DAY precision when documentDate is present', async () => {
      const docDate = new Date('2026-05-10T00:00:00.000Z');
      mockPrisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        patientId: 'patient-1',
        category: DocumentCategory.LAB_REPORT,
        isArchived: false,
        createdAt: new Date('2026-05-11T10:00:00.000Z'),
        metadata: {
          reportTitle: 'Complete Blood Count',
          facility: 'City Pathology Lab',
          providerName: 'Dr. Pathologist',
          documentDate: docDate,
          ocrStatus: 'COMPLETED',
        },
      });

      mockPrisma.healthTimelineEvent.upsert.mockResolvedValue({});

      await service.projectDocument('doc-1');

      expect(mockPrisma.healthTimelineEvent.upsert).toHaveBeenCalledWith({
        where: {
          patientId_sourceType_sourceId: {
            patientId: 'patient-1',
            sourceType: TimelineSourceType.DOCUMENT,
            sourceId: 'doc-1',
          },
        },
        update: expect.objectContaining({
          eventType: TimelineEventType.LAB_RESULT,
          eventDate: docDate,
          datePrecision: TimelineDatePrecision.DAY,
          title: 'Complete Blood Count',
          summary: expect.stringContaining('City Pathology Lab'),
          documentId: 'doc-1',
          providerName: 'Dr. Pathologist',
        }),
        create: expect.objectContaining({
          patientId: 'patient-1',
          eventType: TimelineEventType.LAB_RESULT,
          eventDate: docDate,
          datePrecision: TimelineDatePrecision.DAY,
          sourceType: TimelineSourceType.DOCUMENT,
          sourceId: 'doc-1',
          documentId: 'doc-1',
        }),
      });
    });

    it('projectConsultation: projects consultation note with doctor details', async () => {
      const consultDate = new Date('2026-06-01T14:30:00.000Z');
      mockPrisma.consultation.findUnique.mockResolvedValue({
        id: 'consult-1',
        patientId: 'patient-1',
        doctorId: 'doctor-1',
        consultationDate: consultDate,
        reasonForVisit: 'Hypertension Follow-up',
        assessment: 'Stage 1 Hypertension well controlled',
        doctor: {
          id: 'doctor-1',
          email: 'dr.smith@carepath.io',
          doctorProfile: { fullName: 'Dr. Jane Smith' },
        },
      });

      mockPrisma.healthTimelineEvent.upsert.mockResolvedValue({});

      await service.projectConsultation('consult-1');

      expect(mockPrisma.healthTimelineEvent.upsert).toHaveBeenCalledWith({
        where: {
          patientId_sourceType_sourceId: {
            patientId: 'patient-1',
            sourceType: TimelineSourceType.CONSULTATION,
            sourceId: 'consult-1',
          },
        },
        update: expect.objectContaining({
          eventType: TimelineEventType.CONSULTATION,
          eventDate: consultDate,
          title: 'Consultation: Hypertension Follow-up',
          providerName: 'Dr. Jane Smith',
        }),
        create: expect.objectContaining({
          sourceType: TimelineSourceType.CONSULTATION,
          sourceId: 'consult-1',
          providerId: 'doctor-1',
        }),
      });
    });

    it('projectPrescription: projects prescription with count of medications', async () => {
      const rxDate = new Date('2026-06-02T10:00:00.000Z');
      mockPrisma.prescription.findUnique.mockResolvedValue({
        id: 'rx-1',
        patientId: 'patient-1',
        doctorId: 'doctor-1',
        prescriptionDate: rxDate,
        doctor: {
          id: 'doctor-1',
          email: 'dr.smith@carepath.io',
          doctorProfile: { fullName: 'Dr. Jane Smith' },
        },
        items: [
          { medicineName: 'Amlodipine', dosage: '5mg' },
          { medicineName: 'Metformin', dosage: '500mg' },
        ],
      });

      mockPrisma.healthTimelineEvent.upsert.mockResolvedValue({});

      await service.projectPrescription('rx-1');

      expect(mockPrisma.healthTimelineEvent.upsert).toHaveBeenCalledWith({
        where: {
          patientId_sourceType_sourceId: {
            patientId: 'patient-1',
            sourceType: TimelineSourceType.PRESCRIPTION,
            sourceId: 'rx-1',
          },
        },
        update: expect.objectContaining({
          eventType: TimelineEventType.PRESCRIPTION,
          title: 'Prescription Issued (2 medications)',
          summary: expect.stringContaining('Amlodipine, Metformin'),
        }),
        create: expect.objectContaining({
          sourceType: TimelineSourceType.PRESCRIPTION,
          sourceId: 'rx-1',
        }),
      });
    });

    it('projectInvestigation: projects laboratory/diagnostic order', async () => {
      const invDate = new Date('2026-06-03T11:00:00.000Z');
      mockPrisma.investigationRequest.findUnique.mockResolvedValue({
        id: 'inv-1',
        patientId: 'patient-1',
        doctorId: 'doctor-1',
        requestedDate: invDate,
        investigationName: 'Lipid Panel',
        category: 'LABORATORY',
        priority: 'ROUTINE',
        status: 'PENDING',
        doctor: {
          id: 'doctor-1',
          email: 'dr.smith@carepath.io',
          doctorProfile: { fullName: 'Dr. Jane Smith' },
        },
      });

      mockPrisma.healthTimelineEvent.upsert.mockResolvedValue({});

      await service.projectInvestigation('inv-1');

      expect(mockPrisma.healthTimelineEvent.upsert).toHaveBeenCalledWith({
        where: {
          patientId_sourceType_sourceId: {
            patientId: 'patient-1',
            sourceType: TimelineSourceType.INVESTIGATION,
            sourceId: 'inv-1',
          },
        },
        update: expect.objectContaining({
          eventType: TimelineEventType.INVESTIGATION,
          title: 'Investigation Ordered: Lipid Panel',
          summary: expect.stringContaining('LABORATORY diagnostic ordered by Dr. Jane Smith'),
        }),
        create: expect.objectContaining({
          sourceType: TimelineSourceType.INVESTIGATION,
          sourceId: 'inv-1',
        }),
      });
    });

    it('projectReferral: projects specialist referral', async () => {
      const refDate = new Date('2026-06-04T12:00:00.000Z');
      mockPrisma.referral.findUnique.mockResolvedValue({
        id: 'ref-1',
        patientId: 'patient-1',
        doctorId: 'doctor-1',
        referralDate: refDate,
        specialty: 'Cardiology',
        referredProvider: 'Dr. Heart Specialist',
        priority: 'ROUTINE',
        status: 'PENDING',
        doctor: {
          id: 'doctor-1',
          email: 'dr.smith@carepath.io',
          doctorProfile: { fullName: 'Dr. Jane Smith' },
        },
      });

      mockPrisma.healthTimelineEvent.upsert.mockResolvedValue({});

      await service.projectReferral('ref-1');

      expect(mockPrisma.healthTimelineEvent.upsert).toHaveBeenCalledWith({
        where: {
          patientId_sourceType_sourceId: {
            patientId: 'patient-1',
            sourceType: TimelineSourceType.REFERRAL,
            sourceId: 'ref-1',
          },
        },
        update: expect.objectContaining({
          eventType: TimelineEventType.REFERRAL,
          title: 'Referral to Cardiology',
          summary: expect.stringContaining('Target: Dr. Heart Specialist'),
        }),
        create: expect.objectContaining({
          sourceType: TimelineSourceType.REFERRAL,
          sourceId: 'ref-1',
        }),
      });
    });

    it('projectFollowUp: projects scheduled follow up', async () => {
      const dueDate = new Date('2026-06-15T09:00:00.000Z');
      mockPrisma.followUp.findUnique.mockResolvedValue({
        id: 'fu-1',
        patientId: 'patient-1',
        doctorId: 'doctor-1',
        dueDate,
        reason: 'Review Blood Pressure Logs',
        status: FollowUpStatus.UPCOMING,
        doctor: {
          id: 'doctor-1',
          email: 'dr.smith@carepath.io',
          doctorProfile: { fullName: 'Dr. Jane Smith' },
        },
      });

      mockPrisma.healthTimelineEvent.upsert.mockResolvedValue({});

      await service.projectFollowUp('fu-1');

      expect(mockPrisma.healthTimelineEvent.upsert).toHaveBeenCalledWith({
        where: {
          patientId_sourceType_sourceId: {
            patientId: 'patient-1',
            sourceType: TimelineSourceType.FOLLOW_UP,
            sourceId: 'fu-1',
          },
        },
        update: expect.objectContaining({
          eventType: TimelineEventType.FOLLOW_UP,
          title: 'Follow-Up Scheduled: Review Blood Pressure Logs',
        }),
        create: expect.objectContaining({
          sourceType: TimelineSourceType.FOLLOW_UP,
          sourceId: 'fu-1',
        }),
      });
    });

    it('handleSourceDeletion: removes event when source is deleted or archived', async () => {
      mockPrisma.healthTimelineEvent.deleteMany.mockResolvedValue({ count: 1 });

      await service.handleSourceDeletion(TimelineSourceType.DOCUMENT, 'doc-1');

      expect(mockPrisma.healthTimelineEvent.deleteMany).toHaveBeenCalledWith({
        where: {
          sourceType: TimelineSourceType.DOCUMENT,
          sourceId: 'doc-1',
        },
      });
    });
  });

  // -------------------------------------------------------------
  // 2. Strict Idempotency Testing
  // -------------------------------------------------------------
  describe('Idempotency', () => {
    it('projecting the same record multiple times executes upsert without creating duplicate rows', async () => {
      mockPrisma.consultation.findUnique.mockResolvedValue({
        id: 'consult-idempotent',
        patientId: 'patient-1',
        doctorId: 'doctor-1',
        consultationDate: new Date('2026-06-01T10:00:00.000Z'),
        reasonForVisit: 'Idempotency Check',
        assessment: 'Pass',
        doctor: {
          id: 'doctor-1',
          email: 'doctor@carepath.io',
          doctorProfile: null,
        },
      });

      mockPrisma.healthTimelineEvent.upsert.mockResolvedValue({});

      // Call 1
      await service.projectConsultation('consult-idempotent');
      // Call 2
      await service.projectConsultation('consult-idempotent');

      expect(mockPrisma.healthTimelineEvent.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrisma.healthTimelineEvent.upsert).toHaveBeenNthCalledWith(1, {
        where: {
          patientId_sourceType_sourceId: {
            patientId: 'patient-1',
            sourceType: TimelineSourceType.CONSULTATION,
            sourceId: 'consult-idempotent',
          },
        },
        update: expect.any(Object),
        create: expect.any(Object),
      });
      expect(mockPrisma.healthTimelineEvent.upsert).toHaveBeenNthCalledWith(2, {
        where: {
          patientId_sourceType_sourceId: {
            patientId: 'patient-1',
            sourceType: TimelineSourceType.CONSULTATION,
            sourceId: 'consult-idempotent',
          },
        },
        update: expect.any(Object),
        create: expect.any(Object),
      });
    });

    it('backfillTimeline runs idempotently over all source entities', async () => {
      mockPrisma.document.findMany.mockResolvedValue([{ id: 'd-1' }]);
      mockPrisma.consultation.findMany.mockResolvedValue([{ id: 'c-1' }]);
      mockPrisma.prescription.findMany.mockResolvedValue([{ id: 'p-1' }]);
      mockPrisma.investigationRequest.findMany.mockResolvedValue([{ id: 'i-1' }]);
      mockPrisma.referral.findMany.mockResolvedValue([{ id: 'r-1' }]);
      mockPrisma.followUp.findMany.mockResolvedValue([{ id: 'f-1' }]);

      jest.spyOn(service, 'projectDocument').mockResolvedValue(undefined);
      jest.spyOn(service, 'projectConsultation').mockResolvedValue(undefined);
      jest.spyOn(service, 'projectPrescription').mockResolvedValue(undefined);
      jest.spyOn(service, 'projectInvestigation').mockResolvedValue(undefined);
      jest.spyOn(service, 'projectReferral').mockResolvedValue(undefined);
      jest.spyOn(service, 'projectFollowUp').mockResolvedValue(undefined);

      const count = await service.backfillTimeline();

      expect(count).toBe(6);
      expect(service.projectDocument).toHaveBeenCalledWith('d-1');
      expect(service.projectConsultation).toHaveBeenCalledWith('c-1');
      expect(service.projectPrescription).toHaveBeenCalledWith('p-1');
      expect(service.projectInvestigation).toHaveBeenCalledWith('i-1');
      expect(service.projectReferral).toHaveBeenCalledWith('r-1');
      expect(service.projectFollowUp).toHaveBeenCalledWith('f-1');
    });
  });

  // -------------------------------------------------------------
  // 3. Authorization & IDOR Security Controls
  // -------------------------------------------------------------
  describe('Authorization & Security Controls', () => {
    it('Patient self-access succeeds', async () => {
      mockPrisma.healthTimelineEvent.count.mockResolvedValue(1);
      mockPrisma.healthTimelineEvent.findMany.mockResolvedValue([
        {
          id: 'ev-1',
          patientId: 'patient-1',
          eventType: TimelineEventType.LAB_RESULT,
          eventDate: new Date('2026-06-01T12:00:00.000Z'),
          datePrecision: TimelineDatePrecision.DAY,
          title: 'Blood Test',
          summary: 'Lab results normal',
          sourceType: TimelineSourceType.DOCUMENT,
          sourceId: 'doc-1',
          providerId: null,
          providerName: 'City Lab',
          visibility: TimelineVisibility.SHARED,
          metadata: {},
          createdAt: new Date('2026-06-01T12:00:00.000Z'),
        },
      ]);

      const result = await service.getPatientTimeline('patient-1', {}, patientUser);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].title).toBe('Blood Test');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.any(String),
          result: 'SUCCESS',
        }),
      );
    });

    it('IDOR check: Patient cannot view another patient timeline and logs security alert', async () => {
      await expect(
        service.getPatientTimeline('patient-2', {}, patientUser),
      ).rejects.toThrow(ForbiddenException);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'patient-1',
          result: 'DENIED',
          details: { error: 'CROSS_PATIENT_TIMELINE_ACCESS_ATTEMPT' },
        }),
      );
    });

    it('Doctor without clinical relationship cannot view patient timeline', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue(null);

      await expect(
        service.getPatientTimeline('patient-1', {}, doctorUser),
      ).rejects.toThrow(ForbiddenException);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'doctor-1',
          result: 'DENIED',
          details: { error: 'NO_CLINICAL_RELATIONSHIP' },
        }),
      );
    });

    it('Doctor with clinical relationship but NO active M3 consent receives empty timeline', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'acc-1',
        status: 'APPROVED',
      });
      // No active non-expired consents
      mockPrisma.consent.findMany.mockResolvedValue([]);

      const result = await service.getPatientTimeline('patient-1', {}, doctorUser);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('Doctor with scope restricted to LAB_REPORT only queries permitted resource scopes', async () => {
      mockPrisma.doctorPatientAccess.findFirst.mockResolvedValue({
        id: 'acc-1',
        status: 'APPROVED',
      });
      mockPrisma.consent.findMany.mockResolvedValue([
        {
          id: 'consent-1',
          status: ConsentStatus.APPROVED,
          expiresAt: new Date(Date.now() + 86400000),
          scopes: [
            {
              resourceType: ConsentResourceType.DOCUMENT,
              resourceCategory: DocumentCategory.LAB_REPORT,
            },
          ],
        },
      ]);

      mockPrisma.healthTimelineEvent.count.mockResolvedValue(1);
      mockPrisma.healthTimelineEvent.findMany.mockResolvedValue([
        {
          id: 'ev-lab',
          patientId: 'patient-1',
          eventType: TimelineEventType.LAB_RESULT,
          eventDate: new Date('2026-06-01T12:00:00.000Z'),
          datePrecision: TimelineDatePrecision.DAY,
          title: 'Lipid Panel',
          summary: 'Cholesterol normal',
          sourceType: TimelineSourceType.DOCUMENT,
          sourceId: 'doc-lab-1',
          providerId: null,
          providerName: 'City Lab',
          visibility: TimelineVisibility.SHARED,
          metadata: { category: DocumentCategory.LAB_REPORT },
          createdAt: new Date('2026-06-01T12:00:00.000Z'),
        },
      ]);

      const result = await service.getPatientTimeline('patient-1', {}, doctorUser);

      expect(result.items).toHaveLength(1);
      expect(mockPrisma.healthTimelineEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            patientId: 'patient-1',
            OR: expect.arrayContaining([
              expect.objectContaining({
                sourceType: TimelineSourceType.DOCUMENT,
                metadata: { path: ['category'], equals: DocumentCategory.LAB_REPORT },
              }),
            ]),
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // 4. Cursor Pagination & Grouping Metadata
  // -------------------------------------------------------------
  describe('Cursor Pagination & Grouping', () => {
    it('returns structured grouping metadata (year, month, monthLabel, dayLabel)', async () => {
      const eventDate = new Date('2026-03-15T10:30:00.000Z');
      mockPrisma.healthTimelineEvent.count.mockResolvedValue(1);
      mockPrisma.healthTimelineEvent.findMany.mockResolvedValue([
        {
          id: 'ev-grouping',
          patientId: 'patient-1',
          eventType: TimelineEventType.CONSULTATION,
          eventDate,
          datePrecision: TimelineDatePrecision.EXACT,
          title: 'Consultation with Cardiology',
          summary: 'Follow-up done',
          sourceType: TimelineSourceType.CONSULTATION,
          sourceId: 'c-100',
          providerId: 'doctor-1',
          providerName: 'Dr. Jane Smith',
          visibility: TimelineVisibility.SHARED,
          metadata: null,
          createdAt: eventDate,
        },
      ]);

      const result = await service.getPatientTimeline('patient-1', {}, patientUser);

      expect(result.items).toHaveLength(1);
      const item = result.items[0];
      expect(item.grouping.year).toBe(2026);
      expect(item.grouping.month).toBe(3);
      expect(item.grouping.monthLabel).toContain('March 2026');
      expect(item.grouping.dayLabel).toBe('2026-03-15');
    });

    it('handles pagination with limit and nextCursor when hasMore is true', async () => {
      const d1 = new Date('2026-04-10T10:00:00.000Z');
      const d2 = new Date('2026-04-09T10:00:00.000Z');
      const d3 = new Date('2026-04-08T10:00:00.000Z');

      mockPrisma.healthTimelineEvent.count.mockResolvedValue(3);
      // Query limit 2 -> returns 3 raw rows so hasMore is true
      mockPrisma.healthTimelineEvent.findMany.mockResolvedValue([
        {
          id: 'ev-1',
          patientId: 'patient-1',
          eventType: TimelineEventType.LAB_RESULT,
          eventDate: d1,
          datePrecision: TimelineDatePrecision.DAY,
          title: 'CBC',
          sourceType: TimelineSourceType.DOCUMENT,
          sourceId: 'd-1',
          createdAt: d1,
        },
        {
          id: 'ev-2',
          patientId: 'patient-1',
          eventType: TimelineEventType.PRESCRIPTION,
          eventDate: d2,
          datePrecision: TimelineDatePrecision.EXACT,
          title: 'Rx',
          sourceType: TimelineSourceType.PRESCRIPTION,
          sourceId: 'p-1',
          createdAt: d2,
        },
        {
          id: 'ev-3',
          patientId: 'patient-1',
          eventType: TimelineEventType.CONSULTATION,
          eventDate: d3,
          datePrecision: TimelineDatePrecision.EXACT,
          title: 'Consult',
          sourceType: TimelineSourceType.CONSULTATION,
          sourceId: 'c-1',
          createdAt: d3,
        },
      ]);

      const result = await service.getPatientTimeline('patient-1', { limit: 2 }, patientUser);

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeDefined();

      // Verify decoded cursor
      const decoded = JSON.parse(Buffer.from(result.nextCursor!, 'base64').toString('utf-8'));
      expect(decoded.id).toBe('ev-2');
      expect(decoded.eventDate).toBe(d2.toISOString());
    });
  });

  // -------------------------------------------------------------
  // 5. Timeline Event Details Resolution
  // -------------------------------------------------------------
  describe('getTimelineEventDetails', () => {
    it('returns event details and resolves underlying source object via resolverService', async () => {
      const eventDate = new Date('2026-04-10T10:00:00.000Z');
      mockPrisma.healthTimelineEvent.findUnique.mockResolvedValue({
        id: 'ev-details',
        patientId: 'patient-1',
        eventType: TimelineEventType.CONSULTATION,
        eventDate,
        datePrecision: TimelineDatePrecision.EXACT,
        title: 'Routine Check',
        summary: 'Notes attached',
        sourceType: TimelineSourceType.CONSULTATION,
        sourceId: 'consult-1',
        providerId: 'doctor-1',
        providerName: 'Dr. Jane Smith',
        visibility: TimelineVisibility.SHARED,
        metadata: {},
        createdAt: eventDate,
      });

      mockResolverService.resolveSource.mockResolvedValue({
        id: 'consult-1',
        reasonForVisit: 'Routine Check',
        clinicalNotes: 'All clear',
      });

      const details = await service.getTimelineEventDetails('ev-details', patientUser);

      expect(details.event.id).toBe('ev-details');
      expect(details.resolvedSource).toEqual({
        id: 'consult-1',
        reasonForVisit: 'Routine Check',
        clinicalNotes: 'All clear',
      });
      expect(mockResolverService.resolveSource).toHaveBeenCalledWith(
        TimelineSourceType.CONSULTATION,
        'consult-1',
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VIEW_TIMELINE_EVENT',
          resourceId: 'ev-details',
        }),
      );
    });

    it('throws NotFoundException if event does not exist', async () => {
      mockPrisma.healthTimelineEvent.findUnique.mockResolvedValue(null);

      await expect(
        service.getTimelineEventDetails('non-existent', patientUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
