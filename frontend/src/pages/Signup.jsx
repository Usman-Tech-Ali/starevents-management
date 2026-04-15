import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Webcam from 'react-webcam'
import { UserPlus, User, Mail, Phone, Lock, ShieldCheck } from 'lucide-react'
import api from '../api/axios'
import { useToast } from '../contexts/ToastContext'
import Button from '../components/ui/Button'

const Signup = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    role: 'client',
    password: '',
    password_confirm: '',
  })
  const [capturedImage, setCapturedImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const webcamRef = useRef(null)

  const navigate = useNavigate()
  const { showToast } = useToast()

  const resolveBiometricError = (errorPayload) => {
    if (!errorPayload) return 'Face capture failed. Please try again.'

    if (typeof errorPayload === 'string') return errorPayload

    if (Array.isArray(errorPayload) && errorPayload.length > 0) {
      return String(errorPayload[0])
    }

    const code = errorPayload.error_code
    if (!code) return errorPayload.error || 'Face capture failed. Please try again.'

    const map = {
      biometric_required: 'Face scan is required to create your account.',
      no_face_detected: 'No face detected. Keep your full face visible and try again.',
      multiple_faces_detected: 'Multiple faces detected. Keep only your face in frame.',
      face_too_small: 'Move closer so your face fills more of the frame.',
      face_not_centered: 'Center your face in the frame and try again.',
      image_too_dark: 'Image is too dark. Improve lighting and try again.',
      image_too_bright: 'Image is too bright. Reduce glare and try again.',
      image_too_blurry: 'Image is blurry. Hold still and capture a sharper photo.',
      biometric_service_unavailable: 'Biometric service is unavailable right now. Please try again shortly.',
    }

    return map[code] || errorPayload.error || 'Face capture failed. Please try again.'
  }

  const resolveRegistrationError = (errorPayload) => {
    if (!errorPayload) return 'Registration failed. Please try again.'

    const biometricMessage = resolveBiometricError(errorPayload)
    if (biometricMessage && biometricMessage !== 'Face capture failed. Please try again.') {
      return biometricMessage
    }

    const entries = Object.entries(errorPayload)
      .filter(([key]) => key !== 'error' && key !== 'error_code')

    if (entries.length > 0) {
      const [field, value] = entries[0]
      const fieldLabel = field.replace(/_/g, ' ')
      if (Array.isArray(value) && value.length > 0) {
        return `${fieldLabel}: ${value[0]}`
      }
      if (typeof value === 'string') {
        return `${fieldLabel}: ${value}`
      }
    }

    return errorPayload.error || 'Registration failed. Please check your details and try again.'
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

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!capturedImage) {
      showToast('Please capture your face before creating account.', 'warning')
      return
    }

    if (formData.password !== formData.password_confirm) {
      showToast('Passwords do not match.', 'error')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/register/', {
        ...formData,
        image_data: getImagePayload(capturedImage),
      })

      showToast('Account created and face profile saved. Please sign in.', 'success')
      navigate('/login')
    } catch (error) {
      const message = resolveRegistrationError(error.response?.data)
      showToast(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-50 via-white to-blue-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="mx-auto h-16 w-16 bg-gradient-to-br from-cyan-600 to-blue-700 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <UserPlus className="text-white w-8 h-8" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Create Your StarEvents Account</h2>
          <p className="mt-2 text-sm text-gray-600">Fill details, capture your face, and save account to local database.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="first_name"
                    name="first_name"
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    placeholder="First name"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                <input
                  id="last_name"
                  name="last_name"
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={handleChange}
                  className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  placeholder="Last name"
                />
              </div>

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={formData.username}
                  onChange={handleChange}
                  className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  placeholder="Choose username"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="phone_number"
                    name="phone_number"
                    type="text"
                    value={formData.phone_number}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    placeholder="+923001234567"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="block w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                >
                  <option value="client">Client</option>
                  <option value="staff">Staff</option>
                </select>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    placeholder="Create password"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password_confirm" className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <ShieldCheck className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password_confirm"
                    name="password_confirm"
                    type="password"
                    required
                    value={formData.password_confirm}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    placeholder="Confirm password"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-cyan-50 border border-cyan-200 rounded-lg">
              <p className="text-sm text-cyan-800">
                Face scan is mandatory for signup. This face profile will be stored in your local backend database.
              </p>
              <p className="text-xs text-cyan-700 mt-2">
                Keep one face only, use good light, look straight, and fill most of the frame.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              {capturedImage ? (
                <img src={capturedImage} alt="Captured face" className="w-full max-h-80 object-contain rounded-lg" />
              ) : (
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  className="w-full rounded-lg"
                  videoConstraints={{
                    width: 720,
                    height: 480,
                    facingMode: 'user',
                  }}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button type="button" onClick={captureImage} disabled={loading || !!capturedImage}>Capture Face</Button>
              <Button type="button" variant="outline" onClick={() => setCapturedImage(null)} disabled={loading || !capturedImage}>Retake</Button>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading || !capturedImage}>
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>

            <p className="text-center text-sm text-gray-600">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-cyan-700 hover:text-cyan-900">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Signup
