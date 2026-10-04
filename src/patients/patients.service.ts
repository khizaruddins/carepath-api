import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { AuditAction, AuditResult } from '@prisma/client';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getMyProfile(userId: string, ip?: string, userAgent?: string) {
    const profile = await this.prisma.patientProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            isEmailVerified: true,
            phoneNumber: true,
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Patient profile not found for current user');
    }

    await this.auditService.log({
      actorId: userId,
      actorEmail: profile.user.email,
      actorRole: profile.user.role,
      action: AuditAction.PROFILE_VIEW,
      resourceType: 'PATIENT_PROFILE',
      resourceId: profile.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
    });

    return profile;
  }

  async updateMyProfile(
    userId: string,
    dto: UpdatePatientProfileDto,
    ip?: string,
    userAgent?: string,
  ) {
    const profile = await this.prisma.patientProfile.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!profile) {
      throw new NotFoundException('Patient profile not found for current user');
    }

    const updated = await this.prisma.patientProfile.update({
      where: { userId },
      data: {
        fullName: dto.fullName ?? undefined,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender ?? undefined,
        mobile: dto.mobile ?? undefined,
        email: dto.email ?? undefined,
        city: dto.city ?? undefined,
        bloodGroup: dto.bloodGroup ?? undefined,
        emergencyContactName: dto.emergencyContactName ?? undefined,
        emergencyContactPhone: dto.emergencyContactPhone ?? undefined,
        emergencyContactRelation: dto.emergencyContactRelation ?? undefined,
        knownConditions: dto.knownConditions ?? undefined,
        allergies: dto.allergies ?? undefined,
        currentMedications: dto.currentMedications ?? undefined,
        pastSurgeries: dto.pastSurgeries ?? undefined,
        importantMedicalHistory: dto.importantMedicalHistory ?? undefined,
      },
    });

    await this.auditService.log({
      actorId: userId,
      actorEmail: profile.user.email,
      actorRole: profile.user.role,
      action: AuditAction.PROFILE_UPDATE,
      resourceType: 'PATIENT_PROFILE',
      resourceId: profile.id,
      result: AuditResult.SUCCESS,
      ipAddress: ip,
      userAgent,
      details: {
        updatedFields: Object.keys(dto),
      },
    });

    return updated;
  }
}
