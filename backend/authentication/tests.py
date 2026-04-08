from unittest.mock import patch

import jwt
import numpy as np
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import OTPToken
from .views import EMBEDDING_PREFIX, _generate_jwt_token


User = get_user_model()


class AuthenticationFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='Test@1234',
            phone_number='+1234567890',
            role='client',
        )
        self.admin_user = User.objects.create_user(
            username='adminuser',
            email='admin@test.com',
            password='Admin@1234',
            role='admin',
        )

    def test_login_phase1_requires_otp(self):
        response = self.client.post(
            '/api/auth/login_phase1/',
            {'username': 'testuser', 'password': 'Test@1234'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['phase'], 2)
        self.assertTrue(response.data['requires_otp'])
        self.assertEqual(response.data['user_id'], self.user.id)
        self.assertFalse(response.data['biometric_enrolled'])

    def test_verify_otp_returns_biometric_challenge(self):
        otp_token = OTPToken.generate_otp(self.user, delivery_method='email')

        response = self.client.post(
            '/api/auth/verify_otp/',
            {'user_id': self.user.id, 'otp': otp_token.token},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn('challenge_token', response.data)
        self.assertFalse(response.data['biometric_enrolled'])
        self.assertEqual(response.data['next_step'], 'enroll_biometric')

        payload = jwt.decode(
            response.data['challenge_token'],
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        self.assertEqual(payload['user_id'], self.user.id)
        self.assertEqual(payload['token_use'], 'biometric_challenge')

    @patch('authentication.views._extract_face_encoding_for_location')
    @patch('authentication.views._validate_single_face_quality')
    @patch('authentication.views._image_data_to_rgb_array')
    def test_first_login_enrolls_biometric_and_returns_access_token(
        self,
        mock_image_data_to_rgb_array,
        mock_validate_single_face_quality,
        mock_extract_face_encoding,
    ):
        challenge_token = _generate_jwt_token(
            self.user,
            token_use='biometric_challenge',
            expires_in_seconds=900,
        )

        mock_image_data_to_rgb_array.return_value = (
            b'fake-image-bytes',
            np.zeros((128, 128, 3), dtype=np.uint8),
        )
        mock_validate_single_face_quality.return_value = {
            'ok': True,
            'code': 'ok',
            'message': 'Face quality check passed.',
            'face_location': (10, 90, 90, 10),
        }
        mock_extract_face_encoding.return_value = np.ones(128, dtype=np.float64)

        response = self.client.post(
            '/api/auth/enroll_biometric/',
            {
                'user_id': self.user.id,
                'image_data': 'dGVzdC1pbWFnZQ==',
                'challenge_token': challenge_token,
            },
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {challenge_token}',
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(User.objects.get(pk=self.user.id).biometric_enrolled)
        self.assertIn('token', response.data)

    @patch('authentication.views._extract_face_encoding_for_location')
    @patch('authentication.views._validate_single_face_quality')
    @patch('authentication.views._image_data_to_rgb_array')
    def test_returning_login_verifies_biometric_and_returns_access_token(
        self,
        mock_image_data_to_rgb_array,
        mock_validate_single_face_quality,
        mock_extract_face_encoding,
    ):
        stored_encoding = np.ones(128, dtype=np.float64)
        self.user.biometric_enrolled = True
        self.user.biometric_embedding = EMBEDDING_PREFIX + stored_encoding.tobytes()
        self.user.save(update_fields=['biometric_enrolled', 'biometric_embedding'])

        challenge_token = _generate_jwt_token(
            self.user,
            token_use='biometric_challenge',
            expires_in_seconds=900,
        )

        mock_image_data_to_rgb_array.return_value = (
            b'fake-image-bytes',
            np.zeros((128, 128, 3), dtype=np.uint8),
        )
        mock_validate_single_face_quality.return_value = {
            'ok': True,
            'code': 'ok',
            'message': 'Face quality check passed.',
            'face_location': (10, 90, 90, 10),
        }
        mock_extract_face_encoding.return_value = stored_encoding

        response = self.client.post(
            '/api/auth/verify_biometric/',
            {
                'user_id': self.user.id,
                'image_data': 'dGVzdC1pbWFnZQ==',
                'challenge_token': challenge_token,
            },
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {challenge_token}',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['user']['id'], self.user.id)
        self.assertIn('token', response.data)

    def test_biometric_overview_requires_privileged_user(self):
        response = self.client.get('/api/auth/biometric_overview/')
        self.assertEqual(response.status_code, 401)

        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/auth/biometric_overview/')
        self.assertEqual(response.status_code, 403)

    def test_biometric_overview_returns_summary_for_admin(self):
        self.user.biometric_enrolled = True
        self.user.save(update_fields=['biometric_enrolled'])

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/auth/biometric_overview/')

        self.assertEqual(response.status_code, 200)
        self.assertIn('summary', response.data)
        self.assertEqual(response.data['summary']['total_users'], 2)
        self.assertEqual(response.data['summary']['enrolled_users'], 1)
        self.assertEqual(response.data['summary']['pending_users'], 1)
        self.assertGreaterEqual(len(response.data['users']), 2)
