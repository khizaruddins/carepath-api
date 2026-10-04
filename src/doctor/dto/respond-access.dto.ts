import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AccessStatus } from '@prisma/client';

export class RespondAccessDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'REVOKED'], description: 'Response to access request' })
  @IsEnum(AccessStatus)
  @IsNotEmpty()
  status: AccessStatus;
}
