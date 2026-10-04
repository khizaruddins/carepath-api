import { Injectable, Logger } from '@nestjs/common';
import { OcrService } from '../ocr/ocr.service';
import { OcrInput } from '../ocr/ocr.interface';

@Injectable()
export class DocumentQueueService {
  private readonly logger = new Logger(DocumentQueueService.name);

  constructor(private readonly ocrService: OcrService) {}

  /**
   * Dispatches OCR processing asynchronously
   */
  async dispatchOcrJob(input: OcrInput): Promise<void> {
    this.logger.log(`Dispatching OCR job for document: ${input.documentId}`);

    // Asynchronous dispatch so upload request finishes immediately
    setImmediate(async () => {
      try {
        await this.ocrService.processDocumentOcr(input);
      } catch (err: any) {
        this.logger.error(`Async OCR Job failed: ${err.message}`, err.stack);
      }
    });
  }
}
