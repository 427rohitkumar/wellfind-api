# Wellfind Academic API

A managed one-to-one education network that helps children learn from the right teacher with consistent academic support and progress coordination.

## Overview

Wellfind Academic is a quality-managed one-to-one home education service for UKG–Class 10 students. This repository contains the backend API built with Payload CMS, providing APIs, authentication, access control, and data management for a separate React/Next.js admin dashboard and existing portfolio.

This project is **backend-only**. Payload CMS exposes REST and GraphQL APIs, handles authentication and access control, and manages data. A separate frontend/admin application consumes these APIs.

## Authentication API

All authentication endpoints are under the `/api/auth` prefix. Payload's built-in JWT auth is used; no parallel authentication system is created.

### Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| `POST` | `/api/auth/login` | Authenticate with email + password; returns JWT token | Public (rate-limited) |
| `POST` | `/api/auth/logout` | Log out current session | Authenticated |
| `GET` | `/api/auth/me` | Get authenticated user's profile | Authenticated |
| `POST` | `/api/auth/forgot-password` | Request 4-digit OTP for password reset | Public (rate-limited) |
| `POST` | `/api/auth/verify-otp` | Verify OTP; returns single-use reset auth token | Public (rate-limited) |
| `POST` | `/api/auth/reset-password` | Reset password using reset auth token | Public (rate-limited) |
| `GET` | `/api/auth/admin/users` | List users | Admin only |
| `POST` | `/api/auth/admin/users` | Create a user account | Admin only |
| `PATCH` | `/api/auth/admin/users/:id` | Update user details/status | Admin only |
| `POST` | `/api/auth/admin/users/:id/reset-password` | Admin-initiated password reset | Admin only |
| `POST` | `/api/student-enquiries` | Submit a new student enquiry (public form) | Public (rate-limited) |
| `GET` | `/api/student-enquiries` | List student enquiries | Admin only (super_admin) |
| `GET` | `/api/student-enquiries/:id` | Get one student enquiry | Admin only (super_admin) |
| `PATCH` | `/api/student-enquiries/:id` | Update a student enquiry | Admin only (super_admin) |
| `DELETE` | `/api/student-enquiries/:id` | Delete a student enquiry | Admin only (super_admin) |
| `POST` | `/api/teacher-enquiries` | Submit a new teacher application (multipart/form-data) | Public (rate-limited) |
| `GET` | `/api/teacher-enquiries` | List teacher applications | Admin only (super_admin) |
| `GET` | `/api/teacher-enquiries/:id` | Get one teacher application | Admin only (super_admin) |
| `PATCH` | `/api/teacher-enquiries/:id` | Update a teacher application | Admin only (super_admin) |
| `DELETE` | `/api/teacher-enquiries/:id` | Delete a teacher application | Admin only (super_admin) |

## Backend Architecture

| Layer | Technology |
|-------|------------|
| Framework | Payload CMS 3.x on Next.js 16 |
| Database | PostgreSQL (@payloadcms/db-postgres) |
| Authentication | Payload Auth (Users collection) |
| Media | Payload Media collection (file uploads) |
| Rich Text | Lexical editor |
| API | REST API (`/api`) and GraphQL API (`/api/graphql`) |
| Admin UI | Payload CMS Admin (`/admin`) |
| Email | Nodemailer (SMTP for OTP delivery) |

## Collections

| Collection | Description |
|------------|-------------|
| **Users** | Auth-enabled collection with role-based access control (super_admin, admin, teacher, staff) and account status (active, inactive, suspended) |
| **Media** | Upload-enabled collection for file/media management |
| **Student Enquiries** | Public student enquiry submissions plus internal management fields (status, admin notes, staff assignment). `super_admin`-only read/update/delete; public create. |
| **Teacher Enquiries** | Public teacher application submissions with private KYC/qualification documents plus internal review fields. `super_admin`-only read/update/delete; public create. |
| **Teacher Documents** | Private upload collection for teacher KYC and qualification documents (separate from public `Media`). `super_admin`-only access; documents linked to teacher applications. |

## Project Structure

```
wellfind-api/
├── src/
│   ├── payload.config.ts          # Payload CMS configuration
│   ├── payload-types.ts           # Auto-generated TypeScript types
│   ├── collections/
│   │   ├── Users.ts               # Auth-enabled Users collection (roles, status, OTP fields)
│   │   ├── Media.ts               # Upload-enabled Media collection
│   │   ├── StudentEnquiries.ts    # Student enquiries collection (public form + admin management)
│   │   ├── TeacherEnquiries.ts    # Teacher enquiries collection (public application + admin review)
│   │   └── TeacherDocuments.ts    # Private upload collection for teacher KYC/qualification documents
│   ├── app/
│   │   ├── (payload)/             # Payload CMS admin panel and built-in API routes
│   │   └── api/
│   │       └── auth/              # Custom authentication API endpoints
│   │           ├── login/route.ts
│   │           ├── logout/route.ts
│   │           ├── me/route.ts
│   │           ├── forgot-password/route.ts
│   │           ├── verify-otp/route.ts
│   │           ├── reset-password/route.ts
│   │           └── admin/
│   │               ├── users/route.ts              # GET, POST
│   │               └── users/[id]/
│   │       └── student-enquiries/route.ts        # Public submission + admin list
│   │       └── teacher-enquiries/route.ts        # Public application submission + admin list
│   │                   ├── route.ts                # PATCH
│   │                   └── reset-password/route.ts # POST
│   └── lib/
│       ├── auth.ts                # Rate limiting, role helpers
│       ├── otp.ts                 # OTP generation and hashing
│       └── email.ts               # SMTP email sending (nodemailer)
├── scripts/
│   └── seed-admin.ts              # Idempotent first-admin seeder
├── tests/
│   ├── e2e/                     # Playwright end-to-end tests
│   ├── int/                     # Vitest integration tests
│   └── helpers/                 # Test helpers
├── package.json
├── .env.example                 # Example environment variables
├── docker-compose.yml           # Docker setup for PostgreSQL
├── Dockerfile
├── next.config.ts
├── tsconfig.json
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js ^22.23.4 or >=24.22.1
- pnpm ^9 || ^10 || ^11
- PostgreSQL database

### Local Development

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd wellfind-api
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

4. Configure `.env` with your database and SMTP credentials:

   ```
   DATABASE_URL=postgres://postgres:admin@127.0.0.1:5432/wellfind-db
   PAYLOAD_SECRET=your-secret-here

   SMTP_HOST=your-smtp-host
   SMTP_PORT=587
   SMTP_USER=your-smtp-user
   SMTP_PASSWORD=your-smtp-password
   SMTP_FROM_EMAIL=noreply@wellfind.academy
   SMTP_FROM_NAME=Wellfind Academic

   INITIAL_ADMIN_EMAIL=427rohit@gmail.com
   INITIAL_ADMIN_PASSWORD=change-me-min-8-chars
   ```

   > **Important:** Do not commit real SMTP credentials or the admin password to version control. Remove `INITIAL_ADMIN_PASSWORD` from deployment environments after the first admin is created.

5. Start the development server:

   ```bash
   pnpm dev
   ```

6. Open the admin panel at `http://localhost:3000/admin`.

### First Admin Seeder

Create the initial super_admin account (idempotent — safe to re-run):

```bash
INITIAL_ADMIN_EMAIL=427rohit@gmail.com \
INITIAL_ADMIN_PASSWORD=427rohit@ \
npx tsx scripts/seed-admin.ts
```

- The seeder reads `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` from environment variables.
- If the account already exists, no changes are made (password is not reset).
- Payload automatically hashes the password — it is never stored in plaintext.
- After initial setup, remove `INITIAL_ADMIN_PASSWORD` from your deployment environment.

### Docker

Alternatively, use Docker for local development:

```bash
docker-compose up
```

The `docker-compose.yml` is configured for PostgreSQL. Update the `DATABASE_URL` in your `.env` file to use `postgres` as the hostname when running in Docker (e.g. `postgres://postgres:admin@postgres:5432/wellfind-db`).

## Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | `postgres://postgres:admin@127.0.0.1:5432/wellfind-db` |
| `PAYLOAD_SECRET` | Secret key for Payload CMS JWT signing | Yes | Any random string |
| `SMTP_HOST` | SMTP server hostname | No\* | `smtp.example.com` |
| `SMTP_PORT` | SMTP server port | No\* | `587` |
| `SMTP_USER` | SMTP username | No\* | `user@example.com` |
| `SMTP_PASSWORD` | SMTP password | No\* | `your-password` |
| `SMTP_FROM_EMAIL` | From email address | No | `noreply@wellfind.academy` |
| `SMTP_FROM_NAME` | From name | No | `Wellfind Academic` |
| `INITIAL_ADMIN_EMAIL` | First admin email (seeder) | No | `427rohit@gmail.com` |
| `INITIAL_ADMIN_PASSWORD` | First admin password (seeder) | No | Min 8 chars |
| `OTP_EXPIRY_MINUTES` | OTP expiry in minutes | No | `10` |
| `OTP_MAX_ATTEMPTS` | Max failed OTP attempts | No | `5` |

\* Required for the forgot-password / OTP email flow to work. Without SMTP configured, the API returns a generic response and does not send email.

## Authentication API — Request / Response Examples

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "427rohit@gmail.com",
  "password": "427rohit@"
}
```

Response (200):
```json
{
  "message": "Login successful.",
  "token": "eyJhbG...",
  "user": {
    "id": 1,
    "email": "427rohit@gmail.com",
    "role": "super_admin",
    "status": "active"
  }
}
```

### Logout

```http
POST /api/auth/logout
Authorization: Bearer <token>
```

Response (200): `{ "message": "Logged out successfully." }`

### Get Profile (`/me`)

```http
GET /api/auth/me
Authorization: Bearer <token>
```

Response (200):
```json
{
  "user": {
    "id": 1,
    "email": "427rohit@gmail.com",
    "role": "super_admin",
    "status": "active",
    "createdAt": "2026-10-28T...",
    "updatedAt": "2026-10-28T..."
  }
}
```

### Forgot Password (Request OTP)

```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "427rohit@gmail.com"
}
```

Response (200) — always generic to prevent account enumeration:
```json
{
  "message": "If an account with that email exists, an OTP has been sent to that address."
}
```

### Verify OTP

```http
POST /api/auth/verify-otp
Content-Type: application/json

{
  "email": "427rohit@gmail.com",
  "otp": "1234"
}
```

Response (200):
```json
{
  "message": "OTP verified. You may now reset your password.",
  "resetAuthToken": "a1b2c3...",
  "resetAuthExpiresAt": "2026-10-28T..."
}
```

### Reset Password

```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "resetAuthToken": "a1b2c3...",
  "password": "NewSecurePass123"
}
```

Response (200): `{ "message": "Password has been reset successfully. You can now log in." }`

### Admin: Create User

```http
POST /api/auth/admin/users
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "email": "teacher@example.com",
  "password": "TeacherPass123",
  "role": "teacher",
  "status": "active"
}
```

Response (201):
```json
{
  "message": "User created successfully.",
  "user": {
    "id": 2,
    "email": "teacher@example.com",
    "role": "teacher",
    "status": "active",
    "createdAt": "2026-10-28T..."
  }
}
```

### Admin: List Users

```http
GET /api/auth/admin/users?limit=10&page=1&role=teacher&status=active
Authorization: Bearer <admin-token>
```

### Admin: Update User

```http
PATCH /api/auth/admin/users/2
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "role": "teacher",
  "status": "suspended"
}
```

### Admin: Reset User Password

```http
POST /api/auth/admin/users/2/reset-password
Authorization: Bearer <admin-token>
```

Response (200):
```json
{
  "message": "Password has been reset. A temporary password has been generated.",
  "temporaryPassword": "aBcDeFgHiJkLmNoP",
  "note": "Share this password securely with the user. They should change it after first login."
}
```

### JWT Authentication

- Tokens are Payload CMS JWTs signed with `PAYLOAD_SECRET`.
- Include the token in the `Authorization: Bearer <token>` header for protected endpoints.
- **Logout behavior:** Payload uses stateless JWTs. Logging out instructs the client to discard the token. Server-side revocation is not implemented unless Payload session tracking is enabled.

### Security Notes

- OTPs are 4-digit codes, SHA-256 hashed, 10-minute expiry, max 5 attempts, 1-per-minute resend rate limit.
- Reset auth tokens are single-use, 15-minute expiry, invalidated after password reset.
- Unknown emails return a generic response during forgot-password to prevent account enumeration.
- Passwords are never stored or returned in plaintext (Payload hashes automatically).
- Rate limiting is applied to login, OTP, and reset endpoints (in-memory; use Redis in production).

## Testing

```bash
# Integration tests (vitest)
pnpm run test:int

# End-to-end tests (playwright)
pnpm run test:e2e

# All tests
pnpm test
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm payload` | Run Payload CLI commands |
| `pnpm generate:types` | Generate TypeScript types from Payload config |
| `pnpm test` | Run all tests |

## License

MIT
