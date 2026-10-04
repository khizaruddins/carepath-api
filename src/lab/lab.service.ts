import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HealthcareTimelineService } from '../timeline/healthcare-timeline.service';
import { ConsentAuthorizationService } from '../common/services/consent-authorization.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
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
  AuditResult,
  NotificationType,
  ConsentResourceType,
} from '@prisma/client';
import { RegisterLabDto } from './dto/register-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';
import { ReviewLabVerificationDto } from './dto/review-lab-verification.dto';
import { CreateLabTestDto } from './dto/create-lab-test.dto';
import { UpdateLabTestDto } from './dto/update-lab-test.dto';
import { CreateLabOrderDto } from './dto/create-lab-order.dto';
import { UpdateLabOrderStatusDto } from './dto/update-lab-order-status.dto';
import { CreateLabSampleDto } from './dto/create-lab-sample.dto';
import { UpdateLabSampleDto } from './dto/update-lab-sample.dto';
import { CreateLabReportDto } from './dto/create-lab-report.dto';
import { FinalizeLabReportDto } from './dto/finalize-lab-report.dto';
import { AmendLabReportDto } from './dto/amend-lab-report.dto';

@Injectable()
export class LabService {
  private readonly logger = new Logger(LabService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly timelineService: HealthcareTimelineService,
    private readonly consentAuthService: ConsentAuthorizationService,
  ) {}

  // -------------------------------------------------------------
  // 1. Lab Organization & Membership Management
  // -------------------------------------------------------------

  /**
   * Register a new laboratory facility and assign the registering user as LAB_ADMIN
   */
  async registerLab(
    user: AuthenticatedUser,
    dto: RegisterLabDto,
    ip?: string,
    userAgent?: string,
  ) {
    const existingLab = await this.prisma.labOrganization.findUnique({
      where: { licenseNumber: dto.licenseNumber },
    });

    if (existingLab) {
      throw new ConflictException(
        `A laboratory with license number "${dto.licenseNumber}" is already registered`,
      );
    }

    const lab = await this.prisma.labOrganization.create({
      data: {
        name: dto.name,
        legalName: dto.legalName,
        licenseNumber: dto.licenseNumber,
        accreditationDetails: dto.accreditationDetails,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        operatingHours: dto.operatingHours,
        supportedSampleTypes: dto.supportedSampleTypes || [],
        verificationStatus: LabVerificationStatus.PENDING,
        memberships: {
          create: {
            userId: user.id,
            role: LabMemberRole.LAB_ADMIN,
            status: LabMemberStatus.ACTIVE,
          },
        },
      },
      include: {
        memberships: true,
      },
    });

    // Elevate user role to LAB if not ADMIN
    if (user.role !== Role.ADMIN) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { role: Role.LAB },
      });
    }

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.LAB_REGISTER,
      resourceType: 'LAB_ORGANIZATION',
      resourceId: lab.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        name: lab.name,
        licenseNumber: lab.licenseNumber,
      },
    });

    await this.notificationsService.sendNotification({
      userId: user.id,
      type: NotificationType.LAB_VERIFICATION_SUBMITTED,
      title: 'Laboratory Registered',
      message: `Your laboratory "${lab.name}" registration has been submitted and is pending administrative verification.`,
      metadata: { labId: lab.id },
    });

    return lab;
  }

  /**
   * Get the active laboratory organization for the current authenticated user
   */
  async getMyLab(userId: string) {
    const membership = await this.prisma.labMembership.findFirst({
      where: { userId, status: LabMemberStatus.ACTIVE },
      include: {
        lab: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('You are not associated with any active laboratory organization');
    }

    return {
      membershipId: membership.id,
      role: membership.role,
      status: membership.status,
      lab: membership.lab,
    };
  }

  /**
   * Get lab organization public/detail profile
   */
  async getLabProfile(labId: string) {
    const lab = await this.prisma.labOrganization.findUnique({
      where: { id: labId },
      include: {
        _count: {
          select: { catalogTests: true, orders: true },
        },
      },
    });

    if (!lab) {
      throw new NotFoundException(`Laboratory with ID "${labId}" not found`);
    }

    return lab;
  }

  /**
   * Update lab profile (LAB_ADMIN only)
   */
  async updateLabProfile(
    user: AuthenticatedUser,
    labId: string,
    dto: UpdateLabDto,
    ip?: string,
    userAgent?: string,
  ) {
    await this.assertLabAdmin(user.id, labId);

    const updated = await this.prisma.labOrganization.update({
      where: { id: labId },
      data: {
        name: dto.name,
        legalName: dto.legalName,
        accreditationDetails: dto.accreditationDetails,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        operatingHours: dto.operatingHours,
        supportedSampleTypes: dto.supportedSampleTypes,
      },
    });

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.PROFILE_UPDATE,
      resourceType: 'LAB_ORGANIZATION',
      resourceId: labId,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: { updatedFields: Object.keys(dto) },
    });

    return updated;
  }

  /**
   * Admin review of laboratory verification
   */
  async reviewLabVerification(
    admin: AuthenticatedUser,
    labId: string,
    dto: ReviewLabVerificationDto,
    ip?: string,
    userAgent?: string,
  ) {
    if (admin.role !== Role.ADMIN) {
      throw new ForbiddenException('Only platform administrators can review lab verifications');
    }

    const lab = await this.prisma.labOrganization.findUnique({
      where: { id: labId },
      include: { memberships: true },
    });

    if (!lab) {
      throw new NotFoundException(`Laboratory with ID "${labId}" not found`);
    }

    const updated = await this.prisma.labOrganization.update({
      where: { id: labId },
      data: {
        verificationStatus: dto.status,
        verificationNotes: dto.notes,
        verifiedAt: dto.status === LabVerificationStatus.VERIFIED ? new Date() : null,
        verifiedBy: admin.id,
        isActive: dto.status === LabVerificationStatus.VERIFIED,
      },
    });

    await this.auditService.log({
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      action: AuditAction.LAB_VERIFICATION_REVIEW,
      resourceType: 'LAB_ORGANIZATION',
      resourceId: labId,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        previousStatus: lab.verificationStatus,
        newStatus: dto.status,
        notes: dto.notes,
      },
    });

    // Notify lab admins
    const notifType =
      dto.status === LabVerificationStatus.VERIFIED
        ? NotificationType.LAB_VERIFIED
        : NotificationType.LAB_REJECTED;

    for (const member of lab.memberships) {
      await this.notificationsService.sendNotification({
        userId: member.userId,
        type: notifType,
        title: `Laboratory Verification ${dto.status}`,
        message: `Verification review for "${lab.name}" resulted in status: ${dto.status}. ${dto.notes || ''}`.trim(),
        metadata: { labId, status: dto.status },
      });
    }

    return updated;
  }

  /**
   * List lab verifications for administrative review
   */
  async listVerifications(status?: LabVerificationStatus) {
    const where: any = {};
    if (status) {
      where.verificationStatus = status;
    }

    return this.prisma.labOrganization.findMany({
      where,
      include: {
        _count: { select: { memberships: true, catalogTests: true, orders: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Public / Patient / Doctor discovery of verified active diagnostic laboratories
   */
  async listVerifiedLabs(query?: { city?: string; search?: string }) {
    const where: any = {
      verificationStatus: LabVerificationStatus.VERIFIED,
      isActive: true,
    };

    if (query?.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }

    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { licenseNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.labOrganization.findMany({
      where,
      select: {
        id: true,
        name: true,
        licenseNumber: true,
        contactEmail: true,
        contactPhone: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        operatingHours: true,
        supportedSampleTypes: true,
        _count: { select: { catalogTests: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Add a staff member to the laboratory
   */
  async addLabMember(
    adminUser: AuthenticatedUser,
    labId: string,
    targetUserId: string,
    role: LabMemberRole = LabMemberRole.LAB_TECHNICIAN,
  ) {
    await this.assertLabAdmin(adminUser.id, labId);

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID "${targetUserId}" not found`);
    }

    const existing = await this.prisma.labMembership.findUnique({
      where: {
        labId_userId: { labId, userId: targetUserId },
      },
    });

    if (existing) {
      if (existing.status === LabMemberStatus.ACTIVE) {
        throw new ConflictException('User is already an active member of this laboratory');
      }
      return this.prisma.labMembership.update({
        where: { id: existing.id },
        data: { status: LabMemberStatus.ACTIVE, role },
      });
    }

    const membership = await this.prisma.labMembership.create({
      data: {
        labId,
        userId: targetUserId,
        role,
        status: LabMemberStatus.ACTIVE,
      },
    });

    // Ensure user has LAB role
    if (targetUser.role !== Role.ADMIN) {
      await this.prisma.user.update({
        where: { id: targetUserId },
        data: { role: Role.LAB },
      });
    }

    return membership;
  }

  /**
   * List laboratory staff members
   */
  async listLabMembers(user: AuthenticatedUser, labId: string) {
    await this.assertLabMembership(user.id, labId);

    return this.prisma.labMembership.findMany({
      where: { labId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            phoneNumber: true,
          },
        },
      },
    });
  }

  // -------------------------------------------------------------
  // 2. Lab Test Catalog Management
  // -------------------------------------------------------------

  /**
   * Add a diagnostic test to the laboratory catalog
   */
  async createCatalogTest(
    user: AuthenticatedUser,
    labId: string,
    dto: CreateLabTestDto,
    ip?: string,
    userAgent?: string,
  ) {
    await this.assertVerifiedLabMember(user.id, labId);

    const existing = await this.prisma.labTest.findUnique({
      where: {
        labId_testCode: { labId, testCode: dto.testCode },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Test with code "${dto.testCode}" already exists in this laboratory catalog`,
      );
    }

    const test = await this.prisma.labTest.create({
      data: {
        labId,
        testCode: dto.testCode,
        name: dto.name,
        category: dto.category,
        description: dto.description,
        sampleTypes: dto.sampleTypes || [],
        turnaroundTime: dto.turnaroundTime,
        price: dto.price,
        preparationNotes: dto.preparationNotes,
        isHomeCollection: dto.isHomeCollection || false,
        isActive: true,
      },
    });

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.LAB_TEST_CREATE,
      resourceType: 'LAB_TEST',
      resourceId: test.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        labId,
        testCode: test.testCode,
        name: test.name,
        price: dto.price,
      },
    });

    return test;
  }

  /**
   * Update a diagnostic test in the catalog
   */
  async updateCatalogTest(
    user: AuthenticatedUser,
    labId: string,
    testId: string,
    dto: UpdateLabTestDto,
    ip?: string,
    userAgent?: string,
  ) {
    await this.assertVerifiedLabMember(user.id, labId);

    const test = await this.prisma.labTest.findUnique({
      where: { id: testId },
    });

    if (!test || test.labId !== labId) {
      throw new NotFoundException(`Test with ID "${testId}" not found in this laboratory`);
    }

    const updated = await this.prisma.labTest.update({
      where: { id: testId },
      data: {
        testCode: dto.testCode,
        name: dto.name,
        category: dto.category,
        description: dto.description,
        sampleTypes: dto.sampleTypes,
        turnaroundTime: dto.turnaroundTime,
        price: dto.price,
        preparationNotes: dto.preparationNotes,
        isHomeCollection: dto.isHomeCollection,
        isActive: dto.isActive,
      },
    });

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.LAB_TEST_UPDATE,
      resourceType: 'LAB_TEST',
      resourceId: testId,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: { labId, updatedFields: Object.keys(dto) },
    });

    return updated;
  }

  /**
   * List tests in a laboratory catalog (Public / Patient / Doctor / Lab)
   */
  async listLabTests(labId: string, category?: LabTestCategory, activeOnly = true) {
    const where: any = { labId };
    if (activeOnly) {
      where.isActive = true;
    }
    if (category) {
      where.category = category;
    }

    return this.prisma.labTest.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  // -------------------------------------------------------------
  // 3. Lab Orders Lifecycle & Operational Management
  // -------------------------------------------------------------

  /**
   * Create a new laboratory order
   */
  async createOrder(
    user: AuthenticatedUser,
    dto: CreateLabOrderDto,
    ip?: string,
    userAgent?: string,
  ) {
    // 1. Verify lab is active and verified
    const lab = await this.prisma.labOrganization.findUnique({
      where: { id: dto.labId },
    });

    if (!lab || !lab.isActive || lab.verificationStatus !== LabVerificationStatus.VERIFIED) {
      throw new BadRequestException('Target laboratory is not active or verified to process diagnostic orders');
    }

    // 2. Determine patient ID
    let patientId = dto.patientId;
    if (user.role === Role.PATIENT) {
      patientId = user.id; // Patient ordering for themselves
    } else if (!patientId) {
      throw new BadRequestException('patientId is required when ordering on behalf of a patient');
    }

    // Verify patient user exists
    const patientUser = await this.prisma.user.findUnique({
      where: { id: patientId },
      include: { patientProfile: true },
    });
    if (!patientUser) {
      throw new NotFoundException(`Patient with ID "${patientId}" not found`);
    }

    // 3. If doctor is creating the order, verify clinical authorization / relationship
    let prescribedDoctorId = dto.prescribedDoctorId;
    if (user.role === Role.DOCTOR) {
      prescribedDoctorId = user.id;
      // Doctor must have active relationship or consent
      await this.consentAuthService.authorize({
        actorId: user.id,
        actorRole: user.role,
        actorEmail: user.email,
        patientId,
        resourceType: ConsentResourceType.LAB_ORDER,
        action: 'CREATE',
        ipAddress: ip,
        userAgent,
      });
    }

    // 4. Resolve diagnostic tests and create immutable price snapshots
    const tests = await this.prisma.labTest.findMany({
      where: {
        labId: dto.labId,
        isActive: true,
        OR: [
          { id: { in: dto.tests } },
          { testCode: { in: dto.tests } },
        ],
      },
    });

    if (tests.length === 0) {
      throw new BadRequestException(
        'None of the specified diagnostic tests were found or active in this laboratory catalog',
      );
    }

    // 5. Generate human-readable order number (e.g. CP-LAB-2026-000123)
    const orderNumber = await this.generateOrderNumber();

    // 6. Create order with items in a transaction
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.labOrder.create({
        data: {
          orderNumber,
          patientId,
          prescribedDoctorId,
          investigationRequestId: dto.investigationRequestId,
          labId: dto.labId,
          status: LabOrderStatus.PENDING,
          collectionMode: dto.collectionMode || 'LAB',
          collectionAddress: dto.collectionAddress,
          scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
          instructions: dto.instructions,
          priority: dto.priority || 'ROUTINE',
          notes: dto.notes,
          items: {
            create: tests.map((t) => ({
              testId: t.id,
              testName: t.name,
              testCode: t.testCode,
              price: t.price,
              notes: t.preparationNotes,
            })),
          },
        },
        include: {
          items: true,
          lab: true,
        },
      });

      // If linked to an investigation request, update its status
      if (dto.investigationRequestId) {
        await tx.investigationRequest.update({
          where: { id: dto.investigationRequestId },
          data: { status: 'ORDERED' },
        });
      }

      return created;
    });

    // 7. Audit log
    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.LAB_ORDER_CREATE,
      resourceType: 'LAB_ORDER',
      resourceId: order.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        orderNumber: order.orderNumber,
        labId: dto.labId,
        patientId,
        testCount: tests.length,
      },
    });

    // 8. Notifications
    await this.notificationsService.sendNotification({
      userId: patientId,
      type: NotificationType.LAB_ORDER_CREATED,
      title: 'Lab Order Placed',
      message: `Diagnostic order ${order.orderNumber} for ${tests.map((t) => t.name).join(', ')} has been created with ${lab.name}.`,
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
    });

    // Notify lab admin members
    const labMembers = await this.prisma.labMembership.findMany({
      where: { labId: dto.labId, status: LabMemberStatus.ACTIVE },
    });
    for (const member of labMembers) {
      await this.notificationsService.sendNotification({
        userId: member.userId,
        type: NotificationType.LAB_ORDER_CREATED,
        title: 'New Diagnostic Order Received',
        message: `New order ${order.orderNumber} received for ${patientUser.patientProfile?.fullName || 'patient'}. Priority: ${order.priority}.`,
        metadata: { orderId: order.id, orderNumber: order.orderNumber },
      });
    }

    return order;
  }

  /**
   * Update lab order status (lab staff or patient cancellation)
   */
  async updateOrderStatus(
    user: AuthenticatedUser,
    orderId: string,
    dto: UpdateLabOrderStatusDto,
    ip?: string,
    userAgent?: string,
  ) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: orderId },
      include: { lab: true, items: true },
    });

    if (!order) {
      throw new NotFoundException(`Lab order with ID "${orderId}" not found`);
    }

    // Role checks
    if (user.role === Role.PATIENT) {
      if (order.patientId !== user.id) {
        throw new ForbiddenException('Access denied: You cannot modify another patient’s order');
      }
      if (dto.status !== LabOrderStatus.CANCELLED) {
        throw new ForbiddenException('Patients can only cancel pending laboratory orders');
      }
      if (order.status !== LabOrderStatus.PENDING && order.status !== LabOrderStatus.ACCEPTED) {
        throw new BadRequestException('Order cannot be cancelled after sample collection has begun');
      }
    } else if (user.role === Role.LAB) {
      await this.assertLabMembership(user.id, order.labId);
    } else if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Insufficient permissions to update lab order status');
    }

    const updated = await this.prisma.labOrder.update({
      where: { id: orderId },
      data: {
        status: dto.status,
        cancelledReason:
          dto.status === LabOrderStatus.CANCELLED || dto.status === LabOrderStatus.REJECTED
            ? dto.reason
            : undefined,
        notes: dto.notes ? `${order.notes ? order.notes + '\n' : ''}${dto.notes}` : undefined,
        completedAt: dto.status === LabOrderStatus.COMPLETED ? new Date() : undefined,
      },
    });

    // M5.1: Sync LabCareConnection status
    if (this.prisma.labCareConnection) {
      const conn = await this.prisma.labCareConnection.findUnique({
        where: { labOrderId: orderId },
      });
      if (conn) {
        if (dto.status === LabOrderStatus.CANCELLED) {
          await this.prisma.labCareConnection.update({
            where: { id: conn.id },
            data: { status: 'CANCELLED', revokedAt: new Date(), revocationReason: dto.reason || 'Order cancelled' },
          });
        } else if (dto.status === LabOrderStatus.REJECTED) {
          await this.prisma.labCareConnection.update({
            where: { id: conn.id },
            data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: dto.reason || 'Order rejected by laboratory' },
          });
        }
      }
    }


    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.LAB_ORDER_STATUS_UPDATE,
      resourceType: 'LAB_ORDER',
      resourceId: orderId,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        previousStatus: order.status,
        newStatus: dto.status,
        reason: dto.reason,
      },
    });

    // Notify patient
    const notifType =
      dto.status === LabOrderStatus.ACCEPTED
        ? NotificationType.LAB_ORDER_ACCEPTED
        : dto.status === LabOrderStatus.CANCELLED
        ? NotificationType.LAB_ORDER_CANCELLED
        : NotificationType.GENERAL;

    await this.notificationsService.sendNotification({
      userId: order.patientId,
      type: notifType,
      title: `Lab Order Status: ${dto.status}`,
      message: `Your diagnostic order ${order.orderNumber} status has updated to ${dto.status}.${dto.reason ? ` Reason: ${dto.reason}` : ''}`,
      metadata: { orderId, status: dto.status },
    });

    return updated;
  }

  /**
   * Get lab order details with privacy boundaries enforced
   */
  async getOrder(user: AuthenticatedUser, orderId: string, ip?: string, userAgent?: string) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: orderId },
      include: {
        lab: true,
        items: {
          include: { test: true },
        },
        samples: {
          include: {
            collectedBy: { select: { id: true, email: true } },
          },
        },
        reports: {
          include: {
            document: {
              include: { versions: { take: 1, orderBy: { versionNumber: 'desc' } } },
            },
            verifiedBy: { select: { id: true, email: true } },
          },
        },
        patient: {
          select: {
            id: true,
            email: true,
            patientProfile: {
              select: {
                fullName: true,
                gender: true,
                dateOfBirth: true,
                mobile: true,
                bloodGroup: true,
                // Notice: knownConditions, allergies, medications, etc. are NOT included for lab privacy!
              },
            },
          },
        },
        prescribedDoctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: { select: { fullName: true, specialization: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Lab order with ID "${orderId}" not found`);
    }

    // Privacy & Scoped Access check
    if (user.role === Role.PATIENT) {
      if (order.patientId !== user.id) {
        throw new ForbiddenException('Access denied: You cannot view orders belonging to another patient');
      }
    } else if (user.role === Role.DOCTOR) {
      // Doctor must be prescribed doctor or have active approved consent
      if (order.prescribedDoctorId !== user.id) {
        await this.consentAuthService.authorize({
          actorId: user.id,
          actorRole: user.role,
          actorEmail: user.email,
          patientId: order.patientId,
          resourceType: ConsentResourceType.LAB_ORDER,
          resourceId: order.id,
          action: 'VIEW',
          ipAddress: ip,
          userAgent,
        });
      }
    } else if (user.role === Role.LAB) {
      await this.assertLabMembership(user.id, order.labId);
    } else if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied: Insufficient privileges');
    }

    return order;
  }

  /**
   * List lab orders with role-based scoping
   */
  async listOrders(
    user: AuthenticatedUser,
    filters?: {
      status?: LabOrderStatus;
      labId?: string;
      patientId?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (user.role === Role.PATIENT) {
      where.patientId = user.id;
    } else if (user.role === Role.DOCTOR) {
      where.OR = [
        { prescribedDoctorId: user.id },
        { patientId: filters?.patientId || undefined },
      ];
    } else if (user.role === Role.LAB) {
      const myLab = await this.getMyLab(user.id);
      where.labId = myLab.lab.id;
    } else if (user.role === Role.ADMIN) {
      if (filters?.labId) where.labId = filters.labId;
      if (filters?.patientId) where.patientId = filters.patientId;
    }

    const [total, orders] = await Promise.all([
      this.prisma.labOrder.count({ where }),
      this.prisma.labOrder.findMany({
        where,
        include: {
          lab: { select: { id: true, name: true, city: true } },
          items: true,
          _count: { select: { samples: true, reports: true } },
          patient: {
            select: {
              id: true,
              patientProfile: { select: { fullName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      total,
      page,
      limit,
      orders,
    };
  }

  // -------------------------------------------------------------
  // 4. Lab Sample Collection Tracking
  // -------------------------------------------------------------

  /**
   * Log sample collection for a lab order
   */
  async createSample(
    user: AuthenticatedUser,
    orderId: string,
    dto: CreateLabSampleDto,
    ip?: string,
    userAgent?: string,
  ) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Lab order with ID "${orderId}" not found`);
    }

    await this.assertLabMembership(user.id, order.labId);

    const sample = await this.prisma.$transaction(async (tx) => {
      const created = await tx.labSample.create({
        data: {
          orderId,
          sampleType: dto.sampleType,
          sampleIdentifier: dto.sampleIdentifier,
          barcode: dto.barcode,
          status: LabSampleStatus.COLLECTED,
          collectedAt: new Date(),
          collectedById: user.id,
          notes: dto.notes,
        },
      });

      // Update order status if it was pending or accepted
      if (order.status === LabOrderStatus.PENDING || order.status === LabOrderStatus.ACCEPTED) {
        await tx.labOrder.update({
          where: { id: orderId },
          data: { status: LabOrderStatus.SAMPLE_COLLECTED },
        });

        // M5.1: Sync LabCareConnection status to SAMPLE_COLLECTED
        if (tx.labCareConnection) {
          const conn = await tx.labCareConnection.findUnique({
            where: { labOrderId: orderId },
          });
          if (conn && (conn.status === 'PENDING' || conn.status === 'ACTIVE')) {
            await tx.labCareConnection.update({
              where: { id: conn.id },
              data: {
                status: 'SAMPLE_COLLECTED',
                sampleCollectedAt: new Date(),
              },
            });
          }
        }
      }


      return created;
    });

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.LAB_SAMPLE_CREATE,
      resourceType: 'LAB_SAMPLE',
      resourceId: sample.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        orderId,
        sampleType: sample.sampleType,
        sampleIdentifier: sample.sampleIdentifier,
      },
    });

    await this.notificationsService.sendNotification({
      userId: order.patientId,
      type: NotificationType.LAB_SAMPLE_COLLECTED,
      title: 'Sample Collected',
      message: `Specimen (${sample.sampleType}) collected for diagnostic order ${order.orderNumber}.`,
      metadata: { orderId, sampleId: sample.id },
    });

    return sample;
  }

  /**
   * Update sample status (RECEIVED, REJECTED, PROCESSING, COMPLETED)
   */
  async updateSampleStatus(
    user: AuthenticatedUser,
    sampleId: string,
    dto: UpdateLabSampleDto,
    ip?: string,
    userAgent?: string,
  ) {
    const sample = await this.prisma.labSample.findUnique({
      where: { id: sampleId },
      include: { order: true },
    });

    if (!sample) {
      throw new NotFoundException(`Sample with ID "${sampleId}" not found`);
    }

    await this.assertLabMembership(user.id, sample.order.labId);

    if (dto.status === LabSampleStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException('rejectionReason is mandatory when rejecting a specimen');
    }

    const updated = await this.prisma.labSample.update({
      where: { id: sampleId },
      data: {
        status: dto.status,
        receivedAt: dto.status === LabSampleStatus.RECEIVED ? new Date() : undefined,
        rejectedAt: dto.status === LabSampleStatus.REJECTED ? new Date() : undefined,
        rejectionReason: dto.rejectionReason,
        notes: dto.notes ? `${sample.notes ? sample.notes + '\n' : ''}${dto.notes}` : undefined,
      },
    });

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.LAB_SAMPLE_UPDATE,
      resourceType: 'LAB_SAMPLE',
      resourceId: sampleId,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        orderId: sample.orderId,
        previousStatus: sample.status,
        newStatus: dto.status,
        rejectionReason: dto.rejectionReason,
      },
    });

    if (dto.status === LabSampleStatus.REJECTED) {
      await this.notificationsService.sendNotification({
        userId: sample.order.patientId,
        type: NotificationType.LAB_SAMPLE_REJECTED,
        title: 'Specimen Issue Reported',
        message: `Sample for order ${sample.order.orderNumber} requires recollection. Reason: ${dto.rejectionReason}`,
        metadata: { orderId: sample.orderId, sampleId },
      });
    }

    return updated;
  }

  // -------------------------------------------------------------
  // 5. Lab Reports Lifecycle & Immutability Engine
  // -------------------------------------------------------------

  /**
   * Create a draft report for an order
   */
  async createDraftReport(
    user: AuthenticatedUser,
    orderId: string,
    dto: CreateLabReportDto,
    ip?: string,
    userAgent?: string,
  ) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Lab order with ID "${orderId}" not found`);
    }

    await this.assertLabMembership(user.id, order.labId);

    const reportNumber = await this.generateReportNumber();

    const report = await this.prisma.$transaction(async (tx) => {
      const created = await tx.labReport.create({
        data: {
          reportNumber,
          orderId,
          status: LabReportStatus.DRAFT,
          testSummary: dto.testSummary,
          clinicalNotes: dto.clinicalNotes,
        },
      });

      // Update order status to PROCESSING or REPORT_PENDING_REVIEW
      await tx.labOrder.update({
        where: { id: orderId },
        data: { status: LabOrderStatus.REPORT_PENDING_REVIEW },
      });

      return created;
    });

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.LAB_REPORT_CREATE,
      resourceType: 'LAB_REPORT',
      resourceId: report.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        orderId,
        reportNumber: report.reportNumber,
      },
    });

    return report;
  }

  /**
   * Update draft report (Forbidden if report is already FINALIZED or AMENDED)
   */
  async updateReport(
    user: AuthenticatedUser,
    reportId: string,
    dto: CreateLabReportDto,
    ip?: string,
    userAgent?: string,
  ) {
    const report = await this.prisma.labReport.findUnique({
      where: { id: reportId },
      include: { order: true },
    });

    if (!report) {
      throw new NotFoundException(`Lab report with ID "${reportId}" not found`);
    }

    await this.assertLabMembership(user.id, report.order.labId);

    // IMMUTABILITY GUARANTEE: Finalized or amended reports cannot be edited in place
    if (report.status === LabReportStatus.FINALIZED || report.status === LabReportStatus.AMENDED) {
      throw new ForbiddenException(
        'Immutability violation: Finalized or amended lab reports cannot be modified. Issue a formal amendment instead.',
      );
    }

    const updated = await this.prisma.labReport.update({
      where: { id: reportId },
      data: {
        testSummary: dto.testSummary,
        clinicalNotes: dto.clinicalNotes,
      },
    });

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.LAB_REPORT_UPDATE,
      resourceType: 'LAB_REPORT',
      resourceId: reportId,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
    });

    return updated;
  }

  /**
   * Finalize and publish a lab report (Immutable once finalized)
   */
  async finalizeReport(
    user: AuthenticatedUser,
    reportId: string,
    dto: FinalizeLabReportDto,
    ip?: string,
    userAgent?: string,
  ) {
    const report = await this.prisma.labReport.findUnique({
      where: { id: reportId },
      include: { order: true },
    });

    if (!report) {
      throw new NotFoundException(`Lab report with ID "${reportId}" not found`);
    }

    await this.assertLabMembership(user.id, report.order.labId);

    if (report.status === LabReportStatus.FINALIZED) {
      throw new BadRequestException('Report is already finalized');
    }

    const finalizedAt = new Date();

    const finalized = await this.prisma.$transaction(async (tx) => {
      const rep = await tx.labReport.update({
        where: { id: reportId },
        data: {
          status: LabReportStatus.FINALIZED,
          testSummary: dto.testSummary,
          clinicalNotes: dto.clinicalNotes,
          documentId: dto.documentId,
          verifiedById: user.id,
          verifiedAt: finalizedAt,
          finalizedAt,
        },
      });

      // Update order to COMPLETED
      await tx.labOrder.update({
        where: { id: report.orderId },
        data: {
          status: LabOrderStatus.COMPLETED,
          completedAt: finalizedAt,
        },
      });

      // M5.1: If temporary LabCareConnection exists, complete it and revoke temporary clinical access
      if (tx.labCareConnection) {
        const connection = await tx.labCareConnection.findUnique({
          where: { labOrderId: report.orderId },
        });
        if (connection && connection.status !== 'COMPLETED' && connection.status !== 'REVOKED') {
          await tx.labCareConnection.update({
            where: { id: connection.id },
            data: {
              status: 'COMPLETED',
              reportFinalizedAt: finalizedAt,
              reportDeliveredAt: finalizedAt,
              revokedAt: finalizedAt,
              revocationReason: 'Investigation completed: Final diagnostic report delivered to patient vault',
            },
          });
        }
      }

      return rep;
    });

    // Project finalized report into longitudinal healthcare timeline
    try {
      await this.timelineService.projectLabReport(reportId);
    } catch (err: any) {
      this.logger.warn(`Failed to project lab report ${reportId} to timeline: ${err.message}`);
    }

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.LAB_REPORT_FINALIZE,
      resourceType: 'LAB_REPORT',
      resourceId: reportId,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        orderId: report.orderId,
        reportNumber: finalized.reportNumber,
        documentId: dto.documentId,
      },
    });

    // Notify patient: diagnostic report delivered. Prescribing doctor does NOT automatically receive it.
    await this.notificationsService.sendNotification({
      userId: report.order.patientId,
      type: NotificationType.LAB_REPORT_READY,
      title: 'Diagnostic Report Delivered',
      message: `Your diagnostic report ${finalized.reportNumber} has been finalized and delivered to your private health vault.${report.order.prescribedDoctorId ? ' You can now choose whether to share it with your doctor.' : ''}`,
      metadata: {
        reportId,
        orderId: report.orderId,
        canShareWithDoctor: !!report.order.prescribedDoctorId,
        doctorId: report.order.prescribedDoctorId,
      },
    });

    return finalized;
  }

  /**
   * Amend a finalized lab report (Creates new versioned record, links to predecessor)
   */
  async amendReport(
    user: AuthenticatedUser,
    reportId: string,
    dto: AmendLabReportDto,
    ip?: string,
    userAgent?: string,
  ) {
    const original = await this.prisma.labReport.findUnique({
      where: { id: reportId },
      include: { order: true },
    });

    if (!original) {
      throw new NotFoundException(`Lab report with ID "${reportId}" not found`);
    }

    await this.assertLabMembership(user.id, original.order.labId);

    if (original.status !== LabReportStatus.FINALIZED && original.status !== LabReportStatus.AMENDED) {
      throw new BadRequestException('Only finalized reports can be formally amended');
    }

    const now = new Date();
    const amendmentNumber = `${original.reportNumber}-A${Date.now().toString().slice(-4)}`;

    const amendedReport = await this.prisma.$transaction(async (tx) => {
      // Mark original as amended
      await tx.labReport.update({
        where: { id: reportId },
        data: { isAmended: true },
      });

      // Create new amended report
      return tx.labReport.create({
        data: {
          reportNumber: amendmentNumber,
          orderId: original.orderId,
          documentId: dto.documentId,
          status: LabReportStatus.AMENDED,
          testSummary: dto.testSummary,
          clinicalNotes: dto.clinicalNotes,
          verifiedById: user.id,
          verifiedAt: now,
          finalizedAt: now,
          isAmended: true,
          amendedReason: dto.amendedReason,
          previousReportId: original.id,
        },
      });
    });

    // Project amended report to timeline
    try {
      await this.timelineService.projectLabReport(amendedReport.id);
    } catch (err: any) {
      this.logger.warn(`Failed to project amended lab report ${amendedReport.id} to timeline: ${err.message}`);
    }

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.LAB_REPORT_AMEND,
      resourceType: 'LAB_REPORT',
      resourceId: amendedReport.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        originalReportId: original.id,
        amendedReportNumber: amendedReport.reportNumber,
        amendedReason: dto.amendedReason,
      },
    });

    // Notify patient & prescribing doctor
    await this.notificationsService.sendNotification({
      userId: original.order.patientId,
      type: NotificationType.LAB_REPORT_AMENDED,
      title: 'Lab Report Amended',
      message: `An amended report ${amendedReport.reportNumber} has been issued for order ${original.order.orderNumber}. Reason: ${dto.amendedReason}`,
      metadata: { reportId: amendedReport.id, orderId: original.orderId },
    });

    if (original.order.prescribedDoctorId) {
      await this.notificationsService.sendNotification({
        userId: original.order.prescribedDoctorId,
        type: NotificationType.LAB_REPORT_AMENDED,
        title: 'Amended Lab Report Issued',
        message: `An amended report ${amendedReport.reportNumber} was published. Reason: ${dto.amendedReason}`,
        metadata: { reportId: amendedReport.id, orderId: original.orderId },
      });
    }

    return amendedReport;
  }

  /**
   * Get lab report with authorization checking
   */
  async getReport(user: AuthenticatedUser, reportId: string, ip?: string, userAgent?: string) {
    const report = await this.prisma.labReport.findUnique({
      where: { id: reportId },
      include: {
        order: {
          include: {
            lab: true,
            items: true,
          },
        },
        document: {
          include: { versions: { take: 1, orderBy: { versionNumber: 'desc' } } },
        },
        verifiedBy: { select: { id: true, email: true } },
        previousReport: true,
        amendedReports: true,
      },
    });

    if (!report) {
      throw new NotFoundException(`Lab report with ID "${reportId}" not found`);
    }

    // Role checks
    if (user.role === Role.PATIENT) {
      if (report.order.patientId !== user.id) {
        throw new ForbiddenException('Access denied: You cannot view another patient’s reports');
      }
    } else if (user.role === Role.DOCTOR) {
      // Doctor check: view-only policy
      if (report.order.prescribedDoctorId !== user.id) {
        await this.consentAuthService.authorize({
          actorId: user.id,
          actorRole: user.role,
          actorEmail: user.email,
          patientId: report.order.patientId,
          resourceType: ConsentResourceType.LAB_REPORT,
          resourceId: report.id,
          action: 'VIEW',
          ipAddress: ip,
          userAgent,
        });
      }
    } else if (user.role === Role.LAB) {
      await this.assertLabMembership(user.id, report.order.labId);
    } else if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied: Insufficient privileges');
    }

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.LAB_REPORT_VIEW,
      resourceType: 'LAB_REPORT',
      resourceId: reportId,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        reportNumber: report.reportNumber,
        patientId: report.order.patientId,
      },
    });

    return report;
  }

  // -------------------------------------------------------------
  // Helpers & Security Assertions
  // -------------------------------------------------------------

  private async assertLabAdmin(userId: string, labId: string) {
    const membership = await this.prisma.labMembership.findFirst({
      where: {
        userId,
        labId,
        status: LabMemberStatus.ACTIVE,
        role: LabMemberRole.LAB_ADMIN,
      },
    });

    if (!membership) {
      throw new ForbiddenException('Access denied: Requires LAB_ADMIN role for this laboratory');
    }

    return membership;
  }

  private async assertLabMembership(userId: string, labId: string) {
    const membership = await this.prisma.labMembership.findFirst({
      where: {
        userId,
        labId,
        status: LabMemberStatus.ACTIVE,
      },
    });

    if (!membership) {
      throw new ForbiddenException('Access denied: You do not belong to this laboratory');
    }

    return membership;
  }

  private async assertVerifiedLabMember(userId: string, labId: string) {
    const lab = await this.prisma.labOrganization.findUnique({
      where: { id: labId },
    });

    if (!lab || !lab.isActive || lab.verificationStatus !== LabVerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        'Access denied: Laboratory facility is not verified or currently active',
      );
    }

    return this.assertLabMembership(userId, labId);
  }

  private async generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.labOrder.count();
    const seq = (count + 1).toString().padStart(6, '0');
    return `CP-LAB-${year}-${seq}`;
  }

  private async generateReportNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.labReport.count();
    const seq = (count + 1).toString().padStart(6, '0');
    return `REP-${year}-${seq}`;
  }
}
