# Acadex — Frontend Navigation Knowledge Base (AI Assistant)

This document is intended to be used as a **navigation-oriented knowledge base** for an AI assistant helping end users.

It focuses on:

- where features live in the UI
- what users can do on each page
- step-by-step guidance to complete tasks

---

## Quick route map

### Public

- `/` — Home
- `/login` — Login
- `/register` — Candidate Registration
- `/reset-password` — Reset password page (also used as modal)

### Candidate area (requires login)

All candidate pages are inside the **Candidate Dashboard Shell**.

- `/candidate` — Candidate Dashboard
- `/candidate/question-papers` — Question Papers
- `/candidate/reports` — Reports
- `/candidate/presentations` — Presentations
- `/candidate/chat` — Chat
- `/candidate/profile` — Profile
- `/candidate/settings` — Settings
- `/candidate/account-status` — Account restriction (complaint page)

### Admin area (requires admin login)

All admin pages are inside the **Admin Shell**.

- `/admin` — Admin Dashboard
- `/admin/manage-candidates` — Manage Candidate Accounts
- `/admin/departments` — Departments
- `/admin/question-papers` — Question Papers Upload/CRUD
- `/admin/reports` — Reports Upload/CRUD
- `/admin/presentations` — Presentations Upload/CRUD
- `/admin/profile` — Profile
- `/admin/settings` — Settings

---

## Navigation principles for AI guidance

### How authentication impacts navigation

- The app uses a **session cookie** (`hnd.sid`) and checks authentication via `GET /api/auth/me`.
- If the user is **not authenticated**:
  - Candidate or Admin shell will redirect to `/login`.
- If a candidate is authenticated but **restricted**:
  - Candidate shell will redirect to `/candidate/account-status`.

### How to tell if the user is admin or candidate

- On login, role info is returned via API and also stored in `localStorage`.
- Admin navigation exists under `/admin/...`.
- Candidate navigation exists under `/candidate/...`.

---

## Common user tasks (step-by-step)

### Task: Create a candidate account

1. Go to `/register`.
2. Fill in:
   - **Name**
   - **Department** (dropdown)
   - **Email**
   - **Phone number**
   - **Password** and **Confirm Password**
3. Click **Register**.
4. After success toast, you’re redirected to `/login`.

If department list fails to load:

- The dropdown is loaded from backend. Confirm backend is running and reachable.

### Task: Login

1. Go to `/login`.
2. Enter email and password.
3. Click **Login**.
4. After login:
   - Admin users go to `/admin`.
   - Candidates go to `/candidate`.
   - Restricted candidates are redirected to `/candidate/account-status`.

### Task: Reset password

1. On `/login`, click **Forgot Password?**
2. Step 1:
   - Enter your email
   - Click **Send Code**
3. Step 2:
   - Enter the verification code from your email
   - Enter new password + confirm
   - Click **Update**

If user reports “no email received”:

- Backend must have email configured (`EMAIL_USER`, `EMAIL_PASS`).

### Task: Download a question paper

1. Go to `/candidate/question-papers`.
2. Use filters:
   - Search by title
   - Department dropdown
   - Year dropdown
3. Choose a paper card.
4. Click:
   - **Preview** to open in an embedded viewer
   - **Download** to save to device

### Task: Preview a report (Word/PDF)

1. Go to `/candidate/reports`.
2. Search by report title.
3. Click **Preview**.

Notes for AI support:

- Word previews may require backend conversion to PDF.
- If preview fails, user can still try **Download**.

### Task: Preview a presentation

1. Go to `/candidate/presentations`.
2. Search by presentation title.
3. Click **Preview**.

Notes:

- PPT/PPTX previews may be converted to PDF server-side.

### Task: Open and use Chat

1. Go to `/candidate/chat`.
2. Wait for rooms to load.
3. Select a room in the left list.
4. Type into the message input.
5. Press send.

Chat room types the user may see:

- **General** (all candidates)
- **Department** (department group)
- **Center** (user-created groups)
- **Personal/DM** (direct message)

### Task: Create a “Center” group chat

1. Go to `/candidate/chat`.
2. Open the “Create Center” UI.
3. Enter:
   - Center name
   - Optional description
4. Create.

### Task: Invite a user to a Center

1. In chat, choose a center room.
2. Use the invites UI.
3. Search a candidate by name/ID.
4. Send invite.

### Task: Accept or reject chat invites

1. Go to `/candidate/chat`.
2. Open pending invites section.
3. Choose Accept or Reject.

### Task: Block a user in DM

1. Go to `/candidate/chat`.
2. Open a personal chat.
3. Use block controls to set blocked status.

Result:

- blocked users cannot send DM messages to you (and vice versa depending on enforcement).

### Task: Update profile details

1. Go to `/candidate/profile`.
2. Click **Edit**.
3. Update:
   - Name
   - Phone
   - Address
4. Click save.

### Task: Upload/change profile picture

1. Go to `/candidate/profile`.
2. Click **Edit**.
3. Choose a picture file.
4. Save.

### Task: Change password

1. Go to `/candidate/profile`.
2. Use change password fields.
3. Save.

### Task: Change theme (dark/light)

1. Go to `/candidate/settings` (or `/admin/settings`).
2. Toggle theme.

### Task: Update email preference

1. Go to `/candidate/settings`.
2. Find email preference toggle.
3. Save.

### Task: View account status / submit complaint

This happens when the user is restricted.

1. Go to `/candidate/account-status`.
2. Review:
   - Status (Suspended/Blocked)
   - Reason
   - Duration (if suspended)
3. Enter complaint text.
4. Click **Submit**.

### Task: Rejoin a group you left

1. Go to `/candidate/settings`.
2. Expand **Left groups**.
3. Toggle rejoin on a group.

### Task: Unblock a user you blocked

1. Go to `/candidate/settings`.
2. Expand **Blocked users**.
3. Click unblock action.

### Task: Delete candidate account

1. Go to `/candidate/settings`.
2. Scroll to delete account section.
3. Confirm deletion.

---

## Admin task guides

### Task: Manage departments

1. Go to `/admin/departments`.
2. Use form to create department.
3. Select a department to edit.
4. Delete is available (may be blocked if candidates are assigned).

### Task: Upload question paper

1. Go to `/admin/question-papers`.
2. Choose audience.
3. Fill metadata.
4. Attach file.
5. Upload (may prompt to notify candidates).

### Task: Upload report

1. Go to `/admin/reports`.
2. Choose audience.
3. Fill metadata + attach file.
4. Upload.

### Task: Upload presentation

1. Go to `/admin/presentations`.
2. Optionally link to a report.
3. Fill presenter details.
4. Attach file.
5. Upload.

### Task: Manage candidates (suspend/block/reactivate)

1. Go to `/admin/manage-candidates`.
2. Search for a candidate.
3. Open candidate details modal.
4. Actions:
   - **Suspend**: choose start/end and reason
   - **Block**: reason
   - **Reactivate**
   - **Mark complaints reviewed**

---

## Page-by-page interaction hints

### Candidate Dashboard (`/candidate`)

- Shows:
  - profile summary
  - department
  - coursemates preview
  - download counters
  - recent materials

### Admin Dashboard (`/admin`)

- Contains clickable “cards” to jump to admin sections.
- Contains a toggle for analytics charts.

### Question Papers (`/candidate/question-papers`)

- Filters: title search, department, year
- Actions: preview, download

### Reports (`/candidate/reports`)

- Filter: title search
- Actions: preview, download

### Presentations (`/candidate/presentations`)

- Filter: title search
- Actions: preview, download

### Settings (`/candidate/settings`)

- Theme toggle
- Email preference toggle
- Account status chip
- Left groups accordion
- Blocked users accordion
- Delete account modal

---

## Known limitations / caveats (important for AI assistant)

- History page (`/candidate/history`) expects a `userId` prop in `History.jsx`, but the route renders it directly; this may mean the history list is empty unless the component is wired to read from localStorage/session.
- Reset password (`ResetPassword.jsx`) sends the reset request to a hardcoded `http://localhost:5000` for step 1, which may break if frontend is accessed over LAN/IP.

(These should be handled in support guidance: ask user what host they are using.)
