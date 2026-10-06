/*
  Warnings:

  - A unique constraint covering the columns `[patientId,sourceType,sourceId]` on the table `HealthTimelineEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TimelineSourceType" AS ENUM ('DOCUMENT', 'CONSULTATION', 'PRESCRIPTION', 'INVESTIGATION', 'REFERRAL', 'FOLLOW_UP', 'APPOINTMENT', 'LAB_RESULT', 'OTHER');

-- CreateEnum
CREATE TYPE "TimelineDatePrecision" AS ENUM ('EXACT', 'DAY', 'MONTH', 'YEAR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TimelineVisibility" AS ENUM ('PRIVATE', 'SHARED', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "RestoreRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'REVOKED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('REVIEW_RECENT_REPORTS', 'FOLLOW_UP_CARE', 'SECOND_OPINION', 'CONSULTATION', 'INVESTIGATION_REVIEW', 'ONGOING_CARE', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsentResourceType" AS ENUM ('DOCUMENT', 'TIMELINE', 'CONSULTATION', 'PRESCRIPTION', 'INVESTIGATION', 'REFERRAL', 'FOLLOW_UP', 'PROFILE', 'LAB_ORDER', 'LAB_REPORT');

-- CreateEnum
CREATE TYPE "ConsentAccessLevel" AS ENUM ('VIEW', 'DOWNLOAD');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CONSENT_REQUESTED', 'CONSENT_APPROVED', 'CONSENT_DECLINED', 'CONSENT_REVOKED', 'CONSENT_EXPIRING_SOON', 'CONSENT_EXPIRED', 'ACCESS_REQUESTED', 'ACCESS_GRANTED', 'DOCTOR_ASSIGNED', 'DOCUMENT_UPLOADED', 'CLINICAL_FEEDBACK_ADDED', 'CONSULTATION_CREATED', 'PRESCRIPTION_ISSUED', 'INVESTIGATION_ORDERED', 'FOLLOW_UP_SCHEDULED', 'DOCUMENT_RESTORED', 'DOCTOR_VERIFIED', 'SECURITY_ALERT', 'GENERAL', 'LAB_ORDER_CREATED', 'LAB_ORDER_ACCEPTED', 'LAB_ORDER_CANCELLED', 'LAB_SAMPLE_COLLECTED', 'LAB_SAMPLE_RECEIVED', 'LAB_SAMPLE_REJECTED', 'LAB_REPORT_READY', 'LAB_REPORT_AMENDED', 'LAB_VERIFICATION_SUBMITTED', 'LAB_VERIFIED', 'LAB_REJECTED', 'LAB_CARE_CONNECTION_CREATED', 'LAB_CARE_CONNECTION_EXPIRED', 'LAB_REPORT_DELIVERED', 'LAB_REPORT_SHARED', 'DOCTOR_CONNECTED', 'DOCTOR_DISCONNECTED', 'DOCTOR_RECONNECTED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "DoctorVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('UPCOMING', 'COMPLETED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LabVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "LabMemberRole" AS ENUM ('LAB_ADMIN', 'LAB_TECHNICIAN', 'LAB_PATHOLOGIST');

-- CreateEnum
CREATE TYPE "LabMemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "LabTestCategory" AS ENUM ('HEMATOLOGY', 'BIOCHEMISTRY', 'PATHOLOGY', 'MICROBIOLOGY', 'IMMUNOLOGY', 'ENDOCRINOLOGY', 'URINALYSIS', 'OTHER');

-- CreateEnum
CREATE TYPE "LabOrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'SAMPLE_PENDING', 'SAMPLE_COLLECTED', 'PROCESSING', 'REPORT_PENDING_REVIEW', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LabCollectionMode" AS ENUM ('LAB', 'HOME');

-- CreateEnum
CREATE TYPE "LabSampleStatus" AS ENUM ('PENDING', 'COLLECTED', 'RECEIVED', 'REJECTED', 'PROCESSING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LabReportStatus" AS ENUM ('DRAFT', 'PROCESSING', 'READY_FOR_REVIEW', 'FINALIZED', 'AMENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LabCareConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'SAMPLE_COLLECTED', 'TEST_COMPLETED', 'REPORT_READY', 'COMPLETED', 'EXPIRED', 'REVOKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LabCareAccessScope" AS ENUM ('PATIENT_BASIC_PROFILE', 'INVESTIGATION_REQUEST', 'RELEVANT_PRESCRIPTION', 'RELEVANT_MEDICATION_CONTEXT', 'RELEVANT_PRIOR_REPORT', 'SAMPLE_INFORMATION');

-- CreateEnum
CREATE TYPE "RelationshipStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RelationshipEventType" AS ENUM ('CONNECTED', 'DISCONNECTED', 'RECONNECTED', 'BLOCKED', 'UNBLOCKED');

-- CreateEnum
CREATE TYPE "ConnectionSource" AS ENUM ('SEARCH', 'DOCTOR_INVITE', 'CONSULTATION', 'REFERRAL', 'LAB_FOLLOW_UP', 'OTHER');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'VIEW_PATIENT';
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_CONSULTATION';
ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_CONSULTATION';
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_PRESCRIPTION';
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_INVESTIGATION';
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_REFERRAL';
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_FOLLOW_UP';
ALTER TYPE "AuditAction" ADD VALUE 'UPDATE_FOLLOW_UP';
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_CONSENT';
ALTER TYPE "AuditAction" ADD VALUE 'APPROVE_CONSENT';
ALTER TYPE "AuditAction" ADD VALUE 'DECLINE_CONSENT';
ALTER TYPE "AuditAction" ADD VALUE 'REVOKE_CONSENT';
ALTER TYPE "AuditAction" ADD VALUE 'EXPIRE_CONSENT';
ALTER TYPE "AuditAction" ADD VALUE 'CANCEL_CONSENT';
ALTER TYPE "AuditAction" ADD VALUE 'VIEW_CONSENT';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_VERIFICATION_SUBMIT';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_VERIFICATION_REVIEW';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_RESTORE_REQUEST';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_RESTORE_CANCEL';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_RESTORE_APPROVE';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_RESTORE_REJECT';
ALTER TYPE "AuditAction" ADD VALUE 'DOWNLOAD_PROHIBITED_BLOCKED';
ALTER TYPE "AuditAction" ADD VALUE 'VIEW_TIMELINE';
ALTER TYPE "AuditAction" ADD VALUE 'VIEW_TIMELINE_EVENT';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_REGISTER';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_VERIFICATION_SUBMIT';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_VERIFICATION_REVIEW';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_TEST_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_TEST_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_ORDER_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_ORDER_STATUS_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_ORDER_CANCEL';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_SAMPLE_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_SAMPLE_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_REPORT_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_REPORT_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_REPORT_FINALIZE';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_REPORT_AMEND';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_REPORT_VIEW';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_DISCOVERY';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_PRICE_VIEW';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_SELECTED';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_CARE_CONNECTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_CARE_ACCESS_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_CARE_ACCESS_DENIED';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_CARE_ACCESS_EXPIRED';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_CARE_ACCESS_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE 'LAB_REPORT_SHARED_WITH_DOCTOR';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_SEARCH';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_PROFILE_VIEW';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_CONNECT';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_RECONNECT';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_DISCONNECT';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_BLOCK';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_UNBLOCK';
ALTER TYPE "AuditAction" ADD VALUE 'DOCTOR_RELATIONSHIP_VIEW';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'LAB';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TimelineEventType" ADD VALUE 'DOCUMENT';
ALTER TYPE "TimelineEventType" ADD VALUE 'CONSULTATION';
ALTER TYPE "TimelineEventType" ADD VALUE 'PRESCRIPTION';
ALTER TYPE "TimelineEventType" ADD VALUE 'INVESTIGATION';
ALTER TYPE "TimelineEventType" ADD VALUE 'REFERRAL';
ALTER TYPE "TimelineEventType" ADD VALUE 'FOLLOW_UP';
ALTER TYPE "TimelineEventType" ADD VALUE 'APPOINTMENT';
ALTER TYPE "TimelineEventType" ADD VALUE 'LAB_RESULT';
ALTER TYPE "TimelineEventType" ADD VALUE 'IMAGING';
ALTER TYPE "TimelineEventType" ADD VALUE 'PROCEDURE';
ALTER TYPE "TimelineEventType" ADD VALUE 'HOSPITALIZATION';
ALTER TYPE "TimelineEventType" ADD VALUE 'INVESTIGATION_REQUESTED';
ALTER TYPE "TimelineEventType" ADD VALUE 'REFERRAL_CREATED';
ALTER TYPE "TimelineEventType" ADD VALUE 'FOLLOW_UP_SCHEDULED';
ALTER TYPE "TimelineEventType" ADD VALUE 'CONSENT_GRANTED';
ALTER TYPE "TimelineEventType" ADD VALUE 'CONSENT_REVOKED';
ALTER TYPE "TimelineEventType" ADD VALUE 'LAB_ORDER_PLACED';
ALTER TYPE "TimelineEventType" ADD VALUE 'LAB_REPORT_DELIVERED';
ALTER TYPE "TimelineEventType" ADD VALUE 'LAB_REPORT_SHARED';

-- DropIndex
DROP INDEX "HealthTimelineEvent_eventType_idx";

-- DropIndex
DROP INDEX "HealthTimelineEvent_patientId_idx";

-- AlterTable
ALTER TABLE "DoctorProfile" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "clinicAddress" TEXT,
ADD COLUMN     "clinicName" TEXT,
ADD COLUMN     "consultationFee" TEXT,
ADD COLUMN     "consultationMode" TEXT DEFAULT 'IN_PERSON',
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "education" TEXT,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "medicalCertificate" TEXT,
ADD COLUMN     "mobile" TEXT,
ADD COLUMN     "profilePhoto" TEXT,
ADD COLUMN     "qualifications" TEXT,
ADD COLUMN     "registrationAuthority" TEXT,
ADD COLUMN     "registrationCountry" TEXT DEFAULT 'India',
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "registrationState" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "subSpecialty" TEXT,
ADD COLUMN     "verificationNotes" TEXT,
ADD COLUMN     "verificationStatus" "DoctorVerificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "verificationSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "workingHours" TEXT,
ADD COLUMN     "yearsOfExperience" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "restoreReason" TEXT,
ADD COLUMN     "restoreRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "restoreRequestedAt" TIMESTAMP(3),
ADD COLUMN     "restoreStatus" "RestoreRequestStatus";

-- AlterTable
ALTER TABLE "HealthTimelineEvent" ADD COLUMN     "datePrecision" "TimelineDatePrecision" NOT NULL DEFAULT 'DAY',
ADD COLUMN     "providerId" TEXT,
ADD COLUMN     "providerName" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" "TimelineSourceType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "visibility" "TimelineVisibility" NOT NULL DEFAULT 'SHARED';

-- CreateTable
CREATE TABLE "DocumentRestoreRequest" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "RestoreRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "reviewedById" TEXT,
    "adminNotes" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentRestoreRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorPatientAccess" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "status" "AccessStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "relationshipType" TEXT NOT NULL DEFAULT 'PRIMARY_PHYSICIAN',
    "accessScope" TEXT[] DEFAULT ARRAY['LAB_REPORT', 'PRESCRIPTION', 'CONSULTATION', 'DISCHARGE_SUMMARY', 'IMAGING_REPORT', 'XRAY', 'CT', 'MRI', 'OTHER']::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "requestedBy" "Role" NOT NULL DEFAULT 'DOCTOR',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorPatientAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorFeedback" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "recommendations" TEXT,
    "isReviewed" BOOLEAN NOT NULL DEFAULT true,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorReview" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "consultationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reasonForVisit" TEXT NOT NULL,
    "chiefComplaint" TEXT NOT NULL,
    "clinicalNotes" TEXT NOT NULL,
    "assessment" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "followUpDate" TIMESTAMP(3),
    "followUpInstructions" TEXT,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "consultationId" TEXT,
    "prescriptionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicineName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "instructions" TEXT,
    "additionalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestigationRequest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "investigationName" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'LABORATORY',
    "reason" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "requestedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestigationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "referredProvider" TEXT,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "referralDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "instructions" TEXT,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'UPCOMING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterRole" "Role" NOT NULL DEFAULT 'DOCTOR',
    "purpose" "ConsentPurpose" NOT NULL DEFAULT 'REVIEW_RECENT_REPORTS',
    "purposeDescription" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
    "declineReason" TEXT,
    "revokeReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentScope" (
    "id" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "resourceType" "ConsentResourceType" NOT NULL,
    "resourceId" TEXT,
    "resourceCategory" TEXT,
    "accessLevel" "ConsentAccessLevel" NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabOrganization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "licenseNumber" TEXT NOT NULL,
    "accreditationDetails" JSONB,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "operatingHours" JSONB,
    "supportedSampleTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verificationStatus" "LabVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verificationNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabMembership" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "LabMemberRole" NOT NULL DEFAULT 'LAB_ADMIN',
    "status" "LabMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalTest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "LabTestCategory" NOT NULL,
    "description" TEXT,
    "sampleTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultTurnaroundTime" TEXT,
    "synonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabLocation" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "area" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "operatingHours" JSONB,
    "homeCollectionAvailable" BOOLEAN NOT NULL DEFAULT false,
    "homeCollectionFee" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTest" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "canonicalTestId" TEXT,
    "testCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "LabTestCategory" NOT NULL,
    "description" TEXT,
    "sampleTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "turnaroundTime" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "preparationNotes" TEXT,
    "isHomeCollection" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "prescribedDoctorId" TEXT,
    "investigationRequestId" TEXT,
    "labId" TEXT NOT NULL,
    "labLocationId" TEXT,
    "canonicalTestId" TEXT,
    "status" "LabOrderStatus" NOT NULL DEFAULT 'PENDING',
    "collectionMode" "LabCollectionMode" NOT NULL DEFAULT 'LAB',
    "collectionAddress" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "instructions" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "notes" TEXT,
    "basePrice" DECIMAL(10,2),
    "homeCollectionFee" DECIMAL(10,2),
    "discount" DECIMAL(10,2),
    "totalPrice" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "cancelledReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "testId" TEXT,
    "testName" TEXT NOT NULL,
    "testCode" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabSample" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sampleType" TEXT NOT NULL,
    "sampleIdentifier" TEXT NOT NULL,
    "barcode" TEXT,
    "status" "LabSampleStatus" NOT NULL DEFAULT 'PENDING',
    "collectedAt" TIMESTAMP(3),
    "collectedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReport" (
    "id" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "documentId" TEXT,
    "status" "LabReportStatus" NOT NULL DEFAULT 'DRAFT',
    "testSummary" TEXT,
    "clinicalNotes" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "isAmended" BOOLEAN NOT NULL DEFAULT false,
    "amendedReason" TEXT,
    "previousReportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabCareConnection" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT,
    "labId" TEXT NOT NULL,
    "investigationRequestId" TEXT,
    "labOrderId" TEXT NOT NULL,
    "status" "LabCareConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "purpose" TEXT NOT NULL DEFAULT 'INVESTIGATION_FULFILLMENT',
    "scopes" "LabCareAccessScope"[] DEFAULT ARRAY['PATIENT_BASIC_PROFILE', 'INVESTIGATION_REQUEST', 'SAMPLE_INFORMATION']::"LabCareAccessScope"[],
    "accessGrantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    "sampleCollectedAt" TIMESTAMP(3),
    "testCompletedAt" TIMESTAMP(3),
    "reportFinalizedAt" TIMESTAMP(3),
    "reportDeliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabCareConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientDoctorRelationship" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "status" "RelationshipStatus" NOT NULL DEFAULT 'ACTIVE',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastConsultationAt" TIMESTAMP(3),
    "consultationCount" INTEGER NOT NULL DEFAULT 0,
    "connectionSource" "ConnectionSource" NOT NULL DEFAULT 'SEARCH',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientDoctorRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientDoctorRelationshipEvent" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "eventType" "RelationshipEventType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientDoctorRelationshipEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorPracticeLocation" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "practiceName" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "area" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "pincode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorPracticeLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorSearchHistory" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT,
    "searchQuery" TEXT,
    "searchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorSearchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentRestoreRequest_documentId_idx" ON "DocumentRestoreRequest"("documentId");

-- CreateIndex
CREATE INDEX "DocumentRestoreRequest_patientId_idx" ON "DocumentRestoreRequest"("patientId");

-- CreateIndex
CREATE INDEX "DocumentRestoreRequest_status_idx" ON "DocumentRestoreRequest"("status");

-- CreateIndex
CREATE INDEX "DocumentRestoreRequest_createdAt_idx" ON "DocumentRestoreRequest"("createdAt");

-- CreateIndex
CREATE INDEX "DoctorPatientAccess_patientId_idx" ON "DoctorPatientAccess"("patientId");

-- CreateIndex
CREATE INDEX "DoctorPatientAccess_doctorId_idx" ON "DoctorPatientAccess"("doctorId");

-- CreateIndex
CREATE INDEX "DoctorPatientAccess_status_idx" ON "DoctorPatientAccess"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorPatientAccess_patientId_doctorId_key" ON "DoctorPatientAccess"("patientId", "doctorId");

-- CreateIndex
CREATE INDEX "DoctorFeedback_documentId_idx" ON "DoctorFeedback"("documentId");

-- CreateIndex
CREATE INDEX "DoctorFeedback_doctorId_idx" ON "DoctorFeedback"("doctorId");

-- CreateIndex
CREATE INDEX "DoctorReview_doctorId_idx" ON "DoctorReview"("doctorId");

-- CreateIndex
CREATE INDEX "DoctorReview_patientId_idx" ON "DoctorReview"("patientId");

-- CreateIndex
CREATE INDEX "Consultation_patientId_idx" ON "Consultation"("patientId");

-- CreateIndex
CREATE INDEX "Consultation_doctorId_idx" ON "Consultation"("doctorId");

-- CreateIndex
CREATE INDEX "Consultation_consultationDate_idx" ON "Consultation"("consultationDate");

-- CreateIndex
CREATE INDEX "Prescription_patientId_idx" ON "Prescription"("patientId");

-- CreateIndex
CREATE INDEX "Prescription_doctorId_idx" ON "Prescription"("doctorId");

-- CreateIndex
CREATE INDEX "Prescription_consultationId_idx" ON "Prescription"("consultationId");

-- CreateIndex
CREATE INDEX "Prescription_prescriptionDate_idx" ON "Prescription"("prescriptionDate");

-- CreateIndex
CREATE INDEX "PrescriptionItem_prescriptionId_idx" ON "PrescriptionItem"("prescriptionId");

-- CreateIndex
CREATE INDEX "InvestigationRequest_patientId_idx" ON "InvestigationRequest"("patientId");

-- CreateIndex
CREATE INDEX "InvestigationRequest_doctorId_idx" ON "InvestigationRequest"("doctorId");

-- CreateIndex
CREATE INDEX "InvestigationRequest_status_idx" ON "InvestigationRequest"("status");

-- CreateIndex
CREATE INDEX "Referral_patientId_idx" ON "Referral"("patientId");

-- CreateIndex
CREATE INDEX "Referral_doctorId_idx" ON "Referral"("doctorId");

-- CreateIndex
CREATE INDEX "Referral_status_idx" ON "Referral"("status");

-- CreateIndex
CREATE INDEX "FollowUp_patientId_idx" ON "FollowUp"("patientId");

-- CreateIndex
CREATE INDEX "FollowUp_doctorId_idx" ON "FollowUp"("doctorId");

-- CreateIndex
CREATE INDEX "FollowUp_status_idx" ON "FollowUp"("status");

-- CreateIndex
CREATE INDEX "FollowUp_dueDate_idx" ON "FollowUp"("dueDate");

-- CreateIndex
CREATE INDEX "Consent_patientId_idx" ON "Consent"("patientId");

-- CreateIndex
CREATE INDEX "Consent_requesterId_idx" ON "Consent"("requesterId");

-- CreateIndex
CREATE INDEX "Consent_status_idx" ON "Consent"("status");

-- CreateIndex
CREATE INDEX "Consent_expiresAt_idx" ON "Consent"("expiresAt");

-- CreateIndex
CREATE INDEX "Consent_createdAt_idx" ON "Consent"("createdAt");

-- CreateIndex
CREATE INDEX "Consent_patientId_status_idx" ON "Consent"("patientId", "status");

-- CreateIndex
CREATE INDEX "Consent_requesterId_status_idx" ON "Consent"("requesterId", "status");

-- CreateIndex
CREATE INDEX "Consent_patientId_requesterId_status_idx" ON "Consent"("patientId", "requesterId", "status");

-- CreateIndex
CREATE INDEX "ConsentScope_consentId_idx" ON "ConsentScope"("consentId");

-- CreateIndex
CREATE INDEX "ConsentScope_resourceType_idx" ON "ConsentScope"("resourceType");

-- CreateIndex
CREATE INDEX "ConsentScope_resourceId_idx" ON "ConsentScope"("resourceId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LabOrganization_licenseNumber_key" ON "LabOrganization"("licenseNumber");

-- CreateIndex
CREATE INDEX "LabOrganization_verificationStatus_idx" ON "LabOrganization"("verificationStatus");

-- CreateIndex
CREATE INDEX "LabOrganization_city_idx" ON "LabOrganization"("city");

-- CreateIndex
CREATE INDEX "LabOrganization_isActive_idx" ON "LabOrganization"("isActive");

-- CreateIndex
CREATE INDEX "LabMembership_labId_idx" ON "LabMembership"("labId");

-- CreateIndex
CREATE INDEX "LabMembership_userId_idx" ON "LabMembership"("userId");

-- CreateIndex
CREATE INDEX "LabMembership_role_idx" ON "LabMembership"("role");

-- CreateIndex
CREATE UNIQUE INDEX "LabMembership_labId_userId_key" ON "LabMembership"("labId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalTest_code_key" ON "CanonicalTest"("code");

-- CreateIndex
CREATE INDEX "CanonicalTest_code_idx" ON "CanonicalTest"("code");

-- CreateIndex
CREATE INDEX "CanonicalTest_name_idx" ON "CanonicalTest"("name");

-- CreateIndex
CREATE INDEX "CanonicalTest_category_idx" ON "CanonicalTest"("category");

-- CreateIndex
CREATE INDEX "CanonicalTest_isActive_idx" ON "CanonicalTest"("isActive");

-- CreateIndex
CREATE INDEX "LabLocation_labId_idx" ON "LabLocation"("labId");

-- CreateIndex
CREATE INDEX "LabLocation_city_idx" ON "LabLocation"("city");

-- CreateIndex
CREATE INDEX "LabLocation_pincode_idx" ON "LabLocation"("pincode");

-- CreateIndex
CREATE INDEX "LabLocation_isActive_idx" ON "LabLocation"("isActive");

-- CreateIndex
CREATE INDEX "LabTest_labId_idx" ON "LabTest"("labId");

-- CreateIndex
CREATE INDEX "LabTest_canonicalTestId_idx" ON "LabTest"("canonicalTestId");

-- CreateIndex
CREATE INDEX "LabTest_category_idx" ON "LabTest"("category");

-- CreateIndex
CREATE INDEX "LabTest_isActive_idx" ON "LabTest"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LabTest_labId_testCode_key" ON "LabTest"("labId", "testCode");

-- CreateIndex
CREATE UNIQUE INDEX "LabOrder_orderNumber_key" ON "LabOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "LabOrder_orderNumber_idx" ON "LabOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "LabOrder_patientId_idx" ON "LabOrder"("patientId");

-- CreateIndex
CREATE INDEX "LabOrder_prescribedDoctorId_idx" ON "LabOrder"("prescribedDoctorId");

-- CreateIndex
CREATE INDEX "LabOrder_labId_idx" ON "LabOrder"("labId");

-- CreateIndex
CREATE INDEX "LabOrder_labLocationId_idx" ON "LabOrder"("labLocationId");

-- CreateIndex
CREATE INDEX "LabOrder_canonicalTestId_idx" ON "LabOrder"("canonicalTestId");

-- CreateIndex
CREATE INDEX "LabOrder_status_idx" ON "LabOrder"("status");

-- CreateIndex
CREATE INDEX "LabOrder_createdAt_idx" ON "LabOrder"("createdAt");

-- CreateIndex
CREATE INDEX "LabOrderItem_orderId_idx" ON "LabOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "LabOrderItem_testId_idx" ON "LabOrderItem"("testId");

-- CreateIndex
CREATE INDEX "LabSample_orderId_idx" ON "LabSample"("orderId");

-- CreateIndex
CREATE INDEX "LabSample_sampleIdentifier_idx" ON "LabSample"("sampleIdentifier");

-- CreateIndex
CREATE INDEX "LabSample_status_idx" ON "LabSample"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LabReport_reportNumber_key" ON "LabReport"("reportNumber");

-- CreateIndex
CREATE INDEX "LabReport_reportNumber_idx" ON "LabReport"("reportNumber");

-- CreateIndex
CREATE INDEX "LabReport_orderId_idx" ON "LabReport"("orderId");

-- CreateIndex
CREATE INDEX "LabReport_documentId_idx" ON "LabReport"("documentId");

-- CreateIndex
CREATE INDEX "LabReport_status_idx" ON "LabReport"("status");

-- CreateIndex
CREATE INDEX "LabReport_finalizedAt_idx" ON "LabReport"("finalizedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LabCareConnection_labOrderId_key" ON "LabCareConnection"("labOrderId");

-- CreateIndex
CREATE INDEX "LabCareConnection_patientId_idx" ON "LabCareConnection"("patientId");

-- CreateIndex
CREATE INDEX "LabCareConnection_doctorId_idx" ON "LabCareConnection"("doctorId");

-- CreateIndex
CREATE INDEX "LabCareConnection_labId_idx" ON "LabCareConnection"("labId");

-- CreateIndex
CREATE INDEX "LabCareConnection_status_idx" ON "LabCareConnection"("status");

-- CreateIndex
CREATE INDEX "LabCareConnection_expiresAt_idx" ON "LabCareConnection"("expiresAt");

-- CreateIndex
CREATE INDEX "PatientDoctorRelationship_patientId_idx" ON "PatientDoctorRelationship"("patientId");

-- CreateIndex
CREATE INDEX "PatientDoctorRelationship_doctorId_idx" ON "PatientDoctorRelationship"("doctorId");

-- CreateIndex
CREATE INDEX "PatientDoctorRelationship_status_idx" ON "PatientDoctorRelationship"("status");

-- CreateIndex
CREATE INDEX "PatientDoctorRelationship_lastInteractionAt_idx" ON "PatientDoctorRelationship"("lastInteractionAt");

-- CreateIndex
CREATE INDEX "PatientDoctorRelationship_connectedAt_idx" ON "PatientDoctorRelationship"("connectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientDoctorRelationship_patientId_doctorId_key" ON "PatientDoctorRelationship"("patientId", "doctorId");

-- CreateIndex
CREATE INDEX "PatientDoctorRelationshipEvent_relationshipId_idx" ON "PatientDoctorRelationshipEvent"("relationshipId");

-- CreateIndex
CREATE INDEX "PatientDoctorRelationshipEvent_eventType_idx" ON "PatientDoctorRelationshipEvent"("eventType");

-- CreateIndex
CREATE INDEX "PatientDoctorRelationshipEvent_createdAt_idx" ON "PatientDoctorRelationshipEvent"("createdAt");

-- CreateIndex
CREATE INDEX "DoctorPracticeLocation_doctorId_idx" ON "DoctorPracticeLocation"("doctorId");

-- CreateIndex
CREATE INDEX "DoctorPracticeLocation_city_idx" ON "DoctorPracticeLocation"("city");

-- CreateIndex
CREATE INDEX "DoctorPracticeLocation_area_idx" ON "DoctorPracticeLocation"("area");

-- CreateIndex
CREATE INDEX "DoctorPracticeLocation_pincode_idx" ON "DoctorPracticeLocation"("pincode");

-- CreateIndex
CREATE INDEX "DoctorPracticeLocation_active_idx" ON "DoctorPracticeLocation"("active");

-- CreateIndex
CREATE INDEX "DoctorSearchHistory_patientId_idx" ON "DoctorSearchHistory"("patientId");

-- CreateIndex
CREATE INDEX "DoctorSearchHistory_doctorId_idx" ON "DoctorSearchHistory"("doctorId");

-- CreateIndex
CREATE INDEX "DoctorSearchHistory_searchedAt_idx" ON "DoctorSearchHistory"("searchedAt");

-- CreateIndex
CREATE INDEX "DoctorProfile_verificationStatus_idx" ON "DoctorProfile"("verificationStatus");

-- CreateIndex
CREATE INDEX "HealthTimelineEvent_patientId_eventDate_idx" ON "HealthTimelineEvent"("patientId", "eventDate" DESC);

-- CreateIndex
CREATE INDEX "HealthTimelineEvent_patientId_eventType_eventDate_idx" ON "HealthTimelineEvent"("patientId", "eventType", "eventDate" DESC);

-- CreateIndex
CREATE INDEX "HealthTimelineEvent_patientId_sourceType_sourceId_idx" ON "HealthTimelineEvent"("patientId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "HealthTimelineEvent_providerId_eventDate_idx" ON "HealthTimelineEvent"("providerId", "eventDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "HealthTimelineEvent_patientId_sourceType_sourceId_key" ON "HealthTimelineEvent"("patientId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "DocumentRestoreRequest" ADD CONSTRAINT "DocumentRestoreRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRestoreRequest" ADD CONSTRAINT "DocumentRestoreRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRestoreRequest" ADD CONSTRAINT "DocumentRestoreRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPatientAccess" ADD CONSTRAINT "DoctorPatientAccess_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPatientAccess" ADD CONSTRAINT "DoctorPatientAccess_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorFeedback" ADD CONSTRAINT "DoctorFeedback_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorFeedback" ADD CONSTRAINT "DoctorFeedback_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorReview" ADD CONSTRAINT "DoctorReview_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorReview" ADD CONSTRAINT "DoctorReview_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestigationRequest" ADD CONSTRAINT "InvestigationRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestigationRequest" ADD CONSTRAINT "InvestigationRequest_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentScope" ADD CONSTRAINT "ConsentScope_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "Consent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabMembership" ADD CONSTRAINT "LabMembership_labId_fkey" FOREIGN KEY ("labId") REFERENCES "LabOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabMembership" ADD CONSTRAINT "LabMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabLocation" ADD CONSTRAINT "LabLocation_labId_fkey" FOREIGN KEY ("labId") REFERENCES "LabOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_labId_fkey" FOREIGN KEY ("labId") REFERENCES "LabOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_canonicalTestId_fkey" FOREIGN KEY ("canonicalTestId") REFERENCES "CanonicalTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_prescribedDoctorId_fkey" FOREIGN KEY ("prescribedDoctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_investigationRequestId_fkey" FOREIGN KEY ("investigationRequestId") REFERENCES "InvestigationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_labId_fkey" FOREIGN KEY ("labId") REFERENCES "LabOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_labLocationId_fkey" FOREIGN KEY ("labLocationId") REFERENCES "LabLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_canonicalTestId_fkey" FOREIGN KEY ("canonicalTestId") REFERENCES "CanonicalTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrderItem" ADD CONSTRAINT "LabOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrderItem" ADD CONSTRAINT "LabOrderItem_testId_fkey" FOREIGN KEY ("testId") REFERENCES "LabTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSample" ADD CONSTRAINT "LabSample_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabSample" ADD CONSTRAINT "LabSample_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReport" ADD CONSTRAINT "LabReport_previousReportId_fkey" FOREIGN KEY ("previousReportId") REFERENCES "LabReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCareConnection" ADD CONSTRAINT "LabCareConnection_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCareConnection" ADD CONSTRAINT "LabCareConnection_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCareConnection" ADD CONSTRAINT "LabCareConnection_labId_fkey" FOREIGN KEY ("labId") REFERENCES "LabOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCareConnection" ADD CONSTRAINT "LabCareConnection_investigationRequestId_fkey" FOREIGN KEY ("investigationRequestId") REFERENCES "InvestigationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabCareConnection" ADD CONSTRAINT "LabCareConnection_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDoctorRelationship" ADD CONSTRAINT "PatientDoctorRelationship_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDoctorRelationship" ADD CONSTRAINT "PatientDoctorRelationship_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientDoctorRelationshipEvent" ADD CONSTRAINT "PatientDoctorRelationshipEvent_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "PatientDoctorRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPracticeLocation" ADD CONSTRAINT "DoctorPracticeLocation_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorSearchHistory" ADD CONSTRAINT "DoctorSearchHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorSearchHistory" ADD CONSTRAINT "DoctorSearchHistory_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
