import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDoctorPracticeLocationDto {
  @ApiProperty({ description: 'Name of the clinic, hospital, or practice' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  practiceName: string;

  @ApiProperty({ description: 'Primary street address line' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  addressLine1: string;

  @ApiPropertyOptional({ description: 'Secondary address / suite / floor' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @ApiPropertyOptional({ description: 'Locality or area name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  area?: string;

  @ApiProperty({ description: 'City' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiPropertyOptional({ description: 'State or Province' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ description: 'Postal or PIN code' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pincode?: string;

  @ApiPropertyOptional({ description: 'Geographic latitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Geographic longitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Practice contact telephone' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: 'Whether this is the doctor primary practice location', default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean = false;
}

export class UpdateDoctorPracticeLocationDto {
  @ApiPropertyOptional({ description: 'Name of the clinic, hospital, or practice' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  practiceName?: string;

  @ApiPropertyOptional({ description: 'Primary street address line' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine1?: string;

  @ApiPropertyOptional({ description: 'Secondary address / suite / floor' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @ApiPropertyOptional({ description: 'Locality or area name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  area?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'State or Province' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ description: 'Postal or PIN code' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pincode?: string;

  @ApiPropertyOptional({ description: 'Geographic latitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Geographic longitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Practice contact telephone' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ description: 'Whether this is the primary practice location' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: 'Whether location is active' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
