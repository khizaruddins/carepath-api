import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { AccessControlService } from '../common/services/access-control.service';
import { DocumentQueueService } from '../queue/queue.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentMetadataDto } from './dto/update-document-metadata.dto';
import { FilterDocumentsDto } from './dto/filter-documents.dto';
import {
  AccessStatus,
  AuditAction,
  AuditResult,
  DocumentProcessingStatus,
  NotificationType,
  OcrStatus,
  RestoreRequestStatus,
  Role,
  TimelineEventType,
  TimelineSourceType,
} from '@prisma/client';
import * as crypto from 'crypto';
import { NotificationsService } from '../notifications/notifications.service';
import { HealthcareTimelineService } from '../timeline/healthcare-timeline.service';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly accessControlService: AccessControlService,
    private readonly queueService: DocumentQueueService,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly timelineService?: HealthcareTimelineService,
  ) {}

  /**
   * Uploads medical document adhering to the secure workflow:
   * Upload -> Validate -> Virus check -> Private S3 -> DB metadata -> Async OCR -> Timeline event
   */
  async uploadDocument(
    user: AuthenticatedUser,
    file: Express.Multer.File,
    dto: UploadDocumentDto,
    ip?: string,
    userAgent?: string,
  ) {
    // 1. File validation & Security/virus check
    const validation = this.storageService.validateFile(file);

    const patientId = user.id;

    // 2. Create document record in database
    const document = await this.prisma.document.create({
      data: {
        patientId,
        uploadedById: user.id,
        category: dto.category,
        status: DocumentProcessingStatus.UPLOADED,
      },
    });

    // 3. Store original document in private S3 bucket
    const sanitizedFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `vault/${patientId}/${document.id}/${crypto.randomUUID()}-${sanitizedFileName}`;

    await this.storageService.uploadFile(storageKey, file.buffer, validation.mimeType, {
      patientId,
      documentId: document.id,
      uploadedById: user.id,
    });

    // 4. Create DocumentVersion record (Never modify original)
    const version = await this.prisma.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        storageKey,
        bucket: this.storageService.getBucketName(),
        originalFileName: file.originalname,
        mimeType: validation.mimeType,
        fileSizeBytes: validation.sizeBytes,
        checksumSha256: validation.sha256,
        isClean: validation.clean,
      },
    });

    // 5. Create structured DocumentMetadata separately
    const metadata = await this.prisma.documentMetadata.create({
      data: {
        documentId: document.id,
        documentType: dto.category,
        documentDate: dto.documentDate ? new Date(dto.documentDate) : null,
        providerName: dto.providerName || null,
        facility: dto.facility || null,
        reportTitle: dto.reportTitle || null,
        patientNotes: dto.patientNotes || null,
        ocrStatus: OcrStatus.PENDING,
        isPatientConfirmed: false,
      },
    });

    // 6. Record Audit Log for upload
    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.DOCUMENT_UPLOAD,
      resourceType: 'DOCUMENT',
      resourceId: document.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        category: dto.category,
        fileSize: validation.sizeBytes,
        mimeType: validation.mimeType,
      },
    });

    // 7. Dispatch asynchronous OCR processing hook
    await this.queueService.dispatchOcrJob({
      documentId: document.id,
      storageKey,
      mimeType: validation.mimeType,
      fileName: file.originalname,
      buffer: file.buffer,
    });

    if (this.notificationsService) {
      try {
        const approvedAccess = await this.prisma.doctorPatientAccess.findMany({
          where: { patientId, status: AccessStatus.APPROVED },
          select: { doctorId: true },
        });

        if (approvedAccess.length > 0) {
          const patientUser = await this.prisma.user.findUnique({
            where: { id: patientId },
            include: { patientProfile: true },
          });
          const patientName = patientUser?.patientProfile?.fullName || patientUser?.email || 'A patient';
          const reportTitle = dto.reportTitle || file.originalname;

          for (const access of approvedAccess) {
            await this.notificationsService.sendNotification({
              userId: access.doctorId,
              type: NotificationType.DOCUMENT_UPLOADED,
              title: 'New Medical Report Uploaded',
              message: `${patientName} uploaded a new report: "${reportTitle}".`,
              metadata: {
                documentId: document.id,
                patientId,
                patientName,
                reportTitle,
                category: dto.category,
                action: 'VIEW_DOCUMENT',
              },
            });
            this.notificationsService.sendRealtimeAction(access.doctorId, 'document:uploaded', {
              documentId: document.id,
              patientId,
            });
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to notify doctors of uploaded document: ${err.message}`);
      }
    }

    // Project into longitudinal healthcare timeline
    if (this.timelineService) {
      try {
        await this.timelineService.projectDocument(document.id);
      } catch (err: any) {
        this.logger.warn(`Failed to project document to timeline: ${err.message}`);
      }
    }

    return {
      message: 'Medical document uploaded securely and queued for processing',
      document: {
        id: document.id,
        category: document.category,
        status: document.status,
        createdAt: document.createdAt,
        version: {
          versionNumber: version.versionNumber,
          originalFileName: version.originalFileName,
          mimeType: version.mimeType,
          fileSizeBytes: version.fileSizeBytes,
        },
        metadata,
      },
    };
  }

  /**
   * List documents with filtering and pagination
   */
  async getDocuments(user: AuthenticatedUser, filters: FilterDocumentsDto) {
    const where: any = {
      isArchived: false,
    };

    if (user.role === Role.PATIENT) {
      where.patientId = user.id;
    } else if (user.role === Role.DOCTOR) {
      where.patientId = user.id;
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.search) {
      where.OR = [
        { metadata: { reportTitle: { contains: filters.search, mode: 'insensitive' } } },
        { metadata: { providerName: { contains: filters.search, mode: 'insensitive' } } },
        { metadata: { facility: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const take = filters.limit ? Number(filters.limit) : 20;
    const skip = filters.offset ? Number(filters.offset) : 0;

    const [total, documents] = await Promise.all([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        include: {
          metadata: true,
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: {
              id: true,
              versionNumber: true,
              originalFileName: true,
              mimeType: true,
              fileSizeBytes: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
    ]);

    return {
      total,
      limit: take,
      offset: skip,
      documents,
    };
  }

  /**
   * Retrieves single document, verifies ownership, logs audit, and generates short-lived signed URL
   * For DOCTOR: Access is view-only, downloads are prohibited, and signed download URLs are refused by the server.
   * For ADMIN: Direct document download/view is restricted without clinical authorization.
   */
  async getDocumentById(
    user: AuthenticatedUser,
    documentId: string,
    ip?: string,
    userAgent?: string,
  ) {
    // 1. Centralized access control assertion (Ownership / consent check)
    const document = await this.accessControlService.assertCanAccessDocument(
      user,
      documentId,
      'VIEW',
      ip,
      userAgent,
    );

    const latestVersion = document.versions?.[0];
    if (!latestVersion) {
      throw new NotFoundException('No file version found for this document');
    }

    // 2. Audit access (DOCUMENT_VIEW)
    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.DOCUMENT_VIEW,
      resourceType: 'DOCUMENT',
      resourceId: document.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        category: document.category,
        role: user.role,
      },
    });

    // 3. Server-side clinician download prohibition: DOCTOR receives NO signed download URL
    let signedUrl: string | null = null;
    let downloadProhibited = false;
    let accessMode: 'VIEW_ONLY' | 'FULL' = 'FULL';

    if (user.role === Role.DOCTOR) {
      downloadProhibited = true;
      accessMode = 'VIEW_ONLY';
      signedUrl = null;
    } else if (user.role === Role.ADMIN) {
      downloadProhibited = true;
      accessMode = 'VIEW_ONLY';
      signedUrl = null;
    } else {
      // Patient self-access allows download
      signedUrl = await this.storageService.getSignedDownloadUrl(latestVersion.storageKey, 900);
    }

    return {
      ...document,
      signedUrl,
      signedUrlExpiresInSeconds: signedUrl ? 900 : null,
      downloadProhibited,
      accessMode,
    };
  }

  /**
   * Downloads a document file.
   * Strictly REFUSES and BLOCKS downloads for clinicians (DOCTOR) and ADMIN with audited security event.
   */
  async downloadDocument(
    user: AuthenticatedUser,
    documentId: string,
    ip?: string,
    userAgent?: string,
  ) {
    if (user.role === Role.DOCTOR) {
      await this.auditService.log({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: AuditAction.DOWNLOAD_PROHIBITED_BLOCKED,
        resourceType: 'DOCUMENT',
        resourceId: documentId,
        result: AuditResult.DENIED,
        ipAddress: ip,
        userAgent,
        details: {
          reason: 'Clinician download attempt blocked by server policy. Access is view-only.',
          documentId,
        },
      });
      throw new ForbiddenException(
        'Access denied: Downloading patient records is strictly prohibited for clinicians. Clinician access is view-only.',
      );
    }

    if (user.role === Role.ADMIN) {
      await this.auditService.log({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: AuditAction.SECURITY_EVENT,
        resourceType: 'DOCUMENT',
        resourceId: documentId,
        result: AuditResult.DENIED,
        ipAddress: ip,
        userAgent,
        details: {
          reason: 'Admin attempted direct document download without clinical authorization',
        },
      });
      throw new ForbiddenException(
        'Access denied: Administrative accounts cannot download patient medical records.',
      );
    }

    // Asserts patient ownership
    const document = await this.accessControlService.assertCanAccessDocument(
      user,
      documentId,
      'DOWNLOAD',
      ip,
      userAgent,
    );

    const latestVersion = document.versions?.[0];
    if (!latestVersion) {
      throw new NotFoundException('No file version found for this document');
    }

    const downloadUrl = await this.storageService.getSignedDownloadUrl(latestVersion.storageKey, 900);

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.DOCUMENT_DOWNLOAD,
      resourceType: 'DOCUMENT',
      resourceId: document.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        category: document.category,
        fileName: latestVersion.originalFileName,
      },
    });

    return {
      downloadUrl,
      fileName: latestVersion.originalFileName,
      mimeType: latestVersion.mimeType,
      fileSizeBytes: latestVersion.fileSizeBytes,
      expiresInSeconds: 900,
    };
  }

  /**
   * Updates metadata or confirms OCR extraction
   */
  async updateDocument(
    user: AuthenticatedUser,
    documentId: string,
    dto: UpdateDocumentMetadataDto,
    ip?: string,
    userAgent?: string,
  ) {
    // 1. Centralized access control assertion
    const document = await this.accessControlService.assertCanAccessDocument(user, documentId);

    // 2. Update category if provided
    if (dto.category && dto.category !== document.category) {
      await this.prisma.document.update({
        where: { id: documentId },
        data: { category: dto.category },
      });
    }

    // 3. Update DocumentMetadata
    const updatedMetadata = await this.prisma.documentMetadata.update({
      where: { documentId },
      data: {
        documentType: dto.category ?? undefined,
        reportTitle: dto.reportTitle ?? undefined,
        providerName: dto.providerName ?? undefined,
        facility: dto.facility ?? undefined,
        documentDate: dto.documentDate ? new Date(dto.documentDate) : undefined,
        patientNotes: dto.patientNotes ?? undefined,
        extractedData: dto.extractedData ? (dto.extractedData as any) : undefined,
        isPatientConfirmed: dto.isPatientConfirmed ?? undefined,
        ocrStatus: dto.isPatientConfirmed ? OcrStatus.CONFIRMED : undefined,
      },
    });

    // 4. Create timeline event for update
    await this.prisma.healthTimelineEvent.create({
      data: {
        patientId: document.patientId,
        documentId: document.id,
        eventType: TimelineEventType.DOCUMENT_UPDATED,
        title: `Document Updated: ${updatedMetadata.reportTitle || document.category}`,
        description: dto.isPatientConfirmed
          ? 'Patient confirmed extracted medical details.'
          : 'Document metadata updated.',
      },
    });

    // Re-project document in longitudinal healthcare timeline
    if (this.timelineService) {
      try {
        await this.timelineService.projectDocument(document.id);
      } catch (err: any) {
        this.logger.warn(`Failed to update timeline projection for document ${document.id}: ${err.message}`);
      }
    }

    // 5. Audit log
    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.DOCUMENT_UPDATE,
      resourceType: 'DOCUMENT',
      resourceId: document.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        updatedFields: Object.keys(dto),
      },
    });

    return {
      message: 'Document metadata updated successfully',
      metadata: updatedMetadata,
    };
  }

  /**
   * Archives / deletes medical document with audit log
   */
  async deleteDocument(
    user: AuthenticatedUser,
    documentId: string,
    ip?: string,
    userAgent?: string,
  ) {
    // 1. Centralized access control assertion
    const document = await this.accessControlService.assertCanAccessDocument(user, documentId);

    // 2. Archive document
    await this.prisma.document.update({
      where: { id: documentId },
      data: { isArchived: true },
    });

    // 3. Remove projection from longitudinal healthcare timeline
    if (this.timelineService) {
      try {
        await this.timelineService.handleSourceDeletion(TimelineSourceType.DOCUMENT, document.id);
      } catch (err: any) {
        this.logger.warn(`Failed to remove timeline projection for document ${document.id}: ${err.message}`);
      }
    }

    // 4. Audit log
    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.DOCUMENT_DELETE,
      resourceType: 'DOCUMENT',
      resourceId: document.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
    });

    return { message: 'Document successfully archived' };
  }

  /**
   * Retrieves soft-deleted/archived documents for the authenticated patient
   */
  async getArchivedDocuments(user: AuthenticatedUser) {
    return this.prisma.document.findMany({
      where: {
        patientId: user.id,
        isArchived: true,
      },
      include: {
        metadata: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            id: true,
            versionNumber: true,
            originalFileName: true,
            mimeType: true,
            fileSizeBytes: true,
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Patient requests administrator restoration for an archived document.
   * Creates an auditable DocumentRestoreRequest record with status PENDING.
   * Rejects and audits cross-patient IDOR attempts.
   */
  async requestDocumentRestore(
    user: AuthenticatedUser,
    documentId: string,
    reason?: string,
    ip?: string,
    userAgent?: string,
  ) {
    if (user.role !== Role.PATIENT) {
      throw new ForbiddenException('Only patients can request restoration of their medical documents');
    }

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // IDOR / Cross-patient authorization check
    if (document.patientId !== user.id) {
      await this.auditService.log({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: AuditAction.DOCUMENT_RESTORE_REQUEST,
        resourceType: 'DOCUMENT',
        resourceId: documentId,
        result: AuditResult.DENIED,
        ipAddress: ip,
        userAgent,
        details: {
          reason: 'CROSS_PATIENT_RESTORE_ATTEMPT',
          documentOwnerId: document.patientId,
        },
      });
      throw new ForbiddenException(
        'Access denied: You cannot request restoration for records belonging to another patient',
      );
    }

    if (!document.isArchived) {
      throw new BadRequestException('This document is already active and not archived');
    }

    // Create auditable restoration request
    const restoreRequest = await this.prisma.documentRestoreRequest.create({
      data: {
        documentId,
        patientId: user.id,
        status: RestoreRequestStatus.PENDING,
        reason: reason || 'Accidental deletion. Requested restoration by patient.',
      },
    });

    // Update document restore state
    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        restoreRequested: true,
        restoreStatus: RestoreRequestStatus.PENDING,
        restoreReason: reason || 'Accidental deletion. Requested restoration by patient.',
        restoreRequestedAt: new Date(),
      },
    });

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.DOCUMENT_RESTORE_REQUEST,
      resourceType: 'DOCUMENT_RESTORE_REQUEST',
      resourceId: restoreRequest.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        documentId: document.id,
        category: document.category,
        reason: reason || null,
      },
    });

    return {
      message: 'Restoration request submitted. An administrator will review and restore your document.',
      request: restoreRequest,
      document: updated,
    };
  }

  /**
   * Patient cancels their pending document restoration request.
   */
  async cancelDocumentRestore(
    user: AuthenticatedUser,
    documentId: string,
    ip?: string,
    userAgent?: string,
  ) {
    if (user.role !== Role.PATIENT) {
      throw new ForbiddenException('Only patients can cancel restoration requests');
    }

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.patientId !== user.id) {
      throw new ForbiddenException('You can only cancel restoration for your own documents');
    }

    const pendingRequest = await this.prisma.documentRestoreRequest.findFirst({
      where: {
        documentId,
        patientId: user.id,
        status: RestoreRequestStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (pendingRequest) {
      await this.prisma.documentRestoreRequest.update({
        where: { id: pendingRequest.id },
        data: { status: RestoreRequestStatus.CANCELLED },
      });
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        restoreRequested: false,
        restoreStatus: RestoreRequestStatus.CANCELLED,
      },
    });

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.DOCUMENT_RESTORE_CANCEL,
      resourceType: 'DOCUMENT_RESTORE_REQUEST',
      resourceId: pendingRequest?.id || documentId,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        documentId,
      },
    });

    return {
      message: 'Restoration request cancelled',
      document: updated,
    };
  }

  /**
   * Administrator lists document restoration requests with optional status filtering.
   */
  async getAdminRestoreRequests(status?: RestoreRequestStatus) {
    return this.prisma.documentRestoreRequest.findMany({
      where: status ? { status } : undefined,
      include: {
        document: {
          include: {
            metadata: true,
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
              select: {
                id: true,
                originalFileName: true,
                mimeType: true,
                fileSizeBytes: true,
                createdAt: true,
              },
            },
          },
        },
        patient: {
          select: {
            id: true,
            email: true,
            phoneNumber: true,
            patientProfile: {
              select: {
                fullName: true,
                mobile: true,
              },
            },
          },
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
            adminProfile: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Administrator reviews a document restore request:
   * - APPROVED: Document.isArchived becomes false, returning to Active Vault.
   * - REJECTED: Document.isArchived remains true with rejectionReason.
   */
  async reviewDocumentRestore(
    adminUser: AuthenticatedUser,
    requestId: string,
    dto: {
      status: 'APPROVED' | 'REJECTED';
      adminNotes?: string;
      rejectionReason?: string;
    },
    ip?: string,
    userAgent?: string,
  ) {
    if (adminUser.role !== Role.ADMIN) {
      await this.auditService.log({
        actorId: adminUser.id,
        actorEmail: adminUser.email,
        actorRole: adminUser.role,
        action: AuditAction.SECURITY_EVENT,
        resourceType: 'DOCUMENT_RESTORE_REQUEST',
        resourceId: requestId,
        result: AuditResult.DENIED,
        ipAddress: ip,
        userAgent,
        details: { reason: 'NON_ADMIN_RESTORATION_ATTEMPT' },
      });
      throw new ForbiddenException('Only administrators can review restoration requests');
    }

    const restoreRequest = await this.prisma.documentRestoreRequest.findUnique({
      where: { id: requestId },
      include: { document: { include: { metadata: true } } },
    });

    if (!restoreRequest) {
      throw new NotFoundException('Restoration request not found');
    }

    const isApprove = dto.status === 'APPROVED';

    // 1. Update DocumentRestoreRequest
    const updatedRequest = await this.prisma.documentRestoreRequest.update({
      where: { id: requestId },
      data: {
        status: isApprove ? RestoreRequestStatus.APPROVED : RestoreRequestStatus.REJECTED,
        reviewedById: adminUser.id,
        reviewedAt: new Date(),
        adminNotes: dto.adminNotes || null,
        rejectionReason: !isApprove ? dto.rejectionReason || 'Restoration declined by administrator' : null,
      },
    });

    // 2. Controlled state transition on Document
    const updatedDoc = await this.prisma.document.update({
      where: { id: restoreRequest.documentId },
      data: {
        isArchived: !isApprove, // if approved, isArchived: false; if rejected, remains true
        restoreRequested: false,
        restoreStatus: isApprove ? RestoreRequestStatus.APPROVED : RestoreRequestStatus.REJECTED,
        restoreReason: !isApprove ? dto.rejectionReason || null : null,
      },
    });

    // 3. Audit log
    await this.auditService.log({
      actorId: adminUser.id,
      actorEmail: adminUser.email,
      actorRole: adminUser.role,
      action: isApprove ? AuditAction.DOCUMENT_RESTORE_APPROVE : AuditAction.DOCUMENT_RESTORE_REJECT,
      resourceType: 'DOCUMENT_RESTORE_REQUEST',
      resourceId: requestId,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        documentId: restoreRequest.documentId,
        patientId: restoreRequest.patientId,
        decision: dto.status,
        adminNotes: dto.adminNotes || null,
        rejectionReason: dto.rejectionReason || null,
      },
    });

    if (this.notificationsService) {
      const docTitle = restoreRequest.document?.metadata?.reportTitle || 'Archived Document';
      await this.notificationsService.sendNotification({
        userId: restoreRequest.patientId,
        type: NotificationType.DOCUMENT_RESTORED,
        title: `Document Restoration: ${dto.status}`,
        message: isApprove
          ? `Your document "${docTitle}" has been restored to your active vault.`
          : `Your request to restore "${docTitle}" was declined.${dto.rejectionReason ? ` Reason: ${dto.rejectionReason}` : ''}`,
        metadata: {
          requestId,
          documentId: restoreRequest.documentId,
          status: dto.status,
          docTitle,
          action: 'VIEW_DOCUMENTS',
        },
      });
      this.notificationsService.sendRealtimeAction(restoreRequest.patientId, 'document:restored', {
        requestId,
        documentId: restoreRequest.documentId,
        status: dto.status,
      });
    }

    return {
      message: isApprove
        ? 'Document successfully restored to patient health vault'
        : 'Document restoration request rejected',
      request: updatedRequest,
      document: updatedDoc,
    };
  }

  /**
   * Backward-compatible direct document restoration endpoint by document ID
   */
  async restoreDocument(
    adminUser: AuthenticatedUser,
    documentId: string,
    ip?: string,
    userAgent?: string,
  ) {
    if (adminUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can restore documents');
    }

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (!document.isArchived) {
      throw new BadRequestException('Document is already active');
    }

    // Find any existing pending request or create an approved one
    let pendingRequest = await this.prisma.documentRestoreRequest.findFirst({
      where: { documentId, status: RestoreRequestStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });

    if (pendingRequest) {
      return this.reviewDocumentRestore(
        adminUser,
        pendingRequest.id,
        { status: 'APPROVED', adminNotes: 'Restored via admin quick-action' },
        ip,
        userAgent,
      );
    }

    // Direct restoration if no ticket existed
    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        isArchived: false,
        restoreRequested: false,
        restoreStatus: RestoreRequestStatus.APPROVED,
        restoreReason: null,
        restoreRequestedAt: null,
      },
    });

    await this.auditService.log({
      actorId: adminUser.id,
      actorEmail: adminUser.email,
      actorRole: adminUser.role,
      action: AuditAction.DOCUMENT_RESTORE_APPROVE,
      resourceType: 'DOCUMENT',
      resourceId: document.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        action: 'DOCUMENT_RESTORED_BY_ADMIN',
      },
    });

    return {
      message: 'Document successfully restored to patient health vault',
      document: updated,
    };
  }
}
