# Acadex — API Reference

Base URL (dev): `http://localhost:5000`

All endpoints below are mounted under `/api/*` by `hnd_backend/server.js`.

## Conventions

### Authentication

- Auth is **session-based** using cookie `hnd.sid`.
- Frontend must send requests with credentials:
  - `fetch(..., { credentials: 'include' })`
  - or axios `{ withCredentials: true }`

### Common response fields

Many endpoints respond with one of:

- `{ success: true, ... }`
- `{ success: false, message: "..." }`
- `{ message: "..." }` (some auth endpoints)

### File endpoints

- Download endpoints return a file stream.
- Preview endpoints may return:
  - the original PDF
  - or a converted PDF for doc/docx/ppt/pptx

### Errors

- `401` — not authenticated
- `403` — forbidden / restricted account
- `409` — conflict
- `429` — rate limited (server applies rate limiting under `/api/*`)

---

# 1) Auth API (`/api/auth`)

## POST `/api/auth/register`

Create a candidate account.

- **Body**

| Field | Type | Required | Notes |
|---|---:|---:|---|
| `name` | string | yes | Candidate display name |
| `dpt_id` | string | yes | Department ObjectId |
| `email` | string | yes | Lowercased in backend |
| `phone` | string | yes | |
| `password` | string | yes | Hashed with bcrypt |

- **Response (201)**

```json
{
  "message": "User registered successfully",
  "user": {
    "name": "...",
    "email": "...",
    "phone": "...",
    "department": "Department Name",
    "dpt_id": "<ObjectId>"
  }
}
```

## POST `/api/auth/login`

Login and create a session.

- **Body**

| Field | Type | Required |
|---|---:|---:|
| `email` | string | yes |
| `password` | string | yes |

- **Response (200)**

```json
{
  "message": "Login successful",
  "user": {
    "cand_id": "CAND00001",
    "email": "...",
    "name": "...",
    "dpt_id": "<ObjectId>",
    "role": "candidate",
    "is_admin": false,
    "account_status": "active"
  }
}
```

## GET `/api/auth/me`

Returns the current session user.

- **Response (200)**

Authenticated:

```json
{ "authenticated": true, "user": { "cand_id": "...", "role": "candidate", "account_status": "active" } }
```

Not authenticated:

```json
{ "authenticated": false, "user": null }
```

## POST `/api/auth/logout`

Destroys the session and clears cookie.

- **Response (200)**

```json
{ "success": true }
```

## POST `/api/auth/reset-password`

Send a verification code to email.

- **Body**

| Field | Type | Required |
|---|---:|---:|
| `email` | string | yes |

- **Response (200)**

```json
{ "message": "Verification code sent to your email" }
```

## POST `/api/auth/update-password`

Update password using a verification code.

- **Body**

| Field | Type | Required |
|---|---:|---:|
| `email` | string | yes |
| `code` | string | yes |
| `newPassword` | string | yes |

- **Response (200)**

```json
{ "message": "Password updated successfully" }
```

## GET `/api/auth/departments`

Public department list for registration.

- **Response (200)**

Array of:

```json
{ "dpt_id": "<ObjectId>", "department_name": "...", "abbreviation": "...", "motto": "...", "faculty": "...", "description": "..." }
```

---

# 2) Candidate API (`/api/candidate`)

All candidate endpoints are protected by session middleware (`requireAuth`).

## GET `/api/candidate/dashboard`

Candidate dashboard summary.

- **Query params**

| Param | Type | Required | Notes |
|---|---:|---:|---|
| `userId` | string | sometimes | If session exists, backend may use session user. CandidateDashboard sends this query param. |

- **Response (200)**

```json
{
  "success": true,
  "user": {
    "id": "CAND00001",
    "name": "...",
    "profilePicture": "/uploads/profile/...jpg",
    "department": "...",
    "departmentAbbr": "...",
    "status": "Active"
  },
  "questionPapers": [{ "id": "...", "course_title": "..." }],
  "reports": [{ "id": "...", "title": "..." }],
  "presentations": [{ "id": "...", "title": "..." }],
  "courseMates": [{ "id": "CAND00002", "name": "...", "profile_picture": "..." }],
  "downloads": 0
}
```

## Profile

### GET `/api/candidate/profile/:cand_id`

Get profile by candidate ID.

- **Response (200)**

```json
{
  "cand_id": "CAND00001",
  "name": "...",
  "email": "...",
  "phone": "...",
  "address": "...",
  "profile_picture": "/uploads/profile/...jpg",
  "role": "candidate",
  "academic_year": null,
  "allow_emails": true,
  "createdAt": "...",
  "department": { "dpt_id": "...", "department_name": "...", "abbreviation": "..." }
}
```

### PUT `/api/candidate/profile/update/:cand_id`

Update basic profile.

- **Body**

| Field | Type | Required |
|---|---:|---:|
| `name` | string | yes |
| `phone` | string | yes |
| `address` | string\|null | no |

- **Response (200)**

```json
{ "message": "Profile updated successfully" }
```

### PUT `/api/candidate/profile/update-password/:cand_id`

Change password.

- **Body**

| Field | Type | Required |
|---|---:|---:|
| `newPassword` | string | yes |

- **Response (200)**

```json
{ "message": "Password updated successfully" }
```

### PUT `/api/candidate/profile/settings/:cand_id`

Update settings.

- **Body**

| Field | Type | Required |
|---|---:|---:|
| `allow_emails` | boolean | yes |

- **Response (200)**

```json
{ "message": "Settings updated successfully", "allow_emails": true }
```

### POST `/api/candidate/profile/upload-picture/:cand_id`

Upload profile picture.

- **Content-Type**: `multipart/form-data`
- **Form field**: `profile_picture` (image)

- **Response (200)**

```json
{ "message": "Profile picture updated", "profile_picture": "/uploads/profile/<file>" }
```

## Question papers

### GET `/api/candidate/departments`

Candidate-visible departments for filtering.

### GET `/api/candidate/question-papers`

List question papers accessible by candidate’s department.

- **Response (200)**

```json
{ "success": true, "papers": [ { "qp_id": "...", "paper_title": "...", "hnd_year": "...", "paper_file": "...", "audience": "GENERAL", "departments": [] } ] }
```

### GET `/api/candidate/question-papers/file/:filename`

Download question paper file.

### GET `/api/candidate/question-papers/preview/:filename`

Preview question paper (inline).

## Reports

### GET `/api/candidate/reports`

List accessible reports.

### GET `/api/candidate/reports/file/:filename`

Download report.

### GET `/api/candidate/reports/preview/:filename`

Preview report.

Notes:

- `.doc/.docx` may be converted to PDF using LibreOffice and cached under `uploads/reports/pdfs/`.

## Presentations

### GET `/api/candidate/presentations`

List presentations.

### GET `/api/candidate/presentations/file/:filename`

Download presentation.

### GET `/api/candidate/presentations/preview/:filename`

Preview presentation.

Notes:

- `.ppt/.pptx` may be converted to PDF and cached under `uploads/presentations/pdfs/`.

## History

### POST `/api/candidate/history/add`

Add history record.

- **Body**

| Field | Type | Required |
|---|---:|---:|
| `user_id` | string | yes (fallback) |
| `content_type` | string | yes |
| `content_title` | string | yes |
| `action` | string | yes |

- **Response**

```json
{ "success": true }
```

### GET `/api/candidate/history/:user_id`

Get history logs for user.

- **Response**

```json
{ "success": true, "logs": [ { "history_id": "...", "content_type": "...", "content_title": "...", "action": "...", "timestamp": "..." } ] }
```

## Candidate account management

### GET `/api/candidate/account/status`

Get account restriction details.

- **Response**

```json
{
  "success": true,
  "account_status": "active|suspended|blocked",
  "suspension": { "start_at": "...", "end_at": "...", "reason": "..." },
  "block": { "reason": "..." },
  "complaints": [ { "text": "...", "status": "pending|reviewed" } ],
  "user": { "cand_id": "...", "name": "...", "email": "..." }
}
```

### POST `/api/candidate/account/complaint`

Submit complaint.

- **Body**

| Field | Type | Required |
|---|---:|---:|
| `text` | string | yes |

- **Response**

```json
{ "success": true }
```

### DELETE `/api/candidate/account/delete`

Delete current candidate account and associated chat/history data.

- **Response**

```json
{ "success": true }
```

### GET `/api/candidate/account/left-groups`

List chat groups the candidate left.

### POST `/api/candidate/account/left-groups/:roomId/rejoin`

Rejoin a previously left room.

### GET `/api/candidate/account/blocked-users`

List DM-blocked users.

### DELETE `/api/candidate/account/blocked-users/:otherCandId`

Unblock a user.

---

# 3) Admin API (`/api/admin`)

All admin endpoints are protected by `requireAdmin`.

## Departments

### GET `/api/admin/departments`

List departments (formatted).

### GET `/api/admin/departments/overview`

Returns department counts (aggregation of users per dept).

### POST `/api/admin/departments`

Create department.

### PUT `/api/admin/departments/:id`

Update department.

### DELETE `/api/admin/departments/:id`

Delete department (blocked if users exist).

## Question papers (admin)

### GET `/api/admin/get-question-papers`

List all papers.

### POST `/api/admin/upload-paper`

Upload paper.

- **multipart/form-data**
- **file field:** `paperFile`
- **fields:** `audience`, `dpt_id` or `dpt_ids`, `paperTitle`, `hndYear`, `uploaded_by`, optional `study_links` and `notify`

### PUT `/api/admin/question-papers/:id`

Update paper metadata.

### DELETE `/api/admin/question-papers/:id`

Delete paper + uploaded file.

### GET `/api/admin/download-paper/:filename`

Download a paper.

## Reports (admin)

### GET `/api/admin/reports/list`

List reports.

### POST `/api/admin/upload-report`

Upload report.

- **multipart/form-data**
- **file field:** `reportDoc`

### PUT `/api/admin/reports/:id`

Update report metadata.

### DELETE `/api/admin/reports/:id`

Delete report + uploaded file (+ cached PDF).

## Presentations (admin)

### GET `/api/admin/reports`

List reports (for linking).

### GET `/api/admin/presentations/list`

List presentations.

### POST `/api/admin/upload-presentation`

Upload presentation.

- **multipart/form-data**
- **file field:** `presentationFile`

### PUT `/api/admin/presentations/:id`

Update presentation metadata.

### DELETE `/api/admin/presentations/:id`

Delete presentation + uploaded file (+ cached PDF).

## Candidate management

### GET `/api/admin/candidates`

List candidates.

- **Query params**

| Param | Type | Notes |
|---|---:|---|
| `q` | string | search by name/cand_id/email |

### GET `/api/admin/candidates/:candId`

Candidate details.

### PUT `/api/admin/candidates/:candId/suspend`

Suspend a candidate.

- **Body**: `{ start_at, end_at, reason }`

### PUT `/api/admin/candidates/:candId/block`

Block a candidate.

- **Body**: `{ reason }`

### PUT `/api/admin/candidates/:candId/reactivate`

Reactivate a candidate.

### PUT `/api/admin/candidates/:candId/complaints/reviewed`

Mark pending complaints reviewed.

---

# 4) Chat API (`/api/chat`)

All chat endpoints require authenticated session (`requireAuth`).

## POST `/api/chat/bootstrap`

Initializes chat rooms and memberships (general and department rooms, and other bootstrap tasks).

## GET `/api/chat/users/search?q=...`

Search users by cand_id/name/email.

## GET `/api/chat/rooms`

List rooms visible to the user (includes unread counters, DM metadata, etc.).

## POST `/api/chat/centers`

Create a “center” group chat.

## POST `/api/chat/invite/:code/join`

Join a center by invite code.

## POST `/api/chat/dm/:otherCandId`

Create or fetch a DM room with another user.

## GET `/api/chat/dm/:otherCandId/block`

Get block status between you and another candidate.

## PUT `/api/chat/dm/:otherCandId/block`

Set block status.

- **Body**: `{ blocked: true|false }`

## GET `/api/chat/invites`

List pending invites.

## POST `/api/chat/invites/:inviteId/respond`

Respond to an invite.

- **Body**: `{ accept: true|false }`

## POST `/api/chat/rooms/:roomId/invites`

Invite a user to a center.

## GET `/api/chat/rooms/:roomId/members`

List room members.

- **Query params**: `q` optional filter

## GET `/api/chat/rooms/:roomId/messages`

List messages.

- **Query params**: `limit` optional

## POST `/api/chat/rooms/:roomId/messages`

Send message.

- **Body**: `{ text: "..." }`

## POST `/api/chat/rooms/:roomId/read`

Mark room read.

## POST `/api/chat/rooms/:roomId/clear`

Clear room messages.

## POST `/api/chat/rooms/:roomId/join`

Join room.

## PUT `/api/chat/rooms/:roomId/mute`

Mute/unmute.

- **Body**: `{ muted: true|false }`

## POST `/api/chat/rooms/:roomId/leave`

Leave room.

---

# 5) Static files

- `GET /uploads/*` — serves files from `hnd_backend/uploads/`.

---

## Gaps / items to verify

This reference is derived from route/controller code and covers all mounted endpoints.

If you want the API reference to include **exact** request/response shapes for every chat endpoint, the remaining parts of `chatController.js` (beyond the lines scanned) should be documented in a follow-up pass (e.g., `listRooms`, `createCenter`, `bootstrap`, `sendCenterInvite`, `respondToInvite`, `getMessages`, `sendMessage`, `setMute`, `leaveRoom`).
