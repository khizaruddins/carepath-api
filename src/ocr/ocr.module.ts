import { Module } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { MockOcrProvider } from './mock-ocr.provider';
import { OCR_PROVIDER_TOKEN } from './ocr.interface';

@Module({
  providers: [
    OcrService,
    {
      provide: OCR_PROVIDER_TOKEN,
      useClass: MockOcrProvider,
    },
  ],
  exports: [OcrService, OCR_PROVIDER_TOKEN],
})
export class OcrModule {}
