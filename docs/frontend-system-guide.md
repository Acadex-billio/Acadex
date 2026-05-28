# Acadex — Frontend System Guide

## 1) Application overview

### Purpose
Acadex is a web application for **HND candidates** and **admins**.

- Candidates use it to access academic resources (question papers, reports, presentations), manage their profile/settings, and communicate in the in-app chat (general, department, centers, and direct messages).
- Admins use it to manage departments, upload/manage materials (papers/reports/presentations), and manage candidate accounts (suspend/block/reactivate, review complaints).

### Primary user roles

- **Candidate** (default):
  - Browse/preview/download question papers
  - Browse/preview/download reports and presentations
  - Participate in group chat and direct messages
  - Update profile information and password
  - Configure preferences (theme, email notifications)
  - Account management: view account status, submit complaint if restricted, view left groups, view blocked users, delete account

- **Admin**:
  - Department CRUD (create/update/delete)
  - Question paper CRUD + upload + notify candidates
  - Report CRUD + upload + notify candidates
  - Presentation CRUD + upload + notify candidates
  - Candidate management (view details, suspend, block, reactivate, mark complaints reviewed)

### Technology summary

- **React (CRA)**: `react-scripts` app
- **React Router**: nested routes with `AdminShell` and `CandidateShell`
- **Axios + fetch**: API calls
- **react-toastify**: toasts; global `showToast()` wrapper
- **Loading overlay**: `LoadingContext` + `GraduationCapLoader`

### API base URL
Frontend uses `API_BASE_URL` from `src/config/api.js`:

- `process.env.REACT_APP_API_URL` if set
- otherwise infers `http://<frontend-hostname>:5000`

This is important for LAN access (opening the frontend via IP).

---

## 2) Page and route structure

Routes are defined in `src/App.jsx`.

### Public routes

| Path | Component | Purpose |
|---|---|---|
| `/` | `Home` | Landing page with “Get Started” button → login |
| `/login` | `Login` | Candidate/admin login (session-based) |
| `/register` | `Registration` | Candidate registration (department selection) |
| `/reset-password` | `ResetPassword` | Password reset popup page (also used as modal from Login) |
| `/load` | `GraduationCapLoader` | Standalone loader screen |

### Admin routes (nested under `/admin`)
Rendered inside `AdminShell` layout.

| Path | Component | What the admin can do |
|---|---|---|
| `/admin` (index) | `AdminDashboard` | Admin overview + navigation cards + basic analytics UI |
| `/admin/manage-candidates` | `ManageCandidates` | Search candidates; open details modal; suspend/block/reactivate; review complaints |
| `/admin/departments` | `Department` | Create/update/delete departments |
| `/admin/reports` | `ReportUpload` | Upload/update/delete reports; target audience (general/single/multiple departments); optional email notification |
| `/admin/presentations` | `UploadPresentation` | Upload/update/delete presentations; optionally link to report; optional email notification |
| `/admin/question-papers` | `QuestionUpload` | Upload/update/delete question papers; target audience; optional email notification |
| `/admin/profile` | `Profile` | View/update admin profile (same component used for candidate) |
| `/admin/settings` | `Settings` | Theme + preference settings (admin view differs) |

**Access control:** `AdminShell` calls `/api/auth/me` and redirects to `/login` if not authenticated or not admin.

### Candidate routes (nested under `/candidate`)
Rendered inside `CandidateShell` layout.

| Path | Component | What the candidate can do |
|---|---|---|
| `/candidate` (index) | `CandidateDashboard` | Dashboard overview: recent materials, coursemates, stats |
| `/candidate/question-papers` | `QuestionPapers` | Filter, preview, download question papers |
| `/candidate/reports` | `ViewReports` | Search, preview, download reports |
| `/candidate/presentations` | `ViewPresentation` | Search, preview, download presentations |
| `/candidate/history` | `History` | Interaction history list (may rely on prop wiring) |
| `/candidate/chat` | `GroupChat` | General/department/center/DM chat, invites, blocking, leave/join |
| `/candidate/profile` | `Profile` | View/edit profile + upload picture + change password |
| `/candidate/settings` | `Settings` | Theme + email preference + account management dropdowns |
| `/candidate/account-status` | `CandidateAccountStatus` | Restricted-account page: shows suspension/block info and complaint form |

**Access control:** `CandidateShell` calls `/api/auth/me` and:

- redirects to `/login` if not authenticated
- redirects to `/candidate/account-status` if `account_status !== 'active'`

### Legacy redirects
`App.jsx` redirects older paths to current routes:

- `/admindash` → `/admin`
- `/dept` → `/admin/departments`
- `/upreport` → `/admin/reports`
- `/upresentation` → `/admin/presentations`
- `/question` → `/admin/question-papers`
- `/candash` → `/candidate`
- `/questionpapers` → `/candidate/question-papers`
- `/viewreports` → `/candidate/reports`
- `/viewpresentation` → `/candidate/presentations`
- `/viewhistory` → `/candidate/history`
- `/groupchat` → `/candidate/chat`
- `/can-profile` → `/candidate/profile`

---

## 3) UI navigation guide (common tasks)

### Create an account (Candidate)

1. Go to `/register`.
2. Fill:
   - Name
   - Department (dropdown is loaded from backend)
   - Email
   - Phone
   - Password + Confirm Password
3. Submit.
4. You’ll be redirected to `/login`.

### Login (Candidate or Admin)

1. Go to `/login`.
2. Enter email + password.
3. Submit.
4. On success:
   - Admin → redirected to `/admin`
   - Candidate → redirected to `/candidate` if active, otherwise `/candidate/account-status`

### Reset password

1. On `/login`, click **Forgot Password?**
2. Step 1: enter email and send code.
3. Step 2: enter verification code and new password.

Note: Reset password uses backend email sending; email must be configured server-side.

### Upload question papers (Admin)

1. Navigate: `/admin` → click “Upload Papers” card OR sidebar “Question Papers”.
2. Fill:
   - Audience: General / Single Dept / Multiple Depts
   - Department(s) (if needed)
   - Title, HND Year, Uploaded By
   - Optional study links
   - Select file
3. Submit. Optionally choose notification behavior (modal).

### Upload reports (Admin)

1. Go to `/admin/reports`.
2. Choose audience and department(s).
3. Fill report metadata and attach document.
4. Upload; optionally notify.

### Upload presentations (Admin)

1. Go to `/admin/presentations`.
2. Select an existing report to link (optional).
3. Fill title/presenter info and attach PPT/PPTX.
4. Upload.

### Download resources (Candidate)

- Question papers: `/candidate/question-papers`
  - Use filters
  - Preview opens an iframe modal using a Blob URL
  - Download uses Blob / anchor download

- Reports: `/candidate/reports`
  - Preview uses Blob iframe
  - Download uses direct link to file endpoint

- Presentations: `/candidate/presentations`
  - Preview uses Blob iframe
  - Download uses direct link to file endpoint

### Update profile (Candidate/Admin)

1. Go to Profile:
   - Candidate: `/candidate/profile`
   - Admin: `/admin/profile`
2. Click **Edit**.
3. Update name/phone/address.
4. Optionally choose a profile picture and save.
5. Optionally change password.

### Chat usage (Candidate)

1. Go to `/candidate/chat`.
2. The app bootstraps chat rooms.
3. Select a room:
   - General chat
   - Department group
   - Centers (created by users)
   - Direct messages
4. Type message and send.
5. Use “more” menu for actions like mute/leave/clear, and use DM block controls.

### Account restriction (Candidate)

If suspended or blocked:

1. Login redirects to `/candidate/account-status`.
2. The page shows restriction reason/duration.
3. Candidate can submit a complaint.

### Manage candidates (Admin)

1. Go to `/admin/manage-candidates`.
2. Search by ID/name/email.
3. Click a candidate row to open details modal.
4. Actions:
   - Suspend (start + end + reason)
   - Block (reason)
   - Reactivate
   - Mark complaints reviewed

---

## 4) Component breakdown (major UI components)

### Layout / Shells

- `AdminShell` (`src/components/layout/AdminShell.jsx`)
  - Sidebar navigation + header
  - Auth guard via `/api/auth/me`
  - Logout button calls `/api/auth/logout`

- `CandidateShell` (`src/components/layout/CandidateShell.jsx`)
  - Sidebar navigation + header
  - Auth guard via `/api/auth/me`
  - Redirects restricted accounts to `/candidate/account-status`

### Cross-cutting

- `ToastNotification` (`src/utility/ToastNotification.jsx`)
  - Wraps `react-toastify`
  - Exposes `window.notify` and `showToast(message, type)`
  - Plays audio for each toast

- `LoadingContext` (`src/context/LoadingContext.jsx`)
  - Global pending counter
  - Used by `useApi` and pages to show loader overlay

- `GraduationCapLoader` (`src/components/GraduationCapLoader.jsx`)
  - Fullscreen loader overlay used during route transitions and uploads

### Auth & onboarding

- `Home`, `Login`, `Registration`, `ResetPassword`

### Candidate features

- `CandidateDashboard`
- `QuestionPapers` (browse/preview/download)
- `ViewReports` (browse/preview/download)
- `ViewPresentation` (browse/preview/download)
- `GroupChat` (chat UI)
- `Profile` (profile edit + upload picture + password)
- `Settings` (theme + preferences + account management)
- `CandidateAccountStatus` (restricted UI + complaint submit)

### Admin features

- `AdminDashboard` (dashboard + analytics UI)
- `Department` (department CRUD)
- `QuestionUpload` (question papers CRUD/upload)
- `ReportUpload` (reports CRUD/upload)
- `UploadPresentation` (presentations CRUD/upload)
- `ManageCandidates` (candidate account controls)

---

## 5) User workflows (high-level flows)

### Registration flow

1. `/register` loads departments from `GET /api/auth/departments`.
2. Candidate submits registration to `POST /api/auth/register`.
3. Success toast, then redirect to `/login`.

### Login flow

1. `/login` posts credentials to `POST /api/auth/login`.
2. Backend creates session and returns `{ message, user }`.
3. Frontend stores:
   - `userId` ← `user.cand_id`
   - `userEmail` ← `user.email`
   - `userName` ← `user.name`
   - `isAdmin` ← `user.is_admin`
4. Frontend routes based on role/status.

### Candidate restricted flow

1. `CandidateShell` checks `/api/auth/me`.
2. If `account_status !== 'active'`, navigate to `/candidate/account-status`.
3. `CandidateAccountStatus` calls `GET /api/candidate/account/status` and displays details.
4. Candidate can submit complaint to `POST /api/candidate/account/complaint`.

### Chat workflow

1. `GroupChat` calls `POST /api/chat/bootstrap`.
2. Loads rooms: `GET /api/chat/rooms`.
3. Loads messages: `GET /api/chat/rooms/:roomId/messages`.
4. Sends messages: `POST /api/chat/rooms/:roomId/messages`.
5. Membership actions: join/leave/mute, invite flows.
6. DM blocking: `PUT /api/chat/dm/:otherCandId/block`.

### Profile management workflow

1. `Profile` loads profile: `GET /api/candidate/profile/:cand_id`.
2. Update profile: `PUT /api/candidate/profile/update/:cand_id`.
3. Update password: `PUT /api/candidate/profile/update-password/:cand_id`.
4. Upload picture: `POST /api/candidate/profile/upload-picture/:cand_id` (multipart form)

### Materials consumption workflow (Candidate)

- Question papers:
  - List: `GET /api/candidate/question-papers`
  - Preview: `GET /api/candidate/question-papers/preview/:filename` (blob)
  - Download: `GET /api/candidate/question-papers/file/:filename` (blob)

- Reports:
  - List: `GET /api/candidate/reports`
  - Preview: `GET /api/candidate/reports/preview/:filename` (blob/PDF conversion)
  - Download: `GET /api/candidate/reports/file/:filename`

- Presentations:
  - List: `GET /api/candidate/presentations`
  - Preview: `GET /api/candidate/presentations/preview/:filename` (blob/PDF conversion)
  - Download: `GET /api/candidate/presentations/file/:filename`

---

## 6) Interface descriptions (what the user sees)

### Shell layout

Both Admin and Candidate shells have:

- Header
  - Menu toggle
  - Brand title
  - Logout icon
- Sidebar
  - NavLink list
- Main content
  - Routed page via `<Outlet />`

### Common UI controls

- Forms
  - Registration form with validation + password show/hide
  - Login form
  - CRUD forms for uploads and departments

- Modals
  - Preview modals (iframe + close button)
  - Candidate admin details modal in `ManageCandidates`

- Buttons
  - CRUD action buttons: upload/update/delete
  - Chat send (`paper plane` icon)
  - Profile edit toggle

---

## 7) Feature explanations for AI assistance

### “Where do I upload a file?”

- Admin uploads only:
  - Question papers: `/admin/question-papers`
  - Reports: `/admin/reports`
  - Presentations: `/admin/presentations`
- Candidates do not upload academic files; they can upload only a **profile picture** under `/candidate/profile`.

### “How do I create a group chat?”

- Go to `/candidate/chat`.
- Use the **Create Center** flow inside the chat UI (centers are user-created group chats).

### “How do I update my profile?”

- Go to `/candidate/profile`.
- Click **Edit**, change fields, then save.
- Optional: upload a picture and change password.

### “Why am I redirected to Account Status?”

- If your account is `suspended` or `blocked`, `CandidateShell` redirects you to `/candidate/account-status`.
- That page shows the restriction reason and allows submitting a complaint.
