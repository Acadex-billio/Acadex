# Acadex Backend

## Overview
Acadex backend for managing candidates, departments, reports, question papers, presentations, and chat functionality.

## Quick Start

### Prerequisites
- Node.js 18.0.0 or higher
- MongoDB 4.4+
- npm or yarn

### Setup (5 minutes)

1. **Clone repository**
   ```bash
   git clone https://github.com/BellioNoel/HND-PLATFORM.git
   cd hnd-platform/hnd_backend
   ```

2. **Configure environment**
   ```bash
   # Generate secure session secret
   SESSION_SECRET=$(openssl rand -hex 64)
   
   # Create .env file
   cat > .env << EOF
   MONGODB_URI=mongodb://localhost:27017/hnd_platform
   SESSION_SECRET=$SESSION_SECRET
   PORT=5000
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-gmail-app-password
   CORS_ORIGIN=http://localhost:3000
   EOF
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Start server**
   ```bash
   npm start
   ```

## Features

### 🔐 Security
- **Authentication**: Session-based with bcrypt password hashing
- **Authorization**: Role-based access (admin/candidate)
- **Rate Limiting**: 100 requests per 15 minutes
- **Security Headers**: Helmet.js middleware
- **Input Validation**: Express validator middleware
- **CORS**: Configurable for frontend domain

### 📊 Core Modules
- **User Management**: Registration, login, profile management
- **Department Management**: CRUD operations for academic departments
- **File Management**: Upload/download reports, papers, presentations
- **Chat System**: Real-time messaging with rooms and DMs
- **Announcements**: System-wide notifications
- **AI Assistant**: Web search integration with multiple platforms

### 🔍 Search Integration
- **DuckDuckGo**: Primary search engine
- **Wikipedia**: General knowledge base
- **arXiv**: Academic research papers
- **Stack Overflow**: Programming Q&A
- **GeeksforGeeks**: Technical tutorials
- **MDN Web Docs**: Web development documentation
- **Reddit**: Community discussions

### 📧 API Endpoints

#### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

#### User Management
- `GET /api/candidate/profile` - Get user profile
- `PUT /api/candidate/profile` - Update profile
- `POST /api/candidate/upload` - Upload files

#### Admin
- `GET /api/admin/summary` - Platform statistics
- `GET /api/admin/users` - User management
- `POST /api/admin/upload` - Admin file uploads

#### File Management
- `GET /api/reports` - List reports
- `GET /api/papers` - List question papers
- `GET /api/presentations` - List presentations
- `GET /api/files/download/:id` - Download files

#### Chat
- `GET /api/chat/rooms` - List chat rooms
- `POST /api/chat/message` - Send message
- `GET /api/chat/history/:roomId` - Chat history

#### AI Assistant
- `POST /api/web-search/search` - Multi-platform web search
- `GET /api/web-search/health` - Search service health check

## 🗂 Project Structure

```
hnd_backend/
├── config/
│   └── database.js          # MongoDB connection
├── controllers/                # Route handlers
│   ├── authController.js
│   ├── candidateController.js
│   ├── adminController.js
│   └── ...
├── models/                     # Mongoose schemas
│   ├── User.js
│   ├── Department.js
│   └── ...
├── routes/                     # Express routes
│   ├── authRoutes.js
│   ├── candidateRoutes.js
│   └── ...
├── middlewares/                # Custom middleware
│   ├── sessionAuth.js
│   └── upload.js
├── services/                  # Business logic
│   ├── emailService.js
│   ├── duckDuckGoService.js
│   └── ...
├── uploads/                    # File storage
├── .env                       # Environment variables
├── package.json               # Dependencies
└── server.js                  # Application entry point
```

## 🔧 Development

### Environment Setup
```bash
# Development
npm run dev

# Production
npm run start
```

### Testing
```bash
# Run all tests
npm test

# Security scan
npm run security-scan
```

### Database Setup
```javascript
// config/database.js
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
```

## 📚 Documentation

- [API Documentation](./API_DOCS.md)
- [Security Guidelines](./SECURITY_GUIDELINES.md)
- [Environment Setup](./ENV_SETUP.md)

## 🚀 Deployment

### Production Checklist
- [ ] Environment variables configured
- [ ] MongoDB connection secured
- [ ] HTTPS enabled
- [ ] Rate limiting tested
- [ ] File upload limits set
- [ ] Error logging configured
- [ ] Health checks implemented

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Ensure all tests pass
5. Submit pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

**Last Updated**: March 2026
**Version**: 2.0.0
