import { IsArray, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConsultationDto {
  @ApiPropertyOptional({ description: 'Date of consultation (defaults to current timestamp)' })
  @IsDateString()
  @IsOptional()
  consultationDate?: string;

  @ApiProperty({ description: 'Primary reason for consultation visit', example: 'Follow-up on HbA1c lab results' })
  @IsString()
  @IsNotEmpty()
  reasonForVisit: string;

  @ApiProperty({ description: 'Patient chief complaint', example: 'Fatigue and occasional dizziness over past 2 weeks' })
  @IsString()
  @IsNotEmpty()
  chiefComplaint: string;

  @ApiProperty({ description: 'Detailed clinical examination and observations' })
  @IsString()
  @IsNotEmpty()
  clinicalNotes: string;

  @ApiProperty({ description: 'Clinical assessment and diagnosis' })
  @IsString()
  @IsNotEmpty()
  assessment: string;

  @ApiProperty({ description: 'Management plan, lifestyle, or dietary advice' })
  @IsString()
  @IsNotEmpty()
  plan: string;

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
