import {
  Controller,
  Get,
  Post,
  Patch,
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
import { LabService } from './lab.service';
import { RegisterLabDto } from './dto/register-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';
import { ReviewLabVerificationDto } from './dto/review-lab-verification.dto';
import { CreateLabTestDto } from './dto/create-lab-test.dto';
import { UpdateLabTestDto } from './dto/update-lab-test.dto';
import { CreateLabOrderDto } from './dto/create-lab-order.dto';
import { UpdateLabOrderStatusDto } from './dto/update-lab-order-status.dto';
import { CreateLabSampleDto } from './dto/create-lab-sample.dto';
import { UpdateLabSampleDto } from './dto/update-lab-sample.dto';
import { CreateLabReportDto } from './dto/create-lab-report.dto';
import { FinalizeLabReportDto } from './dto/finalize-lab-report.dto';
import { AmendLabReportDto } from './dto/amend-lab-report.dto';
import { DiscoverLabsDto, LabDiscoverySort } from './dto/discover-labs.dto';
import { CreateCanonicalTestDto } from './dto/create-canonical-test.dto';
import { CreateLabLocationDto } from './dto/create-lab-location.dto';
import { SelectLabForInvestigationDto } from './dto/select-lab-for-investigation.dto';
import { ShareLabReportWithDoctorDto } from './dto/share-lab-report-with-doctor.dto';
import { RevokeLabCareConnectionDto } from './dto/revoke-lab-care-connection.dto';
import { LabMarketplaceService } from './lab-marketplace.service';
import { LabCareConnectionService } from './lab-care-connection.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserStatusGuard } from '../common/guards/user-status.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import {
  Role,
  LabMemberRole,
  LabTestCategory,
  LabOrderStatus,
  LabVerificationStatus,
  LabCollectionMode,
} from '@prisma/client';

@ApiTags('Laboratory Platform')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, UserStatusGuard, RolesGuard)
@Controller()
export class LabController {
  constructor(
    private readonly labService: LabService,
    private readonly labMarketplaceService: LabMarketplaceService,
    private readonly labCareConnectionService: LabCareConnectionService,
  ) {}


  // -------------------------------------------------------------
  // 1. Lab Organization Endpoints
  // -------------------------------------------------------------

  @Post('labs')
  @ApiOperation({ summary: 'Register a new diagnostic laboratory facility' })
  @ApiResponse({ status: 201, description: 'Laboratory registered and pending administrative verification' })
  async registerLab(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterLabDto,
    @Req() req: Request,
  ) {
    return this.labService.registerLab(user, dto, req.ip, req.headers['user-agent']);
  }

  @Get('labs/me')
  @Roles(Role.LAB, Role.ADMIN)
  @ApiOperation({ summary: 'Get current user active laboratory organization and role' })
  @ApiResponse({ status: 200, description: 'Laboratory profile and membership details' })
  async getMyLab(@CurrentUser() user: AuthenticatedUser) {
    return this.labService.getMyLab(user.id);
  }

  @Get('labs')
  @ApiOperation({ summary: 'Discover verified active diagnostic laboratories' })
  @ApiQuery({ name: 'city', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of verified laboratories' })
  async listVerifiedLabs(
    @Query('city') city?: string,
    @Query('search') search?: string,
  ) {
    return this.labService.listVerifiedLabs({ city, search });
  }

  @Get('labs/:id')
  @ApiParam({ name: 'id', description: 'Laboratory ID' })
  @ApiOperation({ summary: 'Get laboratory facility profile by ID' })
  @ApiResponse({ status: 200, description: 'Laboratory details and test counts' })
  async getLabProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.labService.getLabProfile(id);
  }

  @Patch('labs/:id')
  @Roles(Role.LAB, Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Laboratory ID' })
  @ApiOperation({ summary: 'Update laboratory profile (LAB_ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Laboratory profile updated successfully' })
  async updateLabProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabDto,
    @Req() req: Request,
  ) {
    return this.labService.updateLabProfile(user, id, dto, req.ip, req.headers['user-agent']);
  }

  @Post('labs/:id/members')
  @Roles(Role.LAB, Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Laboratory ID' })
  @ApiOperation({ summary: 'Add a staff member to the laboratory facility' })
  @ApiResponse({ status: 201, description: 'Staff member added to laboratory' })
  async addLabMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('userId', ParseUUIDPipe) targetUserId: string,
    @Body('role') role?: LabMemberRole,
  ) {
    return this.labService.addLabMember(user, id, targetUserId, role);
  }

  @Get('labs/:id/members')
  @Roles(Role.LAB, Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Laboratory ID' })
  @ApiOperation({ summary: 'List staff members belonging to the laboratory' })
  @ApiResponse({ status: 200, description: 'List of staff memberships' })
  async listLabMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.labService.listLabMembers(user, id);
  }

  // -------------------------------------------------------------
  // 2. Lab Test Catalog Endpoints
  // -------------------------------------------------------------

  @Post('labs/:id/tests')
  @Roles(Role.LAB, Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Laboratory ID' })
  @ApiOperation({ summary: 'Add a diagnostic test to the laboratory catalog' })
  @ApiResponse({ status: 201, description: 'Test created in catalog' })
  async createCatalogTest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLabTestDto,
    @Req() req: Request,
  ) {
    return this.labService.createCatalogTest(user, id, dto, req.ip, req.headers['user-agent']);
  }

  @Patch('labs/:id/tests/:testId')
  @Roles(Role.LAB, Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Laboratory ID' })
  @ApiParam({ name: 'testId', description: 'Catalog Test ID' })
  @ApiOperation({ summary: 'Update a diagnostic test in the catalog' })
  @ApiResponse({ status: 200, description: 'Test updated in catalog' })
  async updateCatalogTest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('testId', ParseUUIDPipe) testId: string,
    @Body() dto: UpdateLabTestDto,
    @Req() req: Request,
  ) {
    return this.labService.updateCatalogTest(user, id, testId, dto, req.ip, req.headers['user-agent']);
  }

  @Get('labs/:id/tests')
  @ApiParam({ name: 'id', description: 'Laboratory ID' })
  @ApiQuery({ name: 'category', required: false, enum: LabTestCategory })
  @ApiOperation({ summary: 'List active diagnostic tests in a laboratory catalog' })
  @ApiResponse({ status: 200, description: 'Catalog tests list' })
  async listLabTests(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('category') category?: LabTestCategory,
  ) {
    return this.labService.listLabTests(id, category);
  }

  // -------------------------------------------------------------
  // 3. Lab Orders Lifecycle Endpoints
  // -------------------------------------------------------------

  @Post('lab-orders')
  @ApiOperation({ summary: 'Create a new laboratory diagnostic order' })
  @ApiResponse({ status: 201, description: 'Order created with snapshotted items' })
  async createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLabOrderDto,
    @Req() req: Request,
  ) {
    return this.labService.createOrder(user, dto, req.ip, req.headers['user-agent']);
  }

  @Get('lab-orders')
  @ApiOperation({ summary: 'List laboratory orders (role-scoped)' })
  @ApiQuery({ name: 'status', required: false, enum: LabOrderStatus })
  @ApiQuery({ name: 'labId', required: false, type: String })
  @ApiQuery({ name: 'patientId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated orders list' })
  async listOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: LabOrderStatus,
    @Query('labId') labId?: string,
    @Query('patientId') patientId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.labService.listOrders(user, { status, labId, patientId, page, limit });
  }

  @Get('lab-orders/:id')
  @ApiParam({ name: 'id', description: 'Lab Order ID' })
  @ApiOperation({ summary: 'Get laboratory order details (scoped with privacy filtering)' })
  @ApiResponse({ status: 200, description: 'Order details' })
  async getOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.labService.getOrder(user, id, req.ip, req.headers['user-agent']);
  }

  @Patch('lab-orders/:id/status')
  @ApiParam({ name: 'id', description: 'Lab Order ID' })
  @ApiOperation({ summary: 'Update operational status of a laboratory order' })
  @ApiResponse({ status: 200, description: 'Order status updated' })
  async updateOrderStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabOrderStatusDto,
    @Req() req: Request,
  ) {
    return this.labService.updateOrderStatus(user, id, dto, req.ip, req.headers['user-agent']);
  }

  // -------------------------------------------------------------
  // 4. Lab Samples Endpoints
  // -------------------------------------------------------------

  @Post('lab-orders/:id/samples')
  @Roles(Role.LAB, Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Lab Order ID' })
  @ApiOperation({ summary: 'Log sample specimen collection for a laboratory order' })
  @ApiResponse({ status: 201, description: 'Sample logged' })
  async createSample(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateLabSampleDto,
    @Req() req: Request,
  ) {
    return this.labService.createSample(user, orderId, dto, req.ip, req.headers['user-agent']);
  }

  @Patch('lab-samples/:sampleId')
  @Roles(Role.LAB, Role.ADMIN)
  @ApiParam({ name: 'sampleId', description: 'Sample ID' })
  @ApiOperation({ summary: 'Update specimen status (RECEIVED, REJECTED, PROCESSING, COMPLETED)' })
  @ApiResponse({ status: 200, description: 'Sample status updated' })
  async updateSampleStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sampleId', ParseUUIDPipe) sampleId: string,
    @Body() dto: UpdateLabSampleDto,
    @Req() req: Request,
  ) {
    return this.labService.updateSampleStatus(user, sampleId, dto, req.ip, req.headers['user-agent']);
  }

  // -------------------------------------------------------------
  // 5. Lab Reports Lifecycle Endpoints
  // -------------------------------------------------------------

  @Post('lab-orders/:id/reports')
  @Roles(Role.LAB, Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Lab Order ID' })
  @ApiOperation({ summary: 'Initiate a preliminary or draft diagnostic report' })
  @ApiResponse({ status: 201, description: 'Draft report created' })
  async createDraftReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateLabReportDto,
    @Req() req: Request,
  ) {
    return this.labService.createDraftReport(user, orderId, dto, req.ip, req.headers['user-agent']);
  }

  @Patch('lab-reports/:id')
  @Roles(Role.LAB, Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Lab Report ID' })
  @ApiOperation({ summary: 'Update draft report content (forbidden if report is already finalized)' })
  @ApiResponse({ status: 200, description: 'Report updated' })
  async updateReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLabReportDto,
    @Req() req: Request,
  ) {
    return this.labService.updateReport(user, id, dto, req.ip, req.headers['user-agent']);
  }

  @Post('lab-reports/:id/finalize')
  @Roles(Role.LAB, Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Lab Report ID' })
  @ApiOperation({ summary: 'Finalize and publish diagnostic report (immutable; projected to timeline)' })
  @ApiResponse({ status: 200, description: 'Report finalized and published' })
  async finalizeReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinalizeLabReportDto,
    @Req() req: Request,
  ) {
    return this.labService.finalizeReport(user, id, dto, req.ip, req.headers['user-agent']);
  }

  @Post('lab-reports/:id/amend')
  @Roles(Role.LAB, Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Original Lab Report ID' })
  @ApiOperation({ summary: 'Formally amend a finalized lab report (creates versioned successor)' })
  @ApiResponse({ status: 201, description: 'Amended report published and projected to timeline' })
  async amendReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AmendLabReportDto,
    @Req() req: Request,
  ) {
    return this.labService.amendReport(user, id, dto, req.ip, req.headers['user-agent']);
  }

  @Get('lab-reports/:id')
  @ApiParam({ name: 'id', description: 'Lab Report ID' })
  @ApiOperation({ summary: 'View diagnostic lab report details' })
  @ApiResponse({ status: 200, description: 'Lab report details' })
  async getReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.labService.getReport(user, id, req.ip, req.headers['user-agent']);
  }

  // -------------------------------------------------------------
  // 6. Admin Verification Endpoints
  // -------------------------------------------------------------

  @Get('admin/labs/verifications')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List laboratory verifications pending or reviewed (Admin only)' })
  @ApiQuery({ name: 'status', required: false, enum: LabVerificationStatus })
  @ApiResponse({ status: 200, description: 'List of laboratories' })
  async listVerifications(@Query('status') status?: LabVerificationStatus) {
    return this.labService.listVerifications(status);
  }

  @Patch('admin/labs/:id/verification')
  @Roles(Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Laboratory ID' })
  @ApiOperation({ summary: 'Review and approve/reject laboratory verification (Admin only)' })
  @ApiResponse({ status: 200, description: 'Verification reviewed' })
  async reviewLabVerification(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewLabVerificationDto,
    @Req() req: Request,
  ) {
    return this.labService.reviewLabVerification(admin, id, dto, req.ip, req.headers['user-agent']);
  }

  // -------------------------------------------------------------
  // 7. M5.1 Lab Discovery & Investigation Marketplace
  // -------------------------------------------------------------

  @Get('labs/discover')
  @ApiOperation({ summary: 'Discover labs with geospatial distance, test prices, and multi-factor ranking' })
  @ApiResponse({ status: 200, description: 'Ranked list of verified laboratories matching query' })
  async discoverLabs(
    @Query() dto: DiscoverLabsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.labMarketplaceService.discoverLabs(dto, user, req.ip, req.headers['user-agent']);
  }

  @Get('labs/canonical-tests')
  @ApiOperation({ summary: 'List standard canonical diagnostic tests with offering counts' })
  @ApiQuery({ name: 'category', required: false, enum: LabTestCategory })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of canonical diagnostic tests' })
  async listCanonicalTests(
    @Query('category') category?: LabTestCategory,
    @Query('search') search?: string,
  ) {
    return this.labMarketplaceService.listCanonicalTests(category, search);
  }

  @Get('labs/canonical-tests/:id')
  @ApiParam({ name: 'id', description: 'Canonical Test ID' })
  @ApiOperation({ summary: 'Get canonical diagnostic test details and all offering labs' })
  @ApiResponse({ status: 200, description: 'Canonical test details' })
  async getCanonicalTest(@Param('id', ParseUUIDPipe) id: string) {
    return this.labMarketplaceService.getCanonicalTest(id);
  }

  @Post('admin/canonical-tests')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Define a new canonical diagnostic test specification (Admin only)' })
  @ApiResponse({ status: 201, description: 'Canonical test created' })
  async createCanonicalTest(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateCanonicalTestDto,
  ) {
    return this.labMarketplaceService.createCanonicalTest(admin, dto);
  }

  // -------------------------------------------------------------
  // 8. M5.1 Multi-Branch Laboratory Locations
  // -------------------------------------------------------------

  @Post('labs/:id/locations')
  @Roles(Role.LAB, Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Laboratory Organization ID' })
  @ApiOperation({ summary: 'Add a branch/collection center location for a laboratory' })
  @ApiResponse({ status: 201, description: 'Location created' })
  async createLabLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) labId: string,
    @Body() dto: CreateLabLocationDto,
  ) {
    return this.labMarketplaceService.createLabLocation(user, labId, dto);
  }

  @Get('labs/:id/locations')
  @ApiParam({ name: 'id', description: 'Laboratory Organization ID' })
  @ApiOperation({ summary: 'List active branch locations for a laboratory' })
  @ApiResponse({ status: 200, description: 'List of branch locations' })
  async listLabLocations(@Param('id', ParseUUIDPipe) labId: string) {
    return this.labMarketplaceService.listLabLocations(labId);
  }

  // -------------------------------------------------------------
  // 9. M5.1 Investigation Lab Selection & Comparison
  // -------------------------------------------------------------

  @Get('investigations')
  @Roles(Role.PATIENT, Role.ADMIN)
  @ApiOperation({ summary: 'List all diagnostic investigation requests for current patient' })
  @ApiResponse({ status: 200, description: 'List of investigations' })
  async getMyInvestigations(@CurrentUser() user: AuthenticatedUser) {
    return this.labMarketplaceService.getPatientInvestigations(user.id);
  }

  @Get('investigations/:id')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Investigation Request ID' })
  @ApiOperation({ summary: 'Get details of an investigation request' })
  @ApiResponse({ status: 200, description: 'Investigation request details' })
  async getInvestigationById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.labMarketplaceService.getInvestigationById(user.id, id);
  }

  @Get('investigations/:id/labs/comparison')
  @Roles(Role.PATIENT, Role.DOCTOR, Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Investigation Request ID' })
  @ApiQuery({ name: 'latitude', required: false, type: Number })
  @ApiQuery({ name: 'longitude', required: false, type: Number })
  @ApiQuery({ name: 'collectionMode', required: false, enum: LabCollectionMode })
  @ApiQuery({ name: 'sort', required: false, enum: LabDiscoverySort })
  @ApiOperation({ summary: 'Side-by-side comparison of labs offering tests for a doctor investigation request' })
  @ApiResponse({ status: 200, description: 'Investigation comparison with pricing and turnaround breakdown' })
  async compareLabsForInvestigation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) investigationRequestId: string,
    @Query('latitude') latitude?: number,
    @Query('longitude') longitude?: number,
    @Query('collectionMode') collectionMode?: LabCollectionMode,
    @Query('sort') sort?: LabDiscoverySort,
    @Req() req?: Request,
  ) {
    return this.labMarketplaceService.compareLabsForInvestigation(
      user.id,
      investigationRequestId,
      { latitude, longitude, collectionMode, sort },
      req?.ip,
      req?.headers['user-agent'],
    );
  }

  @Post('investigations/:id/select-lab')
  @Roles(Role.PATIENT)
  @ApiParam({ name: 'id', description: 'Investigation Request ID' })
  @ApiOperation({ summary: 'Patient selects laboratory: establishes purpose-bound temporary clinical connection' })
  @ApiResponse({ status: 201, description: 'Order created and temporary clinical connection established' })
  async selectLabForInvestigation(
    @CurrentUser() patient: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) investigationRequestId: string,
    @Body() dto: SelectLabForInvestigationDto,
    @Req() req: Request,
  ) {
    return this.labCareConnectionService.selectLabForInvestigation(
      patient,
      investigationRequestId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  // -------------------------------------------------------------
  // 10. M5.1 Temporary Clinical Connections
  // -------------------------------------------------------------

  @Get('lab-care-connections/:id')
  @ApiOperation({ summary: 'View temporary clinical connection context (strict minimum-necessary scoping for labs)' })
  @ApiParam({ name: 'id', description: 'Lab Care Connection ID' })
  @ApiResponse({ status: 200, description: 'Clinical connection context' })
  async getConnectionDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) connectionId: string,
    @Req() req: Request,
  ) {
    return this.labCareConnectionService.getConnectionDetails(
      user,
      connectionId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get('lab-care-connections/orders/:orderId')
  @ApiParam({ name: 'orderId', description: 'Lab Order ID' })
  @ApiOperation({ summary: 'Get clinical connection by laboratory order ID' })
  @ApiResponse({ status: 200, description: 'Clinical connection details' })
  async getConnectionByOrderId(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.labCareConnectionService.getConnectionByOrderId(user, orderId);
  }

  @Post('lab-care-connections/:id/revoke')
  @Roles(Role.PATIENT, Role.ADMIN)
  @ApiParam({ name: 'id', description: 'Lab Care Connection ID' })
  @ApiOperation({ summary: 'Patient manually revokes a temporary laboratory clinical connection' })
  @ApiResponse({ status: 200, description: 'Clinical connection revoked' })
  async revokeConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) connectionId: string,
    @Body() dto: RevokeLabCareConnectionDto,
    @Req() req: Request,
  ) {
    return this.labCareConnectionService.revokeConnection(
      user,
      connectionId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  // -------------------------------------------------------------
  // 11. M5.1 Patient-Controlled Report Sharing with Doctor
  // -------------------------------------------------------------

  @Post('lab-reports/:id/share-with-doctor')
  @Roles(Role.PATIENT)
  @ApiParam({ name: 'id', description: 'Finalized Lab Report ID' })
  @ApiOperation({ summary: 'Patient explicitly shares diagnostic report with prescribing doctor for review' })
  @ApiResponse({ status: 200, description: 'Report shared and consent granted' })
  async shareReportWithDoctor(
    @CurrentUser() patient: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) reportId: string,
    @Body() dto: ShareLabReportWithDoctorDto,
    @Req() req: Request,
  ) {
    return this.labCareConnectionService.shareReportWithDoctor(
      patient,
      reportId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }
}

