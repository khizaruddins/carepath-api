import {
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LabCollectionMode } from '@prisma/client';

export class SelectLabForInvestigationDto {
  @IsUUID()
  labId: string;

  @IsOptional()
  @IsUUID()
  testId?: string;

  @IsOptional()
  @IsUUID()
  labLocationId?: string;

  @IsEnum(LabCollectionMode)
  collectionMode: LabCollectionMode;

  @IsOptional()
  @IsString()
  collectionAddress?: string;

  @IsOptional()
  @IsString()
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(12)
  @Max(336)
  ttlHours?: number = 72; // default 72 hours clinical access connection
}
