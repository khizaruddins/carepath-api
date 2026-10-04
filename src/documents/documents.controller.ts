import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentMetadataDto } from './dto/update-document-metadata.dto';
import { FilterDocumentsDto } from './dto/filter-documents.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserStatusGuard } from '../common/guards/user-status.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role, RestoreRequestStatus } from '@prisma/client';

@ApiTags('Documents')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, UserStatusGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @Roles(Role.PATIENT, Role.ADMIN)
  @ApiOperation({ summary: 'Upload a medical document (PDF, JPG, JPEG, PNG)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'category'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document file (PDF, JPG, JPEG, PNG, max 25MB)',
        },
        category: {
          type: 'string',
          enum: [
            'LAB_REPORT',
            'PRESCRIPTION',
            'CONSULTATION',
            'DISCHARGE_SUMMARY',
            'IMAGING_REPORT',
            'XRAY',
            'CT',
            'MRI',
            'OTHER',
          ],
        },
        reportTitle: { type: 'string' },
        providerName: { type: 'string' },
        facility: { type: 'string' },
        documentDate: { type: 'string', format: 'date' },
        patientNotes: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Document uploaded and queued for processing' })
  @ApiResponse({ status: 400, description: 'Invalid file type, size, or missing category' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @Req() req: Request,
  ) {
    return this.documentsService.uploadDocument(
      user,
      file,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get()
  @ApiOperation({ summary: 'List medical documents with filters' })
  @ApiResponse({ status: 200, description: 'List of documents' })
  async getDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: FilterDocumentsDto,
  ) {
    return this.documentsService.getDocuments(user, filters);
  }

  @Get('archived')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'List archived/soft-deleted documents for the authenticated patient' })
  @ApiResponse({ status: 200, description: 'List of archived documents' })
  async getArchivedDocuments(@CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.getArchivedDocuments(user);
  }

  @Get('admin/restore-requests')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin lists document restore requests with optional status filter' })
  @ApiQuery({ name: 'status', enum: RestoreRequestStatus, required: false })
  @ApiResponse({ status: 200, description: 'List of restore requests' })
  async getAdminRestoreRequests(@Query('status') status?: RestoreRequestStatus) {
    return this.documentsService.getAdminRestoreRequests(status);
  }

  @Patch('admin/restore-requests/:requestId/review')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin approves or rejects a restoration ticket with reasons' })
  @ApiParam({ name: 'requestId', format: 'uuid', description: 'Restoration Request UUID' })
  async reviewRestoreRequest(
    @CurrentUser() adminUser: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Body() dto: { status: 'APPROVED' | 'REJECTED'; adminNotes?: string; rejectionReason?: string },
    @Req() req: Request,
  ) {
    return this.documentsService.reviewDocumentRestore(
      adminUser,
      requestId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Patch('admin/:id/restore')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin approves and restores an archived document' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Document UUID' })
  async restoreDocument(
    @CurrentUser() adminUser: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: Request,
  ) {
    return this.documentsService.restoreDocument(adminUser, id, req.ip, req.headers['user-agent']);
  }

  @Get(':id/download')
  @ApiOperation({
    summary:
      'Download document file. Strictly blocked and audited for clinicians (view-only policy).',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Document UUID' })
  async downloadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: Request,
  ) {
    return this.documentsService.downloadDocument(user, id, req.ip, req.headers['user-agent']);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get document metadata and generate short-lived signed URL (creates audit event)',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Document UUID' })
  @ApiResponse({ status: 200, description: 'Document details and temporary signed URL' })
  @ApiResponse({ status: 403, description: 'Forbidden: Document belongs to another patient' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getDocumentById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: Request,
  ) {
    return this.documentsService.getDocumentById(user, id, req.ip, req.headers['user-agent']);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update document metadata or confirm/edit OCR extracted data' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Document UUID' })
  @ApiResponse({ status: 200, description: 'Metadata updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: Not your document' })
  async updateDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateDocumentMetadataDto,
    @Req() req: Request,
  ) {
    return this.documentsService.updateDocument(user, id, dto, req.ip, req.headers['user-agent']);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive a medical document' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Document UUID' })
  @ApiResponse({ status: 200, description: 'Document archived' })
  @ApiResponse({ status: 403, description: 'Forbidden: Not your document' })
  async deleteDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: Request,
  ) {
    return this.documentsService.deleteDocument(user, id, req.ip, req.headers['user-agent']);
  }

  @Post(':id/restore-request')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient requests administrator restoration for an archived document' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Document UUID' })
  async requestDocumentRestore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body('reason') reason: string,
    @Req() req: Request,
  ) {
    return this.documentsService.requestDocumentRestore(user, id, reason, req.ip, req.headers['user-agent']);
  }

  @Post(':id/restore-cancel')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient cancels their pending restoration request' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Document UUID' })
  async cancelDocumentRestore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: Request,
  ) {
    return this.documentsService.cancelDocumentRestore(user, id, req.ip, req.headers['user-agent']);
  }
}
