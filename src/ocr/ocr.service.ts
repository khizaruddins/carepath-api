import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { OcrProvider, OCR_PROVIDER_TOKEN, OcrInput, OcrResult } from './ocr.interface';
import { DocumentProcessingStatus, OcrStatus, TimelineEventType } from '@prisma/client';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    @Inject(OCR_PROVIDER_TOKEN) private readonly ocrProvider: OcrProvider,
    private readonly prisma: PrismaService,
  ) {}

  async processDocumentOcr(input: OcrInput): Promise<OcrResult> {
    this.logger.log(`Processing OCR for document: ${input.documentId}`);

    // Update document status to PROCESSING_OCR
    await this.prisma.document.update({
      where: { id: input.documentId },
      data: { status: DocumentProcessingStatus.PROCESSING_OCR },
    });

    await this.prisma.documentMetadata.updateMany({
      where: { documentId: input.documentId },
      data: { ocrStatus: OcrStatus.IN_PROGRESS },
    });

    try {
      const result = await this.ocrProvider.processDocument(input);

      if (result.success) {
        // Update DocumentMetadata with raw OCR text and extracted structured metadata
        // Keep raw text, extracted metadata, and original document separate
        await this.prisma.documentMetadata.updateMany({
          where: { documentId: input.documentId },
          data: {
            rawOcrText: result.rawText,
            extractedData: result.extractedData as any,
            reportTitle: result.extractedData.reportTitle,
            providerName: result.extractedData.providerName,
            facility: result.extractedData.facility,
            documentDate: result.extractedData.documentDate ? new Date(result.extractedData.documentDate) : undefined,
            ocrStatus: OcrStatus.COMPLETED,
            isPatientConfirmed: false,
          },
        });

        // Update document status to READY
        const doc = await this.prisma.document.update({
          where: { id: input.documentId },
          data: { status: DocumentProcessingStatus.READY },
        });

        // Add timeline event
        await this.prisma.healthTimelineEvent.create({
          data: {
            patientId: doc.patientId,
            documentId: doc.id,
            eventType: TimelineEventType.DOCUMENT_UPLOADED,
            title: `Document Processed: ${result.extractedData.reportTitle || 'Medical Document'}`,
            description: `Document "${input.fileName}" uploaded and OCR completed. Ready for patient review.`,
            metadata: {
              category: doc.category,
              provider: result.extractedData.providerName,
              facility: result.extractedData.facility,
            },
          },
        });

        this.logger.log(`OCR processing completed successfully for document: ${input.documentId}`);
        return result;
      } else {
        await this.handleOcrFailure(input.documentId, result.errorMessage || 'OCR processing failed');
        return result;
      }
    } catch (error: any) {
      this.logger.error(`Error during OCR processing: ${error.message}`, error.stack);
      await this.handleOcrFailure(input.documentId, error.message);
      throw error;
    }
  }

  private async handleOcrFailure(documentId: string, reason: string) {
    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentProcessingStatus.READY }, // Document is still viewable even if OCR fails
    });

    await this.prisma.documentMetadata.updateMany({
      where: { documentId },
      data: {
        ocrStatus: OcrStatus.FAILED,
        patientNotes: `Automated OCR note: Could not automatically extract text (${reason}). Manual review possible.`,
      },
    });
  }
}
