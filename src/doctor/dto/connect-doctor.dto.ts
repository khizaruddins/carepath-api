import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString, MaxLength } from 'class-validator';
import { ConnectionSource } from '@prisma/client';

export class ConnectDoctorDto {
  @ApiPropertyOptional({
    description: 'Origin source of the connection',
    enum: ConnectionSource,
    default: ConnectionSource.SEARCH,
  })
  @IsOptional()
  @IsEnum(ConnectionSource)
  source?: ConnectionSource = ConnectionSource.SEARCH;

  @ApiPropertyOptional({ description: 'Optional relationship notes or context' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
