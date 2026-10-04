import { AuditAction, AuditResult } from '@prisma/client';

export interface CreateAuditLogParams {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  result?: AuditResult;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
}
