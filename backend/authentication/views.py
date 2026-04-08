"""
Authentication API Views - 3-Phase Security System
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.contrib.auth import login
from django.utils import timezone
from django.conf import settings
from datetime import datetime, timedelta
import numpy as np
import jwt
import base64
import io
import importlib
from PIL import Image, ImageOps, ImageFilter
try:
    face_recognition = importlib.import_module('face_recognition')
    FACE_RECOGNITION_AVAILABLE = True
except ImportError:
    face_recognition = None
    FACE_RECOGNITION_AVAILABLE = False
try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    cv2 = None
    CV2_AVAILABLE = False
from .models import User, OTPToken, AuditLog
from .serializers import (
    UserSerializer, UserRegistrationSerializer, LoginSerializer,
    OTPRequestSerializer, OTPVerifySerializer, FacialRecognitionSerializer
)
from .utils import send_otp_email, send_otp_sms, log_audit_event

EMBEDDING_PREFIX = b'ENCV1'
IMAGE_PREFIX = b'IMGV1'
IMAGE_PREFIX_V2 = b'IMGV2'
BIOMETRIC_CHALLENGE_TOKEN_EXPIRATION_SECONDS = 900
MIN_FACE_AREA_RATIO = 0.08
MAX_FACE_CENTER_OFFSET = 0.45
MIN_FACE_SHARPNESS_SCORE = 120.0
MIN_FACE_BRIGHTNESS = 45.0
MAX_FACE_BRIGHTNESS = 215.0
FALLBACK_FACE_SIGNATURE_MAX_DISTANCE = 42
HAAR_FACE_CASCADE = None


def _image_data_to_rgb_array(image_data):
    """Convert base64 image payload (raw or data URL) to 8-bit RGB numpy array."""
    if not image_data or not isinstance(image_data, str):
        raise ValueError('Missing image_data')

    cleaned_data = image_data.strip()
    if cleaned_data.startswith('data:image') and ',' in cleaned_data:
        cleaned_data = cleaned_data.split(',', 1)[1]

    padding = len(cleaned_data) % 4
    if padding:
        cleaned_data += '=' * (4 - padding)

    image_bytes = base64.b64decode(cleaned_data)
    image_array = _bytes_to_rgb_array(image_bytes)

    return image_bytes, image_array


def _bytes_to_rgb_array(image_bytes):
    if not image_bytes:
        raise ValueError('Empty image bytes')

    pil_image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    image_array = np.asarray(pil_image, dtype=np.uint8)

    if image_array.ndim != 3 or image_array.shape[2] != 3:
        raise ValueError('Image must be RGB')

    return np.ascontiguousarray(image_array, dtype=np.uint8)


def _to_bytes(value):
    if isinstance(value, memoryview):
        return value.tobytes()
    if isinstance(value, bytearray):
        return bytes(value)
    if isinstance(value, bytes):
        return value
    raise ValueError('Stored biometric data is not bytes')


def _compute_image_hash_from_bytes(image_bytes):
    """Compute a simple 64-bit perceptual hash for fallback biometric matching."""
    image = Image.open(io.BytesIO(image_bytes)).convert('L')
    image = ImageOps.autocontrast(image)
    image = image.filter(ImageFilter.GaussianBlur(radius=1))
    image = image.resize((8, 8), Image.Resampling.LANCZOS)
    pixels = np.asarray(image, dtype=np.uint8)
    mean_val = pixels.mean()
    bits = (pixels >= mean_val).astype(np.uint8).flatten()
    packed = np.packbits(bits)
    return packed.tobytes()


def _compute_image_signature_v2(image_bytes):
    """Compute a more robust 128-bit fallback signature (aHash + dHash)."""
    image = Image.open(io.BytesIO(image_bytes)).convert('L')
    image = ImageOps.autocontrast(image)
    image = image.filter(ImageFilter.GaussianBlur(radius=1))

    width, height = image.size
    side = min(width, height)
    left = max((width - side) // 2, 0)
    top = max((height - side) // 2, 0)
    image = image.crop((left, top, left + side, top + side))

    ahash_img = image.resize((8, 8), Image.Resampling.LANCZOS)
    ahash_pixels = np.asarray(ahash_img, dtype=np.uint8)
    ahash_bits = (ahash_pixels >= ahash_pixels.mean()).astype(np.uint8).flatten()
    ahash_bytes = np.packbits(ahash_bits).tobytes()

    dhash_img = image.resize((9, 8), Image.Resampling.LANCZOS)
    dhash_pixels = np.asarray(dhash_img, dtype=np.uint8)
    dhash_bits = (dhash_pixels[:, 1:] > dhash_pixels[:, :-1]).astype(np.uint8).flatten()
    dhash_bytes = np.packbits(dhash_bits).tobytes()

    return ahash_bytes + dhash_bytes


def _hamming_distance_bytes(hash_a, hash_b):
    if len(hash_a) != len(hash_b):
        return 64
    distance = 0
    for a_byte, b_byte in zip(hash_a, hash_b):
        distance += int((a_byte ^ b_byte).bit_count())
    return distance


def _extract_face_encoding(image_array):
    """Try to extract a face encoding; return None if unavailable on current platform/input."""
    if not FACE_RECOGNITION_AVAILABLE:
        return None
    try:
        encodings = face_recognition.face_encodings(image_array)
        if encodings:
            return encodings[0]
    except Exception:
        return None
    return None


def _get_haar_face_cascade():
    global HAAR_FACE_CASCADE
    if HAAR_FACE_CASCADE is not None:
        return HAAR_FACE_CASCADE
    if not CV2_AVAILABLE:
        return None
    cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    cascade = cv2.CascadeClassifier(cascade_path)
    if cascade.empty():
        return None
    HAAR_FACE_CASCADE = cascade
    return HAAR_FACE_CASCADE


def _detect_single_face_location(image_array):
    if FACE_RECOGNITION_AVAILABLE:
        try:
            model = getattr(settings, 'FACE_RECOGNITION_MODEL', 'hog')
            face_locations = face_recognition.face_locations(image_array, model=model)
        except Exception:
            return []
        return face_locations

    cascade = _get_haar_face_cascade()
    if cascade is None:
        return []

    gray_image = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY)
    detections = cascade.detectMultiScale(
        gray_image,
        scaleFactor=1.1,
        minNeighbors=6,
        minSize=(90, 90)
    )

    face_locations = []
    for x, y, width, height in detections:
        top = int(y)
        left = int(x)
        right = int(x + width)
        bottom = int(y + height)
        face_locations.append((top, right, bottom, left))
    return face_locations


def _face_crop_from_location(image_array, face_location, padding_ratio=0.12):
    top, right, bottom, left = face_location
    image_height, image_width = image_array.shape[:2]

    face_width = max(right - left, 1)
    face_height = max(bottom - top, 1)
    pad_x = int(face_width * padding_ratio)
    pad_y = int(face_height * padding_ratio)

    crop_left = max(left - pad_x, 0)
    crop_right = min(right + pad_x, image_width)
    crop_top = max(top - pad_y, 0)
    crop_bottom = min(bottom + pad_y, image_height)

    face_crop = image_array[crop_top:crop_bottom, crop_left:crop_right]
    return face_crop


def _compute_face_signature(face_crop):
    image = Image.fromarray(face_crop).convert('L')
    image = ImageOps.autocontrast(image)
    image = image.filter(ImageFilter.GaussianBlur(radius=1))

    ahash_img = image.resize((8, 8), Image.Resampling.LANCZOS)
    ahash_pixels = np.asarray(ahash_img, dtype=np.uint8)
    ahash_bits = (ahash_pixels >= ahash_pixels.mean()).astype(np.uint8).flatten()
    ahash_bytes = np.packbits(ahash_bits).tobytes()

    dhash_img = image.resize((9, 8), Image.Resampling.LANCZOS)
    dhash_pixels = np.asarray(dhash_img, dtype=np.uint8)
    dhash_bits = (dhash_pixels[:, 1:] > dhash_pixels[:, :-1]).astype(np.uint8).flatten()
    dhash_bytes = np.packbits(dhash_bits).tobytes()

    return ahash_bytes + dhash_bytes


def _validate_single_face_quality(image_array):
    """Validate that exactly one clear, complete face is present in the image."""
    if not FACE_RECOGNITION_AVAILABLE and not CV2_AVAILABLE:
        return {
            'ok': False,
            'code': 'biometric_service_unavailable',
            'message': 'Biometric face detection is currently unavailable on server.'
        }

    face_locations = _detect_single_face_location(image_array)
    if face_locations is None:
        return {
            'ok': False,
            'code': 'face_processing_error',
            'message': 'Unable to process this image. Please capture a new photo.'
        }

    if not face_locations:
        return {
            'ok': False,
            'code': 'no_face_detected',
            'message': 'No face detected. Keep your full face in frame and try again.'
        }

    if len(face_locations) > 1:
        return {
            'ok': False,
            'code': 'multiple_faces_detected',
            'message': 'Multiple faces detected. Ensure only your face is visible.'
        }

    top, right, bottom, left = face_locations[0]
    height, width = image_array.shape[:2]

    face_width = max(right - left, 1)
    face_height = max(bottom - top, 1)
    face_area_ratio = (face_width * face_height) / float(max(width * height, 1))
    if face_area_ratio < MIN_FACE_AREA_RATIO:
        return {
            'ok': False,
            'code': 'face_too_small',
            'message': 'Face is too far. Move closer so your face fills more of the frame.'
        }

    face_center_x = (left + right) / 2.0
    face_center_y = (top + bottom) / 2.0
    offset_x = abs(face_center_x - (width / 2.0)) / max(width / 2.0, 1.0)
    offset_y = abs(face_center_y - (height / 2.0)) / max(height / 2.0, 1.0)
    if max(offset_x, offset_y) > MAX_FACE_CENTER_OFFSET:
        return {
            'ok': False,
            'code': 'face_not_centered',
            'message': 'Center your face in the camera before continuing.'
        }

    face_crop = _face_crop_from_location(image_array, face_locations[0], padding_ratio=0.06)
    if face_crop.size == 0:
        return {
            'ok': False,
            'code': 'invalid_face_region',
            'message': 'Face region could not be analyzed. Please retake the image.'
        }

    gray_face = np.asarray(Image.fromarray(face_crop).convert('L'), dtype=np.float32)
    brightness = float(np.mean(gray_face))
    if brightness < MIN_FACE_BRIGHTNESS:
        return {
            'ok': False,
            'code': 'image_too_dark',
            'message': 'Image is too dark. Improve lighting and try again.'
        }
    if brightness > MAX_FACE_BRIGHTNESS:
        return {
            'ok': False,
            'code': 'image_too_bright',
            'message': 'Image is too bright. Reduce glare or direct light and try again.'
        }

    grad_x = np.diff(gray_face, axis=1)
    grad_y = np.diff(gray_face, axis=0)
    sharpness_score = float(np.var(grad_x) + np.var(grad_y))
    if sharpness_score < MIN_FACE_SHARPNESS_SCORE:
        return {
            'ok': False,
            'code': 'image_too_blurry',
            'message': 'Image is blurry. Hold still and capture a sharper photo.'
        }

    return {
        'ok': True,
        'code': 'ok',
        'message': 'Face quality check passed.',
        'face_location': face_locations[0],
        'metrics': {
            'face_area_ratio': round(face_area_ratio, 4),
            'brightness': round(brightness, 2),
            'sharpness_score': round(sharpness_score, 2),
        }
    }


def _extract_face_encoding_for_location(image_array, face_location):
    if not FACE_RECOGNITION_AVAILABLE:
        return None
    try:
        encodings = face_recognition.face_encodings(image_array, known_face_locations=[face_location])
        if encodings:
            return encodings[0]
    except Exception:
        return None
    return None


def _compare_face_signature(signature_a, signature_b):
    distance = _hamming_distance_bytes(signature_a, signature_b)
    return distance <= FALLBACK_FACE_SIGNATURE_MAX_DISTANCE


class AuthViewSet(viewsets.ViewSet):
    """
    Authentication ViewSet - 3-Phase Security System
    """
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
            
            log_audit_event(user, 'login_attempt', request, {'phase': 'password_verified'})

            # Proceed to Phase 2 (OTP)
            return Response({
                'phase': 2,
                'message': 'Password verified. OTP required.',
                'user_id': user.id,
                'requires_otp': True,
                'biometric_enrolled': user.biometric_enrolled
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

            challenge_token = _generate_jwt_token(
                user,
                token_use='biometric_challenge',
                expires_in_seconds=BIOMETRIC_CHALLENGE_TOKEN_EXPIRATION_SECONDS,
            )

            return Response({
                'message': 'OTP verified successfully. Complete face capture to finish login.',
                'challenge_token': challenge_token,
                'biometric_enrolled': user.biometric_enrolled,
                'next_step': 'verify_biometric' if user.biometric_enrolled else 'enroll_biometric',
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
            } if settings.DEBUG else {}
        }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def verify_biometric(self, request):
        """
        Verify biometric data (EVERY LOGIN)
        
        FIRST LOGIN:
        - Compares newly captured face with just-enrolled face (same person, same image)
        - Always succeeds on first login because it's comparing same image with itself
        
        SECOND+ LOGINS (the real verification):
        - Loads the reference face image stored in database from first login
        - Extracts face encoding from newly captured image
        - Extracts face encoding from stored reference image
        - Uses face_recognition library to compare if they're the same person
        - If faces match (within tolerance) → login succeeds
        - If faces don't match (different person) → login fails with "Face does not match"
        
        Database check: user.biometric_embedding field contains the stored reference image
        
        Returns: JWT token if verified, error message if verification fails
        """
        user_id = request.data.get('user_id')
        challenge_payload, challenge_error = _get_biometric_challenge_payload(request)
        if challenge_error:
            return challenge_error

        try:
            user = User.objects.get(pk=challenge_payload['user_id'])
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        if user_id and str(user_id) != str(user.id):
            return Response({'error': 'Biometric session does not match this user.'}, status=status.HTTP_403_FORBIDDEN)
        
        if not user.biometric_enrolled:
            return Response({'error': 'Biometric not enrolled'}, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = FacialRecognitionSerializer(data=request.data, context={'user': user})
        if serializer.is_valid():
            # Decode base64 image
            image_data = request.data.get('image_data')
            try:
                image_bytes, image_array = _image_data_to_rgb_array(image_data)
                quality_check = _validate_single_face_quality(image_array)
                if not quality_check['ok']:
                    return Response(
                        {
                            'error': quality_check['message'],
                            'error_code': quality_check['code']
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )

                face_location = quality_check['face_location']
                current_face_crop = _face_crop_from_location(image_array, face_location)
                current_signature = _compute_face_signature(current_face_crop)
                mirrored_face_crop = np.flip(current_face_crop, axis=1)
                mirrored_signature = _compute_face_signature(mirrored_face_crop)
                current_encoding = _extract_face_encoding_for_location(image_array, face_location)
                
                # Load stored embedding and compare
                stored_image_bytes = _to_bytes(user.biometric_embedding)

                is_match = False

                if stored_image_bytes.startswith(EMBEDDING_PREFIX):
                    if current_encoding is None:
                        return Response(
                            {
                                'error': 'Advanced face matching is unavailable for this enrolled profile. Please re-enroll biometric.',
                                'error_code': 're_enroll_required'
                            },
                            status=status.HTTP_400_BAD_REQUEST
                        )

                    stored_encoding_bytes = stored_image_bytes[len(EMBEDDING_PREFIX):]
                    stored_encoding = np.frombuffer(stored_encoding_bytes, dtype=np.float64)
                    if stored_encoding.size != 128:
                        return Response({'error': 'Stored biometric data is invalid.'}, status=status.HTTP_400_BAD_REQUEST)

                    distance = np.linalg.norm(stored_encoding - current_encoding)
                    is_match = distance <= settings.FACE_RECOGNITION_TOLERANCE

                elif stored_image_bytes.startswith(IMAGE_PREFIX):
                    stored_hash = stored_image_bytes[len(IMAGE_PREFIX):]
                    hash_distance = _hamming_distance_bytes(stored_hash, current_signature[:len(stored_hash)])
                    is_match = hash_distance <= 18

                elif stored_image_bytes.startswith(IMAGE_PREFIX_V2):
                    stored_signature = stored_image_bytes[len(IMAGE_PREFIX_V2):]
                    is_match = (
                        _compare_face_signature(stored_signature, current_signature)
                        or _compare_face_signature(stored_signature, mirrored_signature)
                    )

                else:
                    stored_image_array = _bytes_to_rgb_array(stored_image_bytes)
                    stored_quality_check = _validate_single_face_quality(stored_image_array)
                    stored_encoding = None
                    stored_signature = None
                    if stored_quality_check['ok']:
                        stored_face_crop = _face_crop_from_location(stored_image_array, stored_quality_check['face_location'])
                        stored_signature = _compute_face_signature(stored_face_crop)
                        stored_encoding = _extract_face_encoding_for_location(
                            stored_image_array,
                            stored_quality_check['face_location']
                        )

                    if current_encoding is not None and stored_encoding is not None:
                        distance = np.linalg.norm(stored_encoding - current_encoding)
                        is_match = distance <= settings.FACE_RECOGNITION_TOLERANCE
                    elif stored_signature is not None:
                        is_match = (
                            _compare_face_signature(stored_signature, current_signature)
                            or _compare_face_signature(stored_signature, mirrored_signature)
                        )

                if is_match:
                    log_audit_event(user, 'biometric_used', request)
                    user.unlock_account()

                    if not stored_image_bytes.startswith(EMBEDDING_PREFIX):
                        user.biometric_embedding = EMBEDDING_PREFIX + np.asarray(current_encoding, dtype=np.float64).tobytes()
                        user.save(update_fields=['biometric_embedding', 'failed_login_attempts', 'account_locked_until', 'updated_at'])
                    
                    # Generate JWT token
                    token = _generate_jwt_token(user)
                    log_audit_event(user, 'login_success', request, {'method': 'biometric_verification'})
                    
                    return Response({
                        'message': 'Biometric verified successfully',
                        'token': token,
                        'user': UserSerializer(user).data
                    }, status=status.HTTP_200_OK)
                else:
                    log_audit_event(user, 'biometric_failed', request)
                    return Response({'error': 'Face does not match. Try again.'}, status=status.HTTP_400_BAD_REQUEST)
            
            except Exception as e:
                import traceback
                traceback.print_exc()
                return Response({'error': f'Image processing error: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def enroll_biometric(self, request):
        """
        Enroll biometric data (FIRST TIME ONLY)
        
        On first login:
        - Captures user's face image
        - Stores it in database (user.biometric_embedding field)
        - This becomes the reference image for future logins
        
        Returns: Success message when face is saved
        """
        challenge_payload, challenge_error = _get_biometric_challenge_payload(request)
        if challenge_error:
            return challenge_error

        try:
            user = User.objects.get(pk=challenge_payload['user_id'])
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        if request.data.get('user_id') and str(request.data.get('user_id')) != str(user.id):
            return Response({'error': 'Biometric session does not match this user.'}, status=status.HTTP_403_FORBIDDEN)

        if user.biometric_enrolled:
            return Response(
                {
                    'error': 'Biometric profile already exists. Use face verification instead.',
                    'error_code': 'biometric_already_enrolled'
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        image_data = request.data.get('image_data')
        
        try:
            image_bytes, image_array = _image_data_to_rgb_array(image_data)
            quality_check = _validate_single_face_quality(image_array)
            if not quality_check['ok']:
                return Response(
                    {
                        'error': quality_check['message'],
                        'error_code': quality_check['code']
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            face_location = quality_check['face_location']
            face_encoding = _extract_face_encoding_for_location(image_array, face_location)
            if face_encoding is not None:
                user.biometric_embedding = EMBEDDING_PREFIX + np.asarray(face_encoding, dtype=np.float64).tobytes()
            else:
                face_crop = _face_crop_from_location(image_array, face_location)
                fallback_signature = _compute_face_signature(face_crop)
                user.biometric_embedding = IMAGE_PREFIX_V2 + fallback_signature

            user.biometric_enrolled = True
            user.save()

            token = _generate_jwt_token(user)
            log_audit_event(user, 'biometric_used', request)
            log_audit_event(user, 'login_success', request, {'method': 'biometric_enrollment'})
            
            return Response({
                'message': 'Biometric enrolled successfully. Login complete.',
                'token': token,
                'user': UserSerializer(user).data
            }, status=status.HTTP_200_OK)
        
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response({'error': f'Enrollment error: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def biometric_overview(self, request):
        """Admin overview of biometric enrollment status."""
        if not getattr(request.user, 'is_authenticated', False):
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

        if getattr(request.user, 'role', None) not in {'admin', 'staff'}:
            return Response({'error': 'Insufficient permissions'}, status=status.HTTP_403_FORBIDDEN)

        total_users = User.objects.count()
        enrolled_users = User.objects.filter(biometric_enrolled=True).count()
        pending_users = User.objects.filter(biometric_enrolled=False).count()
        locked_users = User.objects.filter(account_locked_until__gt=timezone.now()).count()

        users = User.objects.order_by('username').values(
            'id',
            'username',
            'email',
            'role',
            'biometric_enrolled',
            'failed_login_attempts',
            'account_locked_until',
            'is_active',
        )[:25]

        return Response(
            {
                'summary': {
                    'total_users': total_users,
                    'enrolled_users': enrolled_users,
                    'pending_users': pending_users,
                    'locked_users': locked_users,
                },
                'users': list(users),
            },
            status=status.HTTP_200_OK,
        )


def _get_biometric_challenge_payload(request):
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    token = request.data.get('challenge_token')

    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()

    if not token:
        return None, Response(
            {
                'error': 'Biometric challenge token is required.',
                'error_code': 'missing_biometric_challenge'
            },
            status=status.HTTP_401_UNAUTHORIZED
        )

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
    except jwt.ExpiredSignatureError:
        return None, Response(
            {
                'error': 'Biometric challenge expired. Please sign in again.',
                'error_code': 'biometric_challenge_expired'
            },
            status=status.HTTP_401_UNAUTHORIZED
        )
    except jwt.InvalidTokenError:
        return None, Response(
            {
                'error': 'Invalid biometric challenge token.',
                'error_code': 'invalid_biometric_challenge'
            },
            status=status.HTTP_401_UNAUTHORIZED
        )

    if payload.get('token_use') != 'biometric_challenge':
        return None, Response(
            {
                'error': 'Invalid biometric challenge token.',
                'error_code': 'invalid_biometric_challenge'
            },
            status=status.HTTP_401_UNAUTHORIZED
        )

    return payload, None


def _generate_jwt_token(user, token_use='access', expires_in_seconds=None, extra_claims=None):
    """Generate JWT token for user"""
    expiration_seconds = expires_in_seconds or settings.JWT_EXPIRATION_DELTA
    payload = {
        'user_id': user.id,
        'username': user.username,
        'token_use': token_use,
        'exp': datetime.utcnow() + timedelta(seconds=expiration_seconds),
        'iat': datetime.utcnow()
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
