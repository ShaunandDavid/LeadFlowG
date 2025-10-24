// Public booking page - allows leads to schedule meetings
import { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { format, addDays } from 'date-fns';

interface MeetingType {
  id: string;
  name: string;
  duration: number;
  description: string;
}

interface BookingConfig {
  enabled: boolean;
  meetingTypes: MeetingType[];
  timezone: string;
}

interface AvailableSlot {
  datetime: string;
  duration: number;
}

export default function BookingPage() {
  const [, params] = useRoute('/book/:tenantId/:leadId');
  const { tenantId, leadId } = params || {};
  
  const [selectedMeetingType, setSelectedMeetingType] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    notes: '',
  });
  const [isBooked, setIsBooked] = useState(false);

  // Fetch booking config
  const { data: config, isLoading: configLoading } = useQuery<BookingConfig>({
    queryKey: tenantId ? [`/api/booking/${tenantId}/config`] : ['/api/booking/config'],
    enabled: !!tenantId,
  });

  // Fetch available slots when date and meeting type are selected
  const startDate = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
  const endDate = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';
  
  const slotParams =
    selectedMeetingType && selectedDate
      ? { startDate, endDate, meetingTypeId: selectedMeetingType }
      : undefined;

  const { data: slots = [], isLoading: slotsLoading } = useQuery<AvailableSlot[]>({
    queryKey: tenantId
      ? [`/api/booking/${tenantId}/slots`, slotParams ?? {}]
      : ['/api/booking/slots'],
    enabled: !!tenantId && !!slotParams,
  });

  // Create booking mutation
  const bookingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/booking/${tenantId}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to book');
      return response.json();
    },
    onSuccess: () => {
      setIsBooked(true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedSlot || !formData.name || !formData.email) {
      return;
    }

    bookingMutation.mutate({
      leadId,
      meetingTypeId: selectedMeetingType,
      datetime: selectedSlot,
      attendeeEmail: formData.email,
      attendeeName: formData.name,
      notes: formData.notes,
    });
  };

  if (configLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!config?.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Booking Not Available</CardTitle>
            <CardDescription>
              This booking page is currently disabled.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isBooked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 text-green-500">
              <CheckCircle2 className="h-16 w-16" />
            </div>
            <CardTitle>Meeting Booked!</CardTitle>
            <CardDescription>
              Your meeting has been scheduled. You'll receive a calendar invitation at {formData.email}.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const selectedMeeting = config.meetingTypes.find(mt => mt.id === selectedMeetingType);

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Schedule a Meeting</CardTitle>
            <CardDescription>
              Choose a meeting type and select a time that works for you
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Meeting Type Selection */}
              <div className="space-y-2">
                <Label htmlFor="meetingType">Meeting Type</Label>
                <Select value={selectedMeetingType} onValueChange={setSelectedMeetingType}>
                  <SelectTrigger data-testid="select-meeting-type">
                    <SelectValue placeholder="Select a meeting type" />
                  </SelectTrigger>
                  <SelectContent>
                    {config.meetingTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <span>{type.name}</span>
                          <span className="text-muted-foreground">({type.duration} min)</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedMeeting && (
                  <p className="text-sm text-muted-foreground">{selectedMeeting.description}</p>
                )}
              </div>

              {/* Calendar */}
              {selectedMeetingType && (
                <div className="space-y-2">
                  <Label>Select Date</Label>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => date < new Date() || date > addDays(new Date(), 90)}
                    className="rounded-md border"
                  />
                </div>
              )}

              {/* Time Slots */}
              {selectedDate && (
                <div className="space-y-2">
                  <Label>Available Times ({config.timezone})</Label>
                  {slotsLoading ? (
                    <div className="grid grid-cols-3 gap-2">
                      {[...Array(6)].map((_, i) => (
                        <Skeleton key={i} className="h-10" />
                      ))}
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No available slots for this date</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {slots.map((slot) => {
                        const time = new Date(slot.datetime);
                        const timeStr = format(time, 'h:mm a');
                        return (
                          <Button
                            key={slot.datetime}
                            type="button"
                            variant={selectedSlot === slot.datetime ? 'default' : 'outline'}
                            onClick={() => setSelectedSlot(slot.datetime)}
                            data-testid={`slot-${timeStr}`}
                            className="justify-center"
                          >
                            {timeStr}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Contact Form */}
              {selectedSlot && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="name">Your Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="John Doe"
                      required
                      data-testid="input-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Your Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="john@example.com"
                      required
                      data-testid="input-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes (Optional)</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Any additional details or topics you'd like to discuss..."
                      rows={3}
                      data-testid="textarea-notes"
                    />
                  </div>
                </div>
              )}
            </form>
          </CardContent>

          {selectedSlot && (
            <CardFooter className="flex justify-between">
              <div className="text-sm text-muted-foreground">
                <CalendarIcon className="inline h-4 w-4 mr-1" />
                {selectedDate && format(selectedDate, 'MMMM d, yyyy')} at{' '}
                {format(new Date(selectedSlot), 'h:mm a')}
              </div>
              <Button
                onClick={handleSubmit}
                disabled={bookingMutation.isPending}
                data-testid="button-book-meeting"
              >
                {bookingMutation.isPending ? 'Booking...' : 'Book Meeting'}
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
