import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsentResourceType, ConsentAccessLevel } from '@prisma/client';

export class ConsentScopeDto {
  @ApiProperty({
    enum: ConsentResourceType,
    description: 'Type of healthcare resource to authorize',
    example: ConsentResourceType.DOCUMENT,
  })
  @IsEnum(ConsentResourceType)
  resourceType: ConsentResourceType;

  @ApiPropertyOptional({
    description: 'Specific resource UUID if granting single-record access',
    example: '8b7f8364-58f0-466d-9653-5d55b41fa44a',
  })
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiPropertyOptional({
    description: 'Category-level scope (e.g. LAB_REPORT, PRESCRIPTION, IMAGING_REPORT)',
    example: 'LAB_REPORT',
  })
  @IsOptional()
  @IsString()
  resourceCategory?: string;

  @ApiPropertyOptional({
    enum: ConsentAccessLevel,
    default: ConsentAccessLevel.VIEW,
    description: 'Permission granted: VIEW or DOWNLOAD',
    example: ConsentAccessLevel.VIEW,
  })
  @IsOptional()
  @IsEnum(ConsentAccessLevel)
  accessLevel?: ConsentAccessLevel = ConsentAccessLevel.VIEW;
}
