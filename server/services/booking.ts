// Booking service - handles meeting scheduling with Google Calendar integration
import { adminDb } from '../lib/firebase-admin';
import { google } from 'googleapis';
import { getGmailClient } from './google-oauth';

export interface BookingConfig {
  enabled: boolean;
  meetingTypes: MeetingType[];
  availability: WeeklyAvailability;
  bufferTime: number; // minutes before/after meetings
  minNotice: number; // minimum hours before booking
  maxAdvance: number; // maximum days in advance
  timezone: string;
}

export interface MeetingType {
  id: string;
  name: string;
  duration: number; // minutes
  description: string;
  location: 'zoom' | 'google_meet' | 'phone' | 'in_person';
  locationDetails?: string;
  color?: string;
}

export interface WeeklyAvailability {
  monday: TimeSlot[];
  tuesday: TimeSlot[];
  wednesday: TimeSlot[];
  thursday: TimeSlot[];
  friday: TimeSlot[];
  saturday: TimeSlot[];
  sunday: TimeSlot[];
}

export interface TimeSlot {
  start: string; // HH:mm format
  end: string; // HH:mm format
}

export interface AvailableSlot {
  datetime: string; // ISO 8601
  duration: number; // minutes
}

/**
 * Get booking configuration for a tenant
 */
export async function getBookingConfig(tenantId: string): Promise<BookingConfig | null> {
  const configDoc = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('settings')
    .doc('booking')
    .get();

  if (!configDoc.exists) {
    return null;
  }

  return configDoc.data() as BookingConfig;
}

/**
 * Update booking configuration
 */
export async function updateBookingConfig(
  tenantId: string,
  config: Partial<BookingConfig>
): Promise<void> {
  await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('settings')
    .doc('booking')
    .set(config, { merge: true });
}

/**
 * Get available time slots for a date range
 */
export async function getAvailableSlots(params: {
  tenantId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  meetingTypeId: string;
}): Promise<AvailableSlot[]> {
  const { tenantId, startDate, endDate, meetingTypeId } = params;

  const config = await getBookingConfig(tenantId);
  if (!config || !config.enabled) {
    return [];
  }

  const meetingType = config.meetingTypes.find(mt => mt.id === meetingTypeId);
  if (!meetingType) {
    throw new Error('Meeting type not found');
  }

  // Get existing calendar events to block off busy times
  const busySlots = await getExistingEvents(tenantId, startDate, endDate);

  // Generate available slots based on config
  const slots: AvailableSlot[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Iterate through each day
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dayOfWeek = getDayOfWeek(date);
    const dayAvailability = config.availability[dayOfWeek];

    if (!dayAvailability || dayAvailability.length === 0) {
      continue; // No availability configured for this day
    }

    // For each time slot configured for this day
    for (const timeSlot of dayAvailability) {
      const slotStart = parseTimeSlot(date, timeSlot.start, config.timezone);
      const slotEnd = parseTimeSlot(date, timeSlot.end, config.timezone);

      // Generate slots within this availability window
      let current = new Date(slotStart);
      while (current < slotEnd) {
        const slotEndTime = new Date(current.getTime() + meetingType.duration * 60000);

        // Check if slot ends before the availability window ends
        if (slotEndTime > slotEnd) {
          break;
        }

        // Check min notice requirement
        const now = new Date();
        const minNoticeMs = config.minNotice * 60 * 60 * 1000;
        if (current.getTime() - now.getTime() < minNoticeMs) {
          current = new Date(current.getTime() + 15 * 60000); // Move to next 15-min slot
          continue;
        }

        // Check max advance requirement
        const maxAdvanceMs = config.maxAdvance * 24 * 60 * 60 * 1000;
        if (current.getTime() - now.getTime() > maxAdvanceMs) {
          break;
        }

        // Check if slot conflicts with existing events
        const hasConflict = busySlots.some(busy => {
          const busyStart = new Date(busy.start);
          const busyEnd = new Date(busy.end);
          
          // Add buffer time
          busyStart.setMinutes(busyStart.getMinutes() - config.bufferTime);
          busyEnd.setMinutes(busyEnd.getMinutes() + config.bufferTime);

          return (
            (current >= busyStart && current < busyEnd) ||
            (slotEndTime > busyStart && slotEndTime <= busyEnd) ||
            (current <= busyStart && slotEndTime >= busyEnd)
          );
        });

        if (!hasConflict) {
          slots.push({
            datetime: current.toISOString(),
            duration: meetingType.duration,
          });
        }

        // Move to next slot (15-minute increments)
        current = new Date(current.getTime() + 15 * 60000);
      }
    }
  }

  return slots;
}

/**
 * Get existing calendar events for busy time calculation
 */
async function getExistingEvents(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<Array<{ start: string; end: string }>> {
  try {
    const { client } = await getGmailClient(tenantId);
    const calendar = google.calendar({ version: 'v3', auth: client });

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate + 'T23:59:59').toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (response.data.items || [])
      .filter(event => event.start?.dateTime && event.end?.dateTime)
      .map(event => ({
        start: event.start!.dateTime!,
        end: event.end!.dateTime!,
      }));
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return [];
  }
}

/**
 * Create a booking and add to Google Calendar
 */
export async function createBooking(params: {
  tenantId: string;
  leadId: string;
  meetingTypeId: string;
  datetime: string;
  attendeeEmail: string;
  attendeeName: string;
  notes?: string;
}): Promise<{ bookingId: string; calendarEventId: string }> {
  const { tenantId, leadId, meetingTypeId, datetime, attendeeEmail, attendeeName, notes } = params;

  const config = await getBookingConfig(tenantId);
  if (!config || !config.enabled) {
    throw new Error('Booking is not enabled');
  }

  const meetingType = config.meetingTypes.find(mt => mt.id === meetingTypeId);
  if (!meetingType) {
    throw new Error('Meeting type not found');
  }

  // Create calendar event
  const { client } = await getGmailClient(tenantId);
  const calendar = google.calendar({ version: 'v3', auth: client });

  const startTime = new Date(datetime);
  const endTime = new Date(startTime.getTime() + meetingType.duration * 60000);

  const event = {
    summary: `${meetingType.name} with ${attendeeName}`,
    description: `${meetingType.description}\n\n${notes || ''}`,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: config.timezone,
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: config.timezone,
    },
    attendees: [{ email: attendeeEmail }],
    conferenceData: meetingType.location === 'google_meet' ? {
      createRequest: {
        requestId: `${tenantId}-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    } : undefined,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 30 },
      ],
    },
  };

  const calendarResponse = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
    conferenceDataVersion: meetingType.location === 'google_meet' ? 1 : 0,
  });

  const calendarEventId = calendarResponse.data.id!;

  // Create booking record in Firestore
  const bookingRef = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('bookings')
    .add({
      leadId,
      meetingTypeId,
      datetime,
      duration: meetingType.duration,
      attendeeEmail,
      attendeeName,
      notes: notes || '',
      calendarEventId,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    });

  // Update lead status to booked
  await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('leads')
    .doc(leadId)
    .update({
      status: 'booked',
      bookedAt: new Date().toISOString(),
    });

  // Record analytics event for booking
  const { recordEvent } = await import('../lib/events');
  await recordEvent({
    tenantId,
    leadId,
    type: 'booked',
    timestamp: new Date().toISOString(),
    metadata: {
      meetingTypeId,
      datetime,
      duration: meetingType.duration,
    },
  });

  // Mark sequence as completed if lead is in a sequence
  const progressSnapshot = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('leadProgress')
    .where('leadId', '==', leadId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (!progressSnapshot.empty) {
    await progressSnapshot.docs[0].ref.update({
      status: 'booked',
      updatedAt: new Date().toISOString(),
    });
  }

  // Log event
  await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('events')
    .add({
      type: 'booking_created',
      tenantId,
      leadId,
      bookingId: bookingRef.id,
      calendarEventId,
      createdAt: new Date().toISOString(),
    });

  return { bookingId: bookingRef.id, calendarEventId };
}

/**
 * Helper functions
 */
function getDayOfWeek(date: Date): keyof WeeklyAvailability {
  const days: (keyof WeeklyAvailability)[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  return days[date.getDay()];
}

function parseTimeSlot(date: Date, time: string, timezone: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}
