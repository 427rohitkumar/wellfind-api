# Wellfind Academic User Management API Reference

Comprehensive API documentation for user management and RBAC (Role-Based Access Control).

**Base URLs:**
- Local development: `http://localhost:3000`
- Production: `https://your-domain.com` (replace with your actual domain)

All endpoint paths documented below are appended to the base URL.

---

## Table of Contents

1. [Base URLs](#base-urls)
2. [Roles and Access Control](#roles-and-access-control)
3. [Account Status](#account-status)
4. [Endpoint Overview](#endpoint-overview)
5. [Built-in Payload Users Endpoints](#built-in-payload-users-endpoints)
6. [Custom User Management Endpoints](#custom-user-management-endpoints)
7. [Authentication and JWT Guide](#authentication-and-jwt-guide)
8. [Error Reference](#error-reference)
9. [Security Notes](#security-notes)
10. [Implementation Notes and Gaps](#implementation-notes-and-gaps)

---

## Base URLs

| Environment | Base URL | Notes |
|-------------|----------|-------|
| Local development | `http://localhost:3000` | Development server started with `pnpm dev` |
| Production | `https://your-domain.com` | Replace `your-domain.com` with your actual domain |


---

## Roles and Access Control

### Supported Roles

| Role | Description | Capabilities |
|------|-------------|--------------|
| `super_admin` | Full access to all user-management operations | Create, read, update, delete, block, unblock, suspend, reactivate any user |
| `teacher` | Standard user role; no admin API access | Can authenticate, read own profile via `/api/auth/me` |

**No public signup is supported.** Only `super_admin` can create accounts.

### Authorization Rules

- **Login / Forgot Password / Verify OTP / Reset Password:** Public, rate-limited by IP. No authentication required.
- **`GET /api/auth/me`:** Requires valid JWT. Any authenticated user can call it.
- **User-management endpoints (`/api/auth/admin/users/*`):** Require authenticated user with role `super_admin`.
- **Built-in Payload `/api/users/*` endpoints:** Governed by collection access control — only `super_admin` can create, update, or delete users; any authenticated user can read their own profile.
- Authentication does **not** automatically grant administrative privileges. Teachers cannot access admin-only endpoints.


---

## Account Status

### Supported Statuses

| Status | Description | Can Authenticate? |
|--------|-------------|-------------------|
| `active` | Normal account; full access | Yes |
| `blocked` | Admin-initiated block; cannot authenticate | No |
| `suspended` | Temporary/security-related suspension; cannot authenticate | No |

### Blocked vs Suspended

- **Blocked:** Admin-initiated action via `POST /api/auth/admin/users/:id/block`. Reversed via `POST /api/auth/admin/users/:id/unblock`. Intended for administrative actions (policy violation, non-payment, etc.).
- **Suspended:** Temporary/security-related action via `POST /api/auth/admin/users/:id/suspend`. Reversed via `POST /api/auth/admin/users/:id/reactivate`. Intended for security concerns, investigations, or temporary restrictions.

Both blocked and suspended users cannot authenticate. Status is checked during authentication and on protected requests. Status changes are enforced server-side only — frontend behavior cannot bypass these restrictions.


---

## Endpoint Overview

| Method | Endpoint | Type | Purpose | Access |
|--------|----------|------|---------|--------|
| `GET` | `/api/users` | Built-in | List users with pagination, filtering, search | `super_admin` |
| `POST` | `/api/users` | Built-in | Create a new user account | `super_admin` |
| `GET` | `/api/users/:id` | Built-in | Get a user by ID | `super_admin` or owner |
| `PATCH` | `/api/users/:id` | Built-in | Update user details | `super_admin` or owner (limited fields) |
| `DELETE` | `/api/users/:id` | Built-in | Delete a user | `super_admin` |
| `POST` | `/api/auth/admin/users/:id/block` | Custom | Block a user (status = blocked) | `super_admin` |
| `POST` | `/api/auth/admin/users/:id/unblock` | Custom | Unblock a user (status = active) | `super_admin` |
| `POST` | `/api/auth/admin/users/:id/suspend` | Custom | Suspend a user (status = suspended) | `super_admin` |
| `POST` | `/api/auth/admin/users/:id/reactivate` | Custom | Reactivate a user (status = active) | `super_admin` |
| `POST` | `/api/auth/admin/users/:id/reset-password` | Custom | Admin-initiated password reset | `super_admin` |


---

## Built-in Payload Users Endpoints

Payload CMS automatically generates REST API endpoints at `/api/users` based on the Users collection configuration. These endpoints are governed by the collection's `access` rules.

### GET /api/users

**Purpose:** List users with pagination, filtering, and search.

**Authentication required:** Yes — `super_admin` role required.

**Headers:**
- `Authorization: Bearer <token>` (required)
- `Content-Type: application/json` (recommended)

**Query parameters:**

| Parameter | Type | Required | Default | Example |
|-----------|------|----------|---------|---------|
| `limit` | number | No | 10 | `limit=25` |
| `page` | number | No | 1 | `page=2` |
| `role` | string | No | — | `role=teacher` |
| `status` | string | No | — | `status=active` |
| `search` | string | No | — | `search=john` (matches email) |
| `sort` | string | No | `-createdAt` | `sort=createdAt` |

**Example request (curl):**

```bash
curl -X GET "http://localhost:3000/api/users?limit=10&page=1&role=teacher&status=active" \
  -H "Authorization: Bearer <admin-token>"
```

**Success response (200):**

```json
{
  "docs": [
    {
      "id": 2,
      "email": "teacher@example.com",
      "role": "teacher",
      "status": "active",
      "createdAt": "2026-10-28T...",
      "updatedAt": "2026-10-28T..."
    }
  ],
  "totalDocs": 25,
  "totalPages": 3,
  "page": 1,
  "limit": 10,
  "hasPrevPage": false,
  "hasNextPage": true
}
```

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 403 | Insufficient permissions | `{ "error": "Super admin access required." }` |
| 401 | Not authenticated | `{ "error": "Not authenticated." }` |
| 500 | Server error | `{ "error": "<message>" }` |


### POST /api/users

**Purpose:** Create a new user account.

**Authentication required:** Yes — `super_admin` role required.

**Headers:**
- `Authorization: Bearer <token>` (required)
- `Content-Type: application/json` (required)

**Request fields:**

| Field | Type | Required | Validation | Default | Example |
|-------|------|----------|------------|---------|---------|
| `email` | string | Yes | Must be unique | — | `"teacher@example.com"` |
| `password` | string | Yes | Minimum 8 characters | — | `"TeacherPass123"` |
| `role` | string | No | `super_admin`, `teacher` | `teacher` | `"teacher"` |
| `status` | string | No | `active`, `blocked`, `suspended` | `active` | `"active"` |

**Example request (curl):**

```bash
curl -X POST http://localhost:3000/api/users \
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
  "id": 2,
  "email": "teacher@example.com",
  "role": "teacher",
  "status": "active",
  "createdAt": "2026-10-28T...",
  "updatedAt": "2026-10-28T..."
}
```

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 400 | Missing email or password | `{ "error": "Email is required." }` |
| 400 | Password too short | `{ "error": "Password must be at least 8 characters." }` |
| 403 | Insufficient permissions | `{ "error": "Super admin access required." }` |
| 409 | Email already exists | `{ "error": "A user with this email already exists." }` |
| 500 | Server error | `{ "error": "<message>" }` |


### GET /api/users/:id

**Purpose:** Get a user by ID.

**Authentication required:** Yes — `super_admin` or the user themselves.

**Headers:**
- `Authorization: Bearer <token>` (required)

**URL parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | The numeric ID of the user |

**Example request (curl):**

```bash
curl -X GET http://localhost:3000/api/users/2 \
  -H "Authorization: Bearer <admin-token>"
```

**Success response (200):**

```json
{
  "id": 2,
  "email": "teacher@example.com",
  "role": "teacher",
  "status": "active",
  "createdAt": "2026-10-28T...",
  "updatedAt": "2026-10-28T..."
}
```

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 403 | Insufficient permissions | `{ "error": "Super admin access required." }` |
| 404 | User not found | `{ "error": "User not found." }` |
| 401 | Not authenticated | `{ "error": "Not authenticated." }` |


### PATCH /api/users/:id

**Purpose:** Update user details (email, role, status).

**Authentication required:** Yes — `super_admin` or the user themselves (limited fields).

**Headers:**
- `Authorization: Bearer <token>` (required)
- `Content-Type: application/json` (required)

**URL parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | The numeric ID of the user to update |

**Request fields (at least one required):**

| Field | Type | Required | Validation | Example |
|-------|------|----------|------------|---------|
| `email` | string | No | Must be unique if changed | `"teacher@example.com"` |
| `role` | string | No | `super_admin`, `teacher` | `"teacher"` |
| `status` | string | No | `active`, `blocked`, `suspended` | `"active"` |

**Example request (curl):**

```bash
curl -X PATCH http://localhost:3000/api/users/2 \
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
  "id": 2,
  "email": "teacher@example.com",
  "role": "teacher",
  "status": "suspended",
  "updatedAt": "2026-10-28T..."
}
```

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 400 | No fields to update | `{ "error": "No fields to update." }` |
| 400 | Invalid role or status | `{ "error": "Invalid role." }` |
| 400 | Duplicate email | `{ "error": "A user with this email already exists." }` |
| 403 | Insufficient permissions | `{ "error": "Super admin access required." }` |
| 403 | Last active super_admin protection | `{ "error": "Cannot deactivate the last active super_admin." }` |
| 404 | User not found | `{ "error": "User not found." }` |
| 500 | Server error | `{ "error": "<message>" }` |

**Security notes:**
- Only `super_admin` can modify `role` and `status`.
- Users cannot change their own `role`, `status`, OTP fields, or reset auth tokens via general profile updates.
- The last active `super_admin` cannot be deactivated or demoted.

### DELETE /api/users/:id

**Purpose:** Delete a user account.

**Authentication required:** Yes — `super_admin` role required.

**Headers:**
- `Authorization: Bearer <token>` (required)

**URL parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | The numeric ID of the user to delete |

**Example request (curl):**

```bash
curl -X DELETE http://localhost:3000/api/users/2 \
  -H "Authorization: Bearer <admin-token>"
```

**Success response (200):**

```json
{
  "message": "deleted"
}
```

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 403 | Insufficient permissions | `{ "error": "Super admin access required." }` |
| 403 | Last active super_admin protection | `{ "error": "Cannot delete the last active super_admin." }` |
| 404 | User not found | `{ "error": "User not found." }` |
| 500 | Server error | `{ "error": "<message>" }` |

**Security notes:**
- The last active `super_admin` cannot be deleted.
- Deletion is permanent and cannot be undone.


---

## Custom User Management Endpoints

These endpoints are custom implementations under `/api/auth/admin/users/:id/` and provide business-specific operations not covered by Payload's built-in REST API.

### POST /api/auth/admin/users/:id/block

**Purpose:** Block a user account (set status to `blocked`). Blocked accounts cannot authenticate.

**Authentication required:** Yes — `super_admin` role required.

**Headers:**
- `Authorization: Bearer <token>` (required)

**URL parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | The numeric ID of the user to block |

**Request body:** None required.

**Example request (curl):**

```bash
curl -X POST http://localhost:3000/api/auth/admin/users/2/block \
  -H "Authorization: Bearer <admin-token>"
```

**Success response (200):**

```json
{
  "message": "User has been blocked.",
  "user": {
    "id": 2,
    "email": "teacher@example.com",
    "role": "teacher",
    "status": "blocked",
    "updatedAt": "2026-10-28T..."
  }
}
```

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 400 | User already blocked | `{ "error": "User is already blocked." }` |
| 403 | Last active super_admin protection | `{ "error": "Cannot block the last active super_admin." }` |
| 403 | Insufficient permissions | `{ "error": "Super admin access required." }` |
| 404 | User not found | `{ "error": "User not found." }` |
| 500 | Server error | `{ "error": "<message>" }` |

### POST /api/auth/admin/users/:id/unblock

**Purpose:** Unblock a blocked user account (set status to `active`).

**Authentication required:** Yes — `super_admin` role required.

**Headers:**
- `Authorization: Bearer <token>` (required)

**URL parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | The numeric ID of the user to unblock |

**Request body:** None required.

**Example request (curl):**

```bash
curl -X POST http://localhost:3000/api/auth/admin/users/2/unblock \
  -H "Authorization: Bearer <admin-token>"
```

**Success response (200):**

```json
{
  "message": "User has been unblocked.",
  "user": {
    "id": 2,
    "email": "teacher@example.com",
    "role": "teacher",
    "status": "active",
    "updatedAt": "2026-10-28T..."
  }
}
```

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 400 | User not blocked | `{ "error": "User is not blocked." }` |
| 403 | Insufficient permissions | `{ "error": "Super admin access required." }` |
| 404 | User not found | `{ "error": "User not found." }` |
| 500 | Server error | `{ "error": "<message>" }` |


### POST /api/auth/admin/users/:id/suspend

**Purpose:** Suspend a user account (set status to `suspended`). Suspended accounts cannot authenticate.

**Authentication required:** Yes — `super_admin` role required.

**Headers:**
- `Authorization: Bearer <token>` (required)

**URL parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | The numeric ID of the user to suspend |

**Request body:** None required.

**Example request (curl):**

```bash
curl -X POST http://localhost:3000/api/auth/admin/users/2/suspend \
  -H "Authorization: Bearer <admin-token>"
```

**Success response (200):**

```json
{
  "message": "User has been suspended.",
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
| 400 | User already suspended | `{ "error": "User is already suspended." }` |
| 403 | Last active super_admin protection | `{ "error": "Cannot suspend the last active super_admin." }` |
| 403 | Insufficient permissions | `{ "error": "Super admin access required." }` |
| 404 | User not found | `{ "error": "User not found." }` |
| 500 | Server error | `{ "error": "<message>" }` |

### POST /api/auth/admin/users/:id/reactivate

**Purpose:** Reactivate a suspended or blocked user account (set status to `active`).

**Authentication required:** Yes — `super_admin` role required.

**Headers:**
- `Authorization: Bearer <token>` (required)

**URL parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | The numeric ID of the user to reactivate |

**Request body:** None required.

**Example request (curl):**

```bash
curl -X POST http://localhost:3000/api/auth/admin/users/2/reactivate \
  -H "Authorization: Bearer <admin-token>"
```

**Success response (200):**

```json
{
  "message": "User has been reactivated.",
  "user": {
    "id": 2,
    "email": "teacher@example.com",
    "role": "teacher",
    "status": "active",
    "updatedAt": "2026-10-28T..."
  }
}
```

**Error responses:**

| Status | Condition | Example body |
|--------|-----------|--------------|
| 400 | User already active | `{ "error": "User is already active." }` |
| 403 | Insufficient permissions | `{ "error": "Super admin access required." }` |
| 404 | User not found | `{ "error": "User not found." }` |
| 500 | Server error | `{ "error": "<message>" }` |

### POST /api/auth/admin/users/:id/reset-password

**Purpose:** Admin-initiated password reset. Generates a secure temporary password and returns it once.

**Authentication required:** Yes — `super_admin` role required.

**Headers:**
- `Authorization: Bearer <token>` (required)

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
| 403 | Non-super_admin resetting super_admin password | `{ "error": "Cannot reset super_admin passwords." }` |
| 403 | Insufficient permissions | `{ "error": "Super admin access required." }` |
| 404 | User not found | `{ "error": "User not found." }` |
| 500 | Server error | `{ "error": "<message>" }` |


---

## Authentication and JWT Guide

### How Authentication Works

The API uses Payload CMS built-in JWT authentication. The `PAYLOAD_SECRET` environment variable signs and verifies tokens. Tokens are **stateless JWTs** — the server does not maintain a session store or token blacklist by default.

### Logging In and Obtaining a JWT

1. Call `POST /api/auth/login` with email and password.
2. On success, the response includes a `token` field (the JWT).
3. Store this token on the client.

### Passing the Token to Protected Endpoints

Include the JWT in the `Authorization` header using the Bearer scheme:

```
Authorization: Bearer <your-jwt-token>
```

### Token Expiry

Token expiry is controlled by Payload CMS's auth configuration and follows Payload's defaults unless overridden in `payload.config.ts`.

### Logout Behavior

Payload uses stateless JWTs. Logging out instructs the client to discard the token. Server-side revocation is not implemented unless Payload session tracking is separately enabled. Clients should delete the token from storage after logout.

---

## Error Reference

| Status | Condition | Endpoints | Example body |
|--------|-----------|-----------|--------------|
| 400 | Missing required field | All POST/PATCH endpoints | `{ "error": "Email is required." }` |
| 400 | Invalid request body | All POST/PATCH endpoints | `{ "error": "Invalid request body." }` |
| 400 | Password too short | `POST /api/users`, `POST /api/auth/login` | `{ "error": "Password must be at least 8 characters." }` |
| 400 | Invalid role or status | `PATCH /api/users/:id` | `{ "error": "Invalid role." }` |
| 400 | No fields to update | `PATCH /api/users/:id` | `{ "error": "No fields to update." }` |
| 400 | User already blocked | `POST /api/auth/admin/users/:id/block` | `{ "error": "User is already blocked." }` |
| 400 | User not blocked | `POST /api/auth/admin/users/:id/unblock` | `{ "error": "User is not blocked." }` |
| 400 | User already suspended | `POST /api/auth/admin/users/:id/suspend` | `{ "error": "User is already suspended." }` |
| 400 | User already active | `POST /api/auth/admin/users/:id/reactivate` | `{ "error": "User is already active." }` |
| 401 | Not authenticated | Protected endpoints | `{ "error": "Not authenticated." }` |
| 401 | Invalid email or password | `POST /api/auth/login` | `{ "error": "Invalid email or password." }` |
| 403 | Account blocked/suspended | `POST /api/auth/login` | `{ "error": "Account is not active. Please contact support." }` |
| 403 | Insufficient permissions | Admin endpoints | `{ "error": "Super admin access required." }` |
| 403 | Last active super_admin protection | `PATCH/DELETE` on last super_admin | `{ "error": "Cannot deactivate the last active super_admin." }` |
| 404 | User not found | `GET/PATCH/DELETE /api/users/:id` | `{ "error": "User not found." }` |
| 409 | Duplicate email | `POST /api/users`, `PATCH /api/users/:id` | `{ "error": "A user with this email already exists." }` |
| 429 | Rate limit exceeded | Login, OTP, reset endpoints | `{ "error": "Too many login attempts. Please try again later." }` |
| 500 | Server error | All endpoints | `{ "error": "<message>" }` |

---

## Security Notes

- **Passwords:** Hashed automatically by Payload. Never stored or returned in plaintext.
- **Sensitive fields:** Password hash, salt, OTP hash, OTP expiry, OTP attempts, reset auth token, reset auth expiry, reset auth used are never returned in API responses.
- **Role escalation prevention:** Teachers cannot change their own role or modify another user's account. Only `super_admin` can modify roles and statuses.
- **Last active super_admin protection:** The last active `super_admin` cannot be deleted, deactivated, blocked, suspended, or demoted via any endpoint.
- **Blocked/suspended authentication:** Blocked and suspended users cannot authenticate. Status is checked during login.
- **Rate limiting:** Applied per IP for login, forgot-password, verify-OTP, and reset-password endpoints. Uses in-memory storage (use Redis for production multi-instance deployments).
- **JWT:** Stateless; logout does not immediately invalidate tokens server-side.
- **HTTPS:** Use HTTPS in production to protect tokens and credentials in transit.
- **No public signup:** Account creation is `super_admin`-only.


---

## Implementation Notes and Gaps

1. **Role migration:** The `admin` and `staff` roles have been removed. Existing accounts with these roles would need to be migrated to `teacher` before deploying this change. No data migration script is included.

2. **Status migration:** The `inactive` status has been replaced with `blocked`. Existing accounts with `inactive` status would need to be migrated to `blocked` or `suspended`.

3. **Built-in Payload API access control:** The Users collection `access` rules enforce `super_admin`-only for create/update/delete. However, the built-in Payload REST API may still expose sensitive fields depending on field-level configuration. Always verify responses do not include password hash, salt, or OTP fields.

4. **Custom vs built-in endpoints:** Custom endpoints under `/api/auth/admin/users/:id/` provide block/unblock/suspend/reactivate operations. Built-in Payload endpoints at `/api/users` provide standard CRUD. Both are governed by the same `super_admin` access control.

5. **In-memory rate limiting:** The rate limiter uses a JavaScript `Map` and resets on server restart. For production deployments with multiple instances, a distributed store (e.g., Redis) is recommended.

6. **Last super_admin check race condition:** The last active super_admin check is performed at request time. In high-concurrency scenarios, two simultaneous requests could both pass the check. Consider database-level constraints for production.

---

**End of API Reference**

