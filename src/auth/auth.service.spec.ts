import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

describe('AuthService (Authentication & Token Security)', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    patientProfile: {
      create: jest.fn(),
    },
    doctorProfile: {
      create: jest.fn(),
    },
    adminProfile: {
      create: jest.fn(),
    },
    verificationToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mocked.jwt.access_token'),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'jwt.accessSecret') return 'test_access_secret';
      if (key === 'jwt.accessExpiration') return '15m';
      return null;
    }),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    jest.clearAllMocks();
  });

  describe('Registration & Password Hashing', () => {
    it('hashes passwords securely and registers a new patient', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockImplementation((args) => ({
        id: 'new-patient-id',
        email: args.data.email,
        passwordHash: args.data.passwordHash,
        role: Role.PATIENT,
        status: UserStatus.ACTIVE,
      }));

      const result = await service.register({
        email: 'patient@example.com',
        password: 'Password123!',
        fullName: 'Jane Doe',
      });

      expect(result.tokens.accessToken).toBe('mocked.jwt.access_token');
      expect(result.tokens.refreshToken).toBeDefined();

      const createdUserCall = mockPrisma.user.create.mock.calls[0][0];
      expect(createdUserCall.data.passwordHash).not.toEqual('Password123!');
      const isHashed = await bcrypt.compare('Password123!', createdUserCall.data.passwordHash);
      expect(isHashed).toBe(true);
    });

    it('rejects duplicate email registrations with ConflictException', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          email: 'duplicate@example.com',
          password: 'Password123!',
          fullName: 'Jane Doe',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Login & Status Checks', () => {
    it('authenticates active user with correct password', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword123!', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'valid@example.com',
        passwordHash,
        role: Role.PATIENT,
        status: UserStatus.ACTIVE,
      });

      const response = await service.login({
        email: 'valid@example.com',
        password: 'CorrectPassword123!',
      });

      expect(response.tokens.accessToken).toBe('mocked.jwt.access_token');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN', result: 'SUCCESS' }),
      );
    });

    it('Requirement 4 (part): rejects login with incorrect password', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword123!', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'valid@example.com',
        passwordHash,
        role: Role.PATIENT,
        status: UserStatus.ACTIVE,
      });

      await expect(
        service.login({
          email: 'valid@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN', result: 'FAILURE' }),
      );
    });

    it('Requirement 3 (part): prevents suspended user from logging in', async () => {
      const passwordHash = await bcrypt.hash('CorrectPassword123!', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'suspended-user',
        email: 'suspended@example.com',
        passwordHash,
        role: Role.PATIENT,
        status: UserStatus.SUSPENDED,
      });

      await expect(
        service.login({
          email: 'suspended@example.com',
          password: 'CorrectPassword123!',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Refresh Token Architecture & Requirements', () => {
    it('Requirement 5: Expired refresh token is rejected', async () => {
      const expiredSession = {
        id: 'session-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 10000), // Expired 10 seconds ago
        isRevoked: false,
        user: { id: 'user-1', email: 'user@example.com', role: Role.PATIENT },
      };

      mockPrisma.refreshToken.findFirst.mockResolvedValue(expiredSession);

      await expect(service.refreshTokens('some-raw-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshTokens('some-raw-token')).rejects.toThrow(
        'Refresh token has expired',
      );
    });

    it('Requirement 4 (part): Invalid refresh token is rejected', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refreshTokens('invalid-non-existent-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshTokens('invalid-non-existent-token')).rejects.toThrow(
        'Invalid or expired refresh token',
      );
    });

    it('Detects token reuse on revoked refresh token and invalidates all user sessions', async () => {
      const revokedSession = {
        id: 'session-compromised',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 100000),
        isRevoked: true, // Already used / revoked
        user: { id: 'user-1', email: 'user@example.com', role: Role.PATIENT },
      };

      mockPrisma.refreshToken.findFirst.mockResolvedValue(revokedSession);

      await expect(service.refreshTokens('reused-token')).rejects.toThrow(
        UnauthorizedException,
      );

      // Verify all tokens for this user were revoked
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { isRevoked: true },
      });

      // Verify security event audit log
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SECURITY_EVENT', result: 'DENIED' }),
      );
    });

    it('Rotates valid refresh token: revokes old token and issues fresh pair', async () => {
      const validSession = {
        id: 'session-valid',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 100000),
        isRevoked: false,
        user: { id: 'user-1', email: 'user@example.com', role: Role.PATIENT },
      };

      mockPrisma.refreshToken.findFirst.mockResolvedValue(validSession);

      const newTokens = await service.refreshTokens('valid-refresh-token');

      expect(newTokens.accessToken).toBe('mocked.jwt.access_token');
      expect(newTokens.refreshToken).toBeDefined();

      // Old token was revoked
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'session-valid' },
        data: { isRevoked: true },
      });
    });
  });
});
