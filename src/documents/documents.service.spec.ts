import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { AccessControlService } from '../common/services/access-control.service';
import { DocumentQueueService } from '../queue/queue.service';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Role, DocumentCategory, AuditAction } from '@prisma/client';

describe('DocumentsService (Storage Security & Audit Logging)', () => {
  let service: DocumentsService;
  let accessControlService: AccessControlService;
  let storageService: StorageService;
  let auditService: AuditService;

  const mockPrisma = {
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    documentVersion: {
      create: jest.fn(),
    },
    documentMetadata: {
      create: jest.fn(),
      update: jest.fn(),
    },
    healthTimelineEvent: {
      create: jest.fn(),
    },
  };

  const mockStorageService = {
    validateFile: jest.fn(),
    uploadFile: jest.fn().mockResolvedValue('vault/patient-1/doc-1/file.pdf'),
    getSignedDownloadUrl: jest
      .fn()
      .mockResolvedValue('https://storage.private/signed/cbc.pdf?token=temporary_signed_token'),
    getBucketName: jest.fn().mockReturnValue('carepath-medical-vault'),
    deleteFile: jest.fn().mockResolvedValue(true),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(true),
  };

  const mockAccessControlService = {
    assertCanAccessDocument: jest.fn(),
  };

  const mockQueueService = {
    dispatchOcrJob: jest.fn().mockResolvedValue(undefined),
  };

  const patientA = {
    id: 'patient-a-uuid',
    email: 'patientA@example.com',
    role: Role.PATIENT,
    status: 'ACTIVE',
  };

  const patientB = {
    id: 'patient-b-uuid',
    email: 'patientB@example.com',
    role: Role.PATIENT,
    status: 'ACTIVE',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorageService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: AccessControlService, useValue: mockAccessControlService },
        { provide: DocumentQueueService, useValue: mockQueueService },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    accessControlService = module.get<AccessControlService>(AccessControlService);
    storageService = module.get<StorageService>(StorageService);
    auditService = module.get<AuditService>(AuditService);
    jest.clearAllMocks();
  });

  describe('getDocumentById & URL Generation', () => {
    const docOfPatientA = {
      id: 'doc-uuid-1',
      patientId: 'patient-a-uuid',
      category: DocumentCategory.LAB_REPORT,
      versions: [
        {
          id: 'v1',
          storageKey: 'vault/patient-a-uuid/doc-uuid-1/cbc.pdf',
          originalFileName: 'cbc.pdf',
        },
      ],
      metadata: { reportTitle: 'Blood Test' },
    };

    it('Requirement 6: Unauthorized document URL cannot be generated', async () => {
      // AccessControl rejects unauthorized user
      mockAccessControlService.assertCanAccessDocument.mockRejectedValue(
        new ForbiddenException('Access denied: You do not own this document'),
      );

      // Patient B tries to get Document of Patient A
      await expect(
        service.getDocumentById(patientB, 'doc-uuid-1', '127.0.0.1', 'Mozilla'),
      ).rejects.toThrow(ForbiddenException);

      // Verify that S3 signed URL was NEVER called/generated!
      expect(mockStorageService.getSignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('Requirement 7: Every sensitive document access creates an audit event', async () => {
      mockAccessControlService.assertCanAccessDocument.mockResolvedValue(docOfPatientA);

      const result = await service.getDocumentById(
        patientA,
        'doc-uuid-1',
        '192.168.1.50',
        'TestBrowser/1.0',
      );

      // Verify signed URL is returned
      expect(result.signedUrl).toContain('temporary_signed_token');
      expect(result.signedUrlExpiresInSeconds).toEqual(900);

      // Verify Audit Log recorded DOCUMENT_VIEW
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: patientA.id,
          actorEmail: patientA.email,
          action: AuditAction.DOCUMENT_VIEW,
          resourceType: 'DOCUMENT',
          resourceId: 'doc-uuid-1',
          result: 'SUCCESS',
          ipAddress: '192.168.1.50',
          userAgent: 'TestBrowser/1.0',
        }),
      );
    });
  });

  describe('uploadDocument Security & Audit Logging', () => {
    it('Requirement 7 (part): Document upload creates an immutable audit event', async () => {
      const mockFile: any = {
        buffer: Buffer.from('%PDF-1.4 test dummy content'),
        originalname: 'lab_report.pdf',
        size: 1024,
        mimetype: 'application/pdf',
      };

      mockStorageService.validateFile.mockReturnValue({
        isValid: true,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        sha256: 'abc123sha',
        clean: true,
      });

      mockPrisma.document.create.mockResolvedValue({
        id: 'new-doc-id',
        patientId: patientA.id,
        category: DocumentCategory.LAB_REPORT,
        status: 'UPLOADED',
        createdAt: new Date(),
      });

      mockPrisma.documentVersion.create.mockResolvedValue({
        id: 'ver-1',
        versionNumber: 1,
        originalFileName: 'lab_report.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
      });

      mockPrisma.documentMetadata.create.mockResolvedValue({
        id: 'meta-1',
        documentId: 'new-doc-id',
        reportTitle: 'Lab Test',
      });

      const res = await service.uploadDocument(
        patientA,
        mockFile,
        { category: DocumentCategory.LAB_REPORT, reportTitle: 'Lab Test' },
        '10.0.0.1',
        'ClientApp/2.0',
      );

      expect(res.document.id).toBe('new-doc-id');

      // Verify Audit Log was recorded
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: patientA.id,
          action: AuditAction.DOCUMENT_UPLOAD,
          resourceType: 'DOCUMENT',
          resourceId: 'new-doc-id',
          result: 'SUCCESS',
        }),
      );

      // Verify queue was dispatched
      expect(mockQueueService.dispatchOcrJob).toHaveBeenCalled();
    });
  });

  describe('updateDocument & deleteDocument Audit Logging', () => {
    const docOfPatientA = {
      id: 'doc-uuid-1',
      patientId: 'patient-a-uuid',
      category: DocumentCategory.LAB_REPORT,
    };

    it('Requirement 7 (part): Updating document metadata creates an audit event and timeline event', async () => {
      mockAccessControlService.assertCanAccessDocument.mockResolvedValue(docOfPatientA);
      mockPrisma.documentMetadata.update.mockResolvedValue({
        id: 'meta-1',
        reportTitle: 'Updated Blood Test',
      });

      await service.updateDocument(
        patientA,
        'doc-uuid-1',
        { reportTitle: 'Updated Blood Test' },
        '127.0.0.1',
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: patientA.id,
          action: AuditAction.DOCUMENT_UPDATE,
          resourceType: 'DOCUMENT',
          resourceId: 'doc-uuid-1',
        }),
      );

      expect(mockPrisma.healthTimelineEvent.create).toHaveBeenCalled();
    });

    it('Requirement 7 (part): Deleting/archiving a document creates an audit event', async () => {
      mockAccessControlService.assertCanAccessDocument.mockResolvedValue(docOfPatientA);
      mockPrisma.document.update.mockResolvedValue({ id: 'doc-uuid-1', isArchived: true });

      await service.deleteDocument(patientA, 'doc-uuid-1', '127.0.0.1');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: patientA.id,
          action: AuditAction.DOCUMENT_DELETE,
          resourceType: 'DOCUMENT',
          resourceId: 'doc-uuid-1',
        }),
      );
    });
  });
});
