import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DisconnectDoctorDto {
  @ApiPropertyOptional({ description: 'Optional reason for ending connection' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
