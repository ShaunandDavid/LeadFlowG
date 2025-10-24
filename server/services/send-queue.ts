// Email send queue service with per-tenant throttling and warmup stages
// Uses Firestore as queue backend (can migrate to Cloud Tasks in production)

import { adminDb } from "../lib/firebase-admin";

export interface QueuedEmail {
  id: string;
  tenantId: string;
  leadId: string;
  sequenceId: string;
  stepId: string;
  templateId: string;
  runId: string;
  scheduledFor: string; // ISO timestamp
  idempotencyKey: string; // Prevents duplicate sends
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attemptCount: number;
  lastAttempt?: string;
  error?: string;
  createdAt: string;
}

export interface ThrottleStatus {
  emailsSentToday: number;
  dailyLimit: number;
  warmupStage: number; // 1-4
  canSendMore: boolean;
  nextAvailableSlot?: string;
}

// Warmup stages with progressive daily limits
const WARMUP_STAGES = [
  { stage: 1, dailyLimit: 25, durationDays: 7 },
  { stage: 2, dailyLimit: 50, durationDays: 7 },
  { stage: 3, dailyLimit: 75, durationDays: 7 },
  { stage: 4, dailyLimit: 100, durationDays: Infinity }, // Maintained indefinitely
];

export async function getThrottleStatus(tenantId: string): Promise<ThrottleStatus> {
  const tenantRef = adminDb.collection("tenants").doc(tenantId);
  const tenantDoc = await tenantRef.get();
  const tenant = tenantDoc.data();
  
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const warmupStage = tenant.limits?.rampStage || 1;
  const stageConfig = WARMUP_STAGES.find(s => s.stage === warmupStage) || WARMUP_STAGES[0];
  const dailyLimit = stageConfig.dailyLimit;
  
  const emailsSentToday = tenant.usage?.emailsSentToday || 0;
  const canSendMore = emailsSentToday < dailyLimit;

  return {
    emailsSentToday,
    dailyLimit,
    warmupStage,
    canSendMore,
    nextAvailableSlot: canSendMore ? undefined : getTomorrowMidnight().toISOString(),
  };
}

export async function enqueueEmail(params: {
  tenantId: string;
  leadId: string;
  sequenceId: string;
  stepId: string;
  templateId: string;
  scheduledFor: Date;
  idempotencyKey?: string;
  runId: string;
}): Promise<QueuedEmail> {
  const { tenantId, leadId, sequenceId, stepId, templateId, scheduledFor, idempotencyKey, runId } = params;
  
  // Generate deterministic idempotency key (NO timestamp to ensure deduplication)
  const key = idempotencyKey || `${runId}_${leadId}_${sequenceId}_${stepId}`;
  
  // Use idempotency key as document ID to enforce uniqueness atomically
  // Hash it to ensure valid Firestore document ID (no colons, slashes, etc.)
  const docId = Buffer.from(key).toString('base64').replace(/[/+=]/g, '_');
  
  const queueRef = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("emailQueue")
    .doc(docId);
  
  const now = new Date().toISOString();
  const emailData: Omit<QueuedEmail, 'id'> = {
    tenantId,
    leadId,
    sequenceId,
    stepId,
    templateId,
    runId,
    scheduledFor: scheduledFor.toISOString(),
    idempotencyKey: key,
    status: 'pending',
    attemptCount: 0,
    createdAt: now,
  };
  
  try {
    // Use create() to enforce that document doesn't already exist
    // This will throw if a concurrent request already created it
    await queueRef.create(emailData);
    
    return {
      id: docId,
      ...emailData,
    };
  } catch (error: any) {
    // Document already exists (code 6 = ALREADY_EXISTS)
    if (error.code === 6 || error.message?.includes('ALREADY_EXISTS')) {
      // Return existing document
      const doc = await queueRef.get();
      const existingData = (doc.data() ?? {}) as Partial<QueuedEmail>;
      if (!existingData.runId && runId) {
        await queueRef.update({ runId });
        existingData.runId = runId;
      }
      return {
        id: docId,
        tenantId: existingData.tenantId ?? tenantId,
        leadId: existingData.leadId ?? leadId,
        sequenceId: existingData.sequenceId ?? sequenceId,
        stepId: existingData.stepId ?? stepId,
        templateId: existingData.templateId ?? templateId,
        runId: existingData.runId ?? runId,
        scheduledFor: existingData.scheduledFor ?? scheduledFor.toISOString(),
        idempotencyKey: existingData.idempotencyKey ?? key,
        status: existingData.status ?? 'pending',
        attemptCount: existingData.attemptCount ?? 0,
        lastAttempt: existingData.lastAttempt,
        error: existingData.error,
        createdAt: existingData.createdAt ?? now,
      };
    }
    // Other error, re-throw
    throw error;
  }
}

export async function getNextBatch(tenantId: string, batchSize: number = 10): Promise<QueuedEmail[]> {
  const throttle = await getThrottleStatus(tenantId);
  
  if (!throttle.canSendMore) {
    return []; // Hit daily limit
  }
  
  const now = new Date().toISOString();
  const remainingQuota = throttle.dailyLimit - throttle.emailsSentToday;
  const actualBatchSize = Math.min(batchSize, remainingQuota);
  
  const snapshot = await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("emailQueue")
    .where("status", "==", "pending")
    .where("scheduledFor", "<=", now)
    .orderBy("scheduledFor", "asc")
    .limit(actualBatchSize)
    .get();
  
  return snapshot.docs
    .map(doc => {
      const data = doc.data() as Partial<QueuedEmail>;
      if (!data?.runId) {
        console.warn('Queued email missing runId; skipping', { tenantId, emailId: doc.id });
        return null;
      }
      return {
        id: doc.id,
        ...data,
      } as QueuedEmail;
    })
    .filter((value): value is QueuedEmail => value !== null);
}

export async function markAsProcessing(tenantId: string, emailId: string): Promise<boolean> {
  // Atomic claim: only transition from pending -> processing
  // Returns true if claim succeeded, false if already claimed by another worker
  
  const emailRef = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("emailQueue")
    .doc(emailId);
  
  try {
    await adminDb.runTransaction(async (transaction) => {
      const doc = await transaction.get(emailRef);
      
      if (!doc.exists) {
        throw new Error("Email not found");
      }
      
      const data = doc.data();
      
      // Only claim if status is pending
      if (data?.status !== 'pending') {
        throw new Error("Email already claimed or completed");
      }
      
      transaction.update(emailRef, {
        status: 'processing',
        lastAttempt: new Date().toISOString(),
        attemptCount: (data?.attemptCount || 0) + 1,
      });
    });
    
    return true; // Claim succeeded
  } catch (error) {
    // Another worker claimed it, or it's already processed
    return false;
  }
}

export async function markAsSent(tenantId: string, emailId: string): Promise<void> {
  const { FieldValue } = await import('firebase-admin/firestore');
  const batch = adminDb.batch();
  
  // Update email status
  const emailRef = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("emailQueue")
    .doc(emailId);
  
  batch.update(emailRef, {
    status: 'sent',
  });
  
  // Increment tenant usage atomically (prevents race conditions)
  const tenantRef = adminDb.collection("tenants").doc(tenantId);
  
  batch.update(tenantRef, {
    'usage.emailsSentToday': FieldValue.increment(1),
    'usage.emailsSentMonth': FieldValue.increment(1),
  });
  
  await batch.commit();
}

export async function markAsFailed(tenantId: string, emailId: string, error: string): Promise<void> {
  const emailRef = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("emailQueue")
    .doc(emailId);
  
  // Use transaction to ensure atomic retry logic
  await adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(emailRef);
    const attemptCount = doc.data()?.attemptCount || 0;
    
    // Retry up to 3 times, then mark as permanently failed
    if (attemptCount >= 3) {
      transaction.update(emailRef, {
        status: 'failed',
        error,
      });
    } else {
      // Reset to pending for retry
      transaction.update(emailRef, {
        status: 'pending',
        error,
        // Reschedule for 5 minutes from now
        scheduledFor: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
    }
  });
}

export async function resetDailyQuotas(): Promise<void> {
  // This should be called daily (e.g., via cron job at midnight)
  // Resets emailsSentToday for all tenants
  
  const tenantsSnapshot = await adminDb.collection("tenants").get();
  const batch = adminDb.batch();
  
  tenantsSnapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      'usage.emailsSentToday': 0,
    });
  });
  
  await batch.commit();
}

export async function processAllPendingSteps(): Promise<void> {
  // This should be called periodically (e.g., every 5 minutes) via cron
  // Processes pending waits and schedules next steps for all active runs
  
  const { scheduleNextSteps } = await import('./sequence-engine');
  
  const tenantsSnapshot = await adminDb.collection("tenants").get();
  
  for (const tenantDoc of tenantsSnapshot.docs) {
    const tenantId = tenantDoc.id;
    
    // Get all active runs for this tenant
    const runsSnapshot = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("runs")
      .where("status", "==", "active")
      .get();
    
    // Schedule next steps for each run
    for (const runDoc of runsSnapshot.docs) {
      try {
        await scheduleNextSteps(tenantId, runDoc.id);
      } catch (error) {
        console.error(`Failed to schedule steps for run ${runDoc.id}:`, error);
      }
    }
  }
}

export async function advanceWarmupStage(tenantId: string): Promise<void> {
  const tenantRef = adminDb.collection("tenants").doc(tenantId);
  const tenantDoc = await tenantRef.get();
  const tenant = tenantDoc.data();
  
  if (!tenant) {
    throw new Error("Tenant not found");
  }
  
  const currentStage = tenant.limits?.rampStage || 1;
  if (currentStage >= 4) {
    return; // Already at max stage
  }
  
  // Check if tenant has been in current stage long enough
  const stageConfig = WARMUP_STAGES.find(s => s.stage === currentStage);
  if (!stageConfig) return;
  
  // TODO: Check tenant.limits.rampStageStartedAt to see if enough days have passed
  // For now, allow manual advancement
  
  await tenantRef.update({
    'limits.rampStage': currentStage + 1,
    'limits.rampStageStartedAt': new Date().toISOString(),
  });
}

function getTomorrowMidnight(): Date {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
}
