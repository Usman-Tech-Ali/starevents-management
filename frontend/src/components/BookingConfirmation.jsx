import { CheckCircle, Copy, Download, Calendar, Users, DollarSign, MapPin } from 'lucide-react'
import Button from './ui/Button'
import Card, { CardBody } from './ui/Card'

const BookingConfirmation = ({ booking, event, onClose }) => {
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-6">
      {/* Success Header */}
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <CheckCircle className="w-16 h-16 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h2>
        <p className="text-gray-600">Your booking has been successfully created</p>
      </div>

      {/* Booking Reference */}
      <Card>
        <CardBody className="bg-blue-50">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">Booking Reference</p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-2xl font-mono font-bold text-gray-900">
                {booking.booking_reference}
              </p>
              <button
                onClick={() => copyToClipboard(booking.booking_reference)}
                className="p-2 hover:bg-blue-100 rounded-lg transition"
              >
                <Copy className="w-5 h-5 text-blue-600" />
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-2">Save this reference for your records</p>
          </div>
        </CardBody>
      </Card>

      {/* Event Details */}
      {event && (
        <Card>
          <CardBody className="space-y-4">
            <h3 className="font-semibold text-gray-900">Event Details</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Event</p>
                <p className="font-medium text-gray-900">{event.title}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    Date
                  </p>
                  <p className="font-medium text-gray-900">
                    {new Date(event.start_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    Venue
                  </p>
                  <p className="font-medium text-gray-900">{event.venue}</p>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Booking Summary */}
      <Card>
        <CardBody className="space-y-4">
          <h3 className="font-semibold text-gray-900">Booking Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Number of Tickets</span>
              <span className="font-medium text-gray-900">{booking.number_of_tickets}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Price per Ticket</span>
              <span className="font-medium text-gray-900">£{event?.price || 0}</span>
            </div>
            {booking.special_requests && (
              <div>
                <span className="text-gray-600">Special Requests</span>
                <p className="text-sm text-gray-900 mt-1">{booking.special_requests}</p>
              </div>
            )}
            <div className="pt-3 border-t border-gray-200 flex justify-between">
              <span className="font-semibold text-gray-900">Total Amount</span>
              <span className="text-2xl font-bold text-blue-600">£{booking.total_amount}</span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Status Info */}
      {booking.is_waitlisted && (
        <Card>
          <CardBody className="bg-yellow-50 border border-yellow-200">
            <p className="text-sm text-yellow-800">
              ⚠️ Your booking is on the waitlist. You will be notified when a spot becomes available.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          Continue Shopping
        </Button>
        <Button className="flex-1">
          <Download className="w-4 h-4 mr-2" />
          Download Confirmation
        </Button>
      </div>
    </div>
  )
}

export default BookingConfirmation
