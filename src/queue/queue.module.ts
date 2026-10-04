import { Module } from '@nestjs/common';
import { DocumentQueueService } from './queue.service';
import { OcrModule } from '../ocr/ocr.module';

@Module({
  imports: [OcrModule],
  providers: [DocumentQueueService],
  exports: [DocumentQueueService],
})
export class QueueModule {}
