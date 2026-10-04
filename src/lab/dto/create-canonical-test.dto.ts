import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
} from 'class-validator';
import { LabTestCategory } from '@prisma/client';

export class CreateCanonicalTestDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(LabTestCategory)
  category: LabTestCategory;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sampleTypes?: string[];

  @IsOptional()
  @IsString()
  defaultTurnaroundTime?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  synonyms?: string[];
}
