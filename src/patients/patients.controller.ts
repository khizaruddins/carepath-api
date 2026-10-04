import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { PatientsService } from './patients.service';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserStatusGuard } from '../common/guards/user-status.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Patients')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, UserStatusGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get('me')
  @Roles(Role.PATIENT, Role.ADMIN)
  @ApiOperation({ summary: 'Get current patient profile and health information' })
  @ApiResponse({ status: 200, description: 'Patient profile retrieved' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getMyProfile(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.patientsService.getMyProfile(user.id, req.ip, req.headers['user-agent']);
  }

  @Patch('me')
  @Roles(Role.PATIENT, Role.ADMIN)
  @ApiOperation({ summary: 'Update current patient personal and health information' })
  @ApiResponse({ status: 200, description: 'Patient profile updated successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePatientProfileDto,
    @Req() req: Request,
  ) {
    return this.patientsService.updateMyProfile(user.id, dto, req.ip, req.headers['user-agent']);
  }
}
