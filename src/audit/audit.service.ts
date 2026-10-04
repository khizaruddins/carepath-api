import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateAuditLogParams } from './dto/create-audit-log.dto';
import { AuditResult } from '@prisma/client';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(params: CreateAuditLogParams) {
    try {
      const sanitizedDetails = this.sanitizeDetails(params.details);

      const logEntry = await this.prisma.auditLog.create({
        data: {
          actorId: params.actorId || null,
          actorEmail: params.actorEmail || null,
          actorRole: params.actorRole || null,
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId || null,
          result: params.result || AuditResult.SUCCESS,
          ipAddress: params.ipAddress || null,
          userAgent: params.userAgent || null,
          details: sanitizedDetails || {},
        },
      });

      return logEntry;
    } catch (error) {
      this.logger.error(`Failed to record audit log: ${error.message}`, error.stack);
      // We do not throw here to prevent auditing failure from crashing main operations,
      // but in compliance critical environments it is safely logged.
    }
  }

  async getMyAuditLogs(userId: string, limit = 50, offset = 0) {
    return this.prisma.auditLog.findMany({
      where: {
        actorId: userId,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: Math.min(limit, 100),
      skip: offset,
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        result: true,
        ipAddress: true,
        userAgent: true,
        timestamp: true,
        details: true,
      },
    });
  }

  private sanitizeDetails(details?: Record<string, any>): Record<string, any> | undefined {
    if (!details) return undefined;
    const sanitized = { ...details };
    const sensitiveKeys = ['password', 'token', 'refreshToken', 'secret', 'authorization', 'ocrText', 'content'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    return sanitized;
  }
}
