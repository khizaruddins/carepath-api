import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import {
  Role,
  UserStatus,
  DoctorVerificationStatus,
  AuditAction,
  AuditResult,
  RelationshipStatus,
} from '@prisma/client';
import {
  DiscoverDoctorsDto,
  DoctorSortOrder,
} from './dto/discover-doctors.dto';
import {
  CreateDoctorPracticeLocationDto,
  UpdateDoctorPracticeLocationDto,
} from './dto/doctor-practice-location.dto';

export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function parseFee(fee?: string | null): number {
  if (!fee) return 0;
  const numMatch = fee.replace(/[^0-9.]/g, '');
  return numMatch ? parseFloat(numMatch) : 0;
}

export interface EnrichedDoctor {
  id: string;
  fullName: string;
  profilePhoto: string | null;
  specialization: string | null;
  subSpecialty: string | null;
  qualifications: string | null;
  languages: string[];
  yearsOfExperience: number;
  clinicName: string | null;
  clinicAddress: string | null;
  city: string | null;
  consultationMode: string | null;
  consultationFee: string | null;
  workingHours: string | null;
  hospitalAffiliation: string | null;
  bio: string | null;
  practiceLocations: any[];
  distanceKm: number | null;
  relationshipStatus: RelationshipStatus | null;
  isPreviouslyConsulted: boolean;
  tier: number; // 1 = consulted, 2 = connected, 3 = nearby, 4 = other
}

@Injectable()
export class DoctorDiscoveryService {
  private readonly logger = new Logger(DoctorDiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Verified Doctor Search and Discovery
   */
  async searchDoctors(
    dto: DiscoverDoctorsDto,
    currentUser?: AuthenticatedUser,
    clientIp?: string,
    userAgent?: string,
  ) {
    const isPatient = currentUser?.role === Role.PATIENT;
    const patientId = isPatient ? currentUser.id : undefined;

    // Build Prisma query condition: strictly verified and active doctors only
    const whereClause: any = {
      role: Role.DOCTOR,
      status: UserStatus.ACTIVE,
      doctorProfile: {
        verificationStatus: DoctorVerificationStatus.VERIFIED,
      },
    };

    // Specialty filter
    if (dto.specialty) {
      whereClause.doctorProfile.specialization = {
        contains: dto.specialty,
        mode: 'insensitive',
      };
    }

    // Subspecialty filter
    if (dto.subspecialty) {
      whereClause.doctorProfile.subSpecialty = {
        contains: dto.subspecialty,
        mode: 'insensitive',
      };
    }

    // City filter (matches doctorProfile.city OR any active practice location city)
    if (dto.city) {
      whereClause.OR = [
        { doctorProfile: { city: { contains: dto.city, mode: 'insensitive' } } },
        {
          doctorPracticeLocations: {
            some: { city: { contains: dto.city, mode: 'insensitive' }, active: true },
          },
        },
      ];
    }

    // Area filter (matches clinicAddress OR practice location area)
    if (dto.area) {
      const areaCondition = [
        { doctorProfile: { clinicAddress: { contains: dto.area, mode: 'insensitive' } } },
        {
          doctorPracticeLocations: {
            some: { area: { contains: dto.area, mode: 'insensitive' }, active: true },
          },
        },
      ];
      if (whereClause.OR) {
        whereClause.AND = [{ OR: whereClause.OR }, { OR: areaCondition }];
        delete whereClause.OR;
      } else {
        whereClause.OR = areaCondition;
      }
    }

    // Pincode filter
    if (dto.pincode) {
      const pincodeCondition = [
        { doctorProfile: { clinicAddress: { contains: dto.pincode } } },
        {
          doctorPracticeLocations: {
            some: { pincode: dto.pincode, active: true },
          },
        },
      ];
      if (whereClause.AND) {
        whereClause.AND.push({ OR: pincodeCondition });
      } else if (whereClause.OR) {
        whereClause.AND = [{ OR: whereClause.OR }, { OR: pincodeCondition }];
        delete whereClause.OR;
      } else {
        whereClause.OR = pincodeCondition;
      }
    }

    // Gender filter
    if (dto.gender) {
      whereClause.doctorProfile.gender = dto.gender;
    }

    // Experience filters
    if (dto.experienceMin !== undefined || dto.experienceMax !== undefined) {
      whereClause.doctorProfile.yearsOfExperience = {
        ...(dto.experienceMin !== undefined ? { gte: dto.experienceMin } : {}),
        ...(dto.experienceMax !== undefined ? { lte: dto.experienceMax } : {}),
      };
    }

    // Free text query q
    if (dto.q && dto.q.trim()) {
      const searchTerm = dto.q.trim();
      const textConditions = [
        { doctorProfile: { fullName: { contains: searchTerm, mode: 'insensitive' } } },
        { doctorProfile: { specialization: { contains: searchTerm, mode: 'insensitive' } } },
        { doctorProfile: { subSpecialty: { contains: searchTerm, mode: 'insensitive' } } },
        { doctorProfile: { qualifications: { contains: searchTerm, mode: 'insensitive' } } },
        { doctorProfile: { clinicName: { contains: searchTerm, mode: 'insensitive' } } },
        { doctorProfile: { hospitalAffiliation: { contains: searchTerm, mode: 'insensitive' } } },
        { doctorProfile: { bio: { contains: searchTerm, mode: 'insensitive' } } },
        {
          doctorPracticeLocations: {
            some: {
              active: true,
              OR: [
                { practiceName: { contains: searchTerm, mode: 'insensitive' } },
                { area: { contains: searchTerm, mode: 'insensitive' } },
                { city: { contains: searchTerm, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];

      if (whereClause.AND) {
        whereClause.AND.push({ OR: textConditions });
      } else if (whereClause.OR) {
        whereClause.AND = [{ OR: whereClause.OR }, { OR: textConditions }];
        delete whereClause.OR;
      } else {
        whereClause.OR = textConditions;
      }
    }

    // Fetch verified doctors
    const doctors = await this.prisma.user.findMany({
      where: whereClause,
      include: {
        doctorProfile: true,
        doctorPracticeLocations: {
          where: { active: true },
          orderBy: { isPrimary: 'desc' },
        },
      },
    });

    // If language filter provided, filter in-memory (array contains)
    let filteredDoctors = doctors;
    if (dto.language && dto.language.trim()) {
      const targetLang = dto.language.trim().toLowerCase();
      filteredDoctors = doctors.filter((doc) =>
        doc.doctorProfile?.languages.some((l) =>
          l.toLowerCase().includes(targetLang),
        ),
      );
    }

    // If patient is logged in, fetch past consultations and relationships for ranking
    let previouslyConsultedDoctorIds = new Set<string>();
    let connectedDoctorMap = new Map<string, RelationshipStatus>();

    if (patientId) {
      const [consultations, relationships] = await Promise.all([
        this.prisma.consultation.findMany({
          where: { patientId },
          select: { doctorId: true, consultationDate: true },
          orderBy: { consultationDate: 'desc' },
        }),
        this.prisma.patientDoctorRelationship.findMany({
          where: { patientId },
          select: { doctorId: true, status: true },
        }),
      ]);

      consultations.forEach((c) => previouslyConsultedDoctorIds.add(c.doctorId));
      relationships.forEach((r) => connectedDoctorMap.set(r.doctorId, r.status));
    }

    // Distance calculation and radius filtering
    const hasCoordinates = dto.latitude !== undefined && dto.longitude !== undefined;
    const maxRadius = dto.radius || 25;

    const enrichedList: EnrichedDoctor[] = [];

    for (const doc of filteredDoctors) {
      const profile = doc.doctorProfile;
      if (!profile) continue;

      let minDistanceKm: number | null = null;

      if (hasCoordinates) {
        const docDistances: number[] = [];
        if (profile.latitude !== null && profile.longitude !== null) {
          docDistances.push(
            calculateDistanceKm(dto.latitude!, dto.longitude!, profile.latitude, profile.longitude),
          );
        }
        for (const loc of doc.doctorPracticeLocations) {
          if (loc.latitude !== null && loc.longitude !== null) {
            docDistances.push(
              calculateDistanceKm(dto.latitude!, dto.longitude!, loc.latitude, loc.longitude),
            );
          }
        }
        if (docDistances.length > 0) {
          minDistanceKm = Math.min(...docDistances);
        }

        // Apply radius filter if radius specified and doctor has distance
        if (minDistanceKm !== null && minDistanceKm > maxRadius) {
          continue;
        }
      }

      const isPreviouslyConsulted = previouslyConsultedDoctorIds.has(doc.id);
      const relStatus = connectedDoctorMap.get(doc.id) || null;
      const isConnected = relStatus === RelationshipStatus.ACTIVE;

      // Tiering logic:
      // Tier 1: Previously Consulted
      // Tier 2: Connected or Previously Connected
      // Tier 3: Nearby (< 25km)
      // Tier 4: Other verified
      let tier = 4;
      if (isPreviouslyConsulted) {
        tier = 1;
      } else if (isConnected || relStatus === RelationshipStatus.INACTIVE) {
        tier = 2;
      } else if (minDistanceKm !== null && minDistanceKm <= 25) {
        tier = 3;
      }

      // Sanitize practice locations
      const sanitizedLocations = doc.doctorPracticeLocations.map((loc) => ({
        id: loc.id,
        practiceName: loc.practiceName,
        addressLine1: loc.addressLine1,
        addressLine2: loc.addressLine2,
        area: loc.area,
        city: loc.city,
        state: loc.state,
        pincode: loc.pincode,
        latitude: loc.latitude,
        longitude: loc.longitude,
        phone: loc.phone,
        isPrimary: loc.isPrimary,
      }));

      enrichedList.push({
        id: doc.id,
        fullName: profile.fullName,
        profilePhoto: profile.profilePhoto,
        specialization: profile.specialization,
        subSpecialty: profile.subSpecialty,
        qualifications: profile.qualifications,
        languages: profile.languages,
        yearsOfExperience: profile.yearsOfExperience,
        clinicName: profile.clinicName,
        clinicAddress: profile.clinicAddress,
        city: profile.city,
        consultationMode: profile.consultationMode,
        consultationFee: profile.consultationFee,
        workingHours: profile.workingHours,
        hospitalAffiliation: profile.hospitalAffiliation,
        bio: profile.bio,
        practiceLocations: sanitizedLocations,
        distanceKm: minDistanceKm,
        relationshipStatus: relStatus,
        isPreviouslyConsulted,
        tier,
      });
    }

    // Sort order
    const sort = dto.sort || DoctorSortOrder.RELEVANCE;
    enrichedList.sort((a, b) => {
      if (sort === DoctorSortOrder.RELEVANCE) {
        if (a.tier !== b.tier) return a.tier - b.tier;
        return b.yearsOfExperience - a.yearsOfExperience;
      }
      if (sort === DoctorSortOrder.EXPERIENCE_DESC) {
        return b.yearsOfExperience - a.yearsOfExperience;
      }
      if (sort === DoctorSortOrder.FEE_ASC) {
        return parseFee(a.consultationFee) - parseFee(b.consultationFee);
      }
      if (sort === DoctorSortOrder.FEE_DESC) {
        return parseFee(b.consultationFee) - parseFee(a.consultationFee);
      }
      if (sort === DoctorSortOrder.DISTANCE) {
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      }
      return 0;
    });

    // Pagination
    const page = dto.page || 1;
    const limit = Math.min(dto.limit || 20, 50);
    const total = enrichedList.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedItems = enrichedList.slice(startIndex, startIndex + limit);

    // Save search query into history if patient is authenticated and search term provided
    if (patientId && (dto.q || dto.specialty || dto.city)) {
      const queryStr = [dto.q, dto.specialty, dto.city].filter(Boolean).join(' | ');
      this.prisma.doctorSearchHistory
        .create({
          data: {
            patientId,
            searchQuery: queryStr,
          },
        })
        .catch((err) => {
          this.logger.warn(`Failed to save doctor search history: ${err.message}`);
        });
    }

    // Audit log
    await this.auditService.log({
      actorId: currentUser?.id,
      actorEmail: currentUser?.email,
      actorRole: currentUser?.role,
      action: AuditAction.DOCTOR_SEARCH,
      resourceType: 'DOCTOR_DISCOVERY',
      result: AuditResult.SUCCESS,
      ipAddress: clientIp,
      userAgent,
      details: {
        query: dto.q,
        specialty: dto.specialty,
        city: dto.city,
        resultsCount: total,
      },
    });

    return {
      doctors: paginatedItems,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  /**
   * Public Doctor Profile (Sanitized)
   */
  async getDoctorPublicProfile(
    doctorId: string,
    currentUser?: AuthenticatedUser,
    clientIp?: string,
    userAgent?: string,
  ) {
    const doctor = await this.prisma.user.findFirst({
      where: {
        id: doctorId,
        role: Role.DOCTOR,
        status: UserStatus.ACTIVE,
        doctorProfile: {
          verificationStatus: DoctorVerificationStatus.VERIFIED,
        },
      },
      include: {
        doctorProfile: true,
        doctorPracticeLocations: {
          where: { active: true },
          orderBy: { isPrimary: 'desc' },
        },
      },
    });

    if (!doctor || !doctor.doctorProfile) {
      throw new NotFoundException(`Verified doctor with ID "${doctorId}" not found`);
    }

    const profile = doctor.doctorProfile;
    const isPatient = currentUser?.role === Role.PATIENT;

    let relationshipStatus: RelationshipStatus | null = null;
    let relationshipId: string | null = null;
    let consultationCount = 0;
    let lastConsultationAt: Date | null = null;

    if (isPatient && currentUser) {
      const [relationship, consults] = await Promise.all([
        this.prisma.patientDoctorRelationship.findUnique({
          where: {
            patientId_doctorId: {
              patientId: currentUser.id,
              doctorId: doctor.id,
            },
          },
        }),
        this.prisma.consultation.findMany({
          where: {
            patientId: currentUser.id,
            doctorId: doctor.id,
          },
          orderBy: { consultationDate: 'desc' },
          select: { consultationDate: true },
        }),
      ]);

      if (relationship) {
        relationshipStatus = relationship.status;
        relationshipId = relationship.id;
      }

      consultationCount = consults.length;
      if (consults.length > 0) {
        lastConsultationAt = consults[0].consultationDate;
      }

      // Record profile view in search history
      this.prisma.doctorSearchHistory
        .create({
          data: {
            patientId: currentUser.id,
            doctorId: doctor.id,
            searchQuery: `Profile view: ${profile.fullName}`,
          },
        })
        .catch((err) => {
          this.logger.warn(`Failed to record profile view in search history: ${err.message}`);
        });

      // Audit log
      await this.auditService.log({
        actorId: currentUser.id,
        actorEmail: currentUser.email,
        actorRole: currentUser.role,
        action: AuditAction.DOCTOR_PROFILE_VIEW,
        resourceType: 'DOCTOR_PROFILE',
        resourceId: doctor.id,
        result: AuditResult.SUCCESS,
        ipAddress: clientIp,
        userAgent,
        details: { doctorName: profile.fullName },
      });
    }

    // Sanitized practice locations
    const practiceLocations = doctor.doctorPracticeLocations.map((loc) => ({
      id: loc.id,
      practiceName: loc.practiceName,
      addressLine1: loc.addressLine1,
      addressLine2: loc.addressLine2,
      area: loc.area,
      city: loc.city,
      state: loc.state,
      pincode: loc.pincode,
      latitude: loc.latitude,
      longitude: loc.longitude,
      phone: loc.phone,
      isPrimary: loc.isPrimary,
    }));

    return {
      id: doctor.id,
      fullName: profile.fullName,
      profilePhoto: profile.profilePhoto,
      gender: profile.gender,
      specialization: profile.specialization,
      subSpecialty: profile.subSpecialty,
      qualifications: profile.qualifications,
      education: profile.education,
      languages: profile.languages,
      yearsOfExperience: profile.yearsOfExperience,
      clinicName: profile.clinicName,
      clinicAddress: profile.clinicAddress,
      city: profile.city,
      consultationMode: profile.consultationMode,
      consultationFee: profile.consultationFee,
      workingHours: profile.workingHours,
      hospitalAffiliation: profile.hospitalAffiliation,
      bio: profile.bio,
      practiceLocations,
      relationship: {
        status: relationshipStatus,
        relationshipId,
        consultationCount,
        lastConsultationAt,
      },
    };
  }

  // -------------------------------------------------------------
  // Doctor Practice Locations Management
  // -------------------------------------------------------------

  /**
   * Add a practice location for the authenticated doctor
   */
  async createPracticeLocation(
    doctorId: string,
    dto: CreateDoctorPracticeLocationDto,
  ) {
    if (dto.isPrimary) {
      // Unset previous primary location
      await this.prisma.doctorPracticeLocation.updateMany({
        where: { doctorId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.doctorPracticeLocation.create({
      data: {
        doctorId,
        practiceName: dto.practiceName,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        area: dto.area,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        latitude: dto.latitude,
        longitude: dto.longitude,
        phone: dto.phone,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  /**
   * List practice locations for the authenticated doctor
   */
  async getDoctorPracticeLocations(doctorId: string) {
    return this.prisma.doctorPracticeLocation.findMany({
      where: { doctorId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Update practice location
   */
  async updatePracticeLocation(
    doctorId: string,
    locationId: string,
    dto: UpdateDoctorPracticeLocationDto,
  ) {
    const existing = await this.prisma.doctorPracticeLocation.findFirst({
      where: { id: locationId, doctorId },
    });

    if (!existing) {
      throw new NotFoundException(`Practice location with ID "${locationId}" not found`);
    }

    if (dto.isPrimary) {
      await this.prisma.doctorPracticeLocation.updateMany({
        where: { doctorId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.doctorPracticeLocation.update({
      where: { id: locationId },
      data: {
        practiceName: dto.practiceName,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        area: dto.area,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        latitude: dto.latitude,
        longitude: dto.longitude,
        phone: dto.phone,
        isPrimary: dto.isPrimary,
        active: dto.active,
      },
    });
  }

  /**
   * Delete or deactivate practice location
   */
  async deletePracticeLocation(doctorId: string, locationId: string) {
    const existing = await this.prisma.doctorPracticeLocation.findFirst({
      where: { id: locationId, doctorId },
    });

    if (!existing) {
      throw new NotFoundException(`Practice location with ID "${locationId}" not found`);
    }

    await this.prisma.doctorPracticeLocation.delete({
      where: { id: locationId },
    });

    return { message: 'Practice location removed successfully' };
  }
}
