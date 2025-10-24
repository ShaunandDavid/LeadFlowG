import { adminDb } from './firebase-admin';

export type AnalyticsEventType =
  | 'send_ok'
  | 'send_failed'
  | 'open'
  | 'click'
  | 'reply'
  | 'booked'
  | 'bounce'
  | 'complaint'
  | 'unsubscribe';

export interface AnalyticsEvent {
  tenantId: string;
  leadId?: string;
  sequenceId?: string;
  stepId?: string;
  templateId?: string;
  messageId?: string;
  type: AnalyticsEventType;
  url?: string;
  userAgent?: string;
  ipAddress?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

/**
 * Record an analytics event
 */
export async function recordEvent(event: AnalyticsEvent): Promise<void> {
  try {
    const { tenantId } = event;
    
    // Sanitize timestamp - validate raw input and default to current time if missing/invalid
    let timestamp: string;
    
    if (!event.timestamp || event.timestamp.trim() === '') {
      console.warn(`Missing or empty timestamp for ${event.type} event. Using current time.`, {
        eventType: event.type,
        tenantId: event.tenantId,
        providedTimestamp: event.timestamp,
      });
      timestamp = new Date().toISOString();
    } else {
      const parsedDate = new Date(event.timestamp);
      if (isNaN(parsedDate.getTime())) {
        console.warn(`Invalid timestamp provided: "${event.timestamp}". Using current time instead.`, {
          eventType: event.type,
          tenantId: event.tenantId,
        });
        timestamp = new Date().toISOString();
      } else {
        timestamp = event.timestamp;
      }
    }
    
    const eventWithTimestamp = {
      ...event,
      timestamp,
    };
    
    // Write to events collection
    await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('analyticsEvents')
      .add(eventWithTimestamp);
    
    // Trigger rollup updates asynchronously (don't await)
    updateRollups(eventWithTimestamp).catch(err => {
      console.error('Error updating rollups:', err);
    });
  } catch (error) {
    console.error('Error recording analytics event:', error);
    // Don't throw - tracking failures shouldn't break main functionality
  }
}

/**
 * Update rollup aggregates for an event
 */
async function updateRollups(event: AnalyticsEvent): Promise<void> {
  const { tenantId, sequenceId, templateId, type, timestamp } = event;
  
  // Defensive validation - ensure date is valid before creating rollup keys
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    console.error('Invalid timestamp in updateRollups - skipping rollup update', {
      timestamp,
      eventType: type,
      tenantId,
    });
    return;
  }
  
  // Get date key (YYYYMMDD)
  const dateKey = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  
  // Increment counters for tenant daily rollup
  const tenantDailyRef = adminDb
    .collection('analytics')
    .doc('tenants')
    .collection(tenantId)
    .doc(dateKey);
  
  await tenantDailyRef.set(
    {
      date: dateKey,
      [type]: adminDb.FieldValue.increment(1),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  
  // Increment counters for sequence daily rollup (if applicable)
  if (sequenceId) {
    const sequenceDailyRef = adminDb
      .collection('analytics')
      .doc('sequences')
      .collection(sequenceId)
      .doc(dateKey);
    
    await sequenceDailyRef.set(
      {
        date: dateKey,
        sequenceId,
        tenantId,
        [type]: adminDb.FieldValue.increment(1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
  
  // Increment counters for template daily rollup (if applicable)
  if (templateId) {
    const templateDailyRef = adminDb
      .collection('analytics')
      .doc('templates')
      .collection(templateId)
      .doc(dateKey);
    
    await templateDailyRef.set(
      {
        date: dateKey,
        templateId,
        tenantId,
        [type]: adminDb.FieldValue.increment(1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
}

/**
 * Get aggregated analytics for a tenant
 */
export async function getTenantAnalytics(params: {
  tenantId: string;
  startDate: string;
  endDate: string;
}): Promise<Record<string, any>[]> {
  const { tenantId, startDate, endDate } = params;
  
  const snapshot = await adminDb
    .collection('analytics')
    .doc('tenants')
    .collection(tenantId)
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .orderBy('date', 'asc')
    .get();
  
  return snapshot.docs.map(doc => doc.data());
}

/**
 * Get aggregated analytics for a sequence
 */
export async function getSequenceAnalytics(params: {
  sequenceId: string;
  startDate: string;
  endDate: string;
}): Promise<Record<string, any>[]> {
  const { sequenceId, startDate, endDate } = params;
  
  const snapshot = await adminDb
    .collection('analytics')
    .doc('sequences')
    .collection(sequenceId)
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .orderBy('date', 'asc')
    .get();
  
  return snapshot.docs.map(doc => doc.data());
}

/**
 * Get raw analytics events for export
 */
export async function getAnalyticsEvents(params: {
  tenantId: string;
  startDate: string;
  endDate: string;
  limit?: number;
}): Promise<AnalyticsEvent[]> {
  const { tenantId, startDate, endDate, limit = 1000 } = params;
  
  let query = adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('analyticsEvents')
    .where('timestamp', '>=', startDate)
    .where('timestamp', '<=', endDate)
    .orderBy('timestamp', 'desc')
    .limit(limit);
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data() as AnalyticsEvent);
}
