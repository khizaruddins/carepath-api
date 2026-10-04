import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFollowUpDto {
  @ApiProperty({ description: 'Due date for patient follow-up', example: '2026-10-15T09:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  dueDate: string;

  @ApiProperty({ description: 'Clinical reason for follow-up review', example: 'Evaluate glycemic response to metformin titration' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'Patient preparation or instructions before the visit' })
  @IsString()
  @IsOptional()
  instructions?: string;
}
