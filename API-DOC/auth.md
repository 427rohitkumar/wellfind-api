# Wellfind Academic Authentication API Reference

Comprehensive API documentation for the authentication system built on Payload CMS 3.x.

**Base URLs:**
- Local development: `http://localhost:3000`
- Production: `https://your-domain.com` (replace with your actual domain)

All endpoint paths documented below are appended to the base URL.  
Example: `http://localhost:3000/api/auth/login`

---

## Table of Contents

1. [Base URLs](#base-urls)
2. [Endpoint Overview](#endpoint-overview)
3. [Authentication and JWT Guide](#authentication-and-jwt-guide)
4. [Endpoints](#endpoints)
5. [Forgot Password and OTP Flow](#forgot-password-and-otp-flow)
6. [Admin User Management](#admin-user-management)
7. [Roles and Access Control](#roles-and-access-control)
8. [Error Reference](#error-reference)
9. [Environment Configuration](#environment-configuration)
10. [Security Notes](#security-notes)
11. [Implementation Gaps](#implementation-gaps)

---

## Base URLs

| Environment | Base URL | Notes |
|-------------|----------|-------|
| Local development | `http://localhost:3000` | Development server started with `pnpm dev` |
| Production | `https://your-domain.com` | Replace `your-domain.com` with your actual domain |

Endpoints are always under the `/api/auth` prefix.  
Example full URL: `http://localhost:3000/api/auth/login`

---

## Endpoint Overview

| Method | Endpoint | Purpose | Access |
|--------|----------|---------|--------|
| `POST` | `/api/auth/login` | Authenticate with email + password; returns JWT token | Public (rate-limited) |
| `POST` | `/api/auth/logout` | End the current session (the token stops working) | Authenticated |
| `GET` | `/api/auth/me` | Get authenticated user's profile | Authenticated |
| `POST` | `/api/auth/forgot-password` | Request 4-digit OTP for password reset | Public (rate-limited) |
| `POST` | `/api/auth/verify-otp` | Verify OTP; returns single-use reset auth token | Public (rate-limited) |
| `POST` | `/api/auth/reset-password` | Reset password using reset auth token | Public (rate-limited) |
| `GET` | `/api/auth/admin/users` | List users | Admin only (`super_admin` or `admin`) |
| `POST` | `/api/auth/admin/users` | Create a user account | Admin only (`super_admin` or `admin`) |
| `PATCH` | `/api/auth/admin/users/:id` | Update user details/status | Admin only (`super_admin` or `admin`) |
| `POST` | `/api/auth/admin/users/:id/reset-password` | Admin-initiated password reset | Admin only (`super_admin` or `admin`) |

**No public signup is supported.** Account creation is restricted to authenticated administrators.

---

## Authentication and JWT Guide

### How Authentication Works

The API uses Payload CMS built-in JWT authentication. The `PAYLOAD_SECRET` environment variable signs and verifies tokens. Every token is tied to a **server-side session** (Payload auth sessions): each login creates one, and a token works only while its session exists and the token has not expired.

### Logging In and Obtaining a JWT

1. Call `POST /api/auth/login` with email and password.
2. On success, the response includes a `token` field (the JWT).
3. Store this token on the client (e.g., in memory or `localStorage`).

### Passing the Token to Protected Endpoints

Include the JWT in the `Authorization` header using the Bearer scheme:

```
Authorization: Bearer <your-jwt-token>
```

### Calling /api/auth/me

After obtaining a token, call `GET /api/auth/me` with the Bearer header to retrieve the authenticated user's profile:

```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <your-jwt-token>"
```

### Token Expiry

Tokens and their sessions expire after 2 hours (7200 seconds, the Payload default; the `users` collection does not override it).

### Logout Behavior

`POST /api/auth/logout` ends the session of the token it receives:

- That token is rejected (`401`) from then on, also if someone copied it.
- Other sessions of the same user (another device or browser with its own login) stay signed in.
- Anything that needs the token must happen **before** logout, for example unregistering the push device (`DELETE /api/notifications/devices/:id`).
- Clients should still delete the token from storage.

### Authenticated Users vs Authorized Administrators

- **Authenticated user:** Any user with a valid JWT can call `/api/auth/me` and `/api/auth/logout`.
- **Authorized administrator:** Only users with role `super_admin` or `admin` can call endpoints under `/api/auth/admin/*`.
- Authentication alone does **not** grant admin permissions. Every admin endpoint enforces role checks server-side.

---

## Endpoints

### POST /api/auth/login

**Purpose:** Authenticate a user with email and password. Returns a JWT token and user profile.

**Authentication required:** No (public endpoint)

**Rate limit:** 5 attempts per IP per 15-minute window. Exceeding returns `429`.

**Headers:**
- `Content-Type: application/json` (required)
- `Accept: application/json` (recommended)

**Request fields:**

| Field | Type | Required | Validation | Example |
|-------|------|----------|------------|---------|
| `email` | string | Yes | Must be a non-empty string | `"427rohit@gmail.com"` |
| `password` | string | Yes | Must be a non-empty string | `"427rohit@"` |

**Example request (curl):**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "427rohit@gmail.com",
    "password": "427rohit@"
  }'
```

**Success response (200):**

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

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 400 | Missing email or password | `{ "error": "Email is required." }` |
| 400 | Invalid request body | `{ "error": "Invalid request body." }` |
| 401 | Invalid email or password | `{ "error": "Invalid email or password." }` |
| 403 | Account suspended or inactive | `{ "error": "Account is not active. Please contact support." }` |
| 429 | Rate limit exceeded | `{ "error": "Too many login attempts. Please try again later." }` |
| 500 | Server error | `{ "error": "<message>" }` |

**Security notes:**
- Suspended or inactive accounts cannot log in (returns `403`).
- The response does not include password hash or salt.
- Rate-limited by IP to prevent brute-force attacks.

---

### POST /api/auth/logout

**Purpose:** End the current session, so this token stops working. Other sessions of the user are not touched.

**Authentication required:** Send the JWT in the `Authorization: Bearer <token>` header. Without a valid token there is no session to end; the answer is still `200`. Blocked and suspended accounts can log out.

**Headers:**
- `Authorization: Bearer <token>` (needed to end a session)
- `Content-Type: application/json` (recommended)

**Request body:** None required.

**Example request (curl):**

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json"
```

**Success response (200):**

```json
{
  "message": "Logged out successfully."
}
```

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 500 | Server error | `{ "error": "<message>" }` |

A missing, invalid, expired or already logged-out token answers `200` with the same body.

**Security notes:**
- The session is removed on the server: the token is rejected immediately afterwards.
- Only the session of the presented token ends.
- Clients should delete the token from storage after logout.

---

### GET /api/auth/me

**Purpose:** Return the authenticated user's account details.

**Authentication required:** Yes (valid JWT in `Authorization: Bearer <token>` header)

**Headers:**
- `Authorization: Bearer <token>` (required)

**Request body:** None.

**Example request (curl):**

```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <your-jwt-token>"
```

**Success response (200):**

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

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 401 | Not authenticated / missing or invalid token | `{ "error": "Not authenticated." }` |
| 500 | Server error | `{ "error": "<message>" }` |

**Security notes:**
- Password hash and salt are never returned in the response.
- Authenticated users can read only their own profile via this endpoint.

---

### POST /api/auth/forgot-password

**Purpose:** Request a 4-digit OTP for password reset. The OTP is sent to the user's email via SMTP.

**Authentication required:** No (public endpoint)

**Rate limits:**
- 5 requests per IP per 15-minute window (global IP limit).
- 1 OTP per user per 60 seconds (resend cooldown).

**Headers:**
- `Content-Type: application/json` (required)

**Request fields:**

| Field | Type | Required | Validation | Example |
|-------|------|----------|------------|---------|
| `email` | string | Yes | Must be a non-empty string | `"427rohit@gmail.com"` |

**Example request (curl):**

```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "427rohit@gmail.com"
  }'
```

**Success response (200):**

```json
{
  "message": "If an account with that email exists, an OTP has been sent to that address."
}
```

**Important:** The response is **always generic**, regardless of whether the email exists or is active. This prevents account enumeration.

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 400 | Missing email | `{ "error": "Email is required." }` |
| 400 | Invalid request body | `{ "error": "Invalid request body." }` |
| 429 | Rate limit exceeded (IP or per-user cooldown) | `{ "error": "Too many requests. Please try again later." }` |
| 429 | OTP recently sent (per-user cooldown) | `{ "error": "An OTP was recently sent. Please wait before requesting another." }` |
| 500 | Server error | Returns the same generic success message (errors are masked to prevent enumeration) |

**Security notes:**
- Account enumeration is prevented: unknown emails return the same generic response as known emails.
- Inactive/suspended accounts also return the generic response.
- OTPs are SHA-256 hashed with the user's email as salt; plaintext OTPs are never stored.
- SMTP must be configured for actual email delivery. Without SMTP, the OTP is stored but no email is sent; the response is still generic.

---

### POST /api/auth/verify-otp

**Purpose:** Verify a 4-digit OTP for a given email. On success, issues a short-lived, single-use reset authorization token.

**Authentication required:** No (public endpoint)

**Rate limit:** 10 attempts per IP per 15-minute window.

**Headers:**
- `Content-Type: application/json` (required)

**Request fields:**

| Field | Type | Required | Validation | Example |
|-------|------|----------|------------|---------|
| `email` | string | Yes | Must be a non-empty string | `"427rohit@gmail.com"` |
| `otp` | string | Yes | Must match `^\d{4}$` (exactly 4 digits) | `"1234"` |

**Example request (curl):**

```bash
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "427rohit@gmail.com",
    "otp": "1234"
  }'
```

**Success response (200):**

```json
{
  "message": "OTP verified. You may now reset your password.",
  "resetAuthToken": "a1b2c3d4e5f6...",
  "resetAuthExpiresAt": "2026-10-28T..."
}
```

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 400 | Missing email | `{ "error": "Email is required." }` |
| 400 | Invalid OTP format (not 4 digits) | `{ "error": "A valid 4-digit OTP is required." }` |
| 400 | No OTP found for email | `{ "error": "Invalid or expired OTP." }` |
| 400 | OTP expired | `{ "error": "OTP has expired." }` |
| 400 | Invalid OTP | `{ "error": "Invalid OTP." }` |
| 429 | Too many failed OTP attempts (>= 5) | `{ "error": "Too many failed OTP attempts. Please request a new OTP." }` |
| 429 | Rate limit exceeded (IP) | `{ "error": "Too many verification attempts. Please try again later." }` |
| 500 | Server error | `{ "error": "<message>" }` |

**Security notes:**
- OTPs expire after 10 minutes.
- Maximum 5 failed OTP attempts per user; after that, a new OTP must be requested.
- Failed attempts increment `otpAttempts` on the user record.
- On success, OTP fields are cleared and a `resetAuthToken` is issued.
- The `resetAuthToken` expires after 15 minutes and is single-use.

---

### POST /api/auth/reset-password

**Purpose:** Reset the password using a valid, unused reset authorization token obtained from `/api/auth/verify-otp`. The token is invalidated after use.

**Authentication required:** No (public endpoint)

**Rate limit:** 5 attempts per IP per 15-minute window.

**Headers:**
- `Content-Type: application/json` (required)

**Request fields:**

| Field | Type | Required | Validation | Example |
|-------|------|----------|------------|---------|
| `resetAuthToken` | string | Yes | Must match an unexpired, unused token | `"a1b2c3d4e5f6..."` |
| `password` | string | Yes | Minimum 8 characters | `"NewSecurePass123"` |

**Example request (curl):**

```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "resetAuthToken": "a1b2c3d4e5f6...",
    "password": "NewSecurePass123"
  }'
```

**Success response (200):**

```json
{
  "message": "Password has been reset successfully. You can now log in."
}
```

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 400 | Missing resetAuthToken | `{ "error": "Reset authorization token is required." }` |
| 400 | Password too short | `{ "error": "Password must be at least 8 characters." }` |
| 400 | Invalid or expired reset authorization | `{ "error": "Invalid or expired reset authorization." }` |
| 400 | Reset authorization expired | `{ "error": "Reset authorization has expired." }` |
| 400 | Reset authorization already used | `{ "error": "Reset authorization has already been used." }` |
| 400 | Invalid request body | `{ "error": "Invalid request body." }` |
| 429 | Rate limit exceeded | `{ "error": "Too many reset attempts. Please try again later." }` |
| 500 | Server error | `{ "error": "<message>" }` |

**Security notes:**
- Reset auth tokens are single-use: `resetAuthUsed` is set to `true` after a successful reset.
- Token expiry is 15 minutes from issuance.
- Payload automatically hashes the new password before storage.
- After reset, the user can log in with the new password.

---

### GET /api/auth/admin/users

**Purpose:** List users with optional filtering and pagination. Admin-only.

**Authentication required:** Yes — must be authenticated with role `super_admin` or `admin`.

**Headers:**
- `Authorization: Bearer <admin-token>` (required)

**Query parameters:**

| Parameter | Type | Required | Default | Example |
|-----------|------|----------|---------|---------|
| `limit` | number | No | 10 (max 100) | `limit=25` |
| `page` | number | No | 1 | `page=2` |
| `role` | string | No | — | `role=teacher` |
| `status` | string | No | — | `status=active` |
| `search` | string | No | — | `search=john` (matches email) |

**Example request (curl):**

```bash
curl -X GET "http://localhost:3000/api/auth/admin/users?limit=10&page=1&role=teacher&status=active" \
  -H "Authorization: Bearer <admin-token>"
```

**Success response (200):**

```json
{
  "users": [
    {
      "id": 2,
      "email": "teacher@example.com",
      "role": "teacher",
      "status": "active",
      "createdAt": "2026-10-28T...",
      "updatedAt": "2026-10-28T..."
    }
  ],
  "totalDocs": <number>,
  "totalPages": <number>,
  "page": <number>,
  "limit": <number>
}
```

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 403 | Not authenticated or insufficient role | `{ "error": "Admin access required." }` |
| 500 | Server error | `{ "error": "<message>" }` |

**Security notes:**
- Only users with role `super_admin` or `admin` can access this endpoint.
- Authenticated non-admin users receive `403`.

---

### POST /api/auth/admin/users

**Purpose:** Create a new user account. Public signup is **not** supported — only admins can create accounts.

**Authentication required:** Yes — must be authenticated with role `super_admin` or `admin`.

**Headers:**
- `Authorization: Bearer <admin-token>` (required)
- `Content-Type: application/json` (required)

**Request fields:**

| Field | Type | Required | Validation | Default | Example |
|-------|------|----------|------------|---------|---------|
| `email` | string | Yes | Must be unique | — | `"teacher@example.com"` |
| `password` | string | Yes | Minimum 8 characters | — | `"TeacherPass123"` |
| `role` | string | No | Must be one of: `super_admin`, `admin`, `teacher`, `staff` | `staff` | `"teacher"` |
| `status` | string | No | Must be one of: `active`, `inactive`, `suspended` | `active` | `"active"` |

**Example request (curl):**

```bash
curl -X POST http://localhost:3000/api/auth/admin/users \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@example.com",
    "password": "TeacherPass123",
    "role": "teacher",
    "status": "active"
  }'
```

**Success response (201):**

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

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 400 | Missing email or password | `{ "error": "Email is required." }` |
| 400 | Password too short | `{ "error": "Password must be at least 8 characters." }` |
| 400 | Invalid request body | `{ "error": "Invalid request body." }` |
| 403 | Not authenticated or insufficient role | `{ "error": "Admin access required." }` |
| 409 | Email already exists | `{ "error": "A user with this email already exists." }` |
| 500 | Server error | `{ "error": "<message>" }` |

**Security notes:**
- Passwords are hashed automatically by Payload before storage.
- Only `super_admin` and `admin` roles can create accounts.
- Non-admin authenticated users receive `403`.
- Default role is `staff`; default status is `active` if not specified.

---

### PATCH /api/auth/admin/users/:id

**Purpose:** Update user details (email, role, status). Admin-only with restrictions.

**Authentication required:** Yes — must be authenticated with role `super_admin` or `admin`.

**Headers:**
- `Authorization: Bearer <admin-token>` (required)
- `Content-Type: application/json` (required)

**URL parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | The numeric ID of the user to update |

**Request fields (at least one required):**

| Field | Type | Required | Validation | Example |
|-------|------|----------|------------|---------|
| `email` | string | No | Must be unique if changed | `"teacher@example.com"` |
| `role` | string | No | Must be one of: `super_admin`, `admin`, `teacher`, `staff` | `"teacher"` |
| `status` | string | No | Must be one of: `active`, `inactive`, `suspended` | `"active"` |

**Example request (curl):**

```bash
curl -X PATCH http://localhost:3000/api/auth/admin/users/2 \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "teacher",
    "status": "suspended"
  }'
```

**Success response (200):**

```json
{
  "message": "User updated successfully.",
  "user": {
    "id": 2,
    "email": "teacher@example.com",
    "role": "teacher",
    "status": "suspended",
    "updatedAt": "2026-10-28T..."
  }
}
```

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 400 | No fields to update | `{ "error": "No fields to update." }` |
| 400 | Invalid role | `{ "error": "Invalid role." }` |
| 400 | Invalid status | `{ "error": "Invalid status." }` |
| 400 | Email must be a string | `{ "error": "Email must be a string." }` |
| 400 | Invalid request body | `{ "error": "Invalid request body." }` |
| 403 | Not authenticated or insufficient role | `{ "error": "Admin access required." }` |
| 403 | Non-super_admin modifying roles | `{ "error": "Only super_admin can modify roles." }` |
| 403 | Non-super_admin modifying super_admin account | `{ "error": "Cannot modify super_admin accounts." }` |
| 404 | User not found | `{ "error": "User not found." }` |
| 409 | Email already exists | `{ "error": "A user with this email already exists." }` |
| 500 | Server error | `{ "error": "<message>" }` |

**Security notes:**
- Only `super_admin` can modify `super_admin` accounts.
- Only `super_admin` can assign or change the `super_admin` role.
- `admin` role can update email/status of non-super_admin users but cannot modify roles.
- `admin` role cannot modify any `super_admin` account.

---

### POST /api/auth/admin/users/:id/reset-password

**Purpose:** Admin-initiated password reset for a user. Generates a secure temporary password and returns it once. No OTP required.

**Authentication required:** Yes — must be authenticated with role `super_admin` or `admin`.

**Headers:**
- `Authorization: Bearer <admin-token>` (required)

**URL parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | The numeric ID of the user whose password will be reset |

**Request body:** None required.

**Example request (curl):**

```bash
curl -X POST http://localhost:3000/api/auth/admin/users/2/reset-password \
  -H "Authorization: Bearer <admin-token>"
```

**Success response (200):**

```json
{
  "message": "Password has been reset. A temporary password has been generated.",
  "temporaryPassword": "aBcDeFgHiJkLmNoP",
  "note": "Share this password securely with the user. They should change it after first login."
}
```

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 403 | Not authenticated or insufficient role | `{ "error": "Admin access required." }` |
| 403 | Non-super_admin resetting super_admin password | `{ "error": "Cannot reset super_admin passwords." }` |
| 404 | User not found | `{ "error": "User not found." }` |
| 500 | Server error | `{ "error": "<message>" }` |

**Security notes:**
- Only `super_admin` can reset `super_admin` passwords.
- The temporary password is generated server-side (16 characters, base64url) and returned in the response.
- The temporary password is shown only once in the response.
- Payload automatically hashes the temporary password before storage.
- Share the temporary password securely with the user; they should change it after first login.

---

## Forgot Password and OTP Flow

### Complete Sequence

The password reset flow uses a 4-digit OTP delivered by email, followed by a single-use reset authorization:

| Step | Action | Endpoint | Description |
|------|--------|----------|-------------|
| 1 | Request OTP | `POST /api/auth/forgot-password` | Submit email; system generates OTP, stores its hash, and sends via SMTP |
| 2 | Receive OTP | Email inbox | User receives the 4-digit OTP (only if SMTP is configured) |
| 3 | Verify OTP | `POST /api/auth/verify-otp` | Submit email + OTP; receive single-use `resetAuthToken` |
| 4 | Reset password | `POST /api/auth/reset-password` | Submit `resetAuthToken` + new password; token is invalidated |
| 5 | Log in | `POST /api/auth/login` | Authenticate with email + new password |

### Example Flow

**Step 1 — Request OTP:**

```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "427rohit@gmail.com"}'
```

Response:
```json
{
  "message": "If an account with that email exists, an OTP has been sent to that address."
}
```

**Step 2 — Receive OTP:**
The OTP (e.g., `1234`) is delivered to the user's email. This step requires SMTP configuration.

**Step 3 — Verify OTP:**

```bash
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "427rohit@gmail.com", "otp": "1234"}'
```

Response:
```json
{
  "message": "OTP verified. You may now reset your password.",
  "resetAuthToken": "a1b2c3d4e5f6...",
  "resetAuthExpiresAt": "2026-10-28T..."
}
```

**Step 4 — Reset password:**

```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "resetAuthToken": "a1b2c3d4e5f6...",
    "password": "NewSecurePass123"
  }'
```

Response:
```json
{
  "message": "Password has been reset successfully. You can now log in."
}
```

**Step 5 — Log in:**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "427rohit@gmail.com", "password": "NewSecurePass123"}'
```

### OTP Security Parameters

| Parameter | Value | Source |
|-----------|-------|--------|
| Format | 4 digits (0000–9999) | `crypto.randomInt(0, 10000)` zero-padded |
| Hashing | SHA-256 with email as salt | `hashOTP()` in `src/lib/otp.ts` |
| Expiry | 10 minutes | `OTP_EXPIRY_MINUTES` constant |
| Max failed attempts | 5 | `MAX_OTP_ATTEMPTS` constant |
| Resend cooldown | 60 seconds per user | `OTP_RESEND_COOLDOWN_SECONDS` constant |
| Rate limit (verify) | 10 attempts per IP per 15 min | In-memory rate limiter |
| Rate limit (request) | 5 requests per IP per 15 min | In-memory rate limiter |

### Reset Authorization Token Security

| Parameter | Value |
|-----------|-------|
| Expiry | 15 minutes |
| Usage | Single-use (invalidated after password reset) |
| Storage | `resetAuthToken`, `resetAuthExpiresAt`, `resetAuthUsed` fields on user |

### SMTP Configuration

Email delivery for the forgot-password flow requires SMTP environment variables:

| Variable | Description | Required for OTP email |
|----------|-------------|------------------------|
| `SMTP_HOST` | SMTP server hostname | Yes |
| `SMTP_PORT` | SMTP server port | Yes |
| `SMTP_USER` | SMTP username | Yes |
| `SMTP_PASSWORD` | SMTP password | Yes |
| `SMTP_FROM_EMAIL` | From email address | No (default: `noreply@wellfind.academy`) |
| `SMTP_FROM_NAME` | From display name | No (default: `Wellfind Academic`) |

If SMTP is not configured, the OTP is still generated and stored, but no email is sent. The API returns the same generic success response. Email delivery cannot be verified until valid SMTP provider credentials are configured.

---

## Admin User Management

### Listing Users

`GET /api/auth/admin/users` returns a paginated list of users. Requires `super_admin` or `admin` role. Supports filtering by `role`, `status`, and `search` (email substring).

### Creating Accounts (Admin-Only)

`POST /api/auth/admin/users` creates a new user. **Public signup is not supported.** Only authenticated administrators (`super_admin` or `admin`) can create accounts. Required fields: `email`, `password` (min 8 chars). Optional: `role` (default `staff`), `status` (default `active`).

### Updating User Information

`PATCH /api/auth/admin/users/:id` updates email, role, and/or status. Restrictions:
- `super_admin` can update any user including other admins.
- `admin` cannot modify `super_admin` accounts.
- `admin` cannot assign or modify the `super_admin` role (only `super_admin` can).

### Admin Password Reset

`POST /api/auth/admin/users/:id/reset-password` generates a temporary password for a user. Restrictions:
- `super_admin` can reset any user's password including other admins.
- `admin` cannot reset `super_admin` passwords.
- The temporary password is returned once in the response.

---

## Roles and Access Control

### Supported Roles

| Role | Description |
|------|-------------|
| `super_admin` | Full access: can manage all users including other admins, reset any password, delete users |
| `admin` | Can create users, update non-super_admin users, reset non-super_admin passwords |
| `teacher` | Standard user role; no admin API access |
| `staff` | Default role for new accounts; no admin API access |

### Supported Account Statuses

| Status | Description |
|--------|-------------|
| `active` | Normal account; can authenticate |
| `inactive` | Account disabled; cannot authenticate |
| `suspended` | Account suspended; cannot authenticate |

### Role Capabilities Matrix

| Capability | `super_admin` | `admin` | `teacher` | `staff` |
|------------|:-------------:|:-------:|:---------:|:-------:|
| Create users | Yes | Yes | No | No |
| Update any user | Yes | No (non-super_admin only) | No | No |
| Reset any password | Yes | No (non-super_admin only) | No | No |
| Delete users | Yes | No | No | No |
| Read own profile (`/me`) | Yes | Yes | Yes | Yes |
| Call login/logout | Yes | Yes | Yes | Yes |

### Access Control Rules

- **Login / Forgot Password / Verify OTP / Reset Password:** Public, rate-limited by IP. No authentication required.
- **`/me`:** Requires valid JWT. Any authenticated user can call it.
- **Admin endpoints (`/api/auth/admin/*`):** Require authenticated user with role `super_admin` or `admin`.
  - `super_admin` can manage all users including other admins.
  - `admin` can manage non-super_admin users but cannot modify `super_admin` accounts or assign `super_admin` role.
- Authentication alone does **not** grant admin permissions. Every admin endpoint enforces role checks server-side.

---

## Error Reference

| Status | Condition | Endpoints | Example body |
|--------|-----------|-----------|--------------|
| 400 | Missing required field | All POST/PATCH endpoints | `{ "error": "Email is required." }` |
| 400 | Invalid request body (malformed JSON) | All POST/PATCH endpoints | `{ "error": "Invalid request body." }` |
| 400 | Password too short (< 8 chars) | `POST /api/auth/login`, `POST /api/auth/admin/users`, `POST /api/auth/reset-password` | `{ "error": "Password must be at least 8 characters." }` |
| 400 | Invalid OTP format (not 4 digits) | `POST /api/auth/verify-otp` | `{ "error": "A valid 4-digit OTP is required." }` |
| 400 | Invalid role or status value | `POST /api/auth/admin/users`, `PATCH /api/auth/admin/users/:id` | `{ "error": "Invalid role." }` |
| 400 | No fields to update | `PATCH /api/auth/admin/users/:id` | `{ "error": "No fields to update." }` |
| 400 | OTP expired | `POST /api/auth/verify-otp` | `{ "error": "OTP has expired." }` |
| 400 | Invalid OTP | `POST /api/auth/verify-otp` | `{ "error": "Invalid OTP." }` |
| 400 | OTP attempts exhausted (>= 5) | `POST /api/auth/verify-otp` | `{ "error": "Too many failed OTP attempts. Please request a new OTP." }` |
| 400 | Invalid/expired reset authorization | `POST /api/auth/reset-password` | `{ "error": "Invalid or expired reset authorization." }` |
| 400 | Reset authorization already used | `POST /api/auth/reset-password` | `{ "error": "Reset authorization has already been used." }` |
| 401 | Invalid email or password | `POST /api/auth/login` | `{ "error": "Invalid email or password." }` |
| 401 | Not authenticated | `GET /api/auth/me`, admin endpoints | `{ "error": "Not authenticated." }` |
| 403 | Account suspended/inactive | `POST /api/auth/login` | `{ "error": "Account is not active. Please contact support." }` |
| 403 | Insufficient permissions | Admin endpoints | `{ "error": "Admin access required." }` |
| 403 | Non-super_admin modifying super_admin | `PATCH /api/auth/admin/users/:id` | `{ "error": "Cannot modify super_admin accounts." }` |
| 403 | Non-super_admin modifying roles | `PATCH /api/auth/admin/users/:id` | `{ "error": "Only super_admin can modify roles." }` |
| 403 | Non-super_admin resetting super_admin password | `POST /api/auth/admin/users/:id/reset-password` | `{ "error": "Cannot reset super_admin passwords." }` |
| 404 | User not found | `PATCH /api/auth/admin/users/:id`, `POST /api/auth/admin/users/:id/reset-password` | `{ "error": "User not found." }` |
| 409 | Duplicate email | `POST /api/auth/admin/users`, `PATCH /api/auth/admin/users/:id` | `{ "error": "A user with this email already exists." }` |
| 429 | Rate limit exceeded | `POST /api/auth/login`, `POST /api/auth/forgot-password`, `POST /api/auth/verify-otp`, `POST /api/auth/reset-password` | `{ "error": "Too many login attempts. Please try again later." }` |
| 429 | OTP resend cooldown | `POST /api/auth/forgot-password` | `{ "error": "An OTP was recently sent. Please wait before requesting another." }` |
| 500 | Server error | All endpoints | `{ "error": "<message>" }` |

**Note:** Not every error condition listed above may have an explicit code path in all cases; some are inferred from access-control logic or Payload framework behavior.

---

## Environment Configuration

Reference `.env.example` for all required variables. Use placeholders only — never commit real secrets.

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:admin@127.0.0.1:5432/wellfind-db` |
| `PAYLOAD_SECRET` | Secret key for Payload CMS JWT signing | Any random string |
| `SMTP_HOST` | SMTP server hostname | `smtp.example.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username | `user@example.com` |
| `SMTP_PASSWORD` | SMTP password | `your-smtp-password` |
| `SMTP_FROM_EMAIL` | From email address | `noreply@wellfind.academy` |
| `SMTP_FROM_NAME` | From display name | `Wellfind Academic` |
| `INITIAL_ADMIN_EMAIL` | First admin email (seeder) | `427rohit@gmail.com` |
| `INITIAL_ADMIN_PASSWORD` | First admin password (seeder) | Min 8 chars |
| `OTP_EXPIRY_MINUTES` | OTP expiry in minutes | `10` |
| `OTP_MAX_ATTEMPTS` | Max failed OTP attempts | `5` |

### JWT Configuration

JWT signing uses `PAYLOAD_SECRET`. Token expiry is governed by Payload CMS defaults unless overridden in `payload.config.ts`.

### First Admin Seeder

Run once to create the initial `super_admin` account:

```bash
INITIAL_ADMIN_EMAIL=427rohit@gmail.com \
INITIAL_ADMIN_PASSWORD=427rohit@ \
npx tsx scripts/seed-admin.ts
```

- The seeder reads `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` from environment variables.
- It is **idempotent**: if the account already exists, no changes are made (password is not reset).
- Payload automatically hashes the password; it is never stored in plaintext.
- After initial setup, remove `INITIAL_ADMIN_PASSWORD` from deployment environments.

---

## Security Notes

- **Passwords:** Hashed automatically by Payload. Never stored or returned in plaintext.
- **OTPs:** SHA-256 hashed with email as salt; 10-minute expiry; max 5 attempts; 1-per-minute resend cooldown.
- **Reset auth tokens:** Single-use, 15-minute expiry, invalidated after password reset.
- **Account enumeration:** Forgot-password returns a generic response for all emails (existing or not).
- **Rate limiting:** Applied per IP for login, forgot-password, verify-OTP, and reset-password endpoints. Uses in-memory storage (use Redis for production multi-instance deployments).
- **JWT:** Bound to a server-side session; logout ends that session, so the token is rejected immediately.
- **Admin access:** Enforced server-side on all `/api/auth/admin/*` endpoints. `super_admin` has full control; `admin` is restricted from super_admin accounts.
- **HTTPS:** Use HTTPS in production to protect tokens and credentials in transit.
- **SMTP:** Email delivery requires valid SMTP provider credentials. Without SMTP, OTPs are generated but not emailed.
- **No public signup:** Account creation is admin-only.

---

## Implementation Gaps

The following items were identified while reviewing the implementation and should be noted by API consumers:

1. **SMTP not configured by default:** The forgot-password flow generates and stores OTPs even without SMTP, but no email is sent. API consumers cannot distinguish this case from a successful send because the response is intentionally generic.

2. **Rate limiting is in-memory:** The rate limiter uses a JavaScript `Map` and resets on server restart. For production deployments with multiple instances, a distributed store (e.g., Redis) is recommended.

3. **Token expiry:** JWT expiry is not explicitly configured in the custom auth routes; it follows Payload CMS defaults.

4. **Admin endpoint pagination fields:** The `GET /api/auth/admin/users` response includes `totalDocs`, `totalPages`, `page`, and `limit`, but the variable naming in the implementation may produce inconsistent values.

5. **Verify-OTP response:** The `resetAuthToken` is returned in the response body. In a production frontend, this token should be treated as opaque and single-use.

6. **Role defaults:** When creating a user via `POST /api/auth/admin/users`, unspecified `role` defaults to `staff` and `status` defaults to `active`.

---

**End of API Reference**


