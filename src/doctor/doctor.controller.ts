import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { DoctorService } from './doctor.service';
import { DoctorDiscoveryService } from './doctor-discovery.service';
import { DoctorRelationshipService } from './doctor-relationship.service';
import { DiscoverDoctorsDto } from './dto/discover-doctors.dto';
import { ConnectDoctorDto } from './dto/connect-doctor.dto';
import { DisconnectDoctorDto } from './dto/disconnect-doctor.dto';
import { BlockDoctorDto } from './dto/block-doctor.dto';
import {
  CreateDoctorPracticeLocationDto,
  UpdateDoctorPracticeLocationDto,
} from './dto/doctor-practice-location.dto';
import { RequestAccessDto } from './dto/request-access.dto';
import { RespondAccessDto } from './dto/respond-access.dto';
import { DoctorFeedbackDto } from './dto/doctor-feedback.dto';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { CreateInvestigationDto } from './dto/create-investigation.dto';
import { CreateReferralDto } from './dto/create-referral.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { UpdateFollowUpStatusDto } from './dto/update-follow-up.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserStatusGuard } from '../common/guards/user-status.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { DoctorVerificationStatus, Role, RelationshipStatus } from '@prisma/client';

@ApiTags('Doctor & Clinical Journey Platform (M2, M6)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, UserStatusGuard, RolesGuard)
@Controller()
export class DoctorController {
  constructor(
    private readonly doctorService: DoctorService,
    private readonly doctorDiscoveryService: DoctorDiscoveryService,
    private readonly doctorRelationshipService: DoctorRelationshipService,
  ) {}

  // -------------------------------------------------------------
  // Doctor Clinical Dashboard
  // -------------------------------------------------------------

  @Get('doctor/dashboard')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Clinical dashboard: today tasks, consultations, follow-ups, pending reviews' })
  async getDoctorDashboard(@CurrentUser() doctor: AuthenticatedUser) {
    return this.doctorService.getDoctorDashboard(doctor.id);
  }

  // -------------------------------------------------------------
  // Doctor Access & Patient Consent Endpoints
  // -------------------------------------------------------------

  @Post('doctor/access-requests')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor requests medical vault access from a patient by email' })
  @ApiResponse({ status: 201, description: 'Access request sent' })
  async requestAccess(
    @CurrentUser() doctor: AuthenticatedUser,
    @Body() dto: RequestAccessDto,
  ) {
    return this.doctorService.requestAccess(doctor, dto);
  }

  @Get('doctor/access-requests')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor lists all outgoing access requests' })
  async getDoctorAccessRequests(@CurrentUser() doctor: AuthenticatedUser) {
    return this.doctorService.getDoctorAccessRequests(doctor.id);
  }

  @Get('doctor/patients')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor lists connected patients who granted approved consent' })
  @ApiQuery({ name: 'search', required: false, description: 'Filter by patient name, email, or city' })
  async getDoctorAssignedPatients(
    @CurrentUser() doctor: AuthenticatedUser,
    @Query('search') search?: string,
  ) {
    return this.doctorService.getDoctorAssignedPatients(doctor.id, search);
  }

  @Get('doctor/patients/:patientId/workspace')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor views complete authorized patient workspace (records, consults, timeline)' })
  @ApiParam({ name: 'patientId', description: 'Patient user ID' })
  async getPatientWorkspace(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.doctorService.getPatientWorkspace(doctor.id, patientId);
  }

  @Get('doctor/patients/:patientId/documents')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor views medical documents of an assigned consented patient' })
  @ApiParam({ name: 'patientId', description: 'Patient user ID' })
  async getConsentedPatientDocuments(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    const ws = await this.doctorService.getPatientWorkspace(doctor.id, patientId);
    return {
      patient: ws.patient,
      documents: ws.documents,
    };
  }

  @Get('doctor/documents/:documentId')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor views single authorized document with short-lived signed URL' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  async getAuthorizedDocument(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.doctorService.getAuthorizedDocument(doctor, documentId);
  }

  @Get('doctor/reports/awaiting-review')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor gets list of patient reports awaiting clinical review' })
  async getReportsAwaitingReview(@CurrentUser() doctor: AuthenticatedUser) {
    return this.doctorService.getReportsAwaitingReview(doctor.id);
  }

  @Post('doctor/documents/:documentId/feedback')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor submits clinical assessment/feedback on a patient document' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  async addDoctorFeedback(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: DoctorFeedbackDto,
  ) {
    return this.doctorService.addDoctorFeedback(doctor.id, documentId, dto);
  }

  @Get('documents/:documentId/feedback')
  @ApiOperation({ summary: 'Get clinician feedback on a medical document' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  async getDocumentFeedback(@Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.doctorService.getDocumentFeedback(documentId);
  }

  // -------------------------------------------------------------
  // Consultation Module
  // -------------------------------------------------------------

  @Post('doctor/patients/:patientId/consultations')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor creates a consultation note for an authorized patient' })
  @ApiParam({ name: 'patientId', description: 'Patient user ID' })
  async createConsultation(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateConsultationDto,
  ) {
    return this.doctorService.createConsultation(doctor, patientId, dto);
  }

  @Get('doctor/patients/:patientId/consultations')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor lists consultations for a patient' })
  @ApiParam({ name: 'patientId', description: 'Patient user ID' })
  async getPatientConsultations(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.doctorService.getPatientConsultations(doctor.id, patientId);
  }

  @Get('doctor/consultations/:id')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor gets consultation detail by ID' })
  @ApiParam({ name: 'id', description: 'Consultation ID' })
  async getConsultationById(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) consultationId: string,
  ) {
    return this.doctorService.getConsultationById(doctor.id, consultationId);
  }

  @Patch('doctor/consultations/:id')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor updates a consultation note' })
  @ApiParam({ name: 'id', description: 'Consultation ID' })
  async updateConsultation(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) consultationId: string,
    @Body() dto: UpdateConsultationDto,
  ) {
    return this.doctorService.updateConsultation(doctor.id, consultationId, dto);
  }

  // -------------------------------------------------------------
  // Prescription Module
  // -------------------------------------------------------------

  @Post('doctor/patients/:patientId/prescriptions')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor issues a prescription for an authorized patient' })
  @ApiParam({ name: 'patientId', description: 'Patient user ID' })
  async createPrescription(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreatePrescriptionDto,
  ) {
    return this.doctorService.createPrescription(doctor, patientId, dto);
  }

  @Get('doctor/patients/:patientId/prescriptions')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor lists prescriptions for a patient' })
  @ApiParam({ name: 'patientId', description: 'Patient user ID' })
  async getPatientPrescriptions(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.doctorService.getPatientPrescriptions(doctor.id, patientId);
  }

  @Get('doctor/prescriptions/:id')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor gets prescription detail by ID' })
  @ApiParam({ name: 'id', description: 'Prescription ID' })
  async getPrescriptionById(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) prescriptionId: string,
  ) {
    return this.doctorService.getPrescriptionById(doctor.id, prescriptionId);
  }

  // -------------------------------------------------------------
  // Investigation Request Module
  // -------------------------------------------------------------

  @Post('doctor/patients/:patientId/investigations')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor requests an investigation for an authorized patient' })
  @ApiParam({ name: 'patientId', description: 'Patient user ID' })
  async createInvestigation(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateInvestigationDto,
  ) {
    return this.doctorService.createInvestigation(doctor, patientId, dto);
  }

  @Get('doctor/patients/:patientId/investigations')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor lists investigations for a patient' })
  @ApiParam({ name: 'patientId', description: 'Patient user ID' })
  async getPatientInvestigations(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.doctorService.getPatientInvestigations(doctor.id, patientId);
  }

  @Patch('doctor/investigations/:id/status')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor updates status of an investigation request' })
  @ApiParam({ name: 'id', description: 'Investigation ID' })
  async updateInvestigationStatus(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) investigationId: string,
    @Body('status') status: string,
  ) {
    return this.doctorService.updateInvestigationStatus(doctor.id, investigationId, status);
  }

  // -------------------------------------------------------------
  // Referral Module
  // -------------------------------------------------------------

  @Post('doctor/patients/:patientId/referrals')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor creates a specialist referral for an authorized patient' })
  @ApiParam({ name: 'patientId', description: 'Patient user ID' })
  async createReferral(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateReferralDto,
  ) {
    return this.doctorService.createReferral(doctor, patientId, dto);
  }

  @Get('doctor/patients/:patientId/referrals')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor lists referrals for a patient' })
  @ApiParam({ name: 'patientId', description: 'Patient user ID' })
  async getPatientReferrals(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.doctorService.getPatientReferrals(doctor.id, patientId);
  }

  // -------------------------------------------------------------
  // Follow-up Module
  // -------------------------------------------------------------

  @Post('doctor/patients/:patientId/follow-ups')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor schedules a clinical follow-up for an authorized patient' })
  @ApiParam({ name: 'patientId', description: 'Patient user ID' })
  async createFollowUp(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateFollowUpDto,
  ) {
    return this.doctorService.createFollowUp(doctor, patientId, dto);
  }

  @Get('doctor/patients/:patientId/follow-ups')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor lists follow-ups for a patient' })
  @ApiParam({ name: 'patientId', description: 'Patient user ID' })
  async getPatientFollowUps(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ) {
    return this.doctorService.getPatientFollowUps(doctor.id, patientId);
  }

  @Get('doctor/follow-ups')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor lists all their upcoming patient follow-ups' })
  async getDoctorFollowUps(@CurrentUser() doctor: AuthenticatedUser) {
    return this.doctorService.getDoctorFollowUps(doctor.id);
  }

  @Patch('doctor/follow-ups/:id/status')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor updates follow-up status (UPCOMING, COMPLETED, MISSED, CANCELLED)' })
  @ApiParam({ name: 'id', description: 'Follow-up ID' })
  async updateFollowUpStatus(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) followUpId: string,
    @Body() dto: UpdateFollowUpStatusDto,
  ) {
    return this.doctorService.updateFollowUpStatus(doctor.id, followUpId, dto.status);
  }

  // -------------------------------------------------------------
  // Doctor Activity Log
  // -------------------------------------------------------------

  @Get('doctor/activity')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor views their own clinical & security audit trail' })
  async getDoctorActivity(@CurrentUser() doctor: AuthenticatedUser) {
    return this.doctorService.getDoctorActivity(doctor.id);
  }

  // -------------------------------------------------------------
  // Doctor Profile & Verification Endpoints
  // -------------------------------------------------------------

  @Get('doctor/profile')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor gets their own profile and verification status' })
  async getDoctorProfile(@CurrentUser() doctor: AuthenticatedUser) {
    return this.doctorService.getDoctorProfile(doctor.id);
  }

  @Patch('doctor/profile')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor updates identity, clinical credentials, practice info' })
  async updateDoctorProfile(
    @CurrentUser() doctor: AuthenticatedUser,
    @Body() dto: UpdateDoctorProfileDto,
  ) {
    return this.doctorService.updateDoctorProfile(doctor.id, dto);
  }

  @Post('doctor/verification/submit')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor submits credentials for administrative verification review' })
  async submitForVerification(@CurrentUser() doctor: AuthenticatedUser) {
    return this.doctorService.submitForVerification(doctor.id);
  }

  @Get('admin/doctor-verifications')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin lists doctor verification submissions' })
  @ApiQuery({ name: 'status', enum: DoctorVerificationStatus, required: false })
  async listDoctorVerifications(
    @Query('status') status?: DoctorVerificationStatus,
  ) {
    return this.doctorService.listDoctorVerifications(status);
  }

  @Patch('doctor/verification/:id/review')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin reviews and updates doctor verification status' })
  @ApiParam({ name: 'id', description: 'Doctor user ID' })
  async reviewVerification(
    @Param('id', ParseUUIDPipe) doctorId: string,
    @Body('status') status: DoctorVerificationStatus,
    @Body('notes') notes?: string,
    @Body('reason') reason?: string,
  ) {
    return this.doctorService.reviewVerification(doctorId, status, notes, reason);
  }

  // -------------------------------------------------------------
  // Patient Consent Management Endpoints
  // -------------------------------------------------------------

  @Get('patients/me/access-requests')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient views incoming and active clinician access requests' })
  async getPatientAccessRequests(@CurrentUser() patient: AuthenticatedUser) {
    return this.doctorService.getPatientAccessRequests(patient.id);
  }

  @Patch('patients/me/access-requests/:id/respond')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient approves, rejects, or revokes a clinician access request' })
  @ApiParam({ name: 'id', description: 'Access request ID' })
  async respondAccessRequest(
    @CurrentUser() patient: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) requestId: string,
    @Body() dto: RespondAccessDto,
  ) {
    return this.doctorService.respondAccessRequest(patient.id, requestId, dto);
  }

  @Post('patients/me/assign-doctor')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient directly assigns a doctor to their CarePath care team' })
  async assignDoctor(
    @CurrentUser() patient: AuthenticatedUser,
    @Body('doctorId', ParseUUIDPipe) doctorId: string,
    @Body('notes') notes?: string,
  ) {
    return this.doctorService.assignDoctorByPatient(patient.id, doctorId, notes);
  }

  // -------------------------------------------------------------
  // Public Doctor Directory & Showcase Reviews
  // -------------------------------------------------------------

  // -------------------------------------------------------------
  // M6: Verified Doctor Discovery & Search
  // -------------------------------------------------------------

  @Get('doctors')
  @ApiOperation({ summary: 'Search and discover verified doctors with multi-factor filters and ranking' })
  @ApiResponse({ status: 200, description: 'List of matching verified doctors with practice locations' })
  async discoverDoctors(
    @Query() dto: DiscoverDoctorsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.doctorDiscoveryService.searchDoctors(
      dto,
      user,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('doctors/:id')
  @ApiOperation({ summary: 'Get sanitized public doctor profile with practice locations and relationship status' })
  @ApiParam({ name: 'id', description: 'Doctor user ID' })
  @ApiResponse({ status: 200, description: 'Public doctor profile' })
  @ApiResponse({ status: 404, description: 'Doctor not found or not verified' })
  async getDoctorPublicProfile(
    @Param('id', ParseUUIDPipe) doctorId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.doctorDiscoveryService.getDoctorPublicProfile(
      doctorId,
      user,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('doctors/:id/showcase')
  @ApiOperation({ summary: 'Get legacy doctor showcase profile with reviews and ratings' })
  @ApiParam({ name: 'id', description: 'Doctor user ID' })
  async getDoctorShowcase(@Param('id', ParseUUIDPipe) doctorId: string) {
    return this.doctorService.getDoctorShowcase(doctorId);
  }

  @Post('doctors/:id/reviews')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient leaves a rating and review for an assigned doctor' })
  @ApiParam({ name: 'id', description: 'Doctor user ID' })
  async addDoctorReview(
    @CurrentUser() patient: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) doctorId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.doctorService.addDoctorReview(patient.id, doctorId, dto);
  }

  // -------------------------------------------------------------
  // M6: Multi-Practice Locations Management (Doctor)
  // -------------------------------------------------------------

  @Post('doctor/locations')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor adds a new clinical practice location' })
  @ApiResponse({ status: 201, description: 'Practice location added' })
  async createPracticeLocation(
    @CurrentUser() doctor: AuthenticatedUser,
    @Body() dto: CreateDoctorPracticeLocationDto,
  ) {
    return this.doctorDiscoveryService.createPracticeLocation(doctor.id, dto);
  }

  @Get('doctor/locations')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor lists all their practice locations' })
  async getDoctorPracticeLocations(@CurrentUser() doctor: AuthenticatedUser) {
    return this.doctorDiscoveryService.getDoctorPracticeLocations(doctor.id);
  }

  @Patch('doctor/locations/:locationId')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor updates a practice location' })
  @ApiParam({ name: 'locationId', description: 'Practice location ID' })
  async updatePracticeLocation(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpdateDoctorPracticeLocationDto,
  ) {
    return this.doctorDiscoveryService.updatePracticeLocation(
      doctor.id,
      locationId,
      dto,
    );
  }

  @Delete('doctor/locations/:locationId')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor removes a practice location' })
  @ApiParam({ name: 'locationId', description: 'Practice location ID' })
  async deletePracticeLocation(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.doctorDiscoveryService.deletePracticeLocation(
      doctor.id,
      locationId,
    );
  }

  // -------------------------------------------------------------
  // M6: Patient-Doctor Durable Relationship Lifecycle
  // -------------------------------------------------------------

  @Post('doctors/:id/connect')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient connects to a verified doctor' })
  @ApiParam({ name: 'id', description: 'Doctor user ID' })
  @ApiResponse({ status: 201, description: 'Relationship created or made active' })
  async connectDoctor(
    @CurrentUser() patient: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) doctorId: string,
    @Body() dto: ConnectDoctorDto,
    @Req() req: Request,
  ) {
    return this.doctorRelationshipService.connectDoctor(
      patient.id,
      doctorId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('doctors/:id/reconnect')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient reconnects with a previously disconnected doctor' })
  @ApiParam({ name: 'id', description: 'Doctor user ID' })
  async reconnectDoctor(
    @CurrentUser() patient: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) doctorId: string,
    @Req() req: Request,
  ) {
    return this.doctorRelationshipService.reconnectDoctor(
      patient.id,
      doctorId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('doctors/:id/disconnect')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient ends relationship with a doctor (preserves historical clinical records)' })
  @ApiParam({ name: 'id', description: 'Doctor user ID' })
  async disconnectDoctor(
    @CurrentUser() patient: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) doctorId: string,
    @Body() dto: DisconnectDoctorDto,
    @Req() req: Request,
  ) {
    return this.doctorRelationshipService.disconnectDoctor(
      patient.id,
      doctorId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('doctors/:id/block')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient blocks doctor relationship' })
  @ApiParam({ name: 'id', description: 'Doctor user ID' })
  async blockDoctor(
    @CurrentUser() patient: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) doctorId: string,
    @Body() dto: BlockDoctorDto,
    @Req() req: Request,
  ) {
    return this.doctorRelationshipService.blockDoctor(
      patient.id,
      doctorId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('doctors/:id/unblock')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient unblocks doctor relationship' })
  @ApiParam({ name: 'id', description: 'Doctor user ID' })
  async unblockDoctor(
    @CurrentUser() patient: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) doctorId: string,
    @Req() req: Request,
  ) {
    return this.doctorRelationshipService.unblockDoctor(
      patient.id,
      doctorId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  // -------------------------------------------------------------
  // M6: Patient Relationship Queries & History
  // -------------------------------------------------------------

  @Get('patients/me/doctors')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient lists currently connected doctors' })
  @ApiQuery({ name: 'status', enum: RelationshipStatus, required: false })
  async getPatientDoctors(
    @CurrentUser() patient: AuthenticatedUser,
    @Query('status') status?: RelationshipStatus,
    @Req() req?: Request,
  ) {
    return this.doctorRelationshipService.getPatientDoctors(
      patient.id,
      status,
      req?.ip,
      req?.headers['user-agent'],
    );
  }

  @Get('patients/me/doctors/history')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient views relationship history events across all connected/disconnected doctors' })
  async getPatientRelationshipHistory(@CurrentUser() patient: AuthenticatedUser) {
    return this.doctorRelationshipService.getPatientRelationshipHistory(patient.id);
  }

  @Get('patients/me/doctors/previously-consulted')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient lists doctors with whom they had clinical consultations (consultation history)' })
  async getPreviouslyConsultedDoctors(@CurrentUser() patient: AuthenticatedUser) {
    return this.doctorRelationshipService.getPreviouslyConsultedDoctors(patient.id);
  }

  @Get('patients/me/doctor-search-history')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient views recent doctor search and profile view history' })
  async getPatientSearchHistory(@CurrentUser() patient: AuthenticatedUser) {
    return this.doctorRelationshipService.getPatientSearchHistory(patient.id);
  }

  @Delete('patients/me/doctor-search-history/:id')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient deletes a single doctor search history item' })
  @ApiParam({ name: 'id', description: 'Search history ID' })
  async deleteSearchHistoryItem(
    @CurrentUser() patient: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.doctorRelationshipService.clearPatientSearchHistory(patient.id, id);
  }

  @Delete('patients/me/doctor-search-history')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient clears all doctor search history' })
  async clearAllSearchHistory(@CurrentUser() patient: AuthenticatedUser) {
    return this.doctorRelationshipService.clearPatientSearchHistory(patient.id);
  }

  // -------------------------------------------------------------
  // M6: Doctor Patient Roster
  // -------------------------------------------------------------

  @Get('doctors/me/patients')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Doctor lists connected patients from the relationship network' })
  @ApiQuery({ name: 'search', required: false, description: 'Search patient by name, email, or city' })
  async getDoctorConnectedPatients(
    @CurrentUser() doctor: AuthenticatedUser,
    @Query('search') search?: string,
  ) {
    return this.doctorRelationshipService.getDoctorConnectedPatients(doctor.id, search);
  }
}

