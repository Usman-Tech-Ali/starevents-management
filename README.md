# StarEvents Management System
## Digital Transformation Platform for SMEs

A comprehensive web-based event management system with advanced security, inventory tracking, and reporting capabilities.

---

## 📋 Table of Contents
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Quick Start](#quick-start)
- [Features](#features)
- [API Endpoints](#api-endpoints)
- [Module Overview](#module-overview)
- [Testing](#testing)
- [Deployment](#deployment)

---

## 📁 Project Structure

```
starevents-management/
├── backend/                    # Django REST API
│   ├── authentication/         # 3-phase auth system
│   ├── events/                 # Event & booking management
│   ├── inventory/              # Inventory tracking
│   ├── reports/                # Reporting & analytics
│   ├── starevents/             # Django settings
│   ├── manage.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                   # React.js Frontend
│   ├── src/
│   │   ├── pages/              # Page components
│   │   ├── components/         # Reusable components
│   │   ├── contexts/           # React contexts
│   │   ├── api/                # API client
│   │   └── App.jsx
│   ├── package.json
│   └── Dockerfile
├── nginx/                      # Nginx configuration
├── docker-compose.yml
└── README.md
```

---

## 🛠 Technology Stack

### Backend
- **Python 3.11+** - Programming language
- **Django 4.2+** - Web framework
- **Django REST Framework** - API development
- **PostgreSQL 15** - Production database (SQLite for dev)
- **JWT Authentication** - Token-based auth
- **face_recognition** - Biometric authentication
- **ReportLab** - PDF generation
- **openpyxl** - Excel export
- **Twilio** - SMS delivery (optional)

### Frontend
- **React 18** - UI library
- **React Router v6** - Client-side routing
- **Axios** - HTTP client
- **Tailwind CSS** - Styling
- **Recharts** - Data visualization
- **React Hook Form** - Form management
- **Lucide React** - Icons

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose (recommended)
- Node.js 18+ (for frontend development)
- Python 3.11+ (for backend development)
- Git

### Option 1: Docker Compose (Recommended)
```bash
# Clone repository
git clone <repo-url>
cd starevents-management

# Start all services
docker-compose up

# Access applications
# Frontend: http://localhost:3000
# Backend: http://localhost:8000
# Admin: http://localhost:8000/admin
```

### Option 2: Manual Setup

#### Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env  # Edit .env with your settings

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Start server
python manage.py runserver
```

#### Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

---

## ✨ Features

### 1. 🔐 Three-Phase Authentication System
- **Phase 1**: Username & Password with account lockout
- **Phase 2**: One-Time Password (OTP) via Email/SMS
- **Phase 3**: Face Recognition Biometric verification
- Comprehensive audit logging
- JWT token-based sessions

### 2. 📅 Event Management
- Create, edit, publish, and cancel events
- Event categories (Corporate, Wedding, Birthday, Conference, Seminar)
- Capacity management with availability tracking
- Event status tracking (Draft, Published, Cancelled, Completed)
- Image upload support

### 3. 🎫 Booking System
- Create and manage event bookings
- Booking status tracking (Pending, Confirmed, Cancelled, Completed)
- Automatic booking reference generation
- Waitlist support
- Special requests field
- Email confirmation notifications

### 4. 📦 Inventory Management
- Track event inventory and supplies
- Stock level monitoring
- Inventory allocation to events
- Usage tracking and reporting

### 5. 📊 Reporting & Analytics
- Event performance reports
- Booking analytics
- Revenue tracking
- Inventory reports
- PDF and Excel export

### 6. 🔔 Notifications
- Booking confirmations
- Event reminders
- Cancellation notifications
- Real-time notification system

---

## 🔌 API Endpoints

### Authentication
```
POST   /api/auth/login_phase1/          # Username & password login
POST   /api/auth/request_otp/           # Request OTP
POST   /api/auth/verify_otp/            # Verify OTP
POST   /api/auth/enroll_biometric/      # Enroll face (first login)
POST   /api/auth/verify_biometric/      # Verify face (subsequent logins)
```

### Events
```
GET    /api/events/events/              # List all events
POST   /api/events/events/              # Create event
GET    /api/events/events/{id}/         # Get event details
PUT    /api/events/events/{id}/         # Update event
DELETE /api/events/events/{id}/         # Delete event
POST   /api/events/events/{id}/publish/ # Publish event
POST   /api/events/events/{id}/cancel/  # Cancel event
```

### Bookings
```
GET    /api/events/bookings/            # List bookings
POST   /api/events/bookings/            # Create booking
GET    /api/events/bookings/{id}/       # Get booking details
PUT    /api/events/bookings/{id}/       # Update booking
DELETE /api/events/bookings/{id}/       # Delete booking
POST   /api/events/bookings/{id}/confirm/ # Confirm booking
POST   /api/events/bookings/{id}/cancel/  # Cancel booking
```

### Notifications
```
GET    /api/events/notifications/       # List notifications
POST   /api/events/notifications/{id}/mark_read/  # Mark as read
POST   /api/events/notifications/mark_all_read/   # Mark all as read
```

---

## 👥 Module Overview

### Authentication Module
- **Developer**: Muhammad Shamail Tariq
- **Features**: 3-phase auth, biometric enrollment, OTP verification, audit logging
- **Files**: `backend/authentication/`

### Event Management & Booking
- **Developer**: Muhammad Mohsin Khan
- **Features**: Event CRUD, booking management, notifications, capacity tracking
- **Files**: `backend/events/`

### Inventory & Reporting
- **Developer**: Md Masum Rana
- **Features**: Inventory tracking, analytics, PDF/Excel export
- **Files**: `backend/inventory/`, `backend/reports/`

### Database & DevOps
- **Developer**: Muhammad Musharaf
- **Features**: Database design, Docker setup, deployment configuration
- **Files**: `docker-compose.yml`, `nginx/`, `Dockerfile`

---

## 🧪 Testing

### Test User Credentials
```
Username: testuser
Password: TestPassword123
```

### Complete Authentication Flow
1. Go to `http://localhost:3000/login`
2. Enter test credentials
3. Request OTP (check console for code in dev mode)
4. Verify OTP with 6-digit code
5. Capture face for biometric verification
6. Access dashboard

### API Testing
```bash
# Using curl
curl -X POST http://localhost:8000/api/auth/login_phase1/ \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"TestPassword123"}'

# Using Postman
# Import collection from backend documentation
```

---

## 🌐 Deployment

### Environment Variables
Create `.env` file in backend directory:
```
DEBUG=False
SECRET_KEY=your-secret-key-here
DATABASE_URL=postgresql://user:password@localhost:5432/starevents
CORS_ALLOWED_ORIGINS=https://yourdomain.com
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
FACE_RECOGNITION_TOLERANCE=0.6
```

### Production Checklist
- [ ] Change `SECRET_KEY` and `JWT_SECRET_KEY`
- [ ] Set `DEBUG=False`
- [ ] Configure PostgreSQL database
- [ ] Set up email service (Gmail, SendGrid, etc.)
- [ ] Configure CORS for production domain
- [ ] Enable HTTPS/SSL
- [ ] Set up error tracking (Sentry)
- [ ] Configure logging
- [ ] Set up monitoring and alerts
- [ ] Run security checks

### Docker Deployment
```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

---

## 📝 Database Schema

### User Model
- Standard Django User with custom fields
- `biometric_enrolled` - Face enrollment status
- `biometric_embedding` - Stored face encoding
- `failed_login_attempts` - Login attempt tracking
- `account_locked_until` - Account lockout timestamp

### Event Model
- Title, description, category
- Venue, start/end dates
- Capacity, price, status
- Image upload support
- Timestamps and creator tracking

### Booking Model
- Event reference
- Client reference
- Number of tickets, total amount
- Status tracking
- Special requests
- Automatic reference generation
- Waitlist support

### Notification Model
- User reference
- Notification type
- Title, message, read status
- Related event/booking
- Timestamp

---

## 🔒 Security Features

- **Password Hashing**: bcrypt via Django
- **OTP Hashing**: SHA-256 with salt
- **JWT Tokens**: Secure token-based authentication
- **Account Lockout**: After 3 failed login attempts
- **Face Quality Validation**: Prevents poor biometric enrollment
- **CORS Configuration**: Restricted to allowed origins
- **Audit Logging**: All authentication events logged
- **Rate Limiting**: Configurable per endpoint

---

## 📞 Support & Troubleshooting

### Common Issues

**Port Already in Use**
```bash
# Find process using port
lsof -i :8000  # macOS/Linux
netstat -ano | findstr :8000  # Windows

# Kill process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

**Database Migration Issues**
```bash
cd backend
python manage.py migrate --fake-initial
python manage.py migrate
```

**Face Recognition Not Working**
- Ensure good lighting
- Position face in center of frame
- Check camera permissions
- Verify dlib installation

---

## 📄 License
Academic Project - University of the West of Scotland

---

## 👨‍💻 Contributors
- Muhammad Shamail Tariq (Security & Authentication)
- Muhammad Mohsin Khan (Event Management & Booking)
- Md Masum Rana (Inventory & Reporting)
- Muhammad Musharaf (Database & DevOps)

---

**Last Updated**: April 30, 2026  
**Status**: ✅ Production Ready
