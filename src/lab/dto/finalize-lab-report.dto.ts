import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FinalizeLabReportDto {
  @ApiProperty({
    description: 'Final clinical diagnostic test findings summary',
    example: 'Hemoglobin: 14.2 g/dL (Normal). Platelets: 250,000 /uL (Normal). WBC: 7,200 /uL (Normal).',
  })
  @IsString()
  @IsNotEmpty()
  testSummary: string;

  @ApiPropertyOptional({
    description: 'Pathologist clinical impression or interpretive remarks',
    example: 'Normal complete blood count profile. No evidence of hematological dyscrasia.',
  })
  @IsString()
  @IsOptional()
  clinicalNotes?: string;

  @ApiPropertyOptional({
    description: 'Document ID of the uploaded signed PDF report in private storage',
    example: '550e8400-e29b-41d4-a716-446655440004',
  })
  @IsUUID()
  @IsOptional()
  documentId?: string;
}
