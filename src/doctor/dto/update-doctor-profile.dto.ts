import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';

export class UpdateDoctorProfileDto {
  @ApiPropertyOptional({ description: 'Full legal name and title' })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ description: 'Profile avatar or photo URL' })
  @IsString()
  @IsOptional()
  profilePhoto?: string;

  @ApiPropertyOptional({ description: 'Date of birth (ISO string)' })
  @IsString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender, description: 'Doctor gender' })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ description: 'Official contact mobile number' })
  @IsString()
  @IsOptional()
  mobile?: string;

  @ApiPropertyOptional({ description: 'Medical primary specialty (e.g. Cardiology, Endocrinology)' })
  @IsString()
  @IsOptional()
  specialization?: string;

  @ApiPropertyOptional({ description: 'Sub-specialty or focus area (e.g. Interventional Cardiology)' })
  @IsString()
  @IsOptional()
  subSpecialty?: string;

  @ApiPropertyOptional({ description: 'Qualifications (e.g. MBBS, MD, DM, FRCP)' })
  @IsString()
  @IsOptional()
  qualifications?: string;

  @ApiPropertyOptional({ description: 'Languages spoken', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];

  @ApiPropertyOptional({ description: 'Medical council or board license number' })
  @IsString()
  @IsOptional()
  licenseNumber?: string;

  @ApiPropertyOptional({ description: 'Professional registration number' })
  @IsString()
  @IsOptional()
  registrationNumber?: string;

  @ApiPropertyOptional({ description: 'Registration issuing authority (e.g. State Medical Council)' })
  @IsString()
  @IsOptional()
  registrationAuthority?: string;

  @ApiPropertyOptional({ description: 'Registration state or province' })
  @IsString()
  @IsOptional()
  registrationState?: string;

  @ApiPropertyOptional({ description: 'Registration country' })
  @IsString()
  @IsOptional()
  registrationCountry?: string;

  @ApiPropertyOptional({ description: 'Clinic or primary practice name' })
  @IsString()
  @IsOptional()
  clinicName?: string;

  @ApiPropertyOptional({ description: 'Clinic or practice physical address' })
  @IsString()
  @IsOptional()
  clinicAddress?: string;

  @ApiPropertyOptional({ description: 'Practice city' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ description: 'Consultation mode (IN_PERSON, VIDEO, HYBRID)' })
  @IsString()
  @IsOptional()
  consultationMode?: string;

  @ApiPropertyOptional({ description: 'Weekly working hours or practice schedule' })
  @IsString()
  @IsOptional()
  workingHours?: string;

  @ApiPropertyOptional({ description: 'Affiliated hospital or medical institution' })
  @IsString()
  @IsOptional()
  hospitalAffiliation?: string;

  @ApiPropertyOptional({ description: 'Professional biography and clinical philosophy' })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({ description: 'Number of years practicing in clinical medicine' })
  @IsInt()
  @Min(0)
  @IsOptional()
  yearsOfExperience?: number;

  @ApiPropertyOptional({ description: 'Medical board certificates or credential details' })
  @IsString()
  @IsOptional()
  medicalCertificate?: string;

  @ApiPropertyOptional({ description: 'Medical degrees, fellowships, or academic credentials' })
  @IsString()
  @IsOptional()
  education?: string;

  @ApiPropertyOptional({ description: 'Record review or consultation fee indicator' })
  @IsString()
  @IsOptional()
  consultationFee?: string;
}
