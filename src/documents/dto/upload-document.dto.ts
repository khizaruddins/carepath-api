import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DocumentCategory } from '@prisma/client';

export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentCategory, example: DocumentCategory.LAB_REPORT })
  @IsEnum(DocumentCategory, { message: 'A valid document category is required' })
  @IsNotEmpty()
  category: DocumentCategory;

  @ApiPropertyOptional({ example: 'Annual Blood Work Results' })
  @IsString()
  @IsOptional()
  reportTitle?: string;

  @ApiPropertyOptional({ example: 'Dr. Gregory House' })
  @IsString()
  @IsOptional()
  providerName?: string;

  @ApiPropertyOptional({ example: 'Princeton-Plainsboro Teaching Hospital' })
  @IsString()
  @IsOptional()
  facility?: string;

  @ApiPropertyOptional({ example: '2026-09-15' })
  @IsDateString()
  @IsOptional()
  documentDate?: string;

  @ApiPropertyOptional({ example: 'Routine checkup after starting new medication.' })
  @IsString()
  @IsOptional()
  patientNotes?: string;
}
