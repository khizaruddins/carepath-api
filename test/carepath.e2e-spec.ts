import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { StorageService } from '../src/storage/storage.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus, DocumentCategory, AuditAction } from '@prisma/client';
import * as crypto from 'crypto';

describe('CarePath Backend End-to-End Security & API Verification', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // In-memory mock store for E2E testing
  const mockUsers: any[] = [];
  const mockProfiles: any[] = [];
  const mockDocuments: any[] = [];
  const mockVersions: any[] = [];
  const mockMetadata: any[] = [];
  const mockAuditLogs: any[] = [];
  const mockRefreshTokens: any[] = [];

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(({ where }) => {
        if (where.id) {
          const user = mockUsers.find((u) => u.id === where.id);
          if (user) {
            return {
              ...user,
              patientProfile: mockProfiles.find((p) => p.userId === user.id),
            };
          }
          return null;
        }
        if (where.email) {
          return mockUsers.find((u) => u.email === where.email) || null;
        }
        return null;
      }),
      create: jest.fn(({ data }) => {
        const user = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
        mockUsers.push(user);
        return user;
      }),
      update: jest.fn(({ where, data }) => {
        const idx = mockUsers.findIndex((u) => u.id === where.id);
        if (idx !== -1) {
          mockUsers[idx] = { ...mockUsers[idx], ...data };
          return mockUsers[idx];
        }
        return null;
      }),
    },
    patientProfile: {
      findUnique: jest.fn(({ where }) => {
        const profile = mockProfiles.find((p) => p.userId === where.userId);
        if (profile) {
          const user = mockUsers.find((u) => u.id === profile.userId);
          return { ...profile, user };
        }
        return null;
      }),
      create: jest.fn(({ data }) => {
        const profile = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
        mockProfiles.push(profile);
        return profile;
      }),
      update: jest.fn(({ where, data }) => {
        const idx = mockProfiles.findIndex((p) => p.userId === where.userId);
        if (idx !== -1) {
          mockProfiles[idx] = { ...mockProfiles[idx], ...data };
          return mockProfiles[idx];
        }
        return null;
      }),
    },
    document: {
      findUnique: jest.fn(({ where }) => {
        const doc = mockDocuments.find((d) => d.id === where.id);
        if (doc) {
          return {
            ...doc,
            versions: mockVersions.filter((v) => v.documentId === doc.id),
            metadata: mockMetadata.find((m) => m.documentId === doc.id),
          };
        }
        return null;
      }),
      findMany: jest.fn(() => mockDocuments),
      count: jest.fn(() => mockDocuments.length),
      create: jest.fn(({ data }) => {
        const doc = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
        mockDocuments.push(doc);
        return doc;
      }),
      update: jest.fn(({ where, data }) => {
        const idx = mockDocuments.findIndex((d) => d.id === where.id);
        if (idx !== -1) {
          mockDocuments[idx] = { ...mockDocuments[idx], ...data };
          return mockDocuments[idx];
        }
        return null;
      }),
    },
    documentVersion: {
      create: jest.fn(({ data }) => {
        const ver = { id: crypto.randomUUID(), ...data, createdAt: new Date() };
        mockVersions.push(ver);
        return ver;
      }),
    },
    documentMetadata: {
      create: jest.fn(({ data }) => {
        const meta = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
        mockMetadata.push(meta);
        return meta;
      }),
      update: jest.fn(({ where, data }) => {
        const idx = mockMetadata.findIndex((m) => m.documentId === where.documentId);
        if (idx !== -1) {
          mockMetadata[idx] = { ...mockMetadata[idx], ...data };
          return mockMetadata[idx];
        }
        return null;
      }),
      updateMany: jest.fn(({ where, data }) => {
        mockMetadata.forEach((m) => {
          if (m.documentId === where.documentId) Object.assign(m, data);
        });
      }),
    },
    healthTimelineEvent: {
      create: jest.fn(({ data }) => data),
      findMany: jest.fn(() => []),
      count: jest.fn(() => 0),
    },
    auditLog: {
      create: jest.fn(({ data }) => {
        const log = { id: crypto.randomUUID(), ...data, timestamp: new Date() };
        mockAuditLogs.push(log);
        return log;
      }),
      findMany: jest.fn(({ where }) => {
        return mockAuditLogs.filter((l) => !where?.actorId || l.actorId === where.actorId);
      }),
    },
    refreshToken: {
      create: jest.fn(({ data }) => {
        const rt = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
        mockRefreshTokens.push(rt);
        return rt;
      }),
      findFirst: jest.fn(({ where }) => {
        const found = mockRefreshTokens.find((r) => r.tokenHash === where.tokenHash);
        if (found) {
          const user = mockUsers.find((u) => u.id === found.userId);
          return { ...found, user };
        }
        return null;
      }),
      update: jest.fn(({ where, data }) => {
        const idx = mockRefreshTokens.findIndex((r) => r.id === where.id);
        if (idx !== -1) {
          mockRefreshTokens[idx] = { ...mockRefreshTokens[idx], ...data };
          return mockRefreshTokens[idx];
        }
        return null;
      }),
      updateMany: jest.fn(({ where, data }) => {
        mockRefreshTokens.forEach((r) => {
          if (r.userId === where.userId) Object.assign(r, data);
        });
      }),
    },
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
  };

  const mockStorageService = {
    validateFile: jest.fn().mockReturnValue({
      isValid: true,
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'sha256-test-hash',
      clean: true,
    }),
    uploadFile: jest.fn().mockResolvedValue('vault/key/test.pdf'),
    getSignedDownloadUrl: jest.fn().mockResolvedValue('https://s3.carepath.internal/signed/test.pdf?sig=test1234'),
    getBucketName: jest.fn().mockReturnValue('carepath-medical-vault'),
    deleteFile: jest.fn().mockResolvedValue(true),
  };

  // Pre-configured test accounts
  const patientA = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'patientA@example.com',
    passwordHash: 'hashed',
    role: Role.PATIENT,
    status: UserStatus.ACTIVE,
  };

  const patientB = {
    id: '22222222-2222-4222-a222-222222222222',
    email: 'patientB@example.com',
    passwordHash: 'hashed',
    role: Role.PATIENT,
    status: UserStatus.ACTIVE,
  };

  const suspendedPatient = {
    id: '33333333-3333-4333-a333-333333333333',
    email: 'suspended@example.com',
    passwordHash: 'hashed',
    role: Role.PATIENT,
    status: UserStatus.SUSPENDED,
  };

  const docOfPatientA = {
    id: '99999999-9999-4999-a999-999999999999',
    patientId: patientA.id,
    uploadedById: patientA.id,
    category: DocumentCategory.LAB_REPORT,
    status: 'READY',
    isArchived: false,
  };

  let tokenPatientA: string;
  let tokenPatientB: string;
  let tokenSuspended: string;

  beforeAll(async () => {
    mockUsers.push(patientA, patientB, suspendedPatient);
    mockProfiles.push(
      { id: 'prof-a', userId: patientA.id, fullName: 'Patient A', city: 'Boston' },
      { id: 'prof-b', userId: patientB.id, fullName: 'Patient B', city: 'Denver' },
      { id: 'prof-s', userId: suspendedPatient.id, fullName: 'Suspended Patient', city: 'Austin' },
    );
    mockDocuments.push(docOfPatientA);
    mockVersions.push({
      id: 'ver-1',
      documentId: docOfPatientA.id,
      versionNumber: 1,
      storageKey: 'vault/patientA/docA.pdf',
      bucket: 'carepath-medical-vault',
      originalFileName: 'docA.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 2048,
    });
    mockMetadata.push({
      id: 'meta-1',
      documentId: docOfPatientA.id,
      reportTitle: 'Patient A Blood Panel',
      documentType: DocumentCategory.LAB_REPORT,
      ocrStatus: 'COMPLETED',
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(StorageService)
      .useValue(mockStorageService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    const configService = moduleFixture.get(ConfigService);
    const jwtSecret = configService.get<string>('jwt.accessSecret');

    tokenPatientA = jwtService.sign(
      { sub: patientA.id, email: patientA.email, role: patientA.role },
      { secret: jwtSecret, expiresIn: '1h' },
    );

    tokenPatientB = jwtService.sign(
      { sub: patientB.id, email: patientB.email, role: patientB.role },
      { secret: jwtSecret, expiresIn: '1h' },
    );

    tokenSuspended = jwtService.sign(
      { sub: suspendedPatient.id, email: suspendedPatient.email, role: suspendedPatient.role },
      { secret: jwtSecret, expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Core Security Requirements Verification', () => {
    // 1. Patient cannot access another patient's document.
    it('Requirement 1: Patient cannot access another patient’s document (403 Forbidden)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/documents/${docOfPatientA.id}`)
        .set('Authorization', `Bearer ${tokenPatientB}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Access denied: You do not own this document');
    });

    // 2. Patient cannot modify another patient's profile.
    it('Requirement 2: Patient cannot modify another patient’s profile', async () => {
      // Patients endpoint only updates the authenticated user's own profile (/patients/me)
      const response = await request(app.getHttpServer())
        .patch('/api/v1/patients/me')
        .set('Authorization', `Bearer ${tokenPatientB}`)
        .send({ fullName: 'Patient B New Name', city: 'Denver Metro' });

      expect(response.status).toBe(200);

      // Verify Patient A profile remained unchanged
      const profileA = mockProfiles.find((p) => p.userId === patientA.id);
      expect(profileA.fullName).toBe('Patient A');
      expect(profileA.city).toBe('Boston');
    });

    // 3. Suspended user cannot access protected resources.
    it('Requirement 3: Suspended user cannot access protected resources (403 Forbidden)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenSuspended}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Your account has been suspended');
    });

    // 4. Invalid token is rejected.
    it('Requirement 4: Invalid token is rejected (401 Unauthorized)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer invalid-garbage-token-string');

      expect(response.status).toBe(401);
    });

    // 5. Expired refresh token is rejected.
    it('Requirement 5: Expired refresh token is rejected (401 Unauthorized)', async () => {
      const rawToken = 'test-expired-token-12345';
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      mockRefreshTokens.push({
        id: 'rt-expired',
        userId: patientA.id,
        tokenHash,
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        isRevoked: false,
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rawToken });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Refresh token has expired');
    });

    // 6. Unauthorized document URL cannot be generated.
    it('Requirement 6: Unauthorized document URL cannot be generated', async () => {
      // Patient B requests Patient A's document
      const response = await request(app.getHttpServer())
        .get(`/api/v1/documents/${docOfPatientA.id}`)
        .set('Authorization', `Bearer ${tokenPatientB}`);

      expect(response.status).toBe(403);
      expect(response.body.signedUrl).toBeUndefined();
    });

    // 7. Every sensitive document access creates an audit event.
    it('Requirement 7: Every sensitive document access creates an audit event', async () => {
      const initialLogCount = mockAuditLogs.length;

      // Patient A views their own document
      const response = await request(app.getHttpServer())
        .get(`/api/v1/documents/${docOfPatientA.id}`)
        .set('Authorization', `Bearer ${tokenPatientA}`);

      expect(response.status).toBe(200);
      expect(response.body.signedUrl).toBeDefined();

      // Check that a new audit log for DOCUMENT_VIEW was created
      expect(mockAuditLogs.length).toBeGreaterThan(initialLogCount);
      const latestAuditLog = mockAuditLogs[mockAuditLogs.length - 1];
      expect(latestAuditLog.action).toBe(AuditAction.DOCUMENT_VIEW);
      expect(latestAuditLog.resourceId).toBe(docOfPatientA.id);
      expect(latestAuditLog.actorId).toBe(patientA.id);
    });

    it('Health check endpoint is publicly accessible', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.milestone).toBe('Milestone 1: Patient Health Vault');
    });
  });
});
