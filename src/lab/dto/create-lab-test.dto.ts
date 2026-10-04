import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  Min,
  IsOptional,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabTestCategory } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateLabTestDto {
  @ApiProperty({
    description: 'Unique test code within the laboratory catalog',
    example: 'CBC-001',
  })
  @IsString()
  @IsNotEmpty()
  testCode: string;

  @ApiProperty({
    description: 'Diagnostic test or panel name',
    example: 'Complete Blood Count (CBC) with Automated Differential',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    enum: LabTestCategory,
    description: 'Clinical laboratory category',
    example: LabTestCategory.HEMATOLOGY,
  })
  @IsEnum(LabTestCategory)
  category: LabTestCategory;

  @ApiPropertyOptional({
    description: 'Detailed description of the diagnostic investigation',
    example: 'Measures WBC, RBC, Hemoglobin, Hematocrit, Platelets, and differential indices.',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Required specimen types for this test',
    example: ['Whole Blood EDTA'],
  })
  @IsArray()
  @IsOptional()
  sampleTypes?: string[];

  @ApiPropertyOptional({
    description: 'Standard turnaround time (e.g. 12 hours, 24 hours)',
    example: '12 hours',
  })
  @IsString()
  @IsOptional()
  turnaroundTime?: string;

  @ApiProperty({
    description: 'Current standard price for the test',
    example: 35.0,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    description: 'Patient pre-collection preparation notes (e.g. 10-12 hour fasting required)',
    example: 'Fasting not strictly required for standard CBC, but stay hydrated.',
  })
  @IsString()
  @IsOptional()
  preparationNotes?: string;

  @ApiPropertyOptional({
    description: 'Whether this test is eligible for phlebotomist home sample collection',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isHomeCollection?: boolean;
}
