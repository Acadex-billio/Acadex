# Acadex - System Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [MongoDB Documentation](#mongodb-documentation)
4. [API Reference](#api-reference)
5. [Security](#security)
6. [Environment Variables](#environment-variables)
7. [Setup & Installation](#setup--installation)
8. [Frontend Structure](#frontend-structure)

---

## System Overview

The **Acadex** is a full-stack educational management system for Higher National Diploma (HND) and Brevet de Technicien Supérieur (BTS) students. It provides:

- **Candidate features:** Access to question papers, reports, presentations, profile management, group chat
- **Admin features:** Upload materials, manage departments, view analytics, broadcast notifications
- **Authentication:** Registration, login, password reset with email verification

### Technology Stack

| Layer       | Technology                    |
|------------|-------------------------------|
| Frontend   | React 19, React Router, Axios |
| Backend    | Node.js, Express 5            |
| Database   | MongoDB (Mongoose)            |
| File Storage | Local (uploads/)            |
| Email      | Nodemailer (Gmail)            |

---

## Architecture

### Backend Structure

```
hnd_backend/
├── config/
│   └── database.js          # MongoDB connection
├── controllers/             # Business logic
│   ├── authController.js
│   ├── dashboardController.js
│   ├── profileController.js
│   ├── reportController.js
│   ├── presentationController.js
│   ├── historyController.js
│   ├── departmentController.js
│   ├── questionPaperController.js
│   ├── adminReportController.js
│   └── adminPresentationController.js
├── models/                  # Mongoose schemas
│   ├── User.js
│   ├── Department.js
│   ├── QuestionPaper.js
│   ├── Report.js
│   ├── Presentation.js
│   └── History.js
├── routes/
│   ├── authRoutes.js
│   ├── candidateRoutes.js
│   └── adminRoutes.js
├── services/
│   └── emailService.js      # Email with retry logic
├── middlewares/
│   ├── uploadValidation.js  # File type/size validation
│   └── requestValidation.js # Sanitization
├── server.js
└── uploads/                 # File storage
    ├── papers/
    ├── reports/
    ├── presentations/
    └── profile/
```

---

## MongoDB Documentation

### Database: `hnd_platform`

All collections are managed by Mongoose. The database name is configurable via `MONGODB_URI`.

### Collections & Schemas

#### 1. **users**

Stores candidate/admin user accounts.

| Field            | Type     | Required | Index | Description                    |
|------------------|----------|----------|-------|--------------------------------|
| cand_id          | String   | Yes      | Unique| Candidate ID (e.g. CAND00001)  |
| name             | String   | Yes      | -     | Full name                      |
| email            | String   | Yes      | Unique| Email (lowercase)              |
| phone            | String   | No       | -     | Phone number                   |
| password         | String   | Yes      | -     | Bcrypt hash (select: false)    |
| address          | String   | No       | -     | Physical address               |
| profile_picture  | String   | No       | -     | URL path to image              |
| dpt_id           | ObjectId | Yes      | Index | Reference to departments       |
| createdAt        | Date     | Auto     | -     | Timestamp                      |
| updatedAt        | Date     | Auto     | -     | Timestamp                      |

**Indexes:**
- `email`: 1
- `dpt_id`: 1

---

#### 2. **departments**

Academic departments.

| Field            | Type   | Required | Index   | Description              |
|------------------|--------|----------|---------|--------------------------|
| department_name  | String | Yes      | Index   | Department name          |
| abbreviation     | String | Yes      | Unique  | Short code (e.g. CSE)    |
| motto            | String | No       | -       | Department motto         |
| faculty          | String | No       | -       | Faculty name             |
| description      | String | No       | -       | Description              |
| createdAt        | Date   | Auto     | -       | Timestamp                |
| updatedAt        | Date   | Auto     | -       | Timestamp                |

**Indexes:**
- `department_name`: 1
- `abbreviation`: 1 (unique)

---

#### 3. **questionpapers**

Question papers with embedded department references.

| Field       | Type     | Required | Index  | Description                   |
|-------------|----------|----------|--------|-------------------------------|
| course_title| String   | Yes      | Text   | Paper title                   |
| hnd_year    | String   | Yes      | Index  | Academic year (e.g. 2024)     |
| paper_file  | String   | Yes      | -      | Filename in uploads/papers/   |
| uploaded_by | String   | Yes      | -      | Admin name/email              |
| audience    | String   | No       | -      | GENERAL, SINGLE, MULTIPLE     |
| more_info   | String   | No       | -      | Additional info/study links   |
| departments | [ObjectId] | No    | Index  | Ref to Department (embedded)  |
| createdAt   | Date     | Auto     | Index  | Timestamp                     |
| updatedAt   | Date     | Auto     | -      | Timestamp                     |

**Indexes:**
- `course_title`: text
- `hnd_year`: 1
- `departments`: 1
- `createdAt`: -1

**Audience values:**
- `GENERAL`: All departments (departments array empty)
- `SINGLE`: One department
- `MULTIPLE`: Multiple departments

---

#### 4. **reports**

Reports with embedded department references.

| Field              | Type       | Required | Index | Description              |
|--------------------|------------|----------|-------|--------------------------|
| title              | String     | Yes      | Text  | Report title             |
| writer_names       | String     | Yes      | -     | Author names             |
| writer_email       | String     | Yes      | -     | Author email             |
| keywords           | String     | No       | -     | Keywords                 |
| description        | String     | No       | -     | Description              |
| location           | String     | No       | -     | Geographic focus         |
| pages              | String     | No       | -     | Page count               |
| file_path          | String     | Yes      | -     | Filename in uploads/     |
| audience           | String     | No       | -     | GENERAL, SINGLE, MULTIPLE|
| notify_candidates  | Boolean    | No       | -     | Email notification sent  |
| departments        | [ObjectId] | No       | Index | Ref to Department        |
| createdAt          | Date       | Auto     | Index | Timestamp                |
| updatedAt          | Date       | Auto     | -     | Timestamp                |

**Indexes:**
- `title`: text
- `departments`: 1
- `createdAt`: -1

---

#### 5. **presentations**

PowerPoint presentations (optionally linked to reports).

| Field           | Type     | Required | Index | Description                |
|-----------------|----------|----------|-------|----------------------------|
| title           | String   | Yes      | Text  | Presentation title         |
| presenter_name  | String   | Yes      | -     | Presenter name             |
| presenter_email | String   | Yes      | -     | Presenter email            |
| file_path       | String   | Yes      | -     | Filename in uploads/       |
| report_id       | ObjectId | No       | Index | Reference to Report        |
| createdAt       | Date     | Auto     | Index | Timestamp                  |
| updatedAt       | Date     | Auto     | -     | Timestamp                  |

**Indexes:**
- `title`: text
- `report_id`: 1
- `createdAt`: -1

---

#### 6. **histories**

User activity logs.

| Field        | Type   | Required | Index | Description     |
|--------------|--------|----------|-------|-----------------|
| user_id      | String | Yes      | Index | cand_id         |
| content_type | String | Yes      | -     | e.g. paper, report |
| content_title| String | Yes      | -     | Item title      |
| action       | String | Yes      | -     | e.g. view, download |
| createdAt    | Date   | Auto     | Index | Timestamp       |

**Indexes:**
- `user_id`: 1
- `createdAt`: -1

---

### Entity Relationships

```
Department (1) ─────────< User (N)        [users.dpt_id → departments._id]
Department (N) ─────────< QuestionPaper   [questionpapers.departments → departments._id]
Department (N) ─────────< Report          [reports.departments → departments._id]
Report (1) ─────────────< Presentation (N) [presentations.report_id → reports._id]
User ───────────────────< History (N)     [histories.user_id → users.cand_id]
```

### Query Examples

**Find question papers for a department:**
```javascript
QuestionPaper.find({ 
  $or: [ 
    { audience: 'GENERAL' }, 
    { departments: departmentObjectId } 
  ] 
});
```

**Find reports by department with pagination:**
```javascript
Report.find({ departments: deptId })
  .sort({ createdAt: -1 })
  .skip((page - 1) * limit)
  .limit(limit)
  .select('title writer_names file_path')
  .lean();
```

---

## API Reference

### Base URL
`http://localhost:5000` (or `REACT_APP_API_URL`)

### Auth

| Method | Endpoint                | Description              |
|--------|-------------------------|--------------------------|
| POST   | /api/auth/register      | Register new user        |
| POST   | /api/auth/login         | Login                    |
| POST   | /api/auth/reset-password| Request reset code       |
| POST   | /api/auth/update-password| Update with code        |

### Candidate

| Method | Endpoint                              | Description           |
|--------|---------------------------------------|-----------------------|
| GET    | /api/candidate/dashboard?userId=      | Dashboard data        |
| GET    | /api/candidate/profile/:cand_id       | Get profile           |
| PUT    | /api/candidate/profile/update/:cand_id| Update profile        |
| PUT    | /api/candidate/profile/update-password/:cand_id | Change password |
| POST   | /api/candidate/profile/upload-picture/:cand_id  | Upload avatar   |
| GET    | /api/candidate/reports?page=&limit=   | List reports          |
| GET    | /api/candidate/reports/file/:filename | Download report       |
| GET    | /api/candidate/reports/preview/:filename | Preview report     |
| GET    | /api/candidate/presentations?page=&limit= | List presentations |
| GET    | /api/candidate/presentations/file/:filename | Download presentation |
| GET    | /api/candidate/presentations/preview/:filename | Preview presentation |
| POST   | /api/candidate/history/add            | Add history entry     |
| GET    | /api/candidate/history/:user_id       | Get user history      |

### Admin

| Method | Endpoint                   | Description                |
|--------|----------------------------|----------------------------|
| GET    | /api/admin/departments     | List departments           |
| GET    | /api/admin/departments/overview | Department analytics |
| POST   | /api/admin/departments     | Create department          |
| GET    | /api/admin/get-question-papers | List question papers   |
| POST   | /api/admin/upload-paper    | Upload question paper      |
| GET    | /api/admin/download-paper/:filename | Download paper     |
| POST   | /api/admin/upload-report   | Upload report              |
| GET    | /api/admin/reports         | List reports (for dropdown)|
| POST   | /api/admin/upload-presentation | Upload presentation    |

---

## Security

- **Helmet:** Security HTTP headers
- **Rate Limiting:** 100 requests / 15 min per IP on /api/*
- **CORS:** Configurable origin
- **File Validation:** Allowed types (pdf, doc, docx, ppt, pptx for docs; jpeg, jpg, png for profile). Max 15MB (docs), 5MB (images)
- **Directory Traversal:** Filename sanitization
- **Environment:** Secrets in .env, never committed

---

## Environment Variables

### Backend (.env in hnd_backend/)

| Variable      | Description                    | Example                          |
|---------------|--------------------------------|----------------------------------|
| PORT          | Server port                    | 5000                             |
| MONGODB_URI   | MongoDB connection string      | mongodb://localhost:27017/hnd_platform |
| CORS_ORIGIN   | Allowed frontend origin        | http://localhost:3000            |
| EMAIL_USER    | Gmail for nodemailer           | your@gmail.com                   |
| EMAIL_PASS    | Gmail app password             | xxxx-xxxx-xxxx-xxxx              |

### Frontend (.env in project root)

| Variable            | Description         | Example                    |
|---------------------|---------------------|----------------------------|
| REACT_APP_API_URL   | Backend API base URL| http://localhost:5000      |

---

## Setup & Installation

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Gmail account (for email features)

### 1. Clone and install dependencies

```bash
# Frontend
npm install

# Backend
cd hnd_backend
npm install
```

### 2. Environment setup

```bash
# Backend
cd hnd_backend
cp .env.example .env
# Edit .env with your values

# Frontend (optional - defaults to localhost:5000)
cp .env.example .env
# Set REACT_APP_API_URL if needed
```

### 3. Start MongoDB
Ensure MongoDB is running on `localhost:27017` (or your MONGODB_URI).

### 4. Run the application

```bash
# Terminal 1 - Backend
cd hnd_backend
npm start

# Terminal 2 - Frontend
npm start
```

### 5. Seed data (optional)
Create at least one department via the Admin panel (`/dept`) before registering users.

---

## Frontend Structure

```
src/
├── config/
│   └── api.js              # API_BASE_URL
├── components/
│   ├── AdminDashboard.jsx
│   ├── CandidateDashboard.jsx
│   ├── CandProfile.jsx
│   ├── Department.jsx
│   ├── ErrorBoundary.jsx
│   ├── GroupChat.jsx
│   ├── Home.jsx
│   ├── Login.jsx
│   ├── QuestionPapers.jsx
│   ├── QuestionUpload.jsx
│   ├── Registration.jsx
│   ├── ReportUpload.jsx
│   ├── ResetPassword.jsx
│   ├── UploadPresentation.jsx
│   ├── UploadReport.jsx
│   ├── ViewPresentation.jsx
│   └── ViewReports.jsx
├── context/
│   └── LoadingContext.jsx
├── utility/
│   ├── ToastNotification.jsx
│   ├── apiClient.js
│   └── useLocalStorage.jsx
├── Astyles/                # CSS modules
├── App.jsx
└── index.js
```

All API calls use `API_BASE_URL` from `src/config/api.js`, which reads `REACT_APP_API_URL` or defaults to `http://localhost:5000`.
