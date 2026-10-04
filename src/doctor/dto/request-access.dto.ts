import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestAccessDto {
  @ApiProperty({ description: 'Patient email address to request vault access from' })
  @IsEmail()
  @IsNotEmpty()
  patientEmail: string;

  @ApiPropertyOptional({ description: 'Clinical reason or introduction for requesting access' })
  @IsString()
  @IsOptional()
  notes?: string;
}
