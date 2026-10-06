import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BlockDoctorDto {
  @ApiPropertyOptional({ description: 'Optional reason for blocking doctor' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
