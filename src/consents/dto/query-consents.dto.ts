import { IsOptional, IsEnum, IsInt, Min, Max, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConsentStatus } from '@prisma/client';

export class QueryConsentsDto {
  @ApiPropertyOptional({
    enum: ConsentStatus,
    description: 'Filter by consent status',
  })
  @IsOptional()
  @IsEnum(ConsentStatus)
  status?: ConsentStatus;

  @ApiPropertyOptional({
    description: 'Filter by patient user ID',
  })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiPropertyOptional({
    description: 'Filter by requester user ID (doctor)',
  })
  @IsOptional()
  @IsUUID()
  requesterId?: string;

  @ApiPropertyOptional({
    description: 'Number of records to return',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Pagination offset',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
