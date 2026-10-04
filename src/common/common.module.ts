import { Module, Global } from '@nestjs/common';
import { AccessControlService } from './services/access-control.service';
import { ConsentAuthorizationService } from './services/consent-authorization.service';
import { DatabaseModule } from '../database/database.module';
import { AuditModule } from '../audit/audit.module';

@Global()
@Module({
  imports: [DatabaseModule, AuditModule],
  providers: [AccessControlService, ConsentAuthorizationService],
  exports: [AccessControlService, ConsentAuthorizationService],
})
export class CommonModule {}
