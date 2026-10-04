import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LabTestCategory, LabCollectionMode } from '@prisma/client';

export enum LabDiscoverySort {
  NEARBY = 'NEARBY',
  CHEAPEST = 'CHEAPEST',
  FASTEST = 'FASTEST',
  BEST_MATCH = 'BEST_MATCH',
}

export class DiscoverLabsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  radiusKm?: number = 15;

  @IsOptional()
  @IsUUID()
  investigationRequestId?: string;

  @IsOptional()
  @IsUUID()
  canonicalTestId?: string;

  @IsOptional()
  @IsEnum(LabTestCategory)
  category?: LabTestCategory;

  @IsOptional()
  @IsEnum(LabCollectionMode)
  collectionMode?: LabCollectionMode;

  @IsOptional()
  @IsEnum(LabDiscoverySort)
  sort?: LabDiscoverySort = LabDiscoverySort.BEST_MATCH;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
