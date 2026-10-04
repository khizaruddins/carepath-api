import { IsOptional, IsEnum, IsString, IsInt, Min, Max, IsDateString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TimelineEventType, TimelineSourceType } from '@prisma/client';

export class QueryTimelineDto {
  @ApiPropertyOptional({
    description: 'Filter events on or after this ISO date',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Filter events on or before this ISO date',
    example: '2026-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: TimelineEventType,
    description: 'Filter by specific event classification',
  })
  @IsOptional()
  @IsEnum(TimelineEventType)
  eventType?: TimelineEventType;

  @ApiPropertyOptional({
    enum: TimelineSourceType,
    description: 'Filter by underlying source entity type',
  })
  @IsOptional()
  @IsEnum(TimelineSourceType)
  sourceType?: TimelineSourceType;

  @ApiPropertyOptional({
    description: 'Filter events associated with a specific healthcare provider UUID',
  })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiPropertyOptional({
    description: 'Factual text search across event title, provider, and summary',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Maximum events to return in a single page',
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Opaque cursor string for cursor-based pagination',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Chronological sorting order',
    enum: ['desc', 'asc'],
    default: 'desc',
  })
  @IsOptional()
  @IsEnum(['desc', 'asc'])
  sortOrder?: 'desc' | 'asc' = 'desc';
}
