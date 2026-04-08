import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import api from '../api/axios'
import Button from '../components/ui/Button'
import Webcam from 'react-webcam'
import { Lock, Mail, Smartphone, Shield } from 'lucide-react'

const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [phase, setPhase] = useState(1) // 1: password, 2: OTP, 3: biometric
  const [userId, setUserId] = useState(null)
  const [deliveryMethod, setDeliveryMethod] = useState('email')
  const [capturedImage, setCapturedImage] = useState(null)
  const [biometricSession, setBiometricSession] = useState(null)
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const webcamRef = useRef(null)
  
  const { login } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const resolveBiometricError = (errorPayload) => {
    if (!errorPayload) return 'Face verification failed'

    const errorCode = errorPayload.error_code
    if (!errorCode) return errorPayload.error || 'Face verification failed'

    const errorsByCode = {
      no_face_detected: 'No face detected. Keep your full face visible and try again.',
      multiple_faces_detected: 'Multiple faces detected. Keep only your face in frame.',
      face_too_small: 'Move closer to the camera so your face is larger in the frame.',
      face_not_centered: 'Center your face in the frame before verifying.',
      image_too_dark: 'Lighting is too low. Increase light and try again.',
      image_too_bright: 'Image is too bright. Reduce glare and try again.',
      image_too_blurry: 'Image is blurry. Hold still and retake the photo.',
      face_features_missing: 'Face details were not clear enough. Retake the photo with a straight front face.',
      re_enroll_required: 'Biometric profile format changed. Please sign in again and complete fresh face enrollment.',
      biometric_service_unavailable: 'Biometric service is temporarily unavailable. Please try again shortly.',
      missing_biometric_challenge: 'Your biometric session is missing. Please sign in again.',
      invalid_biometric_challenge: 'Your biometric session is invalid. Please sign in again.',
      biometric_challenge_expired: 'Your biometric session expired. Please sign in again.',
      biometric_already_enrolled: 'Your biometric profile already exists. Please verify your face instead.'
    }

    return errorsByCode[errorCode] || errorPayload.error || 'Face verification failed'
  }

  const handlePasswordLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const response = await api.post('/auth/login_phase1/', { username, password })
      const { user_id, requires_otp } = response.data

      if (requires_otp) {
        setPhase(2)
        setUserId(user_id)
        // Call requestOTP with user_id directly to avoid timing issues
        await requestOTP(user_id, deliveryMethod)
        showToast('OTP sent successfully', 'success')
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Invalid credentials', 'error')
    } finally {
      setLoading(false)
    }
  }

  const requestOTP = async (userIdParam = null, deliveryMethodParam = deliveryMethod) => {
    try {
      const userIdToUse = userIdParam || userId
      if (!userIdToUse) {
        showToast('User ID is missing', 'error')
        return
      }
      await api.post('/auth/request_otp/', {
        user_id: userIdToUse,
        delivery_method: deliveryMethodParam
      })
    } catch (err) {
      console.error('OTP request error:', err.response?.data)
      showToast(err.response?.data?.error || err.response?.data?.message || 'Failed to send OTP', 'error')
    }
  }

  const handleOTPVerify = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const response = await api.post('/auth/verify_otp/', {
        user_id: userId,
        otp: otp
      })

      setBiometricSession({
        challengeToken: response.data.challenge_token,
        biometricEnrolled: response.data.biometric_enrolled,
        nextStep: response.data.next_step,
        user: response.data.user
      })
      setCapturedImage(null)
      setPhase(3)
      showToast(
        response.data.biometric_enrolled
          ? 'OTP verified. Continue with face matching.'
          : 'OTP verified. Capture your face to save your biometric profile.',
        'success'
      )
    } catch (err) {
      showToast(err.response?.data?.error || 'Invalid OTP', 'error')
    } finally {
      setLoading(false)
    }
  }

  const captureImage = () => {
    const imageSrc = webcamRef.current?.getScreenshot()
    if (!imageSrc) {
      showToast('Unable to capture image. Please allow camera access.', 'error')
      return
    }
    setCapturedImage(imageSrc)
  }

  const getImagePayload = (imageData) => {
    if (!imageData) return ''
    return imageData.includes(',') ? imageData.split(',')[1] : imageData
  }

  const completeBiometricAuth = async () => {
    if (!capturedImage) {
      showToast('Please capture your face first.', 'warning')
      return
    }

    if (!biometricSession?.challengeToken) {
      showToast('Your biometric session expired. Please sign in again.', 'error')
      setPhase(1)
      return
    }

    setBiometricLoading(true)
    try {
      const imagePayload = getImagePayload(capturedImage)

      const endpoint = biometricSession.biometricEnrolled
        ? '/auth/verify_biometric/'
        : '/auth/enroll_biometric/'

      const response = await api.post(
        endpoint,
        {
          user_id: userId,
          image_data: imagePayload,
          challenge_token: biometricSession.challengeToken
        },
        {
          headers: {
            Authorization: `Bearer ${biometricSession.challengeToken}`
          }
        }
      )

      login(response.data.user, response.data.token)
      showToast(
        biometricSession.biometricEnrolled
          ? 'Face verified. Login successful!'
          : 'Face enrolled and saved. Login successful!',
        'success'
      )
      navigate('/dashboard')
    } catch (err) {
      const friendlyError = resolveBiometricError(err.response?.data)
      showToast(friendlyError, 'error')
    } finally {
      setBiometricLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="mx-auto h-16 w-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <span className="text-white font-bold text-2xl">SE</span>
          </div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            StarEvents Management
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {phase === 1 && 'Sign in to your account'}
            {phase === 2 && 'Enter your OTP code'}
            {phase === 3 && (biometricSession?.biometricEnrolled ? 'Face verification required' : 'First-time face enrollment')}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {phase === 1 && (
            <form onSubmit={handlePasswordLogin} className="space-y-6">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Shield className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Signing in...
                  </span>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          )}

          {phase === 2 && (
            <form onSubmit={handleOTPVerify} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  OTP Delivery Method
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => { 
                      setDeliveryMethod('email')
                      requestOTP(userId, 'email')
                    }}
                    className={`p-3 border-2 rounded-lg transition-all ${
                      deliveryMethod === 'email'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Mail className="w-5 h-5 mx-auto mb-1" />
                    <span className="text-sm font-medium">Email</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { 
                      setDeliveryMethod('sms')
                      requestOTP(userId, 'sms')
                    }}
                    className={`p-3 border-2 rounded-lg transition-all ${
                      deliveryMethod === 'sms'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Smartphone className="w-5 h-5 mx-auto mb-1" />
                    <span className="text-sm font-medium">SMS</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => requestOTP(userId, deliveryMethod)}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Resend OTP
                </button>
              </div>
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-2">
                  Enter 6-digit OTP
                </label>
                <input
                  id="otp"
                  name="otp"
                  type="text"
                  maxLength="6"
                  required
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center text-2xl font-mono tracking-widest"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <Button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Verifying...
                  </span>
                ) : (
                  'Verify OTP'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPhase(1)}
                className="w-full"
              >
                Back to Login
              </Button>
            </form>
          )}

          {phase === 3 && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  {biometricSession?.biometricEnrolled
                    ? 'Capture your face to verify your identity and finish login.'
                    : 'Capture your face once to save your biometric profile and finish login.'}
                </p>
                <p className="text-xs text-blue-700 mt-2">
                  Use good light, keep one face only, look straight, and fill most of the frame.
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                {capturedImage ? (
                  <img
                    src={capturedImage}
                    alt="Captured face"
                    className="w-full rounded-lg"
                  />
                ) : (
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    className="w-full rounded-lg"
                    videoConstraints={{
                      width: 720,
                      height: 480,
                      facingMode: 'user'
                    }}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  onClick={captureImage}
                  disabled={biometricLoading || !!capturedImage}
                >
                  Capture
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCapturedImage(null)}
                  disabled={biometricLoading || !capturedImage}
                >
                  Retake
                </Button>
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={completeBiometricAuth}
                disabled={biometricLoading || !capturedImage}
              >
                {biometricLoading
                  ? 'Processing face...'
                  : biometricSession?.biometricEnrolled
                    ? 'Verify Face & Continue'
                    : 'Save Face & Continue'}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPhase(1)
                  setUserId(null)
                  setOtp('')
                  setCapturedImage(null)
                  setBiometricSession(null)
                }}
                className="w-full"
                disabled={biometricLoading}
              >
                Back to Login
              </Button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-gray-600">
          Secure 3-phase authentication system
        </p>
      </div>
    </div>
  )
}

export default Login
