import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Gender, BloodGroup } from '@prisma/client';

export class UpdatePatientProfileDto {
  @ApiPropertyOptional({ example: 'Johnathan Doe' })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ example: '1985-06-15' })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender, example: Gender.MALE })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsString()
  @IsOptional()
  mobile?: string;

  @ApiPropertyOptional({ example: 'patient@carepath.example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'New York' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ enum: BloodGroup, example: BloodGroup.O_POSITIVE })
  @IsEnum(BloodGroup)
  @IsOptional()
  bloodGroup?: BloodGroup;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsString()
  @IsOptional()
  emergencyContactName?: string;

  @ApiPropertyOptional({ example: '+1987654321' })
  @IsString()
  @IsOptional()
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ example: 'Spouse' })
  @IsString()
  @IsOptional()
  emergencyContactRelation?: string;

  // Health Information
  @ApiPropertyOptional({ example: ['Hypertension', 'Type 2 Diabetes'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  knownConditions?: string[];

  @ApiPropertyOptional({ example: ['Penicillin', 'Peanuts'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allergies?: string[];

  @ApiPropertyOptional({ example: ['Metformin 500mg', 'Lisinopril 10mg'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  currentMedications?: string[];

  @ApiPropertyOptional({ example: ['Appendectomy (2018)'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  pastSurgeries?: string[];

  @ApiPropertyOptional({ example: 'Family history of cardiovascular disease.' })
  @IsString()
  @IsOptional()
  importantMedicalHistory?: string;
}
