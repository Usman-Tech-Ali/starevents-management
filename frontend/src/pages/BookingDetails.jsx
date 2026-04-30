import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useToast } from '../contexts/ToastContext'
import Card, { CardBody, CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Loading from '../components/ui/Loading'
import { ArrowLeft, Calendar, MapPin, Users, DollarSign, CheckCircle, XCircle, Clock, Copy, Download } from 'lucide-react'

const BookingDetails = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const { showToast } = useToast()

  useEffect(() => {
    fetchBookingDetails()
  }, [id])

  const fetchBookingDetails = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/events/bookings/${id}/`)
      setBooking(response.data)
    } catch (error) {
      showToast('Failed to fetch booking details', 'error')
      navigate('/bookings')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) return
    
    try {
      await api.post(`/events/bookings/${id}/cancel/`)
      showToast('Booking cancelled successfully', 'success')
      fetchBookingDetails()
    } catch (error) {
      showToast('Failed to cancel booking', 'error')
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    showToast('Copied to clipboard', 'success')
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle className="w-6 h-6 text-green-500" />
      case 'cancelled':
        return <XCircle className="w-6 h-6 text-red-500" />
      default:
        return <Clock className="w-6 h-6 text-yellow-500" />
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      completed: 'bg-blue-100 text-blue-800'
    }
    return colors[status] || colors.pending
  }

  if (loading) {
    return <Loading className="py-12" />
  }

  if (!booking) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={() => navigate('/bookings')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Bookings
        </Button>
        <Card>
          <CardBody className="text-center py-12">
            <p className="text-gray-500">Booking not found</p>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => navigate('/bookings')}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Bookings
      </Button>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Booking Details</h1>
          <p className="mt-1 text-sm text-gray-500">Reference: {booking.booking_reference}</p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon(booking.status)}
          <span className={`px-4 py-2 text-sm font-medium rounded-full ${getStatusColor(booking.status)}`}>
            {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Event Information */}
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Event Information</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Event Title</p>
                <p className="text-lg font-semibold text-gray-900">{booking.event_title}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Date & Time</p>
                  <p className="font-medium text-gray-900">
                    {new Date(booking.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Number of Tickets</p>
                  <p className="font-medium text-gray-900">{booking.number_of_tickets}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Booking Information */}
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Booking Information</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Booking Reference</p>
                <div className="flex items-center gap-2">
                  <p className="font-mono font-semibold text-gray-900">{booking.booking_reference}</p>
                  <button
                    onClick={() => copyToClipboard(booking.booking_reference)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition"
                  >
                    <Copy className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Booking Date</p>
                  <p className="font-medium text-gray-900">
                    {new Date(booking.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Status</p>
                  <p className="font-medium text-gray-900">
                    {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                  </p>
                </div>
              </div>
              {booking.special_requests && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">Special Requests</p>
                  <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{booking.special_requests}</p>
                </div>
              )}
              {booking.is_waitlisted && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    ⚠️ This booking is on the waitlist
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Summary</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Amount</p>
                <p className="text-3xl font-bold text-blue-600">£{booking.total_amount}</p>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600 mb-1">Client Name</p>
                <p className="font-medium text-gray-900">{booking.client_name}</p>
              </div>
              {booking.confirmed_at && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-1">Confirmed On</p>
                  <p className="font-medium text-gray-900">
                    {new Date(booking.confirmed_at).toLocaleDateString()}
                  </p>
                </div>
              )}
              {booking.cancelled_at && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-1">Cancelled On</p>
                  <p className="font-medium text-gray-900">
                    {new Date(booking.cancelled_at).toLocaleDateString()}
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Actions */}
          {booking.status === 'confirmed' && (
            <Button 
              variant="danger" 
              onClick={handleCancel}
              className="w-full"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancel Booking
            </Button>
          )}
          {booking.status === 'pending' && (
            <Button 
              variant="danger" 
              onClick={handleCancel}
              className="w-full"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancel Booking
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default BookingDetails
