import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReferralDto {
  @ApiProperty({ description: 'Specialty required for referral', example: 'Cardiology' })
  @IsString()
  @IsNotEmpty()
  specialty: string;

  @ApiPropertyOptional({ description: 'Referred physician or institution if specific' })
  @IsString()
  @IsOptional()
  referredProvider?: string;

  @ApiProperty({ description: 'Clinical reason for referral', example: 'Echocardiogram evaluation for persistent murmur' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'Clinical history and supplementary referral notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Priority level (ROUTINE, URGENT)', example: 'ROUTINE' })
  @IsString()
  @IsOptional()
  priority?: string;
}
