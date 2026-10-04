import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TimelineEventType,
  TimelineSourceType,
  TimelineDatePrecision,
  TimelineVisibility,
} from '@prisma/client';

export class TimelineSourceRefDto {
  @ApiProperty({ enum: TimelineSourceType, example: TimelineSourceType.DOCUMENT })
  type: TimelineSourceType;

  @ApiProperty({ example: '8b7f8364-58f0-466d-9653-5d55b41fa44a' })
  id: string;
}

export class TimelineGroupingMetadataDto {
  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ example: 10 })
  month: number;

  @ApiProperty({ example: 'October 2026' })
  monthLabel: string;

  @ApiProperty({ example: '2026-10-03' })
  dayLabel: string;
}

export class TimelineEventItemDto {
  @ApiProperty({ example: '3c6842a0-2164-433e-b31e-d7b2b69181c1' })
  id: string;

  @ApiProperty({ example: 'a42d1465-a244-4202-9db8-75b5c3508a31' })
  patientId: string;

  @ApiProperty({ enum: TimelineEventType, example: TimelineEventType.DOCUMENT })
  eventType: TimelineEventType;

  @ApiProperty({ example: '2026-10-03T12:00:00.000Z' })
  eventDate: Date;

  @ApiProperty({ enum: TimelineDatePrecision, example: TimelineDatePrecision.DAY })
  datePrecision: TimelineDatePrecision;

  @ApiProperty({ example: 'CBC & Liver Panel' })
  title: string;

  @ApiPropertyOptional({ example: 'Laboratory pathology report uploaded.' })
  summary?: string | null;

  @ApiProperty({ type: TimelineSourceRefDto })
  source: TimelineSourceRefDto;

  @ApiPropertyOptional({ example: 'doctor-uuid-123' })
  providerId?: string | null;

  @ApiPropertyOptional({ example: 'Dr. Marcus Vance' })
  providerName?: string | null;

  @ApiProperty({ enum: TimelineVisibility, example: TimelineVisibility.SHARED })
  visibility: TimelineVisibility;

  @ApiProperty({ type: TimelineGroupingMetadataDto })
  grouping: TimelineGroupingMetadataDto;

  @ApiPropertyOptional()
  metadata?: Record<string, any> | null;

  @ApiProperty({ example: '2026-10-03T12:00:00.000Z' })
  createdAt: Date;
}

export class TimelineResponseDto {
  @ApiProperty({ type: [TimelineEventItemDto] })
  items: TimelineEventItemDto[];

  @ApiPropertyOptional({ example: 'eyJkYXRlIjoiMjAyNi0xMC0wM1QxMjo...' })
  nextCursor?: string | null;

  @ApiProperty({ example: true })
  hasMore: boolean;

  @ApiProperty({ example: 120 })
  total: number;
}
