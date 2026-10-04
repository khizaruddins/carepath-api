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
  LabVerificationStatus,
  LabTestCategory,
  LabCollectionMode,
  AuditAction,
  AuditResult,
} from '@prisma/client';
import {
  DiscoverLabsDto,
  LabDiscoverySort,
} from './dto/discover-labs.dto';
import { CreateCanonicalTestDto } from './dto/create-canonical-test.dto';
import { CreateLabLocationDto } from './dto/create-lab-location.dto';

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

export function parseTurnaroundHours(tat?: string | null): number {
  if (!tat) return 48; // default fallback 48h
  const lower = tat.toLowerCase();
  const numMatch = lower.match(/\d+(\.\d+)?/);
  if (!numMatch) return 48;
  const val = parseFloat(numMatch[0]);
  if (lower.includes('day')) return val * 24;
  if (lower.includes('hour') || lower.includes('hr')) return val;
  if (lower.includes('week')) return val * 24 * 7;
  return val;
}

@Injectable()
export class LabMarketplaceService {
  private readonly logger = new Logger(LabMarketplaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // -------------------------------------------------------------
  // 1. Canonical Diagnostic Tests Normalization
  // -------------------------------------------------------------

  /**
   * Seed standard canonical tests if they don't already exist
   */
  async ensureSeedCanonicalTests() {
    const defaults = [
      {
        code: 'CBC',
        name: 'Complete Blood Count',
        category: LabTestCategory.HEMATOLOGY,
        description: 'Measures RBCs, WBCs, hemoglobin, hematocrit, and platelets to detect anemia, infection, and other disorders.',
        sampleTypes: ['EDTA Whole Blood'],
        defaultTurnaroundTime: '12-24 hours',
        synonyms: ['CBC', 'Hemogram', 'Complete Hemogram', 'Full Blood Count', 'FBC'],
      },
      {
        code: 'LIPID',
        name: 'Lipid Profile',
        category: LabTestCategory.BIOCHEMISTRY,
        description: 'Measures total cholesterol, HDL, LDL, VLDL, and triglycerides to assess cardiovascular risk.',
        sampleTypes: ['Serum'],
        defaultTurnaroundTime: '12-24 hours',
        synonyms: ['Lipid Panel', 'Cholesterol Test', 'Lipid Screen'],
      },
      {
        code: 'LFT',
        name: 'Liver Function Test',
        category: LabTestCategory.BIOCHEMISTRY,
        description: 'Assesses hepatic health via bilirubin, SGOT/AST, SGPT/ALT, alkaline phosphatase, and protein levels.',
        sampleTypes: ['Serum'],
        defaultTurnaroundTime: '24 hours',
        synonyms: ['LFT', 'Hepatic Function Panel', 'Liver Panel'],
      },
      {
        code: 'KFT',
        name: 'Kidney Function Test',
        category: LabTestCategory.BIOCHEMISTRY,
        description: 'Evaluates renal clearance via creatinine, BUN, urea, and electrolyte levels.',
        sampleTypes: ['Serum'],
        defaultTurnaroundTime: '24 hours',
        synonyms: ['KFT', 'RFT', 'Renal Function Test', 'Renal Panel'],
      },
      {
        code: 'HBA1C',
        name: 'Glycated Hemoglobin (HbA1c)',
        category: LabTestCategory.ENDOCRINOLOGY,
        description: 'Monitors 3-month average blood glucose control in diabetic management.',
        sampleTypes: ['EDTA Whole Blood'],
        defaultTurnaroundTime: '12-24 hours',
        synonyms: ['HbA1c', 'Glycohemoglobin', 'A1C'],
      },
      {
        code: 'TSH',
        name: 'Thyroid Stimulating Hormone (TSH)',
        category: LabTestCategory.ENDOCRINOLOGY,
        description: 'Assesses pituitary-thyroid axis for hyper- or hypothyroidism.',
        sampleTypes: ['Serum'],
        defaultTurnaroundTime: '24 hours',
        synonyms: ['TSH', 'Thyroid Screen', 'Thyrotropin'],
      },
      {
        code: 'VIT_D',
        name: 'Vitamin D 25-Hydroxy',
        category: LabTestCategory.BIOCHEMISTRY,
        description: 'Assesses vitamin D status for bone mineral metabolism and immune support.',
        sampleTypes: ['Serum'],
        defaultTurnaroundTime: '24-48 hours',
        synonyms: ['Vitamin D', '25-OH Vitamin D', 'Calcidiol'],
      },
      {
        code: 'URINE_R_M',
        name: 'Urine Routine & Microscopy',
        category: LabTestCategory.URINALYSIS,
        description: 'Physical, chemical, and microscopic examination of urine for renal or urinary tract disorders.',
        sampleTypes: ['Random Urine'],
        defaultTurnaroundTime: '12 hours',
        synonyms: ['Urine Routine', 'Urinalysis', 'Urine R/M'],
      },
    ];

    for (const test of defaults) {
      await this.prisma.canonicalTest.upsert({
        where: { code: test.code },
        update: {},
        create: test,
      });
    }
  }

  /**
   * List or search canonical tests
   */
  async listCanonicalTests(category?: LabTestCategory, search?: string) {
    await this.ensureSeedCanonicalTests();

    const where: any = { isActive: true };
    if (category) {
      where.category = category;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { synonyms: { has: search } },
      ];
    }

    return this.prisma.canonicalTest.findMany({
      where,
      include: {
        _count: { select: { labTests: true } },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Get single canonical test with all participating labs
   */
  async getCanonicalTest(id: string) {
    const canonical = await this.prisma.canonicalTest.findUnique({
      where: { id },
      include: {
        labTests: {
          where: {
            isActive: true,
            lab: {
              verificationStatus: LabVerificationStatus.VERIFIED,
              isActive: true,
            },
          },
          include: {
            lab: {
              include: {
                locations: { where: { isActive: true } },
              },
            },
          },
        },
      },
    });

    if (!canonical) {
      throw new NotFoundException(`Canonical test with ID "${id}" not found`);
    }

    return canonical;
  }

  /**
   * Create a new canonical test (Admin only)
   */
  async createCanonicalTest(admin: AuthenticatedUser, dto: CreateCanonicalTestDto) {
    if (admin.role !== Role.ADMIN) {
      throw new ForbiddenException('Only platform administrators can define canonical test specifications');
    }

    const existing = await this.prisma.canonicalTest.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(`Canonical test with code "${dto.code}" already exists`);
    }

    return this.prisma.canonicalTest.create({
      data: {
        code: dto.code.toUpperCase(),
        name: dto.name,
        category: dto.category,
        description: dto.description,
        sampleTypes: dto.sampleTypes || [],
        defaultTurnaroundTime: dto.defaultTurnaroundTime,
        synonyms: dto.synonyms || [],
      },
    });
  }

  // -------------------------------------------------------------
  // 2. Multi-Branch Laboratory Locations
  // -------------------------------------------------------------

  /**
   * Add a branch or service location for a laboratory
   */
  async createLabLocation(
    user: AuthenticatedUser,
    labId: string,
    dto: CreateLabLocationDto,
  ) {
    // Verify membership or admin
    if (user.role !== Role.ADMIN) {
      const membership = await this.prisma.labMembership.findFirst({
        where: { userId: user.id, labId, status: 'ACTIVE' },
      });
      if (!membership || membership.role !== 'LAB_ADMIN') {
        throw new ForbiddenException('Only laboratory administrators can manage lab locations');
      }
    }

    const lab = await this.prisma.labOrganization.findUnique({
      where: { id: labId },
    });
    if (!lab) {
      throw new NotFoundException(`Laboratory with ID "${labId}" not found`);
    }

    return this.prisma.labLocation.create({
      data: {
        labId,
        name: dto.name,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        area: dto.area,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        latitude: dto.latitude,
        longitude: dto.longitude,
        phone: dto.phone || lab.contactPhone,
        operatingHours: dto.operatingHours || lab.operatingHours,
        homeCollectionAvailable: dto.homeCollectionAvailable ?? false,
        homeCollectionFee: dto.homeCollectionFee,
      },
    });
  }

  /**
   * List locations for a laboratory
   */
  async listLabLocations(labId: string) {
    return this.prisma.labLocation.findMany({
      where: { labId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  // -------------------------------------------------------------
  // 3. Lab Discovery, Search, and Price Comparison
  // -------------------------------------------------------------

  /**
   * Comprehensive laboratory discovery with geospatial distance,
   * price breakdown, turnaround times, and multi-factor ranking
   */
  async discoverLabs(
    dto: DiscoverLabsDto,
    user?: AuthenticatedUser,
    ip?: string,
    userAgent?: string,
  ) {
    await this.ensureSeedCanonicalTests();

    // 1. Build base filters for verified, active labs
    const labWhere: any = {
      verificationStatus: LabVerificationStatus.VERIFIED,
      isActive: true,
    };

    if (dto.city) {
      labWhere.OR = [
        { city: { contains: dto.city, mode: 'insensitive' } },
        { locations: { some: { city: { contains: dto.city, mode: 'insensitive' }, isActive: true } } },
      ];
    }

    if (dto.pincode) {
      labWhere.OR = [
        { pincode: dto.pincode },
        { locations: { some: { pincode: dto.pincode, isActive: true } } },
      ];
    }

    if (dto.q) {
      labWhere.OR = [
        { name: { contains: dto.q, mode: 'insensitive' } },
        { address: { contains: dto.q, mode: 'insensitive' } },
        { city: { contains: dto.q, mode: 'insensitive' } },
        {
          catalogTests: {
            some: {
              isActive: true,
              OR: [
                { name: { contains: dto.q, mode: 'insensitive' } },
                { testCode: { contains: dto.q, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    // 2. Determine target canonical test or investigation
    let matchedCanonicalTestId = dto.canonicalTestId;
    let targetInvestigation: any = null;

    if (dto.investigationRequestId) {
      targetInvestigation = await this.prisma.investigationRequest.findUnique({
        where: { id: dto.investigationRequestId },
        include: { doctor: { select: { doctorProfile: true, email: true } } },
      });

      if (!targetInvestigation) {
        throw new NotFoundException(`Investigation request with ID "${dto.investigationRequestId}" not found`);
      }

      // Try matching investigationName to a CanonicalTest
      if (!matchedCanonicalTestId) {
        const canonical = await this.prisma.canonicalTest.findFirst({
          where: {
            isActive: true,
            OR: [
              { name: { contains: targetInvestigation.investigationName, mode: 'insensitive' } },
              { code: { contains: targetInvestigation.investigationName, mode: 'insensitive' } },
              { synonyms: { has: targetInvestigation.investigationName } },
            ],
          },
        });
        if (canonical) {
          matchedCanonicalTestId = canonical.id;
        }
      }
    }

    // 3. Fetch matching labs with locations and tests
    const labs = await this.prisma.labOrganization.findMany({
      where: labWhere,
      include: {
        locations: { where: { isActive: true } },
        catalogTests: {
          where: {
            isActive: true,
            ...(matchedCanonicalTestId ? { canonicalTestId: matchedCanonicalTestId } : {}),
            ...(dto.category ? { category: dto.category } : {}),
            ...(dto.collectionMode === LabCollectionMode.HOME ? { isHomeCollection: true } : {}),
            ...(dto.q && !matchedCanonicalTestId
              ? {
                  OR: [
                    { name: { contains: dto.q, mode: 'insensitive' } },
                    { testCode: { contains: dto.q, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          include: { canonicalTest: true },
        },
      },
    });

    // 4. Transform and enrich each lab entry
    const results: any[] = [];

    for (const lab of labs) {
      // If a specific test/canonical is requested, require at least 1 matching test
      if ((matchedCanonicalTestId || dto.investigationRequestId) && lab.catalogTests.length === 0) {
        // Fallback: check if lab has any test loosely matching investigationName
        if (targetInvestigation) {
          const looseMatch = await this.prisma.labTest.findFirst({
            where: {
              labId: lab.id,
              isActive: true,
              name: { contains: targetInvestigation.investigationName, mode: 'insensitive' },
            },
          });
          if (!looseMatch) continue;
        } else {
          continue;
        }
      }

      // Calculate distance if coordinates provided
      let minDistanceKm: number | null = null;
      let closestLocation: any = null;

      if (dto.latitude !== undefined && dto.longitude !== undefined) {
        // Check main lab location
        if (lab.latitude && lab.longitude) {
          minDistanceKm = calculateDistanceKm(dto.latitude, dto.longitude, lab.latitude, lab.longitude);
        }

        // Check branch locations
        for (const loc of lab.locations) {
          if (loc.latitude && loc.longitude) {
            const dist = calculateDistanceKm(dto.latitude, dto.longitude, loc.latitude, loc.longitude);
            if (minDistanceKm === null || dist < minDistanceKm) {
              minDistanceKm = dist;
              closestLocation = loc;
            }
          }
        }

        // If radius is strict, filter out labs beyond radiusKm
        if (dto.radiusKm && minDistanceKm !== null && minDistanceKm > dto.radiusKm) {
          continue;
        }
      }

      // Compute pricing for matching test(s)
      const matchingTest = lab.catalogTests[0] || null;
      let basePrice: number | null = null;
      let homeCollectionFee = 0;
      let totalPrice: number | null = null;
      let turnaroundHours = 48;

      if (matchingTest) {
        basePrice = Number(matchingTest.price);
        turnaroundHours = parseTurnaroundHours(matchingTest.turnaroundTime);

        // Home collection fee determination
        if (dto.collectionMode === LabCollectionMode.HOME || matchingTest.isHomeCollection) {
          if (closestLocation?.homeCollectionFee) {
            homeCollectionFee = Number(closestLocation.homeCollectionFee);
          } else if (matchingTest.isHomeCollection) {
            homeCollectionFee = 0; // included in test or free
          }
        }
        totalPrice = basePrice + homeCollectionFee;
      }

      const hasHomeCollection =
        lab.catalogTests.some((t) => t.isHomeCollection) ||
        lab.locations.some((l) => l.homeCollectionAvailable);

      // Score for BEST_MATCH ranking
      let matchScore = 100;
      if (minDistanceKm !== null) {
        matchScore -= Math.min(minDistanceKm * 2, 50); // closer is higher
      }
      if (totalPrice !== null) {
        matchScore -= Math.min(totalPrice * 0.01, 30); // cheaper is higher
      }
      if (turnaroundHours <= 24) matchScore += 15;
      if (dto.collectionMode === LabCollectionMode.HOME && hasHomeCollection) matchScore += 10;

      results.push({
        lab: {
          id: lab.id,
          name: lab.name,
          legalName: lab.legalName,
          licenseNumber: lab.licenseNumber,
          accreditationDetails: lab.accreditationDetails,
          contactEmail: lab.contactEmail,
          contactPhone: lab.contactPhone,
          address: lab.address,
          city: lab.city,
          state: lab.state,
          pincode: lab.pincode,
          operatingHours: lab.operatingHours,
          supportedSampleTypes: lab.supportedSampleTypes,
          hasHomeCollection,
        },
        closestLocation: closestLocation
          ? {
              id: closestLocation.id,
              name: closestLocation.name,
              addressLine1: closestLocation.addressLine1,
              city: closestLocation.city,
              pincode: closestLocation.pincode,
              phone: closestLocation.phone,
              homeCollectionAvailable: closestLocation.homeCollectionAvailable,
              homeCollectionFee: closestLocation.homeCollectionFee
                ? Number(closestLocation.homeCollectionFee)
                : 0,
            }
          : null,
        distanceKm: minDistanceKm,
        matchingTest: matchingTest
          ? {
              id: matchingTest.id,
              testCode: matchingTest.testCode,
              name: matchingTest.name,
              category: matchingTest.category,
              turnaroundTime: matchingTest.turnaroundTime,
              turnaroundHours,
              preparationNotes: matchingTest.preparationNotes,
              isHomeCollection: matchingTest.isHomeCollection,
              canonicalTest: matchingTest.canonicalTest
                ? {
                    id: matchingTest.canonicalTest.id,
                    code: matchingTest.canonicalTest.code,
                    name: matchingTest.canonicalTest.name,
                  }
                : null,
            }
          : null,
        pricing: {
          basePrice,
          homeCollectionFee,
          discount: 0,
          totalPrice,
          currency: 'INR',
        },
        matchScore: Math.round(matchScore),
      });
    }

    // 5. Apply Sorting
    const sort = dto.sort || LabDiscoverySort.BEST_MATCH;
    results.sort((a, b) => {
      if (sort === LabDiscoverySort.NEARBY) {
        if (a.distanceKm === null && b.distanceKm === null) return 0;
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      }
      if (sort === LabDiscoverySort.CHEAPEST) {
        if (a.pricing.totalPrice === null && b.pricing.totalPrice === null) return 0;
        if (a.pricing.totalPrice === null) return 1;
        if (b.pricing.totalPrice === null) return -1;
        return a.pricing.totalPrice - b.pricing.totalPrice;
      }
      if (sort === LabDiscoverySort.FASTEST) {
        const aTat = a.matchingTest?.turnaroundHours ?? 999;
        const bTat = b.matchingTest?.turnaroundHours ?? 999;
        return aTat - bTat;
      }
      // Default: BEST_MATCH
      return b.matchScore - a.matchScore;
    });

    // 6. Pagination
    const page = dto.page || 1;
    const limit = dto.limit || 20;
    const startIndex = (page - 1) * limit;
    const paginatedItems = results.slice(startIndex, startIndex + limit);

    // 7. Audit log discovery query
    if (user) {
      await this.auditService.log({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: AuditAction.LAB_DISCOVERY,
        resourceType: 'LAB_ORGANIZATION',
        result: AuditResult.SUCCESS,
        ipAddress: ip,
        userAgent,
        details: {
          query: dto.q,
          city: dto.city,
          sort,
          totalMatches: results.length,
          investigationRequestId: dto.investigationRequestId,
          canonicalTestId: matchedCanonicalTestId,
        },
      });
    }

    return {
      items: paginatedItems,
      meta: {
        total: results.length,
        page,
        limit,
        totalPages: Math.ceil(results.length / limit),
      },
      investigationContext: targetInvestigation
        ? {
            id: targetInvestigation.id,
            investigationName: targetInvestigation.investigationName,
            category: targetInvestigation.category,
            priority: targetInvestigation.priority,
            doctorName:
              targetInvestigation.doctor?.doctorProfile?.fullName ||
              targetInvestigation.doctor?.email ||
              'Prescribing Doctor',
          }
        : null,
    };
  }

  /**
   * Dedicated side-by-side comparison of labs for a specific doctor investigation request
   */
  async compareLabsForInvestigation(
    patientId: string,
    investigationRequestId: string,
    options?: {
      latitude?: number;
      longitude?: number;
      collectionMode?: LabCollectionMode;
      sort?: LabDiscoverySort;
    },
    ip?: string,
    userAgent?: string,
  ) {
    const investigation = await this.prisma.investigationRequest.findUnique({
      where: { id: investigationRequestId },
      include: {
        doctor: { select: { doctorProfile: true, email: true } },
      },
    });

    if (!investigation) {
      throw new NotFoundException(`Investigation request "${investigationRequestId}" not found`);
    }

    if (investigation.patientId !== patientId) {
      throw new ForbiddenException('Access denied: You can only compare laboratories for your own investigation requests');
    }

    const discovery = await this.discoverLabs(
      {
        investigationRequestId,
        latitude: options?.latitude,
        longitude: options?.longitude,
        collectionMode: options?.collectionMode,
        sort: options?.sort || LabDiscoverySort.BEST_MATCH,
        limit: 50,
      },
      { id: patientId, email: '', role: Role.PATIENT } as any,
      ip,
      userAgent,
    );

    // Audit price comparison viewing
    await this.auditService.log({
      actorId: patientId,
      actorRole: Role.PATIENT,
      action: AuditAction.LAB_PRICE_VIEW,
      resourceType: 'INVESTIGATION_REQUEST',
      resourceId: investigationRequestId,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        investigationName: investigation.investigationName,
        labsCount: discovery.items.length,
      },
    });

    return {
      investigation: {
        id: investigation.id,
        investigationName: investigation.investigationName,
        category: investigation.category,
        reason: investigation.reason,
        priority: investigation.priority,
        notes: investigation.notes,
        requestedDate: investigation.requestedDate,
        doctor: {
          fullName: investigation.doctor?.doctorProfile?.fullName,
          clinicName: investigation.doctor?.doctorProfile?.clinicName,
        },
      },
      comparison: discovery.items,
    };
  }

  /**
   * List all investigation requests for a patient
   */
  async getPatientInvestigations(patientId: string) {
    return this.prisma.investigationRequest.findMany({
      where: { patientId },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: { select: { fullName: true, clinicName: true, specialization: true } },
          },
        },
        labOrders: {
          include: {
            lab: { select: { id: true, name: true, city: true, address: true, contactPhone: true } },
            reports: { select: { id: true, reportNumber: true, status: true, finalizedAt: true } },
            careConnection: { select: { id: true, status: true, expiresAt: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { requestedDate: 'desc' },
    });
  }

  /**
   * Get single investigation request with full clinical and lab order context
   */
  async getInvestigationById(userId: string, id: string) {
    const inv = await this.prisma.investigationRequest.findUnique({
      where: { id },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: { select: { fullName: true, clinicName: true, specialization: true } },
          },
        },
        labOrders: {
          include: {
            lab: { select: { id: true, name: true, city: true, address: true, contactPhone: true } },
            reports: { select: { id: true, reportNumber: true, status: true, finalizedAt: true } },
            careConnection: { select: { id: true, status: true, expiresAt: true } },
            items: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!inv) {
      throw new NotFoundException(`Investigation request "${id}" not found`);
    }

    if (inv.patientId !== userId && inv.doctorId !== userId) {
      throw new ForbiddenException('Access denied: You cannot view this investigation request');
    }

    return inv;
  }
}

