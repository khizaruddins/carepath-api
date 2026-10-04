import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PrescriptionItemDto {
  @ApiProperty({ description: 'Name of medicine / pharmaceutical', example: 'Metformin' })
  @IsString()
  @IsNotEmpty()
  medicineName: string;

  @ApiProperty({ description: 'Dosage specification', example: '500 mg' })
  @IsString()
  @IsNotEmpty()
  dosage: string;

  @ApiProperty({ description: 'Frequency of administration', example: 'Twice daily' })
  @IsString()
  @IsNotEmpty()
  frequency: string;

  @ApiProperty({ description: 'Course duration', example: '30 days' })
  @IsString()
  @IsNotEmpty()
  duration: string;

  @ApiPropertyOptional({ description: 'Patient instructions', example: 'Take with or immediately after meals' })
  @IsString()
  @IsOptional()
  instructions?: string;

  @ApiPropertyOptional({ description: 'Additional clinical remarks' })
  @IsString()
  @IsOptional()
  additionalNotes?: string;
}

export class CreatePrescriptionDto {
  @ApiPropertyOptional({ description: 'Optional linked consultation ID' })
  @IsString()
  @IsOptional()
  consultationId?: string;

  @ApiPropertyOptional({ description: 'Prescription date (defaults to current timestamp)' })
  @IsDateString()
  @IsOptional()
  prescriptionDate?: string;

  @ApiPropertyOptional({ description: 'General prescription remarks or clinical indications' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ description: 'List of prescribed medication items', type: [PrescriptionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}
