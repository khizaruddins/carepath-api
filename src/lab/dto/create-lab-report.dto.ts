import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLabReportDto {
  @ApiPropertyOptional({
    description: 'Initial diagnostic test findings summary or preliminary text',
    example: 'Preliminary counts within normal limits; differential pending manual review.',
  })
  @IsString()
  @IsOptional()
  testSummary?: string;

  @ApiPropertyOptional({
    description: 'Internal clinical remarks by evaluating technician or pathologist',
    example: 'Peripheral blood smear examination recommended if anemia persists.',
  })
  @IsString()
  @IsOptional()
  clinicalNotes?: string;
}
