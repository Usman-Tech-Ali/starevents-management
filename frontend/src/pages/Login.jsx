import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import api from '../api/axios'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Loading from '../components/ui/Loading'
import { Lock, Mail, Smartphone, Shield } from 'lucide-react'

const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [phase, setPhase] = useState(1) // 1: password, 2: OTP, 3: biometric
  const [userId, setUserId] = useState(null)
  const [deliveryMethod, setDeliveryMethod] = useState('email')
  const [loading, setLoading] = useState(false)
  
  const { login } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const handlePasswordLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const response = await api.post('/auth/login_phase1/', { username, password })
      const { phase: nextPhase, user_id, requires_otp, requires_biometric } = response.data
      
      if (requires_biometric) {
        setPhase(3)
        setUserId(user_id)
        showToast('Too many failed attempts. Biometric authentication required.', 'warning')
      } else if (requires_otp) {
        setPhase(2)
        setUserId(user_id)
        // Call requestOTP with user_id directly to avoid timing issues
        await requestOTP(user_id)
        showToast('OTP sent successfully', 'success')
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Invalid credentials', 'error')
    } finally {
      setLoading(false)
    }
  }

  const requestOTP = async (userIdParam = null) => {
    try {
      const userIdToUse = userIdParam || userId
      if (!userIdToUse) {
        showToast('User ID is missing', 'error')
        return
      }
      await api.post('/auth/request_otp/', {
        user_id: userIdToUse,
        delivery_method: deliveryMethod
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
      
      login(response.data.user, response.data.token)
      showToast('Login successful!', 'success')
      navigate('/dashboard')
    } catch (err) {
      showToast(err.response?.data?.error || 'Invalid OTP', 'error')
    } finally {
      setLoading(false)
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
            {phase === 3 && 'Biometric authentication required'}
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
                      requestOTP(userId)
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
                      requestOTP(userId)
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
                  onClick={() => requestOTP(userId)}
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
            <div className="text-center space-y-6">
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ Too many failed login attempts. Biometric authentication is required for security.
                </p>
              </div>
              <div className="p-8 bg-gray-50 rounded-lg">
                <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">
                  Biometric authentication feature will be available in the full implementation.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setPhase(1)}
                  className="w-full"
                >
                  Back to Login
                </Button>
              </div>
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
