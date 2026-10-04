import {
  IsUUID,
  IsEnum,
  IsString,
  IsNotEmpty,
  IsDateString,
  IsArray,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ConsentPurpose } from '@prisma/client';
import { ConsentScopeDto } from './consent-scope.dto';

export class CreateConsentDto {
  @ApiProperty({
    description: 'Patient user ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  patientId: string;

  @ApiProperty({
    enum: ConsentPurpose,
    description: 'Standardized clinical purpose for accessing medical records',
    example: ConsentPurpose.REVIEW_RECENT_REPORTS,
  })
  @IsEnum(ConsentPurpose)
  purpose: ConsentPurpose;

  @ApiProperty({
    description: 'Detailed human-readable clinical rationale explaining the need for access',
    example: 'Review recent blood panels and imaging prior to scheduled follow-up consultation.',
  })
  @IsString()
  @IsNotEmpty()
  purposeDescription: string;

  @ApiProperty({
    description: 'Expiration date and time for this consent grant (ISO 8601)',
    example: '2026-10-15T00:00:00.000Z',
  })
  @IsDateString()
  expiresAt: string;

  @ApiProperty({
    type: [ConsentScopeDto],
    description: 'List of specific resources or categories to authorize',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one resource scope must be requested' })
  @ValidateNested({ each: true })
  @Type(() => ConsentScopeDto)
  scopes: ConsentScopeDto[];
}
