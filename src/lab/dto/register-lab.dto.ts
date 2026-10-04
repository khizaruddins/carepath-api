import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsArray,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterLabDto {
  @ApiProperty({
    description: 'Display name of the laboratory facility',
    example: 'Apex Clinical Reference Laboratories',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Registered legal company name',
    example: 'Apex Diagnostic Solutions Pvt. Ltd.',
  })
  @IsString()
  @IsOptional()
  legalName?: string;

  @ApiProperty({
    description: 'Government or regulatory medical lab license number',
    example: 'LAB-REG-2026-98124',
  })
  @IsString()
  @IsNotEmpty()
  licenseNumber: string;

  @ApiPropertyOptional({
    description: 'Accreditation certificates or details (e.g. NABL, CAP, ISO 15189)',
    example: { nablAccredited: true, accreditationNumber: 'NABL-MC-5432' },
  })
  @IsObject()
  @IsOptional()
  accreditationDetails?: Record<string, any>;

  @ApiProperty({
    description: 'Primary contact email for official communications',
    example: 'admin@apexlabs.org',
  })
  @IsEmail()
  contactEmail: string;

  @ApiProperty({
    description: 'Primary contact phone number',
    example: '+1-555-019-2834',
  })
  @IsString()
  @IsNotEmpty()
  contactPhone: string;

  @ApiPropertyOptional({
    description: 'Physical address of the diagnostic facility',
    example: '450 Healthcare Blvd, Suite 200',
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({
    description: 'City where laboratory operates',
    example: 'Metropolis',
  })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({
    description: 'State or Province',
    example: 'NY',
  })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({
    description: 'Postal/ZIP code',
    example: '10001',
  })
  @IsString()
  @IsOptional()
  pincode?: string;

  @ApiPropertyOptional({
    description: 'Operating hours schedule',
    example: { mondayFriday: '07:00-20:00', saturday: '08:00-14:00' },
  })
  @IsObject()
  @IsOptional()
  operatingHours?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'List of supported sample specimen types',
    example: ['Blood (Serum)', 'Blood (EDTA)', 'Urine', 'Swab', 'Sputum'],
  })
  @IsArray()
  @IsOptional()
  supportedSampleTypes?: string[];
}
