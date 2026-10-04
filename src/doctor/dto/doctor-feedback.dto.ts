import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DoctorFeedbackDto {
  @ApiProperty({ description: 'Clinical assessment, remarks or findings on the medical document' })
  @IsString()
  @IsNotEmpty()
  notes: string;

  @ApiPropertyOptional({ description: 'Recommended next steps, follow-ups, or lifestyle modifications' })
  @IsString()
  @IsOptional()
  recommendations?: string;
}
