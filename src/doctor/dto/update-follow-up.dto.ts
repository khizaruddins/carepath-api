import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FollowUpStatus } from '@prisma/client';

export class UpdateFollowUpStatusDto {
  @ApiProperty({ enum: FollowUpStatus, description: 'Updated follow-up status' })
  @IsEnum(FollowUpStatus)
  @IsNotEmpty()
  status: FollowUpStatus;
}
