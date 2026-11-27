# Uploads API

Route: `src/app/api/uploads/route.ts`. All requests need a signed-in, active user (`Authorization: Bearer <token>`).

## POST /api/uploads

`multipart/form-data`:

| Field | Value |
|---|---|
| `file` | The file |
| `purpose` | `avatar`, `document` (default), `course-thumbnail` (or `thumbnail`), `course-video` (or `video`) |
| `label`, `category` | Optional, documents only |

| Purpose | Who | Accepted | Max size |
|---|---|---|---|
| `avatar` | Any active user | JPG, PNG, WebP | 5 MB |
| `document` | Any active user | PDF or image, private | 10 MB |
| `course-thumbnail` | `courses` write access (`super_admin`, `course_manager`) | JPG, PNG, WebP | 10 MB |
| `course-video` | `courses` write access (`super_admin`, `course_manager`) | Video | 60 MB |

Success: `201` with `{ success, message, data }`. Course uploads return the file `url`, `publicId`, `format`, `size`, `width`, `height`; videos also return `duration` (seconds) and `resourceType`.

| Status | When |
|---|---|
| 400 | Not multipart, unknown purpose, missing or invalid file |
| 401 | Not signed in (checked before the body is read, in every environment) |
| 403 | Blocked or suspended account, or course upload without `courses` write access |

## Other routes

- `GET /api/uploads`: the caller's documents; super admins may add `?userId=`.
- `DELETE /api/uploads/:id`: deletes one of the caller's documents.
- `DELETE /api/uploads/avatar`: removes the caller's profile photo.
