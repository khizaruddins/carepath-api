import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabSampleStatus } from '@prisma/client';

export class UpdateLabSampleDto {
  @ApiProperty({
    enum: LabSampleStatus,
    description: 'Updated specimen tracking status',
    example: LabSampleStatus.RECEIVED,
  })
  @IsEnum(LabSampleStatus)
  status: LabSampleStatus;

  @ApiPropertyOptional({
    description: 'Reason for specimen rejection if status is REJECTED',
    example: 'Specimen hemolyzed / clotted / inadequate volume',
  })
  @IsString()
  @IsOptional()
  rejectionReason?: string;

  @ApiPropertyOptional({
    description: 'Technician observations or processing notes',
    example: 'Centrifuged at 3000 RPM for 10 minutes at 4C.',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
