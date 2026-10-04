import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TimelineSourceType } from '@prisma/client';

export interface ResolvedSourceDetails {
  sourceType: TimelineSourceType;
  sourceId: string;
  sourceData: Record<string, any>;
}

@Injectable()
export class TimelineEventResolverService {
  private readonly logger = new Logger(TimelineEventResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves permitted source entity content for a specific timeline projection
   */
  async resolveSource(
    sourceType: TimelineSourceType,
    sourceId: string,
  ): Promise<ResolvedSourceDetails | null> {
    if (!sourceId) return null;

    switch (sourceType) {
      case TimelineSourceType.DOCUMENT:
        return this.resolveDocument(sourceId);
      case TimelineSourceType.CONSULTATION:
        return this.resolveConsultation(sourceId);
      case TimelineSourceType.PRESCRIPTION:
        return this.resolvePrescription(sourceId);
      case TimelineSourceType.INVESTIGATION:
        return this.resolveInvestigation(sourceId);
      case TimelineSourceType.REFERRAL:
        return this.resolveReferral(sourceId);
      case TimelineSourceType.FOLLOW_UP:
        return this.resolveFollowUp(sourceId);
      case TimelineSourceType.LAB_RESULT:
        return this.resolveLabResult(sourceId);
      default:
        return {
          sourceType,
          sourceId,
          sourceData: {},
        };
    }
  }

  private async resolveDocument(documentId: string): Promise<ResolvedSourceDetails | null> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        metadata: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            versionNumber: true,
            originalFileName: true,
            mimeType: true,
            fileSizeBytes: true,
            createdAt: true,
          },
        },
      },
    });

    if (!document) return null;

    return {
      sourceType: TimelineSourceType.DOCUMENT,
      sourceId: documentId,
      sourceData: {
        id: document.id,
        category: document.category,
        status: document.status,
        isArchived: document.isArchived,
        createdAt: document.createdAt,
        documentDate: document.metadata?.documentDate,
        reportTitle: document.metadata?.reportTitle,
        providerName: document.metadata?.providerName,
        facility: document.metadata?.facility,
        patientNotes: document.metadata?.patientNotes,
        ocrStatus: document.metadata?.ocrStatus,
        version: document.versions[0] || null,
      },
    };
  }

  private async resolveConsultation(consultationId: string): Promise<ResolvedSourceDetails | null> {
    const consult = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: {
              select: {
                fullName: true,
                specialization: true,
                hospitalAffiliation: true,
              },
            },
          },
        },
      },
    });

    if (!consult) return null;

    return {
      sourceType: TimelineSourceType.CONSULTATION,
      sourceId: consultationId,
      sourceData: {
        id: consult.id,
        consultationDate: consult.consultationDate,
        reasonForVisit: consult.reasonForVisit,
        chiefComplaint: consult.chiefComplaint,
        assessment: consult.assessment,
        plan: consult.plan,
        followUpDate: consult.followUpDate,
        followUpInstructions: consult.followUpInstructions,
        attachments: consult.attachments,
        doctor: {
          id: consult.doctor.id,
          name: consult.doctor.doctorProfile?.fullName || consult.doctor.email,
          specialty: consult.doctor.doctorProfile?.specialization,
          hospital: consult.doctor.doctorProfile?.hospitalAffiliation,
        },
      },
    };
  }

  private async resolvePrescription(prescriptionId: string): Promise<ResolvedSourceDetails | null> {
    const rx = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        items: true,
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: {
              select: {
                fullName: true,
                specialization: true,
              },
            },
          },
        },
      },
    });

    if (!rx) return null;

    return {
      sourceType: TimelineSourceType.PRESCRIPTION,
      sourceId: prescriptionId,
      sourceData: {
        id: rx.id,
        prescriptionDate: rx.prescriptionDate,
        notes: rx.notes,
        items: rx.items.map((item) => ({
          medicineName: item.medicineName,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          instructions: item.instructions,
        })),
        doctor: {
          id: rx.doctor.id,
          name: rx.doctor.doctorProfile?.fullName || rx.doctor.email,
          specialty: rx.doctor.doctorProfile?.specialization,
        },
      },
    };
  }

  private async resolveInvestigation(investigationId: string): Promise<ResolvedSourceDetails | null> {
    const inv = await this.prisma.investigationRequest.findUnique({
      where: { id: investigationId },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: { select: { fullName: true } },
          },
        },
      },
    });

    if (!inv) return null;

    return {
      sourceType: TimelineSourceType.INVESTIGATION,
      sourceId: investigationId,
      sourceData: {
        id: inv.id,
        investigationName: inv.investigationName,
        category: inv.category,
        reason: inv.reason,
        priority: inv.priority,
        status: inv.status,
        requestedDate: inv.requestedDate,
        doctor: {
          id: inv.doctor.id,
          name: inv.doctor.doctorProfile?.fullName || inv.doctor.email,
        },
      },
    };
  }

  private async resolveReferral(referralId: string): Promise<ResolvedSourceDetails | null> {
    const ref = await this.prisma.referral.findUnique({
      where: { id: referralId },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: { select: { fullName: true } },
          },
        },
      },
    });

    if (!ref) return null;

    return {
      sourceType: TimelineSourceType.REFERRAL,
      sourceId: referralId,
      sourceData: {
        id: ref.id,
        specialty: ref.specialty,
        referredProvider: ref.referredProvider,
        reason: ref.reason,
        priority: ref.priority,
        status: ref.status,
        referralDate: ref.referralDate,
        doctor: {
          id: ref.doctor.id,
          name: ref.doctor.doctorProfile?.fullName || ref.doctor.email,
        },
      },
    };
  }

  private async resolveFollowUp(followUpId: string): Promise<ResolvedSourceDetails | null> {
    const fu = await this.prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            doctorProfile: { select: { fullName: true } },
          },
        },
      },
    });

    if (!fu) return null;

    return {
      sourceType: TimelineSourceType.FOLLOW_UP,
      sourceId: followUpId,
      sourceData: {
        id: fu.id,
        dueDate: fu.dueDate,
        reason: fu.reason,
        instructions: fu.instructions,
        status: fu.status,
        completedAt: fu.completedAt,
        doctor: {
          id: fu.doctor.id,
          name: fu.doctor.doctorProfile?.fullName || fu.doctor.email,
        },
      },
    };
  }

  private async resolveLabResult(reportId: string): Promise<ResolvedSourceDetails | null> {
    const report = await this.prisma.labReport.findUnique({
      where: { id: reportId },
      include: {
        order: {
          include: {
            lab: true,
            items: true,
            prescribedDoctor: {
              select: {
                id: true,
                email: true,
                doctorProfile: { select: { fullName: true } },
              },
            },
          },
        },
        document: {
          select: {
            id: true,
            category: true,
            status: true,
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
              select: {
                originalFileName: true,
                mimeType: true,
                fileSizeBytes: true,
              },
            },
          },
        },
        verifiedBy: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!report) return null;

    return {
      sourceType: TimelineSourceType.LAB_RESULT,
      sourceId: reportId,
      sourceData: {
        id: report.id,
        reportNumber: report.reportNumber,
        status: report.status,
        testSummary: report.testSummary,
        clinicalNotes: report.clinicalNotes,
        finalizedAt: report.finalizedAt,
        isAmended: report.isAmended,
        amendedReason: report.amendedReason,
        lab: {
          id: report.order.lab.id,
          name: report.order.lab.name,
          licenseNumber: report.order.lab.licenseNumber,
        },
        order: {
          id: report.order.id,
          orderNumber: report.order.orderNumber,
          collectionMode: report.order.collectionMode,
          items: report.order.items.map((i) => ({
            testName: i.testName,
            testCode: i.testCode,
          })),
        },
        document: report.document
          ? {
              id: report.document.id,
              status: report.document.status,
              version: report.document.versions[0] || null,
            }
          : null,
      },
    };
  }
}

