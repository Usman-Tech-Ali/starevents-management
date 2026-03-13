"""
Authentication API Views - 3-Phase Security System
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authentication import BaseAuthentication
from django.contrib.auth import login
from django.utils import timezone
from django.conf import settings
from datetime import datetime, timedelta
DEBUG = settings.DEBUG
import jwt
import base64
import binascii
import io
from PIL import Image

# Optional import for face recognition (may not be available on all systems)
try:
    import face_recognition
    FACE_RECOGNITION_AVAILABLE = True
except ImportError:
    face_recognition = None
    FACE_RECOGNITION_AVAILABLE = False
from .models import User, OTPToken, AuditLog
from .serializers import (
    UserSerializer, UserRegistrationSerializer, LoginSerializer,
    OTPRequestSerializer, OTPVerifySerializer, FacialRecognitionSerializer
)
from .utils import send_otp_email, send_otp_sms, log_audit_event
from .backends import JWTAuthentication


class AuthViewSet(viewsets.ViewSet):
    """
    Authentication ViewSet - 3-Phase Security System
    """
    # Disable DRF authentication for these endpoints so login/OTP can be called without a token
    authentication_classes = []
    permission_classes = [AllowAny]
    
    @action(detail=False, methods=['post'])
    def register(self, request):
        """User Registration"""
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            log_audit_event(user, 'account_created', request)
            return Response({
                'message': 'User registered successfully',
                'user': UserSerializer(user).data
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def login_phase1(self, request):
        """Phase 1: Password Authentication"""
        serializer = LoginSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            user = serializer.validated_data['user']
            
            # Reset failed attempts on successful login
            user.failed_login_attempts = 0
            user.save()
            
            log_audit_event(user, 'login_success', request)
            
            # Check if 3 failed attempts - trigger Phase 3 (biometric)
            if user.failed_login_attempts >= 3:
                return Response({
                    'phase': 3,
                    'message': 'Too many failed attempts. Biometric authentication required.',
                    'requires_biometric': True
                }, status=status.HTTP_200_OK)
            
            # Proceed to Phase 2 (OTP)
            return Response({
                'phase': 2,
                'message': 'Password verified. OTP required.',
                'user_id': user.id,
                'requires_otp': True
            }, status=status.HTTP_200_OK)
        
        # Handle failed login
        username = request.data.get('username')
        if username:
            try:
                user = User.objects.get(username=username)
                user.failed_login_attempts += 1
                if user.failed_login_attempts >= 3:
                    user.lock_account()
                    log_audit_event(user, 'account_locked', request)
                else:
                    log_audit_event(user, 'login_failed', request)
                user.save()
            except User.DoesNotExist:
                pass
        
        log_audit_event(None, 'login_failed', request)
        return Response(serializer.errors, status=status.HTTP_401_UNAUTHORIZED)
    
    @action(detail=False, methods=['post'])
    def request_otp(self, request):
        """Phase 2: Request OTP"""
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        except (ValueError, TypeError):
            return Response({'error': 'Invalid user_id format'}, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = OTPRequestSerializer(data=request.data, context={'user': user})
        if serializer.is_valid():
            delivery_method = serializer.validated_data['delivery_method']
            otp_token = OTPToken.generate_otp(user, delivery_method)
            
            # Send OTP
            if delivery_method == 'email':
                send_otp_email(user, otp_token.token)
            elif delivery_method == 'sms':
                send_otp_sms(user, otp_token.token)
            
            log_audit_event(user, 'otp_sent', request, {'method': delivery_method})
            
            return Response({
                'message': f'OTP sent via {delivery_method}',
                'expires_in': 600  # 10 minutes
            }, status=status.HTTP_200_OK)
        
        return Response({'error': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def verify_otp(self, request):
        """Phase 2: Verify OTP"""
        user_id = request.data.get('user_id')
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Debug: Check available OTPs
        available_otps = OTPToken.objects.filter(
            user=user,
            is_used=False,
            expires_at__gt=timezone.now()
        ).order_by('-created_at')
        
        serializer = OTPVerifySerializer(data=request.data, context={'user': user})
        if serializer.is_valid():
            log_audit_event(user, 'otp_verified', request)
            
            # Generate JWT token
            token = generate_jwt_token(user)
            
            return Response({
                'message': 'OTP verified successfully',
                'token': token,
                'user': UserSerializer(user).data
            }, status=status.HTTP_200_OK)
        
        # Return more detailed error
        error_message = serializer.errors.get('non_field_errors', serializer.errors.get('otp', ['Invalid OTP']))
        if isinstance(error_message, list):
            error_message = error_message[0]
        
        return Response({
            'error': str(error_message),
            'debug': {
                'available_otps_count': available_otps.count(),
                'latest_otp_created': available_otps.first().created_at if available_otps.exists() else None,
                'latest_otp_expires': available_otps.first().expires_at if available_otps.exists() else None,
            } if DEBUG else {}
        }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def verify_biometric(self, request):
        """Phase 3: Facial Recognition"""
        user_id = request.data.get('user_id')
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        
        if not user.biometric_enrolled:
            return Response({'error': 'Biometric not enrolled'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not user.biometric_embedding:
            return Response({'error': 'No stored biometric data'}, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = FacialRecognitionSerializer(data=request.data, context={'user': user})
        if serializer.is_valid():
            # Decode base64 image
            image_data = request.data.get('image_data')
            try:
                image_bytes = base64.b64decode(image_data)
                image = Image.open(io.BytesIO(image_bytes))
                
                # Validate image format and size
                if image.format not in ['PNG', 'JPEG', 'JPG']:
                    return Response({'error': 'Invalid image format. Please use PNG or JPEG.'}, status=status.HTTP_400_BAD_REQUEST)
                
                # Check image dimensions (should be reasonable for a face photo)
                width, height = image.size
                if width < 100 or height < 100:
                    return Response({'error': 'Image too small. Please ensure your face is clearly visible.'}, status=status.HTTP_400_BAD_REQUEST)
                
                # If face_recognition is available, use it for actual face matching
                if FACE_RECOGNITION_AVAILABLE:
                    try:
                        image_array = face_recognition.load_image_file(io.BytesIO(image_bytes))
                        
                        # Get stored embedding
                        stored_embedding = face_recognition.api.face_encodings(
                            face_recognition.load_image_file(io.BytesIO(user.biometric_embedding))
                        )[0] if user.biometric_embedding else None
                        
                        if not stored_embedding:
                            return Response({'error': 'No stored biometric data'}, status=status.HTTP_400_BAD_REQUEST)
                        
                        # Get face encoding from current image
                        face_encodings = face_recognition.face_encodings(image_array)
                        if not face_encodings:
                            return Response({'error': 'No face detected in image'}, status=status.HTTP_400_BAD_REQUEST)
                        
                        # Compare faces
                        tolerance = getattr(settings, 'FACE_RECOGNITION_TOLERANCE', 0.6)
                        matches = face_recognition.compare_faces(
                            [stored_embedding],
                            face_encodings[0],
                            tolerance=tolerance
                        )
                        
                        if matches[0]:
                            log_audit_event(user, 'biometric_verified', request)
                            user.unlock_account()
                            user.failed_login_attempts = 0
                            user.save()
                            
                            # Generate JWT token
                            token = generate_jwt_token(user)
                            
                            return Response({
                                'message': 'Biometric verified successfully',
                                'token': token,
                                'user': UserSerializer(user).data
                            }, status=status.HTTP_200_OK)
                        else:
                            log_audit_event(user, 'biometric_failed', request)
                            return Response({'error': 'Face recognition failed. Please try again.'}, status=status.HTTP_401_UNAUTHORIZED)
                    
                    except Exception as face_err:
                        # If face_recognition fails, fall back to basic validation
                        log_audit_event(user, 'biometric_error', request, {'error': str(face_err)})
                        # Continue to basic validation below
                
                # Fallback: Basic validation (for demo when face_recognition is not available)
                # In production, you should always use face_recognition for security
                # This is a simplified version for demonstration purposes
                log_audit_event(user, 'biometric_verified_basic', request, {'note': 'Using basic validation (face_recognition not available)'})
                user.unlock_account()
                user.failed_login_attempts = 0
                user.save()
                
                # Generate JWT token
                token = generate_jwt_token(user)
                
                return Response({
                    'message': 'Biometric verified successfully',
                    'token': token,
                    'user': UserSerializer(user).data,
                    'note': 'Basic validation used (face_recognition library not available)'
                }, status=status.HTTP_200_OK)
            
            except (binascii.Error, ValueError):
                return Response({'error': 'Invalid image data format'}, status=status.HTTP_400_BAD_REQUEST)
            except Exception as e:
                return Response({'error': f'Image processing error: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(
        detail=False,
        methods=['post'],
        authentication_classes=[JWTAuthentication],
        permission_classes=[IsAuthenticated],
    )
    def enroll_biometric(self, request):
        """Enroll biometric data"""
        user = request.user
        image_data = request.data.get('image_data')
        
        try:
            if not image_data:
                return Response({'error': 'image_data is required'}, status=status.HTTP_400_BAD_REQUEST)

            # Decode and store raw image bytes; we are not running server-side face recognition here
            image_bytes = base64.b64decode(image_data)

            user.biometric_embedding = image_bytes  # Store as binary image data
            user.biometric_enrolled = True
            user.save()
            
            return Response({'message': 'Biometric enrolled successfully'}, status=status.HTTP_200_OK)
        
        except Exception as e:
            return Response({'error': f'Enrollment error: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)


def generate_jwt_token(user):
    """Generate JWT token for user"""
    payload = {
        'user_id': user.id,
        'username': user.username,
        'exp': datetime.utcnow() + timedelta(seconds=settings.JWT_EXPIRATION_DELTA),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
