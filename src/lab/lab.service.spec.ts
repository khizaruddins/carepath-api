import { Test, TestingModule } from '@nestjs/testing';
import { LabService } from './lab.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HealthcareTimelineService } from '../timeline/healthcare-timeline.service';
import { ConsentAuthorizationService } from '../common/services/consent-authorization.service';
import {
  Role,
  LabVerificationStatus,
  LabMemberRole,
  LabMemberStatus,
  LabTestCategory,
  LabOrderStatus,
  LabSampleStatus,
  LabReportStatus,
  AuditAction,
  NotificationType,
} from '@prisma/client';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

describe('LabService', () => {
  let service: LabService;
  let prisma: any;
  let auditService: any;
  let notificationsService: any;
  let timelineService: any;
  let consentAuthService: any;

  const mockAdminUser = {
    id: 'admin-uuid-1',
    email: 'admin@carepath.org',
    role: Role.ADMIN,
    status: 'ACTIVE',
  };

  const mockLabAdminUser = {
    id: 'lab-admin-uuid-1',
    email: 'director@apexlabs.com',
    role: Role.LAB,
    status: 'ACTIVE',
  };

  const mockLabTechUser = {
    id: 'lab-tech-uuid-1',
    email: 'tech@apexlabs.com',
    role: Role.LAB,
    status: 'ACTIVE',
  };

  const mockPatientUser = {
    id: 'patient-uuid-1',
    email: 'john.doe@example.com',
    role: Role.PATIENT,
    status: 'ACTIVE',
  };

  const mockDoctorUser = {
    id: 'doctor-uuid-1',
    email: 'dr.smith@carepath.org',
    role: Role.DOCTOR,
    status: 'ACTIVE',
  };

  const mockLabOrg = {
    id: 'lab-org-uuid-1',
    name: 'Apex Reference Laboratories',
    licenseNumber: 'LAB-LIC-2026-001',
    contactEmail: 'contact@apexlabs.com',
    contactPhone: '+1-555-0199',
    city: 'Metropolis',
    verificationStatus: LabVerificationStatus.VERIFIED,
    isActive: true,
  };

  beforeEach(async () => {
    prisma = {
      labOrganization: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      labMembership: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      labTest: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      labOrder: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(42),
      },
      labSample: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      labReport: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(10),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      investigationRequest: {
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    auditService = {
      log: jest.fn().mockResolvedValue({}),
    };

    notificationsService = {
      sendNotification: jest.fn().mockResolvedValue({}),
    };

    timelineService = {
      projectLabReport: jest.fn().mockResolvedValue(undefined),
    };

    consentAuthService = {
      authorize: jest.fn().mockResolvedValue({ authorized: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: HealthcareTimelineService, useValue: timelineService },
        { provide: ConsentAuthorizationService, useValue: consentAuthService },
      ],
    }).compile();

    service = module.get<LabService>(LabService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------
  // 1. Lab Registration & Verification Workflow
  // -------------------------------------------------------------
  describe('Lab Registration & Verification Workflow', () => {
    it('successfully registers a new laboratory with PENDING status and LAB_ADMIN membership', async () => {
      prisma.labOrganization.findUnique.mockResolvedValue(null);
      prisma.labOrganization.create.mockResolvedValue({
        id: 'new-lab-uuid',
        name: 'Metro Diagnostics',
        licenseNumber: 'LIC-999',
        verificationStatus: LabVerificationStatus.PENDING,
        memberships: [{ userId: mockLabAdminUser.id, role: LabMemberRole.LAB_ADMIN }],
      });

      const result = await service.registerLab(mockLabAdminUser, {
        name: 'Metro Diagnostics',
        licenseNumber: 'LIC-999',
        contactEmail: 'admin@metro.com',
        contactPhone: '+1-555-1234',
      });

      expect(result.id).toBe('new-lab-uuid');
      expect(prisma.labOrganization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            verificationStatus: LabVerificationStatus.PENDING,
            licenseNumber: 'LIC-999',
          }),
        }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockLabAdminUser.id },
        data: { role: Role.LAB },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LAB_REGISTER,
        }),
      );
      expect(notificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.LAB_VERIFICATION_SUBMITTED,
        }),
      );
    });

    it('prevents registering with a duplicate license number', async () => {
      prisma.labOrganization.findUnique.mockResolvedValue(mockLabOrg);

      await expect(
        service.registerLab(mockLabAdminUser, {
          name: 'Another Lab',
          licenseNumber: mockLabOrg.licenseNumber,
          contactEmail: 'test@lab.com',
          contactPhone: '+1-555-9999',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows platform admin to verify a laboratory and dispatches notifications', async () => {
      prisma.labOrganization.findUnique.mockResolvedValue({
        ...mockLabOrg,
        verificationStatus: LabVerificationStatus.PENDING,
        memberships: [{ userId: mockLabAdminUser.id }],
      });
      prisma.labOrganization.update.mockResolvedValue({
        ...mockLabOrg,
        verificationStatus: LabVerificationStatus.VERIFIED,
        isActive: true,
      });

      const result = await service.reviewLabVerification(mockAdminUser, mockLabOrg.id, {
        status: LabVerificationStatus.VERIFIED,
        notes: 'Compliance credentials verified.',
      });

      expect(result.verificationStatus).toBe(LabVerificationStatus.VERIFIED);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LAB_VERIFICATION_REVIEW,
        }),
      );
      expect(notificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.LAB_VERIFIED,
          userId: mockLabAdminUser.id,
        }),
      );
    });

    it('rejects review attempt from non-admin accounts', async () => {
      await expect(
        service.reviewLabVerification(mockLabAdminUser, mockLabOrg.id, {
          status: LabVerificationStatus.VERIFIED,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------
  // 2. Staff Management & Public Discovery
  // -------------------------------------------------------------
  describe('Staff Management & Public Discovery', () => {
    it('allows LAB_ADMIN to add a technician member to their facility', async () => {
      prisma.labMembership.findFirst.mockResolvedValue({
        userId: mockLabAdminUser.id,
        labId: mockLabOrg.id,
        role: LabMemberRole.LAB_ADMIN,
        status: LabMemberStatus.ACTIVE,
      });
      prisma.user.findUnique.mockResolvedValue({ id: mockLabTechUser.id, role: Role.PATIENT });
      prisma.labMembership.findUnique.mockResolvedValue(null);
      prisma.labMembership.create.mockResolvedValue({
        id: 'membership-2',
        labId: mockLabOrg.id,
        userId: mockLabTechUser.id,
        role: LabMemberRole.LAB_TECHNICIAN,
      });

      const result = await service.addLabMember(
        mockLabAdminUser,
        mockLabOrg.id,
        mockLabTechUser.id,
        LabMemberRole.LAB_TECHNICIAN,
      );

      expect(result.role).toBe(LabMemberRole.LAB_TECHNICIAN);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockLabTechUser.id },
        data: { role: Role.LAB },
      });
    });

    it('only lists active verified labs in public discovery', async () => {
      prisma.labOrganization.findMany.mockResolvedValue([mockLabOrg]);

      const result = await service.listVerifiedLabs({ city: 'Metropolis' });
      expect(result.length).toBe(1);
      expect(prisma.labOrganization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            verificationStatus: LabVerificationStatus.VERIFIED,
            isActive: true,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------
  // 3. Lab Test Catalog
  // -------------------------------------------------------------
  describe('Lab Test Catalog', () => {
    it('creates a test in catalog for a verified lab and enforces unique testCode', async () => {
      prisma.labOrganization.findUnique.mockResolvedValue(mockLabOrg);
      prisma.labMembership.findFirst.mockResolvedValue({
        userId: mockLabAdminUser.id,
        labId: mockLabOrg.id,
        status: LabMemberStatus.ACTIVE,
      });
      prisma.labTest.findUnique.mockResolvedValue(null);
      prisma.labTest.create.mockResolvedValue({
        id: 'test-1',
        labId: mockLabOrg.id,
        testCode: 'CBC-001',
        name: 'Complete Blood Count',
        category: LabTestCategory.HEMATOLOGY,
        price: 35.0,
      });

      const result = await service.createCatalogTest(mockLabAdminUser, mockLabOrg.id, {
        testCode: 'CBC-001',
        name: 'Complete Blood Count',
        category: LabTestCategory.HEMATOLOGY,
        price: 35.0,
      });

      expect(result.testCode).toBe('CBC-001');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.LAB_TEST_CREATE }),
      );
    });

    it('rejects duplicate testCode within the same laboratory', async () => {
      prisma.labOrganization.findUnique.mockResolvedValue(mockLabOrg);
      prisma.labMembership.findFirst.mockResolvedValue({
        userId: mockLabAdminUser.id,
        labId: mockLabOrg.id,
        status: LabMemberStatus.ACTIVE,
      });
      prisma.labTest.findUnique.mockResolvedValue({ id: 'existing-test' });

      await expect(
        service.createCatalogTest(mockLabAdminUser, mockLabOrg.id, {
          testCode: 'CBC-001',
          name: 'Complete Blood Count',
          category: LabTestCategory.HEMATOLOGY,
          price: 35.0,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('prohibits unverified laboratories from creating catalog tests', async () => {
      prisma.labOrganization.findUnique.mockResolvedValue({
        ...mockLabOrg,
        verificationStatus: LabVerificationStatus.PENDING,
      });

      await expect(
        service.createCatalogTest(mockLabAdminUser, mockLabOrg.id, {
          testCode: 'CBC-001',
          name: 'Complete Blood Count',
          category: LabTestCategory.HEMATOLOGY,
          price: 35.0,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------
  // 4. Lab Orders Lifecycle & Multi-Tenant Isolation
  // -------------------------------------------------------------
  describe('Lab Orders Lifecycle & Multi-Tenant Isolation', () => {
    it('creates an order with immutable historical price snapshots and human-readable order number', async () => {
      prisma.labOrganization.findUnique.mockResolvedValue(mockLabOrg);
      prisma.user.findUnique.mockResolvedValue({
        id: mockPatientUser.id,
        patientProfile: { fullName: 'John Doe' },
      });
      prisma.labTest.findMany.mockResolvedValue([
        { id: 'test-1', testCode: 'CBC-001', name: 'Complete Blood Count', price: 35.0 },
      ]);
      prisma.labMembership.findMany.mockResolvedValue([{ userId: mockLabAdminUser.id }]);

      prisma.labOrder.create.mockResolvedValue({
        id: 'order-1',
        orderNumber: 'CP-LAB-2026-000043',
        patientId: mockPatientUser.id,
        labId: mockLabOrg.id,
        status: LabOrderStatus.PENDING,
        items: [{ testCode: 'CBC-001', testName: 'Complete Blood Count', price: 35.0 }],
        lab: mockLabOrg,
      });

      const result = await service.createOrder(mockPatientUser, {
        labId: mockLabOrg.id,
        tests: ['CBC-001'],
      });

      expect(result.orderNumber).toMatch(/^CP-LAB-\d{4}-\d{6}$/);
      expect(prisma.labOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: LabOrderStatus.PENDING,
            items: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({ testCode: 'CBC-001', price: 35.0 }),
              ]),
            }),
          }),
        }),
      );
      expect(notificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockPatientUser.id,
          type: NotificationType.LAB_ORDER_CREATED,
        }),
      );
    });

    it('enforces multi-tenant isolation: Lab A staff cannot access Lab B orders', async () => {
      prisma.labOrder.findUnique.mockResolvedValue({
        id: 'order-foreign',
        labId: 'other-lab-uuid',
        patientId: 'patient-x',
      });
      prisma.labMembership.findFirst.mockResolvedValue(null); // not a member of other-lab-uuid

      await expect(
        service.getOrder(mockLabAdminUser, 'order-foreign'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows patient to cancel their pending order, but rejects cancelling in-progress processing', async () => {
      prisma.labOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        orderNumber: 'CP-LAB-2026-000043',
        patientId: mockPatientUser.id,
        labId: mockLabOrg.id,
        status: LabOrderStatus.PROCESSING,
        lab: mockLabOrg,
        items: [],
      });

      await expect(
        service.updateOrderStatus(mockPatientUser, 'order-1', {
          status: LabOrderStatus.CANCELLED,
          reason: 'Changed mind',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------
  // 5. Specimen Tracking
  // -------------------------------------------------------------
  describe('Specimen Tracking', () => {
    it('logs sample collection and transitions order status to SAMPLE_COLLECTED', async () => {
      prisma.labOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        orderNumber: 'CP-LAB-2026-000043',
        labId: mockLabOrg.id,
        status: LabOrderStatus.PENDING,
        patientId: mockPatientUser.id,
      });
      prisma.labMembership.findFirst.mockResolvedValue({
        userId: mockLabTechUser.id,
        labId: mockLabOrg.id,
        status: LabMemberStatus.ACTIVE,
      });
      prisma.labSample.create.mockResolvedValue({
        id: 'sample-1',
        sampleType: 'Whole Blood EDTA',
        sampleIdentifier: 'SMP-1001',
        status: LabSampleStatus.COLLECTED,
      });

      const sample = await service.createSample(mockLabTechUser, 'order-1', {
        sampleType: 'Whole Blood EDTA',
        sampleIdentifier: 'SMP-1001',
      });

      expect(sample.sampleIdentifier).toBe('SMP-1001');
      expect(prisma.labOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          data: { status: LabOrderStatus.SAMPLE_COLLECTED },
        }),
      );
      expect(notificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.LAB_SAMPLE_COLLECTED,
        }),
      );
    });

    it('requires a mandatory rejectionReason when rejecting a specimen', async () => {
      prisma.labSample.findUnique.mockResolvedValue({
        id: 'sample-1',
        order: { labId: mockLabOrg.id },
      });
      prisma.labMembership.findFirst.mockResolvedValue({
        userId: mockLabTechUser.id,
        labId: mockLabOrg.id,
        status: LabMemberStatus.ACTIVE,
      });

      await expect(
        service.updateSampleStatus(mockLabTechUser, 'sample-1', {
          status: LabSampleStatus.REJECTED,
          // missing rejectionReason
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -------------------------------------------------------------
  // 6. Lab Reports Lifecycle & Immutability Engine
  // -------------------------------------------------------------
  describe('Lab Reports Lifecycle & Immutability Engine', () => {
    it('creates draft report and advances order to REPORT_PENDING_REVIEW', async () => {
      prisma.labOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        labId: mockLabOrg.id,
      });
      prisma.labMembership.findFirst.mockResolvedValue({
        userId: mockLabTechUser.id,
        labId: mockLabOrg.id,
        status: LabMemberStatus.ACTIVE,
      });
      prisma.labReport.create.mockResolvedValue({
        id: 'report-1',
        reportNumber: 'REP-2026-000011',
        orderId: 'order-1',
        status: LabReportStatus.DRAFT,
      });

      const draft = await service.createDraftReport(mockLabTechUser, 'order-1', {
        testSummary: 'Initial values recorded',
      });

      expect(draft.status).toBe(LabReportStatus.DRAFT);
      expect(prisma.labOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: LabOrderStatus.REPORT_PENDING_REVIEW },
      });
    });

    it('enforces immutability: rejects in-place update of a FINALIZED report', async () => {
      prisma.labReport.findUnique.mockResolvedValue({
        id: 'report-finalized',
        status: LabReportStatus.FINALIZED,
        order: { labId: mockLabOrg.id },
      });
      prisma.labMembership.findFirst.mockResolvedValue({
        userId: mockLabTechUser.id,
        labId: mockLabOrg.id,
        status: LabMemberStatus.ACTIVE,
      });

      await expect(
        service.updateReport(mockLabTechUser, 'report-finalized', {
          testSummary: 'Trying to alter results directly',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('finalizes report, completes order, and projects event to healthcare timeline', async () => {
      prisma.labReport.findUnique.mockResolvedValue({
        id: 'report-1',
        reportNumber: 'REP-2026-000011',
        orderId: 'order-1',
        status: LabReportStatus.DRAFT,
        order: {
          id: 'order-1',
          orderNumber: 'CP-LAB-2026-000043',
          labId: mockLabOrg.id,
          patientId: mockPatientUser.id,
          prescribedDoctorId: mockDoctorUser.id,
        },
      });
      prisma.labMembership.findFirst.mockResolvedValue({
        userId: mockLabTechUser.id,
        labId: mockLabOrg.id,
        status: LabMemberStatus.ACTIVE,
      });
      prisma.labReport.update.mockResolvedValue({
        id: 'report-1',
        reportNumber: 'REP-2026-000011',
        status: LabReportStatus.FINALIZED,
      });

      const result = await service.finalizeReport(mockLabTechUser, 'report-1', {
        testSummary: 'Hemoglobin 14.2 g/dL (Normal). Platelets 250,000 /uL.',
      });

      expect(result.status).toBe(LabReportStatus.FINALIZED);
      expect(timelineService.projectLabReport).toHaveBeenCalledWith('report-1');
      expect(prisma.labOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          data: expect.objectContaining({ status: LabOrderStatus.COMPLETED }),
        }),
      );
      expect(notificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockPatientUser.id,
          type: NotificationType.LAB_REPORT_READY,
        }),
      );
    });

    it('formally amends a report: creates versioned record linked to predecessor and projects to timeline', async () => {
      prisma.labReport.findUnique.mockResolvedValue({
        id: 'report-finalized-1',
        reportNumber: 'REP-2026-000011',
        status: LabReportStatus.FINALIZED,
        orderId: 'order-1',
        order: {
          id: 'order-1',
          orderNumber: 'CP-LAB-2026-000043',
          labId: mockLabOrg.id,
          patientId: mockPatientUser.id,
          prescribedDoctorId: mockDoctorUser.id,
        },
      });
      prisma.labMembership.findFirst.mockResolvedValue({
        userId: mockLabTechUser.id,
        labId: mockLabOrg.id,
        status: LabMemberStatus.ACTIVE,
      });
      prisma.labReport.create.mockResolvedValue({
        id: 'report-amended-1',
        reportNumber: 'REP-2026-000011-A0001',
        previousReportId: 'report-finalized-1',
        status: LabReportStatus.AMENDED,
        isAmended: true,
        amendedReason: 'Quality control recalibration of platelet counter.',
      });

      const result = await service.amendReport(mockLabTechUser, 'report-finalized-1', {
        amendedReason: 'Quality control recalibration of platelet counter.',
        testSummary: 'Hemoglobin 14.2 g/dL. Platelets 265,000 /uL (Recalibrated).',
      });

      expect(result.status).toBe(LabReportStatus.AMENDED);
      expect(result.previousReportId).toBe('report-finalized-1');
      expect(timelineService.projectLabReport).toHaveBeenCalledWith('report-amended-1');
      expect(notificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockPatientUser.id,
          type: NotificationType.LAB_REPORT_AMENDED,
        }),
      );
    });
  });
});
