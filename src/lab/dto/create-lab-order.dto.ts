import {
  IsUUID,
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  ArrayMinSize,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabCollectionMode } from '@prisma/client';

export class CreateLabOrderDto {
  @ApiProperty({
    description: 'Target laboratory organization ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  labId: string;

  @ApiPropertyOptional({
    description: 'Patient user ID. Optional when authenticated patient orders for themselves.',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @ApiPropertyOptional({
    description: 'Prescribing doctor user ID',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsUUID()
  @IsOptional()
  prescribedDoctorId?: string;

  @ApiPropertyOptional({
    description: 'Investigation request ID if ordered against a clinical request',
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  @IsUUID()
  @IsOptional()
  investigationRequestId?: string;

  @ApiProperty({
    description: 'Array of lab test IDs or test codes to be conducted',
    example: ['CBC-001', 'LFT-002'],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Order must contain at least one diagnostic test' })
  @IsString({ each: true })
  tests: string[];

  @ApiPropertyOptional({
    enum: LabCollectionMode,
    description: 'Collection mode: at the diagnostic laboratory center or home visit',
    example: LabCollectionMode.LAB,
  })
  @IsEnum(LabCollectionMode)
  @IsOptional()
  collectionMode?: LabCollectionMode;

  @ApiPropertyOptional({
    description: 'Address for sample collection if home collection mode is selected',
    example: 'Flat 4B, Greenwood Heights, Baker Street',
  })
  @IsString()
  @IsOptional()
  collectionAddress?: string;

  @ApiPropertyOptional({
    description: 'Desired appointment or scheduled collection date/time (ISO 8601)',
    example: '2026-10-10T09:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  scheduledDate?: string;

  @ApiPropertyOptional({
    description: 'Clinical instructions or patient prep guidance',
    example: 'Overnight fasting required for 10-12 hours.',
  })
  @IsString()
  @IsOptional()
  instructions?: string;

  @ApiPropertyOptional({
    description: 'Clinical urgency priority: ROUTINE, URGENT, STAT',
    example: 'ROUTINE',
  })
  @IsString()
  @IsOptional()
  priority?: string;

  @ApiPropertyOptional({
    description: 'Additional clinical or administrative order notes',
    example: 'Patient history of vasovagal response to venipuncture.',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
