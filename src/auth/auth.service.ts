import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { SendOtpDto, VerifyOtpDto } from './dto/otp.dto';
import {
  Role,
  UserStatus,
  AuditAction,
  AuditResult,
  VerificationTokenType,
} from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Register a new user with secure password hashing and profile creation
   */
  async register(dto: RegisterDto, ip?: string, userAgent?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('An account with this email address already exists');
    }

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const userRole = dto.role || Role.PATIENT;

    // Transaction to create User, Profile, and Verification Token atomically
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          role: userRole,
          status: UserStatus.ACTIVE, // Created as active, can also require email verification
          isEmailVerified: false,
          phoneNumber: dto.phoneNumber,
        },
      });

      // Role-specific profile initialization
      if (userRole === Role.PATIENT) {
        await tx.patientProfile.create({
          data: {
            userId: user.id,
            fullName: dto.fullName,
            email: user.email,
            mobile: dto.phoneNumber,
          },
        });
      } else if (userRole === Role.DOCTOR) {
        await tx.doctorProfile.create({
          data: {
            userId: user.id,
            fullName: dto.fullName,
          },
        });
      } else if (userRole === Role.ADMIN) {
        await tx.adminProfile.create({
          data: {
            userId: user.id,
            fullName: dto.fullName,
          },
        });
      }

      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      await tx.verificationToken.create({
        data: {
          userId: user.id,
          token: verificationToken,
          type: VerificationTokenType.EMAIL_VERIFICATION,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });

      return { user, verificationToken };
    });

    await this.auditService.log({
      actorId: result.user.id,
      actorEmail: result.user.email,
      actorRole: result.user.role,
      action: AuditAction.USER_REGISTER,
      resourceType: 'USER',
      resourceId: result.user.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: { role: userRole },
    });

    const tokens = await this.generateTokens(result.user, ip, userAgent);

    return {
      message: 'Registration successful',
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        status: result.user.status,
      },
      tokens,
      verificationToken: result.verificationToken,
    };
  }

  /**
   * Authenticate user with email and password
   */
  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        patientProfile: { select: { id: true } },
        doctorProfile: { select: { id: true } },
        adminProfile: { select: { id: true } },
      },
    });

    if (!user) {
      await this.auditService.log({
        actorEmail: dto.email.toLowerCase(),
        action: AuditAction.LOGIN,
        resourceType: 'AUTH',
        result: AuditResult.FAILURE,
        ipAddress: ip,
        userAgent,
        details: { reason: 'User not found' },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      await this.auditService.log({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: AuditAction.LOGIN,
        resourceType: 'AUTH',
        resourceId: user.id,
        result: AuditResult.FAILURE,
        ipAddress: ip,
        userAgent,
        details: { reason: 'Password mismatch' },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === UserStatus.SUSPENDED) {
      await this.auditService.log({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: AuditAction.LOGIN,
        resourceType: 'AUTH',
        resourceId: user.id,
        result: AuditResult.DENIED,
        ipAddress: ip,
        userAgent,
        details: { reason: 'Account suspended' },
      });
      throw new ForbiddenException('Your account has been suspended. Please contact support.');
    }

    if (user.status === UserStatus.DEACTIVATED) {
      throw new ForbiddenException('Your account is deactivated.');
    }

    const tokens = await this.generateTokens(user, ip, userAgent);

    await this.auditService.log({
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: AuditAction.LOGIN,
      resourceType: 'AUTH',
      resourceId: user.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
    });

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        patientProfileId: user.patientProfile?.id,
        doctorProfileId: user.doctorProfile?.id,
        adminProfileId: user.adminProfile?.id,
      },
      tokens,
    };
  }

  /**
   * Rotate and refresh access token using a valid refresh token
   */
  async refreshTokens(rawRefreshToken: string, ip?: string, userAgent?: string) {
    const tokenHash = this.hashToken(rawRefreshToken);

    const session = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (session.isRevoked) {
      // Security: Refresh token reuse detected! Revoke all tokens for this user
      await this.prisma.refreshToken.updateMany({
        where: { userId: session.userId },
        data: { isRevoked: true },
      });

      await this.auditService.log({
        actorId: session.userId,
        action: AuditAction.SECURITY_EVENT,
        resourceType: 'REFRESH_TOKEN',
        resourceId: session.id,
        result: AuditResult.DENIED,
        ipAddress: ip,
        userAgent,
        details: { reason: 'Revoked refresh token reuse detected - revoked all user sessions' },
      });

      throw new UnauthorizedException('Invalid refresh token. All active sessions invalidated.');
    }

    if (new Date() > session.expiresAt) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Revoke old token as part of rotation
    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });

    // Generate new token pair
    const tokens = await this.generateTokens(session.user, ip, userAgent);

    await this.auditService.log({
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: session.user.role,
      action: AuditAction.REFRESH_TOKEN,
      resourceType: 'AUTH',
      resourceId: session.user.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
    });

    return tokens;
  }

  /**
   * Invalidate session / refresh token on logout
   */
  async logout(userId: string, rawRefreshToken?: string, ip?: string, userAgent?: string) {
    if (rawRefreshToken) {
      const tokenHash = this.hashToken(rawRefreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, userId },
        data: { isRevoked: true },
      });
    } else {
      // Revoke all sessions for this user
      await this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { isRevoked: true },
      });
    }

    await this.auditService.log({
      actorId: userId,
      action: AuditAction.LOGOUT,
      resourceType: 'AUTH',
      resourceId: userId,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
    });

    return { message: 'Successfully logged out' };
  }

  /**
   * Request password reset token
   */
  async forgotPassword(dto: ForgotPasswordDto, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    let resetToken = '';

    if (user) {
      resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: resetToken,
          expiresAt,
        },
      });

      await this.auditService.log({
        actorId: user.id,
        actorEmail: user.email,
        action: AuditAction.SECURITY_EVENT,
        resourceType: 'USER',
        resourceId: user.id,
        result: AuditResult.SUCCESS,
        ipAddress: ip,
        userAgent,
        details: { action: 'FORGOT_PASSWORD_REQUEST' },
      });
    }

    return {
      message: 'If an account exists with this email, a password reset link has been dispatched.',
      // Provided in response for development and integration test convenience
      resetToken: process.env.NODE_ENV !== 'production' ? resetToken : undefined,
    };
  }

  /**
   * Complete password reset
   */
  async resetPassword(dto: ResetPasswordDto, ip?: string, userAgent?: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
      include: { user: true },
    });

    if (!record || record.consumedAt || new Date() > record.expiresAt) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(dto.newPassword, saltRounds);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash: newPasswordHash },
      });

      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });

      // Revoke all existing sessions after password reset
      await tx.refreshToken.updateMany({
        where: { userId: record.userId },
        data: { isRevoked: true },
      });
    });

    await this.auditService.log({
      actorId: record.user.id,
      actorEmail: record.user.email,
      actorRole: record.user.role,
      action: AuditAction.PASSWORD_CHANGE,
      resourceType: 'USER',
      resourceId: record.user.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
    });

    return { message: 'Password has been successfully updated' };
  }

  /**
   * Verify email address
   */
  async verifyEmail(dto: VerifyEmailDto, ip?: string, userAgent?: string) {
    const record = await this.prisma.verificationToken.findUnique({
      where: { token: dto.token },
      include: { user: true },
    });

    if (!record || record.consumedAt || new Date() > record.expiresAt) {
      throw new BadRequestException('Invalid or expired email verification token');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: {
          isEmailVerified: true,
          status: UserStatus.ACTIVE,
        },
      });

      await tx.verificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
    });

    await this.auditService.log({
      actorId: record.user.id,
      actorEmail: record.user.email,
      actorRole: record.user.role,
      action: AuditAction.SECURITY_EVENT,
      resourceType: 'USER',
      resourceId: record.user.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: { action: 'EMAIL_VERIFIED' },
    });

    return { message: 'Email verified successfully. Your account is now active.' };
  }

  /**
   * Mobile / OTP architecture hooks (extensible for SMS gateways like Twilio/AWS SNS)
   */
  async sendOtp(dto: SendOtpDto) {
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    this.logger.log(`[OTP STUB] Generated OTP ${otpCode} for phone: ${dto.phoneNumber}`);
    return {
      message: 'OTP sent successfully',
      expiresInSeconds: 300,
      // For local testing convenience
      devOtp: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    // Stub implementation verifying 6-digit pattern
    return {
      message: 'Phone number verified successfully',
      phoneNumber: dto.phoneNumber,
      verified: true,
    };
  }

  /**
   * Generate access token and cryptographically secure refresh token
   */
  private async generateTokens(user: { id: string; email: string; role: string }, ip?: string, userAgent?: string) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: this.configService.get<string>('jwt.accessExpiration') || '15m',
    });

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);

    const refreshDays = 7;
    const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: ip,
        userAgent,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: 900, // 15 mins
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
