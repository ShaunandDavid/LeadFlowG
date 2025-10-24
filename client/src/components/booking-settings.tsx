import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Clock, Plus, Trash2, Copy } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/auth-context';

interface MeetingType {
  id: string;
  name: string;
  duration: number;
  description: string;
  location: 'zoom' | 'google_meet' | 'phone' | 'in_person';
  locationDetails?: string;
  color?: string;
}

interface TimeSlot {
  start: string;
  end: string;
}

interface WeeklyAvailability {
  monday: TimeSlot[];
  tuesday: TimeSlot[];
  wednesday: TimeSlot[];
  thursday: TimeSlot[];
  friday: TimeSlot[];
  saturday: TimeSlot[];
  sunday: TimeSlot[];
}

interface BookingConfig {
  enabled: boolean;
  meetingTypes: MeetingType[];
  availability: WeeklyAvailability;
  bufferTime: number;
  minNotice: number;
  maxAdvance: number;
  timezone: string;
}

const DAYS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
] as const;

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const DEFAULT_CONFIG: BookingConfig = {
  enabled: false,
  meetingTypes: [],
  timezone: 'America/New_York',
  availability: {
    monday: [{ start: '09:00', end: '17:00' }],
    tuesday: [{ start: '09:00', end: '17:00' }],
    wednesday: [{ start: '09:00', end: '17:00' }],
    thursday: [{ start: '09:00', end: '17:00' }],
    friday: [{ start: '09:00', end: '17:00' }],
    saturday: [],
    sunday: [],
  },
  bufferTime: 15,
  minNotice: 60,
  maxAdvance: 90,
};

export function BookingSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const { data: config, isLoading } = useQuery<BookingConfig>({
    queryKey: ['/api/booking/config'],
  });

  const [formData, setFormData] = useState<BookingConfig>(DEFAULT_CONFIG);

  // Sync fetched config to form data
  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  const updateMutation = useMutation({
    mutationFn: (data: BookingConfig) => 
      apiRequest('/api/booking/config', 'PUT', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/booking/config'] });
      toast({
        title: 'Settings saved',
        description: 'Your booking configuration has been updated',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to save booking settings',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    // Validate meeting types
    for (const mt of formData.meetingTypes) {
      if (!mt.name || !mt.description || !mt.duration || mt.duration < 15) {
        toast({
          title: 'Invalid meeting type',
          description: 'All meeting types must have a name, description, and duration of at least 15 minutes',
          variant: 'destructive',
        });
        return;
      }
    }

    // Validate at least one time slot exists
    const hasSlots = Object.values(formData.availability).some(slots => slots.length > 0);
    if (!hasSlots) {
      toast({
        title: 'No availability configured',
        description: 'Please add at least one availability time slot',
        variant: 'destructive',
      });
      return;
    }

    updateMutation.mutate(formData);
  };

  const addMeetingType = () => {
    const newType: MeetingType = {
      id: `meeting-${Date.now()}`,
      name: 'New Meeting',
      duration: 30,
      description: '',
      location: 'google_meet',
      locationDetails: '',
      color: '#3b82f6',
    };
    setFormData({
      ...formData,
      meetingTypes: [...formData.meetingTypes, newType],
    });
  };

  const updateMeetingType = (id: string, updates: Partial<MeetingType>) => {
    setFormData({
      ...formData,
      meetingTypes: formData.meetingTypes.map(mt =>
        mt.id === id ? { ...mt, ...updates } : mt
      ),
    });
  };

  const deleteMeetingType = (id: string) => {
    setFormData({
      ...formData,
      meetingTypes: formData.meetingTypes.filter(mt => mt.id !== id),
    });
  };

  const addTimeSlot = (day: keyof WeeklyAvailability) => {
    const slots = formData.availability[day] || [];
    setFormData({
      ...formData,
      availability: {
        ...formData.availability,
        [day]: [...slots, { start: '09:00', end: '17:00' }],
      },
    });
  };

  const updateTimeSlot = (day: keyof WeeklyAvailability, index: number, updates: Partial<TimeSlot>) => {
    const slots = [...(formData.availability[day] || [])];
    const updatedSlot = { ...slots[index], ...updates };
    
    // Validate that start is before end
    if (updatedSlot.start && updatedSlot.end && updatedSlot.start >= updatedSlot.end) {
      toast({
        title: 'Invalid time range',
        description: 'Start time must be before end time',
        variant: 'destructive',
      });
      return;
    }
    
    slots[index] = updatedSlot;
    setFormData({
      ...formData,
      availability: {
        ...formData.availability,
        [day]: slots,
      },
    });
  };

  const deleteTimeSlot = (day: keyof WeeklyAvailability, index: number) => {
    const slots = [...(formData.availability[day] || [])];
    slots.splice(index, 1);
    setFormData({
      ...formData,
      availability: {
        ...formData.availability,
        [day]: slots,
      },
    });
  };

  const copyBookingUrl = () => {
    const baseUrl = window.location.origin;
    const tenantId = user?.tenantId || 'YOUR_TENANT_ID';
    const url = `${baseUrl}/book/${tenantId}/LEAD_ID`;
    navigator.clipboard.writeText(url);
    toast({
      title: 'URL copied',
      description: 'Booking page URL template copied to clipboard',
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Booking Page</CardTitle>
              <CardDescription>
                Allow leads to schedule meetings directly from your outreach emails
              </CardDescription>
            </div>
            <Switch
              checked={formData.enabled}
              onCheckedChange={(enabled) => setFormData({ ...formData, enabled })}
              data-testid="switch-booking-enabled"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input
              value={`${window.location.origin}/book/${user?.tenantId || 'YOUR_TENANT_ID'}/LEAD_ID`}
              readOnly
              className="font-mono text-sm"
              data-testid="input-booking-url"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={copyBookingUrl}
              data-testid="button-copy-url"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Replace LEAD_ID with the actual lead ID when sending emails
          </p>
        </CardContent>
      </Card>

      {/* Meeting Types */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Meeting Types</CardTitle>
              <CardDescription>Configure different meeting options for your leads</CardDescription>
            </div>
            <Button onClick={addMeetingType} size="sm" data-testid="button-add-meeting-type">
              <Plus className="h-4 w-4 mr-2" />
              Add Meeting Type
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.meetingTypes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No meeting types configured</p>
              <p className="text-sm">Click "Add Meeting Type" to get started</p>
            </div>
          ) : (
            formData.meetingTypes.map((meetingType, idx) => (
              <div key={meetingType.id} className="p-4 border border-border rounded-lg space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={meetingType.name}
                          onChange={(e) => updateMeetingType(meetingType.id, { name: e.target.value })}
                          placeholder="Discovery Call"
                          data-testid={`input-meeting-name-${idx}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Duration (minutes)</Label>
                        <Input
                          type="number"
                          value={meetingType.duration}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            if (!isNaN(value) && value > 0) {
                              updateMeetingType(meetingType.id, { duration: value });
                            }
                          }}
                          min={15}
                          step={15}
                          data-testid={`input-meeting-duration-${idx}`}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Input
                        value={meetingType.description}
                        onChange={(e) => updateMeetingType(meetingType.id, { description: e.target.value })}
                        placeholder="30-minute introduction call to discuss your needs"
                        data-testid={`input-meeting-description-${idx}`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Location</Label>
                        <Select
                          value={meetingType.location}
                          onValueChange={(value) => updateMeetingType(meetingType.id, { location: value as any })}
                        >
                          <SelectTrigger data-testid={`select-meeting-location-${idx}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="google_meet">Google Meet</SelectItem>
                            <SelectItem value="zoom">Zoom</SelectItem>
                            <SelectItem value="phone">Phone</SelectItem>
                            <SelectItem value="in_person">In Person</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Color</Label>
                        <Input
                          type="color"
                          value={meetingType.color || '#3b82f6'}
                          onChange={(e) => updateMeetingType(meetingType.id, { color: e.target.value })}
                          data-testid={`input-meeting-color-${idx}`}
                        />
                      </div>
                    </div>
                    {(meetingType.location === 'zoom' || meetingType.location === 'phone' || meetingType.location === 'in_person') && (
                      <div className="space-y-2">
                        <Label>Location Details</Label>
                        <Input
                          value={meetingType.locationDetails || ''}
                          onChange={(e) => updateMeetingType(meetingType.id, { locationDetails: e.target.value })}
                          placeholder={
                            meetingType.location === 'zoom' ? 'Zoom link or meeting ID' :
                            meetingType.location === 'phone' ? 'Phone number' :
                            'Address or location details'
                          }
                          data-testid={`input-meeting-location-details-${idx}`}
                        />
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMeetingType(meetingType.id)}
                    className="ml-2"
                    data-testid={`button-delete-meeting-${idx}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Availability */}
      <Card>
        <CardHeader>
          <CardTitle>Availability</CardTitle>
          <CardDescription>Set your weekly availability schedule</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(timezone) => setFormData({ ...formData, timezone })}
              >
                <SelectTrigger data-testid="select-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Buffer Time (minutes)</Label>
              <Input
                type="number"
                value={formData.bufferTime}
                onChange={(e) => setFormData({ ...formData, bufferTime: parseInt(e.target.value) || 0 })}
                min={0}
                step={5}
                data-testid="input-buffer-time"
              />
              <p className="text-xs text-muted-foreground">
                Time between meetings
              </p>
            </div>
            <div className="space-y-2">
              <Label>Min Notice (hours)</Label>
              <Input
                type="number"
                value={formData.minNotice}
                onChange={(e) => setFormData({ ...formData, minNotice: parseInt(e.target.value) || 0 })}
                min={0}
                data-testid="input-min-notice"
              />
              <p className="text-xs text-muted-foreground">
                Minimum advance notice
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            {DAYS.map(({ key, label }) => {
              const slots = formData.availability[key] || [];
              const hasSlots = slots.length > 0;
              
              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">{label}</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => addTimeSlot(key)}
                      data-testid={`button-add-slot-${key}`}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Slot
                    </Button>
                  </div>
                  {!hasSlots && (
                    <p className="text-sm text-muted-foreground">No availability</p>
                  )}
                  {slots.map((slot, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={slot.start}
                        onChange={(e) => updateTimeSlot(key, idx, { start: e.target.value })}
                        className="w-32"
                        data-testid={`input-${key}-start-${idx}`}
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={slot.end}
                        onChange={(e) => updateTimeSlot(key, idx, { end: e.target.value })}
                        className="w-32"
                        data-testid={`input-${key}-end-${idx}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteTimeSlot(key, idx)}
                        data-testid={`button-delete-slot-${key}-${idx}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          data-testid="button-save-booking-settings"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
