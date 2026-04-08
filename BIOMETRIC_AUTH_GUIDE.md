# Face Recognition Authentication System - Setup & Implementation Guide

## Overview
This project implements a 3-phase authentication system with biometric face recognition for the StarEvents Management System.

### The 3-Phase Login Flow:
1. **Phase 1: Username & Password** - Traditional credential validation
2. **Phase 2: OTP Verification** - One-time password via Email/SMS (2FA)
3. **Phase 3: Face Recognition** - Biometric authentication
   - First login: Face enrollment (capture and store user's face)
   - Subsequent logins: Face verification (compare captured face with stored profile)

---

## Backend Setup

### Prerequisites
- Python 3.11+
- PostgreSQL 15 (for production) or SQLite (for development)
- pip virtual environment

### Installation

1. **Navigate to backend directory:**
```bash
cd backend
```

2. **Create and activate virtual environment:**
```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1  # Windows PowerShell
source .venv/bin/activate      # Linux/macOS
```

3. **Install dependencies:**
```bash
pip install -r requirements.txt
```

4. **Configure environment variables:**
Create a `.env` file in the `backend` directory with the following:
```
DEBUG=True
SECRET_KEY=your-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-here
ALLOWED_HOSTS=localhost,127.0.0.1

# Database configuration
DATABASE_URL=sqlite:///db.sqlite3  # For development
# or for PostgreSQL:
DATABASE_URL=postgresql://user:password@localhost:5432/starevents_db

# Face Recognition Settings
FACE_RECOGNITION_TOLERANCE=0.6
FACE_RECOGNITION_MODEL=hog

# Email Configuration
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password

# SMS Configuration (Twilio - optional)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=your-twilio-number

# CORS Settings
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000
```

5. **Run migrations:**
```bash
python manage.py migrate
```

6. **Create a test user (optional):**
```bash
python manage.py shell
>>> from django.contrib.auth import get_user_model
>>> User = get_user_model()
>>> user = User.objects.create_user(
...     username='testuser',
...     email='test@example.com',
...     password='TestPassword123',
...     phone_number='+1234567890'
... )
```

7. **Start the backend server:**
```bash
python manage.py runserver
```
Backend will be available at: `http://localhost:8000`

---

## Frontend Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. **Navigate to frontend directory:**
```bash
cd frontend
```

2. **Install dependencies:**
```bash
npm install
```

3. **Create environment configuration (if needed):**
Create a `.env.local` file:
```
VITE_API_URL=http://localhost:8000/api
```

4. **Start the development server:**
```bash
npm run dev
```
Frontend will be available at: `http://localhost:3000`

---

## API Endpoints

### Authentication Endpoints

#### 1. Register User
```
POST /api/auth/register/
Content-Type: application/json

{
  "username": "newuser",
  "email": "user@example.com",
  "password": "SecurePassword123",
  "password_confirm": "SecurePassword123",
  "first_name": "John",
  "last_name": "Doe",
  "phone_number": "+1234567890",
  "role": "client"
}
```

**Response (201):**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "username": "newuser",
    "email": "user@example.com",
    "first_name": "John",
    "role": "client",
    "biometric_enrolled": false
  }
}
```

---

#### 2. Phase 1: Login with Username & Password
```
POST /api/auth/login_phase1/
Content-Type: application/json

{
  "username": "testuser",
  "password": "TestPassword123"
}
```

**Response (200):**
```json
{
  "phase": 2,
  "message": "Password verified. OTP required.",
  "user_id": 1,
  "requires_otp": true,
  "biometric_enrolled": false
}
```

**Error Response (401):**
```json
{
  "non_field_errors": ["Invalid credentials"]
}
```

---

#### 3. Phase 2a: Request OTP
```
POST /api/auth/request_otp/
Content-Type: application/json

{
  "user_id": 1,
  "delivery_method": "email"  # or "sms"
}
```

**Response (200):**
```json
{
  "message": "OTP sent via email",
  "expires_in": 600
}
```

---

#### 4. Phase 2b: Verify OTP
```
POST /api/auth/verify_otp/
Content-Type: application/json

{
  "user_id": 1,
  "otp": "123456"
}
```

**Response (200):**
```json
{
  "message": "OTP verified successfully. Complete face capture to finish login.",
  "challenge_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "biometric_enrolled": false,
  "next_step": "enroll_biometric",
  "user": {
    "id": 1,
    "username": "testuser",
    "email": "test@example.com",
    "biometric_enrolled": false
  }
}
```

---

#### 5. Phase 3a: Enroll Biometric (First Login Only)
```
POST /api/auth/enroll_biometric/
Content-Type: application/json
Authorization: Bearer <challenge_token>

{
  "user_id": 1,
  "image_data": "base64-encoded-image-data",
  "challenge_token": "<challenge_token>"
}
```

**Response (200):**
```json
{
  "message": "Biometric enrolled successfully. Login complete.",
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",  # Final JWT token for authenticated requests
  "user": {
    "id": 1,
    "username": "testuser",
    "biometric_enrolled": true
  }
}
```

**Error Response (400):**
```json
{
  "error": "No face detected. Keep your full face in frame and try again.",
  "error_code": "no_face_detected"
}
```

---

#### 6. Phase 3b: Verify Biometric (Subsequent Logins)
```
POST /api/auth/verify_biometric/
Content-Type: application/json
Authorization: Bearer <challenge_token>

{
  "user_id": 1,
  "image_data": "base64-encoded-image-data",
  "challenge_token": "<challenge_token>"
}
```

**Response (200):**
```json
{
  "message": "Biometric verified successfully",
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",  # Final JWT token
  "user": {
    "id": 1,
    "username": "testuser",
    "biometric_enrolled": true
  }
}
```

**Error Response (400):**
```json
{
  "error": "Face does not match. Try again.",
  "error_code": "face_mismatch"
}
```

---

## Face Quality Validation Error Codes

The system validates face quality to ensure accurate biometric matching:

| Error Code | Message | Solution |
|-----------|---------|----------|
| `no_face_detected` | No face detected | Keep your full face visible in the camera |
| `multiple_faces_detected` | Multiple faces detected | Keep only your face in frame |
| `face_too_small` | Face is too far | Move closer to the camera |
| `face_too_large` | Face fills entire frame | Move farther from the camera |
| `face_not_centered` | Center face in frame | Position your face in the middle of the frame |
| `image_too_dark` | Image is too dark | Increase lighting |
| `image_too_bright` | Image is too bright | Reduce glare or direct light |
| `image_too_blurry` | Image is blurry | Hold still and capture a clearer photo |
| `face_features_missing` | Face details not clear | Ensure good lighting and look straight ahead |
| `biometric_challenge_expired` | Biometric session expired | Sign in again |
| `invalid_biometric_challenge` | Invalid session token | Sign in again |

---

## Testing the System

### Manual Testing Steps

#### Test 1: First Time Login (With Face Enrollment)

1. **Navigate to:** `http://localhost:3000/login`

2. **Enter credentials:**
   - Username: `testuser`
   - Password: `TestPassword123`

3. **Phase 1 - Password Verification:**
   - Click "Sign in"
   - You should see "Password verified. OTP required."

4. **Phase 2 - OTP Verification:**
   - Choose delivery method: Email or SMS
   - Check your email/SMS for the 6-digit OTP
   - Enter the OTP code
   - Click "Verify OTP"
   - You should see "OTP verified. Capture your face to save your biometric profile."

5. **Phase 3 - Face Enrollment:**
   - The webcam feed will appear
   - Look straight at the camera with your face clearly visible
   - Make sure you're in good lighting
   - Click "Capture" to take a photo
   - Review the captured image
   - Click "Save Face & Continue"
   - Your face will be analyzed and stored
   - Login should be successful
   - You'll be redirected to the dashboard

---

#### Test 2: Second Login (With Face Verification)

1. **Navigate to:** `http://localhost:3000/login`

2. **Logout first (if still logged in):**
   - Click on your profile menu
   - Click "Logout"

3. **Repeat login steps 1-4 from Test 1**

4. **Phase 3 - Face Verification (Different from Enrollment):**
   - The message will say: "Face verification required"
   - Capture your face again
   - The system will compare your new photo with the stored face
   - If faces match: Login succeeds
   - If faces don't match: You'll see "Face does not match" error

---

#### Test 3: Testing Face Quality Checks

The system automatically validates face quality. Try these tests to see error messages:

1. **No Face Detection:**
   - Point camera away from your face
   - Click capture
   - Expected error: "No face detected"

2. **Multiple Faces:**
   - Have another person stand next to you
   - Click capture
   - Expected error: "Multiple faces detected"

3. **Face Too Small:**
   - Stand far from camera
   - Click capture
   - Expected error: "Face is too far"

4. **Poor Lighting:**
   - Cover camera or dim lights
   - Click capture
   - Expected error: "Image is too dark"

5. **Blurry Image:**
   - Move while capturing
   - Click capture
   - Expected error: "Image is blurry"

---

## Database Schema

### User Model
```python
class User(AbstractUser):
    role = CharField(choices=[('admin', 'Admin'), ('staff', 'Staff'), ('client', 'Client')])
    phone_number = CharField(max_length=20, nullable=True)
    is_verified = BooleanField(default=False)
    failed_login_attempts = IntegerField(default=0)
    account_locked_until = DateTimeField(nullable=True)
    biometric_enrolled = BooleanField(default=False)
    biometric_embedding = BinaryField(nullable=True)  # Encrypted face data
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
```

### OTPToken Model
```python
class OTPToken(models.Model):
    user = ForeignKey(User)
    token = CharField(max_length=6)
    token_hash = CharField(max_length=64)
    delivery_method = CharField(choices=[('sms', 'SMS'), ('email', 'Email')])
    created_at = DateTimeField(auto_now_add=True)
    expires_at = DateTimeField()
    is_used = BooleanField(default=False)
    attempts = IntegerField(default=0)
    max_attempts = IntegerField(default=3)
```

### AuditLog Model
```python
class AuditLog(models.Model):
    user = ForeignKey(User, nullable=True)
    action = CharField(choices=[
        ('login_attempt', 'Login Attempt'),
        ('login_success', 'Login Success'),
        ('otp_verified', 'OTP Verified'),
        ('biometric_used', 'Biometric Used'),
        # ... more actions
    ])
    ip_address = GenericIPAddressField(nullable=True)
    user_agent = TextField()
    details = JSONField()
    created_at = DateTimeField(auto_now_add=True)
```

---

## Biometric Data Storage

The system uses multiple fallback mechanisms for storing biometric data:

1. **Primary: Face Encoding (EMBEDDING_PREFIX)**
   - Uses `face_recognition` library
   - Stores 128-dimensional vector
   - Most accurate for matching

2. **Fallback 1: Image Signature V2 (IMAGE_PREFIX_V2)**
   - If face_recognition unavailable
   - Uses average hash + difference hash
   - Used for basic comparison

3. **Fallback 2: Raw Image (No Prefix)**
   - Stores original image bytes
   - Extracted and compared at login time
   - Least efficient but most compatible

---

## Security Features

### Account Lockout
- After 3 failed login attempts, account is locked for 30 minutes
- Locks applied at password validation stage
- Failed biometric verifications do not count as account lockout

### OTP Security
- 6-digit random OTP generated per request
- Expires in 10 minutes
- Maximum 3 verification attempts
- Hashed before storage (SHA-256)
- Delivered via Email or SMS

### JWT Token Management
- Challenge tokens for biometric phase (15 minutes expiration)
- Access tokens for authenticated requests (24 hours expiration)
- Tokens signed with HS256 algorithm
- Token use verified at each endpoint

### Biometric Challenge Tokens
- Short-lived tokens (900 seconds / 15 minutes)
- Required for biometric enrollment/verification
- Prevents replay attacks
- Validated against user_id in payload

---

## Troubleshooting

### Issue: "AttributeError: _ARRAY_API not found"
**Solution:** Downgrade NumPy to 1.x
```bash
pip install 'numpy<2'
```

### Issue: "psycopg2.OperationalError: could not translate host name"
**Solution:** Use SQLite for local development or ensure PostgreSQL is running
```
DATABASE_URL=sqlite:///db.sqlite3
```

### Issue: "No face detected" on every capture
**Possible causes:**
1. Camera not working or permission denied
2. Not enough lighting
3. Face too far from camera
4. Camera pointed in wrong direction

### Issue: "Face does not match" on second login
**Possible causes:**
1. Different person logging in
2. Different lighting conditions
3. Different face angle/expression
4. First image was of poor quality
5. Try re-enrollment

### Issue: Webcam not working on frontend
**Solution:** Check browser permissions
1. Allow camera access when prompted
2. Check Settings > Privacy > Camera
3. Ensure HTTPS if required (some browsers need it)

---

## Performance Optimization

### Face Recognition Model Options
```python
# In settings.py
FACE_RECOGNITION_MODEL = 'hog'  # Fast, works on CPU
# or
FACE_RECOGNITION_MODEL = 'cnn'  # Accurate, needs GPU
```

### Facial Encoding Tolerance
```python
FACE_RECOGNITION_TOLERANCE = 0.6  # Default (strict)
# Lower = stricter matching (0.1 to 0.5)
# Higher = lenient matching (0.7 to 0.9)
```

---

## Production Deployment

### For Docker Deployment:
```bash
docker-compose up -d
```

### Environment Variables for Production:
```
DEBUG=False
SECRET_KEY=generate-a-strong-key
JWT_SECRET_KEY=generate-a-strong-key
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
DATABASE_URL=postgresql://user:password@db:5432/starevents_db
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
# ... configure email and SMS services
```

### Database Migration:
```bash
docker-compose exec backend python manage.py migrate
```

---

## Next Steps & Future Enhancements

- [ ] Add face liveness detection (prevent spoofing with photos)
- [ ] Implement multi-face enrollment for various lighting conditions
- [ ] Add voice recognition as additional biometric layer
- [ ] Create admin dashboard for biometric audit logs
- [ ] Implement biometric re-enrollment prompts
- [ ] Add batch face matching for security events
- [ ] Integrate with biometric devices (fingerprint scanners, etc.)
- [ ] Create mobile app with biometric support

---

## Support & Documentation

For issues or questions:
1. Check the troubleshooting section above
2. Review API error codes
3. Check backend logs: `python manage.py runserver`
4. Check browser console for frontend errors
5. Enable Django DEBUG mode for detailed error messages

---

## License

StarEvents Management System © 2026. All rights reserved.
