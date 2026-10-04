import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateLabTestDto } from './create-lab-test.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateLabTestDto extends PartialType(CreateLabTestDto) {
  @ApiPropertyOptional({
    description: 'Whether test is actively offered in laboratory catalog',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
