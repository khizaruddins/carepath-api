import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { StorageModule } from '../storage/storage.module';
import { QueueModule } from '../queue/queue.module';
import { OcrModule } from '../ocr/ocr.module';
import { AccessControlService } from '../common/services/access-control.service';
import { TimelineModule } from '../timeline/timeline.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [StorageModule, QueueModule, OcrModule, NotificationsModule, TimelineModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, AccessControlService],
  exports: [DocumentsService, AccessControlService],
})
export class DocumentsModule {}
