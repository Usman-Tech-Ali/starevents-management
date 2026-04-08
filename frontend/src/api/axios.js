import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const requestUrl = config.url || ''
    const isAuthRoute = requestUrl.includes('/auth/')
    const token = localStorage.getItem('token')
    const hasExplicitAuthHeader = Boolean(config.headers?.Authorization)

    // Keep caller-provided Authorization headers (needed for biometric enrollment)
    if (hasExplicitAuthHeader) {
      return config
    }

    // Auto-attach token only for non-auth endpoints to avoid stale-token 403 on login
    if (token && !isAuthRoute) {
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || ''
    const isAuthRoute = requestUrl.includes('/auth/')

    if (error.response?.status === 401 && !isAuthRoute) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
