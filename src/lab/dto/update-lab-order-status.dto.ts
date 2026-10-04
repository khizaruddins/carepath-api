import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabOrderStatus } from '@prisma/client';

export class UpdateLabOrderStatusDto {
  @ApiProperty({
    enum: LabOrderStatus,
    description: 'Updated operational status of the lab order',
    example: LabOrderStatus.ACCEPTED,
  })
  @IsEnum(LabOrderStatus)
  status: LabOrderStatus;

  @ApiPropertyOptional({
    description: 'Explanation if the order is cancelled or rejected',
    example: 'Sample hemolyzed upon arrival; recollection scheduled.',
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Internal operational notes or instructions',
    example: 'Barcodes scanned and routed to hematology analyzer bay 2.',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
