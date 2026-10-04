import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateConsultationDto {
  @ApiPropertyOptional({ description: 'Primary reason for consultation visit' })
  @IsString()
  @IsOptional()
  reasonForVisit?: string;

  @ApiPropertyOptional({ description: 'Patient chief complaint' })
  @IsString()
  @IsOptional()
  chiefComplaint?: string;

  @ApiPropertyOptional({ description: 'Detailed clinical examination and observations' })
  @IsString()
  @IsOptional()
  clinicalNotes?: string;

  @ApiPropertyOptional({ description: 'Clinical assessment' })
  @IsString()
  @IsOptional()
  assessment?: string;

  @ApiPropertyOptional({ description: 'Management plan' })
  @IsString()
  @IsOptional()
  plan?: string;

  @ApiPropertyOptional({ description: 'Recommended follow-up appointment date' })
  @IsDateString()
  @IsOptional()
  followUpDate?: string;

  @ApiPropertyOptional({ description: 'Instructions for the patient before follow-up' })
  @IsString()
  @IsOptional()
  followUpInstructions?: string;

  @ApiPropertyOptional({ description: 'Referenced document or report IDs', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  attachments?: string[];
}
