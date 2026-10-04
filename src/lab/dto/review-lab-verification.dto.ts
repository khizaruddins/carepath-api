import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabVerificationStatus } from '@prisma/client';

export class ReviewLabVerificationDto {
  @ApiProperty({
    enum: LabVerificationStatus,
    description: 'Target verification status decided by admin',
    example: LabVerificationStatus.VERIFIED,
  })
  @IsEnum(LabVerificationStatus)
  status: LabVerificationStatus;

  @ApiPropertyOptional({
    description: 'Administrative decision notes or rationale',
    example: 'Regulatory documents and NABL accreditation verified successfully.',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
