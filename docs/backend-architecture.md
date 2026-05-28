# Acadex — Backend Architecture

## 1) Backend overview

### Purpose
The backend is a Node.js/Express API responsible for:

- Authentication (register/login/logout/session `/me`)
- Candidate APIs (dashboard, profile, question papers, reports, presentations, history)
- Admin APIs (departments CRUD, uploads/CRUD for papers/reports/presentations, candidate management)
- Chat APIs (rooms, messages, invites, membership, DM block)
- File hosting for uploaded materials under `/uploads`
- Session persistence using MongoDB session store

### Tech stack

- **Node.js + Express** (Express v5)
- **MongoDB + Mongoose** for primary data storage
- **express-session + connect-mongo** for session storage
- **multer** for file uploads
- **helmet**, **cors**, **express-rate-limit** for security/operational concerns
- **nodemailer** (Gmail) for reset password + bulk notifications
- **LibreOffice** (optional) invoked via `soffice` for converting DOC/DOCX and PPT/PPTX previews to PDF

---

## 2) Server architecture

### Entry point

- `hnd_backend/server.js`

Key initialization steps:

- `dotenv` load
- `connectDB()` (MongoDB connection)
- `helmet()` hardening
- `cors()` with dynamic origin allowlist
- rate limit on `/api/*`
- JSON + urlencoded bodies
- `express-session` using `connect-mongo`
- static file server: `GET /uploads/*`
- route mounts:
  - `/api/auth` → `routes/authRoutes.js`
  - `/api/candidate` → `routes/candidateRoutes.js`
  - `/api/admin` → `routes/adminRoutes.js`
  - `/api/chat` → `routes/chatRoutes.js`
- centralized error handler

### Session model

- Cookie name: `hnd.sid`
- Store: MongoDB via `connect-mongo`
- Cookie:
  - `httpOnly: true`
  - `sameSite: 'lax'` in dev, `'none'` in production
  - `secure: false` in dev, `true` in production
  - `maxAge`: 7 days

Backend stores `req.session.user` like:

```json
{
  "cand_id": "CAND00001",
  "email": "...",
  "name": "...",
  "dpt_id": "<Department ObjectId>",
  "role": "candidate|admin",
  "is_admin": true|false,
  "account_status": "active|suspended|blocked"
}
```

---

## 3) Folder structure

Root: `hnd_backend/`

| Folder | Contents |
|---|---|
| `config/` | MongoDB connection (`database.js`) |
| `controllers/` | Express handlers for each domain (auth, admin, candidate, chat) |
| `middlewares/` | session auth guards, file upload validation, request validation helpers |
| `models/` | Mongoose schemas for users, departments, materials, chat, history |
| `routes/` | Express routers (auth/candidate/admin/chat) |
| `services/` | external services (email) |
| `uploads/` | uploaded files: papers, reports, presentations, profile pictures |

There are also legacy/older folders (`Routes/`, `Authentication/`, `Adminwork/`, `CandidateWork/`, `Database/`) which appear to be from earlier iterations and are not mounted by the current `server.js` route configuration.

---

## 4) Authentication system

### Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/reset-password`
- `POST /api/auth/update-password`

### Auth mechanism

- Passwords are hashed using `bcrypt`.
- Sessions are created on login via `express-session`.
- Authorization checks rely on presence of `req.session.user`.

### Account restriction enforcement

Middleware: `middlewares/sessionAuth.js`

- `requireAuth`
  - allows admins through
  - for candidates:
    - loads user from DB
    - auto-reactivates if suspension expired
    - blocks restricted users (403) except allowlisted endpoints
- `requireAdmin`
  - checks session role or `ADMIN_EMAILS` allowlist
- `requireSelfOrAdmin(paramName)`
  - validates that `req.params[paramName] === session user cand_id` OR user is admin

Allowlisted routes when restricted (candidate):

- `GET /api/candidate/account/status`
- `POST /api/candidate/account/complaint`
- `DELETE /api/candidate/account/delete`

---

## 5) Middleware

### `middlewares/sessionAuth.js`

- `requireAuth` — session presence and restriction enforcement
- `requireAdmin` — admin-only endpoints
- `requireSelfOrAdmin` — resource ownership enforcement

### `middlewares/uploadValidation.js`

Validates upload types and size:

- Documents: `.pdf`, `.doc`, `.docx`, `.ppt`, `.pptx`
- Images: `.jpeg`, `.jpg`, `.png`

Size limits:

- documents: 15MB
- images: 5MB

### `middlewares/requestValidation.js`

- `sanitizeString(val, maxLen)`
- `sanitizeFilename(filename)`

Used to prevent directory traversal and invalid filename usage.

---

## 6) Controllers and responsibilities

### Auth

- `controllers/authController.js`
  - register, login, me, logout, reset password, update password

### Candidate (protected via `requireAuth`)

- `controllers/dashboardController.js` — dashboard summary
- `controllers/profileController.js` — profile CRUD, settings, password update, upload picture
- `controllers/candidateQuestionPaperController.js` — list/download/preview papers (dept-aware)
- `controllers/reportController.js` — list/download/preview reports (dept-aware) + DOC→PDF conversion
- `controllers/presentationController.js` — list/download/preview presentations + PPT→PDF conversion
- `controllers/historyController.js` — add + list history logs
- `controllers/candidateAccountController.js` — account status/complaints/delete account + chat-related account lists

### Admin (protected via `requireAdmin`)

- `controllers/departmentController.js` — department CRUD + overview aggregation
- `controllers/questionPaperController.js` — papers upload/update/delete + bulk email notify
- `controllers/adminReportController.js` — reports upload/update/delete + bulk email notify
- `controllers/adminPresentationController.js` — presentations upload/update/delete + bulk email notify
- `controllers/adminCandidateController.js` — list candidates + suspend/block/reactivate + complaint review

### Chat (protected via `requireAuth`)

- `controllers/chatController.js` — rooms, messages, center creation, invites, membership actions, DM blocks

---

## 7) Database models and schemas

### Core models

- `models/User.js`
  - `cand_id` (unique)
  - `role` (`admin|candidate`)
  - profile fields: name/email/phone/address/profile_picture
  - department reference: `dpt_id`
  - preference: `allow_emails`
  - account management:
    - `account_status` (`active|suspended|blocked`)
    - `suspension` object
    - `block` object
    - `complaints[]`

- `models/Department.js`
  - department_name, abbreviation, motto, faculty, description

### Materials

- `models/QuestionPaper.js`
  - course_title, hnd_year, paper_file, uploaded_by
  - audience (`GENERAL|SINGLE|MULTIPLE`)
  - departments[]
  - more_info (study links)

- `models/Report.js`
  - title, writer_names, writer_email, keywords, description, location, pages
  - file_path
  - audience + departments[]
  - notify_candidates

- `models/Presentation.js`
  - title, presenter_name, presenter_email
  - file_path
  - optional `report_id` ref

### Chat

- `models/ChatRoom.js`
  - types: `general`, `department`, `center`, `dm`
  - `invite_code` unique partial index
  - `dm_key` unique partial index

- `models/ChatMembership.js`
  - membership per user/room
  - role, mute, last_read_at, left_at

- `models/ChatMessage.js`
  - room_id, sender_cand_id, text

- `models/ChatInvite.js`
  - invites for centers

- `models/ChatBlock.js`
  - DM block relationships

### History

- `models/History.js`
  - user_id, content_type, content_title, action

---

## 8) External integrations

### Email

- `services/emailService.js`
  - Gmail transporter
  - retry logic
  - bulk BCC send in chunks

Used by:

- reset password email code
- admin “notify candidates” flows when uploading papers/reports/presentations

### LibreOffice conversion

- `reportController.previewFile` converts `.doc/.docx` to `.pdf` into `uploads/reports/pdfs/`
- `presentationController.previewFile` converts `.ppt/.pptx` to `.pdf` into `uploads/presentations/pdfs/`

These depend on LibreOffice being installed on the server machine (Windows paths are checked).

---

## 9) Environment variables and configuration

### Frontend

- `REACT_APP_API_URL` — backend base URL for frontend.

### Backend (observed in code)

- `PORT` — server port (default `5000`)
- `NODE_ENV` — affects cookie `secure`/`sameSite` and CORS behavior
- `CORS_ORIGIN` — comma-separated allowlist origins
- `SESSION_SECRET` — session signing secret
- `MONGODB_URI` — MongoDB connection string
- `ADMIN_EMAILS` — comma-separated admin email allowlist (used for admin access)
- `EMAIL_USER`, `EMAIL_PASS` — Gmail credentials/app password

---

## 10) Request/response flow (high-level)

1. Frontend sends request with `credentials: include` / `withCredentials: true`.
2. Browser includes `hnd.sid` cookie.
3. Express session middleware loads session from MongoDB.
4. Auth middleware (`requireAuth`/`requireAdmin`) checks `req.session.user`.
5. Controllers execute DB operations and return JSON.
6. For file endpoints:
   - server streams files from `uploads/*`.

---

## 11) Notes / invariants

- Candidate identity is keyed by `cand_id` (string) in most endpoints.
- Department identity is MongoDB `_id`.
- Many candidate endpoints are department-scoped for access control.
- Chat membership supports “left groups” and rejoin flows by toggling `left_at`.
