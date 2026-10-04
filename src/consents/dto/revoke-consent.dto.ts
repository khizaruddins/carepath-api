import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RevokeConsentDto {
  @ApiPropertyOptional({
    description: 'Optional patient reason for revoking access before scheduled expiry',
    example: 'Second opinion completed; revoking record sharing.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
