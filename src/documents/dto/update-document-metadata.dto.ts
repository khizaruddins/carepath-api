import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { DocumentCategory } from '@prisma/client';

export class UpdateDocumentMetadataDto {
  @ApiPropertyOptional({ enum: DocumentCategory })
  @IsEnum(DocumentCategory)
  @IsOptional()
  category?: DocumentCategory;

  @ApiPropertyOptional({ example: 'Updated Report Title' })
  @IsString()
  @IsOptional()
  reportTitle?: string;

  @ApiPropertyOptional({ example: 'Dr. Sarah Connor' })
  @IsString()
  @IsOptional()
  providerName?: string;

  @ApiPropertyOptional({ example: 'Metro General Diagnostic' })
  @IsString()
  @IsOptional()
  facility?: string;

  @ApiPropertyOptional({ example: '2026-09-20' })
  @IsDateString()
  @IsOptional()
  documentDate?: string;

  @ApiPropertyOptional({ example: 'Doctor confirmed findings are clear.' })
  @IsString()
  @IsOptional()
  patientNotes?: string;

  @ApiPropertyOptional({ example: true, description: 'Patient confirms or corrects OCR extraction' })
  @IsBoolean()
  @IsOptional()
  isPatientConfirmed?: boolean;

  @ApiPropertyOptional({ description: 'Custom structured parameters or patient-corrected values' })
  @IsObject()
  @IsOptional()
  extractedData?: Record<string, any>;
}
