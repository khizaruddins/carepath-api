import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HealthcareTimelineService } from '../timeline/healthcare-timeline.service';
import {
  LabMarketplaceService,
  calculateDistanceKm,
  parseTurnaroundHours,
} from './lab-marketplace.service';
import { LabCareConnectionService } from './lab-care-connection.service';
import {
  Role,
  LabVerificationStatus,
  LabTestCategory,
  LabCollectionMode,
  LabCareConnectionStatus,
  LabCareAccessScope,
  LabOrderStatus,
  ConsentStatus,
  ConsentPurpose,
  AuditAction,
  NotificationType,
} from '@prisma/client';
import { LabDiscoverySort } from './dto/discover-labs.dto';

describe('CarePath M5.1 — Lab Marketplace & Clinical Connections', () => {
  let marketplaceService: LabMarketplaceService;
  let connectionService: LabCareConnectionService;
  let prisma: any;
  let auditService: any;
  let notificationsService: any;
  let timelineService: any;

  const mockPatient = {
    id: 'patient-uuid-1',
    email: 'patient@example.com',
    role: Role.PATIENT,
  };

  const mockDoctor = {
    id: 'doctor-uuid-1',
    email: 'dr.smith@carepath.com',
    role: Role.DOCTOR,
    doctorProfile: { fullName: 'Dr. John Smith', clinicName: 'Apollo Clinic' },
  };

  const mockLabMember = {
    id: 'lab-user-1',
    email: 'tech@central-lab.com',
    role: Role.LAB,
  };

  const mockAdmin = {
    id: 'admin-uuid-1',
    email: 'admin@carepath.com',
    role: Role.ADMIN,
  };

  const mockLab1 = {
    id: 'lab-uuid-1',
    name: 'Central Diagnostic Center',
    licenseNumber: 'LIC-1001',
    contactEmail: 'central@lab.com',
    contactPhone: '9876543210',
    address: '123 MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    latitude: 12.9716,
    longitude: 77.5946,
    verificationStatus: LabVerificationStatus.VERIFIED,
    isActive: true,
    supportedSampleTypes: ['Serum', 'EDTA Whole Blood'],
    locations: [
      {
        id: 'loc-1',
        labId: 'lab-uuid-1',
        name: 'Indiranagar Branch',
        addressLine1: '100ft Road',
        city: 'Bengaluru',
        pincode: '560038',
        latitude: 12.9784,
        longitude: 77.6408,
        homeCollectionAvailable: true,
        homeCollectionFee: '150.00',
        isActive: true,
      },
    ],
    catalogTests: [
      {
        id: 'test-1',
        labId: 'lab-uuid-1',
        testCode: 'CBC',
        name: 'Complete Blood Count',
        category: LabTestCategory.HEMATOLOGY,
        price: '350.00',
        turnaroundTime: '24 hours',
        isHomeCollection: true,
        isActive: true,
        canonicalTestId: 'canon-cbc',
        canonicalTest: { id: 'canon-cbc', code: 'CBC', name: 'Complete Blood Count' },
      },
    ],
  };

  const mockLab2 = {
    id: 'lab-uuid-2',
    name: 'Metro Pathology Labs',
    licenseNumber: 'LIC-2002',
    contactEmail: 'metro@lab.com',
    contactPhone: '9876543211',
    address: '456 Koramangala',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560034',
    latitude: 12.9352,
    longitude: 77.6245,
    verificationStatus: LabVerificationStatus.VERIFIED,
    isActive: true,
    supportedSampleTypes: ['Serum', 'EDTA Whole Blood'],
    locations: [],
    catalogTests: [
      {
        id: 'test-2',
        labId: 'lab-uuid-2',
        testCode: 'CBC-METRO',
        name: 'Complete Blood Count (CBC)',
        category: LabTestCategory.HEMATOLOGY,
        price: '280.00',
        turnaroundTime: '12 hours',
        isHomeCollection: false,
        isActive: true,
        canonicalTestId: 'canon-cbc',
        canonicalTest: { id: 'canon-cbc', code: 'CBC', name: 'Complete Blood Count' },
      },
    ],
  };

  const mockInvestigation = {
    id: 'inv-uuid-1',
    patientId: 'patient-uuid-1',
    doctorId: 'doctor-uuid-1',
    investigationName: 'Complete Blood Count',
    category: 'LABORATORY',
    priority: 'ROUTINE',
    reason: 'Routine annual checkup',
    notes: 'Fasting not required',
    status: 'PENDING',
    requestedDate: new Date(),
    doctor: mockDoctor,
  };

  beforeEach(async () => {
    prisma = {
      canonicalTest: {
        upsert: jest.fn().mockResolvedValue({ id: 'canon-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ id: 'canon-cbc', code: 'CBC', name: 'Complete Blood Count' }),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'new-canon-1', ...args.data })),
      },
      labOrganization: {
        findMany: jest.fn().mockResolvedValue([mockLab1, mockLab2]),
        findUnique: jest.fn().mockResolvedValue(mockLab1),
      },
      labLocation: {
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'loc-new', ...args.data })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      labTest: {
        findFirst: jest.fn().mockResolvedValue(mockLab1.catalogTests[0]),
        findMany: jest.fn().mockResolvedValue(mockLab1.catalogTests),
        findUnique: jest.fn().mockResolvedValue(mockLab1.catalogTests[0]),
      },
      investigationRequest: {
        findUnique: jest.fn().mockResolvedValue(mockInvestigation),
        update: jest.fn().mockResolvedValue({ ...mockInvestigation, status: 'ORDERED' }),
      },
      labOrder: {
        count: jest.fn().mockResolvedValue(10),
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({
          id: 'order-uuid-1',
          ...args.data,
          items: [{ testId: 'test-1', testName: 'Complete Blood Count', price: '350.00' }],
        })),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'order-uuid-1', status: LabOrderStatus.COMPLETED }),
      },
      labReport: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      labCareConnection: {
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({
          id: 'conn-uuid-1',
          ...args.data,
        })),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve({
          id: args.where.id,
          ...args.data,
        })),
      },
      labMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'mem-1',
          userId: 'lab-user-1',
          labId: 'lab-uuid-1',
          role: 'LAB_ADMIN',
          status: 'ACTIVE',
        }),
        findMany: jest.fn().mockResolvedValue([{ userId: 'lab-user-1' }]),
      },
      user: {
        findUnique: jest.fn().mockImplementation((args: any) => {
          if (args.where.id === mockDoctor.id) return Promise.resolve(mockDoctor);
          if (args.where.id === mockPatient.id) return Promise.resolve(mockPatient);
          return Promise.resolve(null);
        }),
      },
      consent: {
        create: jest.fn().mockImplementation((args: any) => Promise.resolve({
          id: 'consent-uuid-1',
          ...args.data,
        })),
      },
      healthTimelineEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    notificationsService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };

    timelineService = {
      projectLabOrder: jest.fn().mockResolvedValue(undefined),
      projectLabReport: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabMarketplaceService,
        LabCareConnectionService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: HealthcareTimelineService, useValue: timelineService },
      ],
    }).compile();

    marketplaceService = module.get<LabMarketplaceService>(LabMarketplaceService);
    connectionService = module.get<LabCareConnectionService>(LabCareConnectionService);
  });

  describe('Geospatial & Utilities', () => {
    it('correctly computes Haversine distance between two coordinates', () => {
      // MG Road (12.9716, 77.5946) to Indiranagar (12.9784, 77.6408) is ~5.1 km
      const distance = calculateDistanceKm(12.9716, 77.5946, 12.9784, 77.6408);
      expect(distance).toBeGreaterThan(4.5);
      expect(distance).toBeLessThan(5.5);
    });

    it('correctly parses turnaround time in hours', () => {
      expect(parseTurnaroundHours('12 hours')).toBe(12);
      expect(parseTurnaroundHours('2 days')).toBe(48);
      expect(parseTurnaroundHours('1 week')).toBe(168);
      expect(parseTurnaroundHours(null)).toBe(48);
    });
  });

  describe('Lab Discovery & Investigation Marketplace', () => {
    it('discovers labs with pricing breakdown and sorts by CHEAPEST', async () => {
      const result = await marketplaceService.discoverLabs({
        q: 'CBC',
        sort: LabDiscoverySort.CHEAPEST,
      });

      expect(result.items.length).toBe(2);
      expect(result.items[0].pricing.totalPrice).toBeLessThanOrEqual(result.items[1].pricing.totalPrice);
      expect(result.items[0].lab.name).toBe('Metro Pathology Labs'); // 280 vs 350
    });

    it('ranks labs by NEARBY distance when user coordinates are provided', async () => {
      // User is right next to Indiranagar location of Central Lab (12.9780, 77.6400)
      const result = await marketplaceService.discoverLabs({
        latitude: 12.978,
        longitude: 77.64,
        sort: LabDiscoverySort.NEARBY,
      });

      expect(result.items.length).toBe(2);
      expect(result.items[0].distanceKm).toBeLessThan(result.items[1].distanceKm);
      expect(result.items[0].lab.name).toBe('Central Diagnostic Center');
    });

    it('sorts labs by FASTEST turnaround time', async () => {
      const result = await marketplaceService.discoverLabs({
        sort: LabDiscoverySort.FASTEST,
      });

      expect(result.items[0].matchingTest.turnaroundHours).toBeLessThanOrEqual(
        result.items[1].matchingTest.turnaroundHours,
      );
      expect(result.items[0].lab.name).toBe('Metro Pathology Labs'); // 12h vs 24h
    });

    it('compares labs for an investigation request and audits price viewing', async () => {
      const comparison = await marketplaceService.compareLabsForInvestigation(
        mockPatient.id,
        mockInvestigation.id,
      );

      expect(comparison.investigation.id).toBe(mockInvestigation.id);
      expect(comparison.comparison.length).toBe(2);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LAB_PRICE_VIEW,
          actorId: mockPatient.id,
        }),
      );
    });

    it('rejects cross-patient unauthorized investigation comparison', async () => {
      await expect(
        marketplaceService.compareLabsForInvestigation('other-patient-uuid', mockInvestigation.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Canonical Diagnostic Tests', () => {
    it('seeds and retrieves canonical tests', async () => {
      await marketplaceService.ensureSeedCanonicalTests();
      expect(prisma.canonicalTest.upsert).toHaveBeenCalled();
    });

    it('allows admin to define new canonical test', async () => {
      prisma.canonicalTest.findUnique.mockResolvedValueOnce(null);
      const created = await marketplaceService.createCanonicalTest(mockAdmin as any, {
        code: 'VIT_B12',
        name: 'Vitamin B12 Assay',
        category: LabTestCategory.BIOCHEMISTRY,
      });

      expect(created.code).toBe('VIT_B12');
      expect(prisma.canonicalTest.create).toHaveBeenCalled();
    });

    it('forbids non-admin from creating canonical tests', async () => {
      await expect(
        marketplaceService.createCanonicalTest(mockPatient as any, {
          code: 'XYZ',
          name: 'Test',
          category: LabTestCategory.OTHER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Temporary Clinical Connection & Lab Selection', () => {
    it('establishes temporary clinical connection upon patient lab selection with 72h TTL', async () => {
      const result = await connectionService.selectLabForInvestigation(
        mockPatient as any,
        mockInvestigation.id,
        {
          labId: mockLab1.id,
          collectionMode: LabCollectionMode.LAB,
          ttlHours: 72,
        },
      );

      expect(result.order).toBeDefined();
      expect(result.connection).toBeDefined();
      expect(result.connection.status).toBe(LabCareConnectionStatus.ACTIVE);
      expect(result.connection.scopes).toContain(LabCareAccessScope.PATIENT_BASIC_PROFILE);
      expect(result.connection.scopes).toContain(LabCareAccessScope.INVESTIGATION_REQUEST);
      expect(result.connection.scopes).toContain(LabCareAccessScope.SAMPLE_INFORMATION);

      // Verify audit logs
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LAB_SELECTED,
          actorId: mockPatient.id,
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LAB_CARE_CONNECTION_CREATED,
          actorId: mockPatient.id,
        }),
      );

      // Verify notifications
      expect(notificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockPatient.id,
          type: NotificationType.LAB_CARE_CONNECTION_CREATED,
        }),
      );
    });

    it('requires physical address when HOME collection mode is selected', async () => {
      await expect(
        connectionService.selectLabForInvestigation(
          mockPatient as any,
          mockInvestigation.id,
          {
            labId: mockLab1.id,
            collectionMode: LabCollectionMode.HOME,
            // no collectionAddress
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces valid state machine transitions', async () => {
      const mockConn = {
        id: 'conn-1',
        status: LabCareConnectionStatus.ACTIVE,
        patientId: mockPatient.id,
      };
      prisma.labCareConnection.findUnique.mockResolvedValue(mockConn);

      // Valid: ACTIVE -> SAMPLE_COLLECTED
      const updated = await connectionService.transitionConnectionStatus(
        'conn-1',
        LabCareConnectionStatus.SAMPLE_COLLECTED,
      );
      expect(updated.status).toBe(LabCareConnectionStatus.SAMPLE_COLLECTED);

      // Invalid: Jump from ACTIVE directly to COMPLETED
      await expect(
        connectionService.transitionConnectionStatus('conn-1', LabCareConnectionStatus.COMPLETED),
      ).rejects.toThrow(BadRequestException);
    });

    it('automatically revokes clinical access when report is delivered to patient', async () => {
      const mockConn = {
        id: 'conn-1',
        status: LabCareConnectionStatus.REPORT_READY,
        patientId: mockPatient.id,
      };
      prisma.labCareConnection.findUnique.mockResolvedValue(mockConn);

      const completed = await connectionService.transitionConnectionStatus(
        'conn-1',
        LabCareConnectionStatus.COMPLETED,
      );

      expect(completed.status).toBe(LabCareConnectionStatus.COMPLETED);
      expect(completed.revokedAt).toBeDefined();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LAB_CARE_ACCESS_REVOKED,
        }),
      );
    });

    it('enforces minimum-necessary context scoping for laboratory actors', async () => {
      const mockConnectionWithContext = {
        id: 'conn-1',
        status: LabCareConnectionStatus.ACTIVE,
        purpose: 'INVESTIGATION_FULFILLMENT',
        scopes: [LabCareAccessScope.PATIENT_BASIC_PROFILE, LabCareAccessScope.INVESTIGATION_REQUEST],
        accessGrantedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000), // valid future TTL
        patientId: mockPatient.id,
        doctorId: mockDoctor.id,
        labId: mockLab1.id,
        patient: {
          id: mockPatient.id,
          email: mockPatient.email,
          phoneNumber: '9998887776',
          patientProfile: {
            fullName: 'Jane Doe',
            gender: 'FEMALE',
            dateOfBirth: new Date('1990-01-01'),
            mobile: '9998887776',
          },
        },
        doctor: mockDoctor,
        investigationRequest: mockInvestigation,
        labOrder: {
          id: 'order-1',
          orderNumber: 'CP-LAB-2026-000010',
          status: LabOrderStatus.PENDING,
          collectionMode: LabCollectionMode.LAB,
          collectionAddress: null,
          scheduledDate: null,
          priority: 'ROUTINE',
          items: [],
          samples: [],
        },
      };

      prisma.labCareConnection.findUnique.mockResolvedValue(mockConnectionWithContext);

      const context: any = await connectionService.getConnectionDetails(
        mockLabMember as any,
        'conn-1',
      );

      // Verify minimum-necessary fields exist
      expect(context.patientContext.fullName).toBe('Jane Doe');
      expect(context.patientContext.age).toBeDefined();
      expect(context.investigationContext.investigationName).toBe('Complete Blood Count');

      // Verify patient medical vault documents, history, and timeline are NOT present in lab context!
      expect(context.patientContext.documents).toBeUndefined();
      expect(context.patientContext.timeline).toBeUndefined();
      expect(context.patientContext.pastConsultations).toBeUndefined();
      expect(context.patientContext.prescriptions).toBeUndefined();

      // Verify access audit
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LAB_CARE_ACCESS_GRANTED,
          actorId: mockLabMember.id,
        }),
      );
    });

    it('rejects access and transitions status when connection TTL is expired', async () => {
      const expiredConn = {
        id: 'conn-expired',
        status: LabCareConnectionStatus.ACTIVE,
        expiresAt: new Date(Date.now() - 3600000), // 1 hour in the past
        labId: mockLab1.id,
        patientId: mockPatient.id,
        patient: { patientProfile: {} },
        labOrder: {},
      };
      prisma.labCareConnection.findUnique.mockResolvedValue(expiredConn);

      await expect(
        connectionService.getConnectionDetails(mockLabMember as any, 'conn-expired'),
      ).rejects.toThrow(ForbiddenException);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LAB_CARE_ACCESS_EXPIRED,
          actorId: mockLabMember.id,
        }),
      );
    });

    it('rejects cross-tenant access when lab actor belongs to a different laboratory', async () => {
      const connOtherLab = {
        id: 'conn-other',
        status: LabCareConnectionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 3600000),
        labId: 'other-lab-uuid', // Different lab
        patientId: mockPatient.id,
      };
      prisma.labCareConnection.findUnique.mockResolvedValue(connOtherLab);
      prisma.labMembership.findFirst.mockResolvedValueOnce(null); // Not a member of other-lab

      await expect(
        connectionService.getConnectionDetails(mockLabMember as any, 'conn-other'),
      ).rejects.toThrow(ForbiddenException);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LAB_CARE_ACCESS_DENIED,
          actorId: mockLabMember.id,
        }),
      );
    });
  });

  describe('Patient-Controlled Diagnostic Report Sharing', () => {
    it('creates scoped consent and notifies doctor when patient shares report', async () => {
      const mockReport = {
        id: 'report-uuid-1',
        reportNumber: 'CP-REP-2026-000042',
        orderId: 'order-uuid-1',
        documentId: 'doc-uuid-1',
        order: {
          patientId: mockPatient.id,
          items: [{ testName: 'Complete Blood Count' }],
        },
      };
      prisma.labReport.findUnique.mockResolvedValue(mockReport);

      const result = await connectionService.shareReportWithDoctor(
        mockPatient as any,
        mockReport.id,
        {
          doctorId: mockDoctor.id,
          notes: 'Please review my blood count results',
          expiresInDays: 30,
        },
      );

      expect(result.consent).toBeDefined();
      expect(result.consent.status).toBe(ConsentStatus.APPROVED);
      expect(result.consent.purpose).toBe(ConsentPurpose.INVESTIGATION_REVIEW);

      // Verify audit log
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LAB_REPORT_SHARED_WITH_DOCTOR,
          actorId: mockPatient.id,
        }),
      );

      // Verify notification sent to doctor
      expect(notificationsService.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockDoctor.id,
          type: NotificationType.LAB_REPORT_SHARED,
        }),
      );
    });

    it('forbids sharing reports belonging to another patient', async () => {
      const mockReport = {
        id: 'report-uuid-1',
        reportNumber: 'CP-REP-2026-000042',
        orderId: 'order-uuid-1',
        order: {
          patientId: 'different-patient-uuid',
          items: [],
        },
      };
      prisma.labReport.findUnique.mockResolvedValue(mockReport);

      await expect(
        connectionService.shareReportWithDoctor(mockPatient as any, mockReport.id, {
          doctorId: mockDoctor.id,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
