# CarePath Backend — Milestone 1: Patient Health Vault

CarePath is an enterprise healthcare journey platform. **Milestone 1 (Patient Health Vault)** establishes the secure foundation for patients to maintain their healthcare records, record health history, track timeline events, and prepare for future consented record-sharing with doctors.

---

## Architecture & Technology Stack

- **Framework**: [NestJS](https://nestjs.com/) (Modular, TypeScript)
- **Database & ORM**: PostgreSQL with [Prisma ORM](https://www.prisma.io/)
- **Authentication**: JWT Access Token (15m) + Cryptographically Secure Refresh-Token Rotation Architecture (7d)
- **Password Security**: Bcrypt with salt rounds (12)
- **Private Storage**: S3-compatible private object storage (MinIO for local dev / AWS S3 for production)
- **Asynchronous Processing**: BullMQ / Queue architecture for asynchronous OCR extraction and security checks
- **Documentation**: Swagger / OpenAPI 3.0 at `/api/v1/docs`
- **Containerization**: Docker Compose (PostgreSQL, Redis, MinIO with automated bucket initialization)
- **Security**:
  - Centralized Access Control & Server-side RBAC (PATIENT, DOCTOR, ADMIN)
  - Helmet HTTP Security Headers & strict CORS
  - Rate Limiting & Brute-force protection (`@nestjs/throttler`)
  - User Status Enforcement (`ACTIVE`, `PENDING_VERIFICATION`, `SUSPENDED`, `DEACTIVATED`)
  - Strict DTO Whitelisting (`ValidationPipe`) & UUID v4 Validation (`ParseUUIDPipe`)
  - Immutable Audit Logging for all sensitive actions
  - Short-lived signed URLs (15 minutes expiration) for private document downloads

---

## Directory Structure

```text
carepath/
└── carepath-backend/
    ├── docker-compose.yml       # Local PostgreSQL, Redis, MinIO services
    ├── .env.example             # Environment variable template
    ├── prisma/
    │   ├── schema.prisma        # Normalized schema with UUID identifiers
    │   ├── seed.ts              # Fake dev users for Patient, Doctor, Admin, Suspended
    │   └── migrations/          # Version-controlled SQL migrations
    ├── src/
    │   ├── config/              # Centralized environment configuration
    │   ├── database/            # Global PrismaService and DatabaseModule
    │   ├── common/              # Decorators, Guards, Filters, AccessControlService
    │   ├── audit/               # Immutable audit logging service and controller
    │   ├── storage/             # Private S3/MinIO client with presigned URLs
    │   ├── ocr/                 # Extensible OCR Provider abstraction & MockOcrProvider
    │   ├── queue/               # Asynchronous queue service for background processing
    │   ├── auth/                # Registration, login, token rotation, password recovery
    │   ├── users/               # Current authenticated user details
    │   ├── patients/            # Patient profile & personal health information
    │   ├── documents/           # Medical document vault upload & lifecycle
    │   ├── timeline/            # Chronological patient health events
    │   ├── health/              # Liveness and database connectivity checks
    │   ├── app.module.ts        # Root module with global guards & filters
    │   └── main.ts              # Entry point with Swagger, Helmet & CORS
    └── test/                    # Integration and End-to-End security test suites
```

---

## Database Schema (Milestone 1)

- **`User`**: Core user entity with `Role` (`PATIENT`, `DOCTOR`, `ADMIN`) and `UserStatus` (`ACTIVE`, `PENDING_VERIFICATION`, `SUSPENDED`, `DEACTIVATED`).
- **`PatientProfile`**: Personal info (full name, DOB, gender, mobile, email, city, blood group, emergency contact) and health info (conditions, allergies, medications, past surgeries, history).
- **`DoctorProfile`**: Professional details (specialization, license number, hospital affiliation).
- **`AdminProfile`**: System administration and department records.
- **`Document`**: Category (`LAB_REPORT`, `PRESCRIPTION`, `CONSULTATION`, `DISCHARGE_SUMMARY`, `IMAGING_REPORT`, `XRAY`, `CT`, `MRI`, `OTHER`) and processing status (`UPLOADED`, `SCANNING`, `PROCESSING_OCR`, `READY`, `FAILED`).
- **`DocumentVersion`**: Immutable physical file pointer (storage key, private bucket, checksum SHA256, MIME, size, virus scan status). Never overwrites original medical files.
- **`DocumentMetadata`**: Separately stored structured metadata (report title, provider, facility, date, notes, raw OCR text, extracted data, and patient confirmation status).
- **`HealthTimelineEvent`**: Chronological events (`DOCUMENT_UPLOADED`, `DOCUMENT_UPDATED`, `REPORT_ADDED`, etc.).
- **`AuditLog`**: Immutable compliance logs recording actor, action, resource, result (`SUCCESS`, `FAILURE`, `DENIED`), IP, user agent, and safe details.
- **`RefreshToken`**: Cryptographically secure token hashes with automatic rotation and token reuse detection.
- **`VerificationToken`**: Email and mobile OTP verification tokens.
- **`PasswordResetToken`**: Time-limited password reset tokens.

*Future-proof design: Ready for Milestone 2+ entities (Doctor-patient relations, Consent, Consultations, Prescriptions, Labs, Appointments, Care Tasks) without database refactoring.*

---

## Document Security & Workflow

Medical documents are **NEVER publicly accessible**. No permanent URLs are stored or exposed.

```text
Upload (Multipart/form-data)
  ↓
Validate file (PDF, JPG, JPEG, PNG, max 25MB, magic-byte inspection)
  ↓
Security / Antivirus scan hook (Disallow executable headers & malicious signatures)
  ↓
Store original file in private S3 bucket (`vault/{patientId}/{documentId}/...`)
  ↓
Create database metadata (Document & DocumentVersion records)
  ↓
Asynchronous OCR processing hook (MockOcrProvider / Extensible OCR engine)
  ↓
Extract structured metadata (Separated raw OCR text & parameters)
  ↓
Patient review & confirmation (`PATCH /documents/:id`)
  ↓
Chronological health timeline event generated
```

When a document is requested:
1. **Authenticate**: Bearer JWT validated.
2. **Authorize**: Server-side RBAC checks role.
3. **Ownership Check**: Centralized `AccessControlService` verifies that the document belongs to the requesting patient.
4. **Audit Access**: Immutable `AuditLog` records `DOCUMENT_VIEW` with actor, timestamp, and IP.
5. **Signed URL**: Generates a short-lived signed URL (15 minutes expiry). Only then is access granted.

---

## Getting Started

### Prerequisites

- Node.js >= 18 (Tested on Node 23)
- Docker & Docker Compose
- npm or yarn

### 1. Local Infrastructure Setup

Start PostgreSQL, Redis, and MinIO with automatic bucket initialization:

```bash
cd carepath/carepath-backend
docker compose up -d
```

Verify services:
- **PostgreSQL**: `localhost:5432` (`carepath_db`)
- **Redis**: `localhost:6379`
- **MinIO S3**: `localhost:9000` (Console: `http://localhost:9001`, credentials: `minioadmin` / `minioadmin`)

### 2. Environment Configuration

Copy the sample environment file:

```bash
cp .env.example .env
```

### 3. Database Migration & Seed

Run database migrations and seed default development accounts:

```bash
# Generate Prisma Client
npm run prisma:generate

# Apply SQL migrations
npm run prisma:migrate:deploy

# Seed development users
npm run prisma:seed
```

### Default Seed Accounts (Obviously Fake Development Data)

| Role | Email | Password | Purpose |
|---|---|---|---|
| **PATIENT** | `patient@carepath.example.com` | `Password123!` | Complete patient profile, allergies, medications, conditions |
| **DOCTOR** | `doctor@carepath.example.com` | `Password123!` | Licensed physician profile |
| **ADMIN** | `admin@carepath.example.com` | `Password123!` | System administrator with audit oversight |
| **SUSPENDED** | `suspended@carepath.example.com` | `Password123!` | Account suspended for testing status guards |

### 4. Running the Application

```bash
# Development mode with hot-reload
npm run start:dev

# Production build and run
npm run build
npm run start:prod
```

- **API Base**: `http://localhost:3000/api/v1`
- **Swagger Documentation**: `http://localhost:3000/api/v1/docs`
- **Health Check**: `http://localhost:3000/api/v1/health`

---

## API Endpoints Reference

All endpoints are versioned under `/api/v1`.

### Authentication (`/api/v1/auth`)
- `POST /auth/register` — Register a new patient, doctor, or admin.
- `POST /auth/login` — Login with email and password (returns access & refresh tokens).
- `POST /auth/refresh` — Rotate refresh token and get fresh token pair.
- `POST /auth/logout` — Revoke active refresh token session.
- `POST /auth/forgot-password` — Request a password reset token.
- `POST /auth/reset-password` — Reset password using token.
- `POST /auth/verify-email` — Verify email address.
- `POST /auth/otp/send` — Mobile OTP request stub.
- `POST /auth/otp/verify` — Mobile OTP verification stub.

### Current User (`/api/v1/users`)
- `GET /users/me` — Retrieve current user account details and profile link.

### Patient Vault (`/api/v1/patients`)
- `GET /patients/me` — Retrieve patient personal and health history.
- `PATCH /patients/me` — Update personal details, conditions, allergies, medications, surgeries.

### Document Management (`/api/v1/documents`)
- `POST /documents` — Upload medical record (PDF, JPG, PNG) with category.
- `GET /documents` — List user's documents with category, status, and search filters.
- `GET /documents/:id` — Retrieve document details, trigger audit log, and return short-lived signed URL.
- `PATCH /documents/:id` — Update document metadata or confirm/edit OCR extracted fields.
- `DELETE /documents/:id` — Archive document.

### Health Timeline (`/api/v1/timeline`)
- `GET /timeline` — Retrieve chronological patient health events with pagination.

### Audit Logs (`/api/v1/audit`)
- `GET /audit/me` — Retrieve immutable compliance and access audit logs for authenticated user.

### Health Check (`/api/v1/health`)
- `GET /health` — Public endpoint checking database connection and uptime.

---

## Testing

CarePath includes extensive unit, authorization, and end-to-end security test suites.

```bash
# Run unit tests (Access control, AuthService, DocumentsService, Guards)
npm test

# Run End-to-End security verification test suite
npm run test:e2e
```

### Verified Security Assertions

1. **Patient Isolation**: Patient cannot access another patient's document (Returns `403 Forbidden`).
2. **Profile Protection**: Patient cannot modify another patient's profile.
3. **Suspended User Lockout**: Suspended accounts are immediately denied from accessing protected resources (Returns `403 Forbidden`).
4. **Invalid Token Rejection**: Forged or invalid JWT tokens are rejected (Returns `401 Unauthorized`).
5. **Expired Refresh Token**: Expired or manipulated refresh tokens are rejected.
6. **No Unauthorized Storage URLs**: Unauthorized users cannot generate signed S3/MinIO URLs.
7. **Comprehensive Audit Trail**: Every sensitive document view, upload, update, and deletion writes an immutable record to `AuditLog`.
