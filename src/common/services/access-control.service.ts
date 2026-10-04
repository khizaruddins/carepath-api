import { Injectable, ForbiddenException, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConsentAuthorizationService } from './consent-authorization.service';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { Role, ConsentResourceType } from '@prisma/client';

@Injectable()
export class AccessControlService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly consentAuthService?: ConsentAuthorizationService,
  ) {}

  /**
   * Centralized check for document access
   */
  async assertCanAccessDocument(
    user: AuthenticatedUser,
    documentId: string,
    action: 'VIEW' | 'DOWNLOAD' = 'VIEW',
    ip?: string,
    userAgent?: string,
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { versions: true, metadata: true },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID "${documentId}" not found`);
    }

    if (this.consentAuthService) {
      await this.consentAuthService.authorize({
        actorId: user.id,
        actorRole: user.role,
        actorEmail: user.email,
        patientId: document.patientId,
        resourceType: ConsentResourceType.DOCUMENT,
        resourceId: document.id,
        action,
        ipAddress: ip,
        userAgent,
      });
      return document;
    }

    // Fallback checks
    if (user.role === Role.ADMIN) {
      return document;
    }

    if (user.role === Role.PATIENT) {
      if (document.patientId !== user.id) {
        throw new ForbiddenException('Access denied: You do not own this document');
      }
      return document;
    }

    if (user.role === Role.DOCTOR) {
      if (document.patientId === user.id) {
        return document;
      }

      const access = await this.prisma.doctorPatientAccess.findFirst({
        where: {
          doctorId: user.id,
          patientId: document.patientId,
          status: 'APPROVED',
        },
      });

      if (access) {
        return document;
      }

      throw new ForbiddenException(
        'Access denied: Patient has not granted consent to view this record',
      );
    }

    if (user.role === Role.LAB) {
      const report = await this.prisma.labReport.findFirst({
        where: {
          documentId,
          order: {
            lab: {
              memberships: {
                some: { userId: user.id, status: 'ACTIVE' },
              },
            },
          },
        },
      });

      if (report) {
        return document;
      }

      throw new ForbiddenException(
        'Access denied: Laboratory personnel can only access documents linked to their own reports',
      );
    }

    throw new ForbiddenException('Access denied: Insufficient privileges');
  }

  /**
   * Centralized check for modifying patient profile
   */
  assertCanModifyProfile(user: AuthenticatedUser, targetUserId: string) {
    if (user.role === Role.ADMIN) {
      return true;
    }

    if (user.id !== targetUserId) {
      throw new ForbiddenException('Access denied: You cannot modify another user’s profile');
    }

    return true;
  }
}
