import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender } from '@prisma/client';

export enum DoctorSortOrder {
  RELEVANCE = 'relevance',
  EXPERIENCE_DESC = 'experience_desc',
  FEE_ASC = 'fee_asc',
  FEE_DESC = 'fee_desc',
  DISTANCE = 'distance',
}

export class DiscoverDoctorsDto {
  @ApiPropertyOptional({ description: 'Text search matching doctor name, clinic name, specialty, bio, or qualifications' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by specialty / department' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ description: 'Filter by sub-specialty' })
  @IsOptional()
  @IsString()
  subspecialty?: string;

  @ApiPropertyOptional({ description: 'Filter by city' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Filter by area / locality' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ description: 'Filter by pincode / zip code' })
  @IsOptional()
  @IsString()
  pincode?: string;

  @ApiPropertyOptional({ description: 'Patient latitude for distance calculations' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Patient longitude for distance calculations' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Search radius in kilometers (default: 25km)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  radius?: number = 25;

  @ApiPropertyOptional({ description: 'Filter by gender', enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ description: 'Filter by spoken language' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Minimum years of medical experience' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  experienceMin?: number;

  @ApiPropertyOptional({ description: 'Maximum years of medical experience' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  experienceMax?: number;

  @ApiPropertyOptional({ description: 'Sort criteria', enum: DoctorSortOrder, default: DoctorSortOrder.RELEVANCE })
  @IsOptional()
  @IsEnum(DoctorSortOrder)
  sort?: DoctorSortOrder = DoctorSortOrder.RELEVANCE;

  @ApiPropertyOptional({ description: 'Cursor ID for keyset pagination' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page number for pagination (1-based)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Number of items per page (default: 20, max: 50)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
