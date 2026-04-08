import { useEffect, useState } from 'react'
import api from '../api/axios'
import { useToast } from '../contexts/ToastContext'
import Card, { CardBody, CardHeader } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Loading from '../components/ui/Loading'
import { Search, CheckCircle, XCircle, Clock, Calendar, User, Mail, Phone, DollarSign } from 'lucide-react'

const Bookings = () => {
  const [bookings, setBookings] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const { showToast } = useToast()

  useEffect(() => {
    fetchBookings()
    fetchEvents()
  }, [filterStatus])

  const fetchBookings = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filterStatus) params.append('status', filterStatus)
      
      const response = await api.get(`/events/bookings/?${params}`)
      setBookings(response.data.results || response.data || [])
    } catch (error) {
      showToast('Failed to fetch bookings', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchEvents = async () => {
    try {
      const response = await api.get('/events/events/')
      setEvents(response.data.results || response.data || [])
    } catch (error) {
      console.error('Error fetching events:', error)
    }
  }

  const handleConfirm = async (id) => {
    try {
      await api.post(`/events/bookings/${id}/confirm/`)
      showToast('Booking confirmed successfully', 'success')
      fetchBookings()
    } catch (error) {
      showToast('Failed to confirm booking', 'error')
    }
  }

  const handleCancel = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) return
    
    try {
      await api.post(`/events/bookings/${id}/cancel/`)
      showToast('Booking cancelled successfully', 'success')
      fetchBookings()
    } catch (error) {
      showToast('Failed to cancel booking', 'error')
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-500" />
      default:
        return <Clock className="w-5 h-5 text-yellow-500" />
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

  const filteredBookings = bookings.filter(booking => {
    const matchesSearch = 
      booking.booking_reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.event_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesSearch
  })

  const getEventById = (eventId) => {
    return events.find(e => e.id === eventId)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bookings</h1>
          <p className="mt-1 text-sm text-gray-500">Manage event bookings and reservations</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search bookings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
            </select>
            <Button variant="outline" onClick={() => { setSearchTerm(''); setFilterStatus('') }}>
              Clear Filters
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Bookings Table */}
      {loading ? (
        <Loading className="py-12" />
      ) : filteredBookings.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No bookings found</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => {
            const event = getEventById(booking.event)
            return (
              <Card key={booking.id} hover>
                <CardBody>
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">
                            {booking.event_title || 'Event'}
                          </h3>
                          <p className="text-sm text-gray-500">
                            Reference: <span className="font-mono font-medium">{booking.booking_reference}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(booking.status)}
                          <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(booking.status)}`}>
                            {booking.status}
                          </span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center text-gray-600">
                          <User className="w-4 h-4 mr-2" />
                          <span className="font-medium">{booking.client_name}</span>
                        </div>
                        <div className="flex items-center text-gray-600">
                          <Calendar className="w-4 h-4 mr-2" />
                          {new Date(booking.created_at).toLocaleDateString()}
                        </div>
                        <div className="flex items-center text-gray-600">
                          <span className="mr-2">Tickets:</span>
                          <span className="font-medium">{booking.number_of_tickets}</span>
                        </div>
                        <div className="flex items-center text-gray-600">
                          <DollarSign className="w-4 h-4 mr-2" />
                          <span className="font-medium">£{booking.total_amount}</span>
                        </div>
                      </div>

                      {booking.special_requests && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">Special Requests:</span> {booking.special_requests}
                          </p>
                        </div>
                      )}

                      {booking.is_waitlisted && (
                        <div className="mt-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-sm text-yellow-800">
                            ⚠️ This booking is on the waitlist
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 lg:min-w-[200px]">
                      {booking.status === 'pending' && (
                        <>
                          <Button size="sm" variant="success" onClick={() => handleConfirm(booking.id)}>
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Confirm
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => handleCancel(booking.id)}>
                            <XCircle className="w-4 h-4 mr-1" />
                            Cancel
                          </Button>
                        </>
                      )}
                      {booking.status === 'confirmed' && (
                        <Button size="sm" variant="danger" onClick={() => handleCancel(booking.id)}>
                          <XCircle className="w-4 h-4 mr-1" />
                          Cancel Booking
                        </Button>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Bookings
