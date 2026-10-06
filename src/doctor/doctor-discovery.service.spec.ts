import { Test, TestingModule } from '@nestjs/testing';
import { DoctorDiscoveryService, calculateDistanceKm, parseFee } from './doctor-discovery.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  Role,
  UserStatus,
  DoctorVerificationStatus,
  RelationshipStatus,
  AuditAction,
} from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

describe('DoctorDiscoveryService', () => {
  let service: DoctorDiscoveryService;
  let prisma: PrismaService;
  let audit: AuditService;

  const mockPrisma = {
    user: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    doctorPracticeLocation: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    doctorSearchHistory: {
      create: jest.fn().mockResolvedValue({ id: 'sh-1' }),
      findMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    consultation: {
      findMany: jest.fn(),
    },
    patientDoctorRelationship: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockAudit = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const sampleDoctor = {
    id: 'doc-1',
    email: 'doc1@carepath.test',
    role: Role.DOCTOR,
    status: UserStatus.ACTIVE,
    doctorProfile: {
      fullName: 'Dr. Jane Smith',
      specialization: 'Cardiology',
      subSpecialty: 'Interventional Cardiology',
      qualifications: 'MD, DM Cardiology',
      languages: ['English', 'Hindi'],
      yearsOfExperience: 12,
      clinicName: 'Heart Care Clinic',
      clinicAddress: '123 Medical Way, Indiranagar',
      city: 'Bangalore',
      latitude: 12.9716,
      longitude: 77.5946,
      consultationMode: 'IN_PERSON',
      consultationFee: '₹800',
      workingHours: '9:00 AM - 5:00 PM',
      hospitalAffiliation: 'City Hospital',
      bio: 'Leading cardiologist with 12 years experience.',
      verificationStatus: DoctorVerificationStatus.VERIFIED,
      profilePhoto: 'https://cdn.carepath.com/photos/doc1.jpg',
    },
    doctorPracticeLocations: [
      {
        id: 'loc-1',
        practiceName: 'Heart Care Indiranagar',
        addressLine1: '123 Medical Way',
        addressLine2: 'Suite 200',
        area: 'Indiranagar',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560038',
        latitude: 12.9716,
        longitude: 77.5946,
        phone: '+91 9876543210',
        isPrimary: true,
        active: true,
      },
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoctorDiscoveryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<DoctorDiscoveryService>(DoctorDiscoveryService);
    prisma = module.get<PrismaService>(PrismaService);
    audit = module.get<AuditService>(AuditService);
  });

  describe('Helper Functions', () => {
    it('should calculate distance correctly using Haversine formula', () => {
      // Bangalore (12.9716, 77.5946) to Mumbai (19.0760, 72.8777) ~ 840-850 km
      const distance = calculateDistanceKm(12.9716, 77.5946, 19.076, 72.8777);
      expect(distance).toBeGreaterThan(800);
      expect(distance).toBeLessThan(900);

      // Same point should be 0 km
      const zeroDistance = calculateDistanceKm(12.9716, 77.5946, 12.9716, 77.5946);
      expect(zeroDistance).toBe(0);
    });

    it('should parse fee correctly from various string representations', () => {
      expect(parseFee('₹800')).toBe(800);
      expect(parseFee('1200 INR')).toBe(1200);
      expect(parseFee('$50.50')).toBe(50.5);
      expect(parseFee(null)).toBe(0);
    });
  });

  describe('searchDoctors', () => {
    it('should find verified doctors and return sanitized results', async () => {
      mockPrisma.user.findMany.mockResolvedValue([sampleDoctor]);

      const result = await service.searchDoctors(
        { q: 'Jane', specialty: 'Cardiology' },
        undefined,
        '127.0.0.1',
        'Jest/Test',
      );

      expect(result.doctors).toHaveLength(1);
      expect(result.doctors[0].id).toBe('doc-1');
      expect(result.doctors[0].fullName).toBe('Dr. Jane Smith');
      expect(result.doctors[0].specialization).toBe('Cardiology');
      expect(result.doctors[0].practiceLocations).toHaveLength(1);
      expect(result.pagination.total).toBe(1);

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DOCTOR_SEARCH,
        }),
      );
    });

    it('should prioritize previously consulted doctors over other doctors', async () => {
      const patient: AuthenticatedUser = {
        id: 'patient-1',
        email: 'patient@test.com',
        role: Role.PATIENT,
        status: UserStatus.ACTIVE,
      };

      const doc2 = {
        ...sampleDoctor,
        id: 'doc-2',
        doctorProfile: {
          ...sampleDoctor.doctorProfile,
          fullName: 'Dr. Aaron General',
          yearsOfExperience: 25,
        },
      };

      mockPrisma.user.findMany.mockResolvedValue([doc2, sampleDoctor]);
      // Patient previously consulted doc-1
      mockPrisma.consultation.findMany.mockResolvedValue([
        { doctorId: 'doc-1', consultationDate: new Date() },
      ]);
      mockPrisma.patientDoctorRelationship.findMany.mockResolvedValue([]);

      const result = await service.searchDoctors({}, patient);

      expect(result.doctors).toHaveLength(2);
      // doc-1 is tier 1 (consulted), so it appears before doc-2 even though doc-2 has more years of experience
      expect(result.doctors[0].id).toBe('doc-1');
      expect(result.doctors[0].isPreviouslyConsulted).toBe(true);
      expect(result.doctors[1].id).toBe('doc-2');
      expect(result.doctors[1].isPreviouslyConsulted).toBe(false);
    });

    it('should filter doctors by distance and radius', async () => {
      mockPrisma.user.findMany.mockResolvedValue([sampleDoctor]);

      // Coordinates in Delhi (far from Bangalore doc-1)
      const result = await service.searchDoctors({
        latitude: 28.6139,
        longitude: 77.209,
        radius: 50,
      });

      // Doctor is ~1700km away, radius is 50km -> should be excluded
      expect(result.doctors).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });

    it('should filter by spoken language', async () => {
      mockPrisma.user.findMany.mockResolvedValue([sampleDoctor]);

      const resultHindi = await service.searchDoctors({ language: 'Hindi' });
      expect(resultHindi.doctors).toHaveLength(1);

      const resultGerman = await service.searchDoctors({ language: 'German' });
      expect(resultGerman.doctors).toHaveLength(0);
    });
  });

  describe('getDoctorPublicProfile', () => {
    it('should return complete sanitized doctor profile with relationship context', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(sampleDoctor);

      const patient: AuthenticatedUser = {
        id: 'patient-1',
        email: 'patient@test.com',
        role: Role.PATIENT,
        status: UserStatus.ACTIVE,
      };

      mockPrisma.patientDoctorRelationship.findUnique.mockResolvedValue({
        id: 'rel-1',
        patientId: 'patient-1',
        doctorId: 'doc-1',
        status: RelationshipStatus.ACTIVE,
      });

      mockPrisma.consultation.findMany.mockResolvedValue([
        { consultationDate: new Date('2026-09-01T10:00:00Z') },
      ]);

      const result = await service.getDoctorPublicProfile('doc-1', patient);

      expect(result.id).toBe('doc-1');
      expect(result.fullName).toBe('Dr. Jane Smith');
      expect(result.relationship.status).toBe(RelationshipStatus.ACTIVE);
      expect(result.relationship.consultationCount).toBe(1);
      expect(result.practiceLocations).toHaveLength(1);

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.DOCTOR_PROFILE_VIEW,
          resourceId: 'doc-1',
        }),
      );
    });

    it('should throw NotFoundException if doctor does not exist or is not verified', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.getDoctorPublicProfile('non-existent-doc'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Doctor Practice Locations Management', () => {
    it('should create a practice location and unset previous primary if isPrimary is true', async () => {
      mockPrisma.doctorPracticeLocation.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.doctorPracticeLocation.create.mockResolvedValue({
        id: 'loc-new',
        doctorId: 'doc-1',
        practiceName: 'Prime Specialty Clinic',
        isPrimary: true,
      });

      const res = await service.createPracticeLocation('doc-1', {
        practiceName: 'Prime Specialty Clinic',
        addressLine1: '456 Brigade Rd',
        city: 'Bangalore',
        isPrimary: true,
      });

      expect(mockPrisma.doctorPracticeLocation.updateMany).toHaveBeenCalledWith({
        where: { doctorId: 'doc-1', isPrimary: true },
        data: { isPrimary: false },
      });
      expect(res.id).toBe('loc-new');
    });

    it('should update a practice location', async () => {
      mockPrisma.doctorPracticeLocation.findFirst.mockResolvedValue({ id: 'loc-1', doctorId: 'doc-1' });
      mockPrisma.doctorPracticeLocation.update.mockResolvedValue({
        id: 'loc-1',
        practiceName: 'Updated Clinic Name',
      });

      const res = await service.updatePracticeLocation('doc-1', 'loc-1', {
        practiceName: 'Updated Clinic Name',
      });

      expect(res.practiceName).toBe('Updated Clinic Name');
    });

    it('should delete a practice location', async () => {
      mockPrisma.doctorPracticeLocation.findFirst.mockResolvedValue({ id: 'loc-1', doctorId: 'doc-1' });
      mockPrisma.doctorPracticeLocation.delete.mockResolvedValue({ id: 'loc-1' });

      const res = await service.deletePracticeLocation('doc-1', 'loc-1');
      expect(res.message).toBe('Practice location removed successfully');
    });
  });
});
