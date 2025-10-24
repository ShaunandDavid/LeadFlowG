// Sequence execution engine - orchestrates multi-step email sequences
// Manages step progression, scheduling, and statistics tracking

import { adminDb } from "../lib/firebase-admin";
import { enqueueEmail } from "./send-queue";
import { calculateSendTime, substituteVariables } from "./template";

export interface SequenceRun {
  id: string;
  tenantId: string;
  sequenceId: string;
  leadIds: string[];
  status: 'pending' | 'active' | 'paused' | 'completed' | 'cancelled';
  stats: {
    totalLeads: number;
    contacted: number;
    replied: number;
    booked: number;
    unsubscribed: number;
  };
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface LeadProgress {
  leadId: string;
  runId: string;
  sequenceId: string;
  currentStepIndex: number;
  enqueuedStepId?: string; // Tracks which step email was enqueued for (prevents duplicates)
  status: 'active' | 'replied' | 'booked' | 'unsubscribed' | 'bounced' | 'completed';
  lastSentAt?: string;
  nextScheduledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export async function startSequenceRun(params: {
  tenantId: string;
  sequenceId: string;
  leadIds: string[];
}): Promise<SequenceRun> {
  const { tenantId, sequenceId, leadIds } = params;
  
  // Get sequence
  const sequenceRef = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("sequences")
    .doc(sequenceId);
  
  const sequenceDoc = await sequenceRef.get();
  if (!sequenceDoc.exists) {
    throw new Error("Sequence not found");
  }
  
  const sequence = sequenceDoc.data();
  if (!sequence?.active) {
    throw new Error("Sequence is not active");
  }
  
  // Create run
  const runRef = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("runs")
    .doc();
  
  const now = new Date().toISOString();
  const runData: Omit<SequenceRun, 'id'> = {
    tenantId,
    sequenceId,
    leadIds,
    status: 'active',
    stats: {
      totalLeads: leadIds.length,
      contacted: 0,
      replied: 0,
      booked: 0,
      unsubscribed: 0,
    },
    startedAt: now,
    createdAt: now,
  };
  
  await runRef.set(runData);
  
  // Create progress tracking for each lead
  const batch = adminDb.batch();
  
  for (const leadId of leadIds) {
    const progressRef = adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("leadProgress")
      .doc(`${runRef.id}_${leadId}`);
    
    const progressData: LeadProgress = {
      leadId,
      runId: runRef.id,
      sequenceId,
      currentStepIndex: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    
    batch.set(progressRef, progressData);
  }
  
  await batch.commit();
  
  // Schedule first step for all leads
  await scheduleNextSteps(tenantId, runRef.id);
  
  return {
    id: runRef.id,
    ...runData,
  };
}

export async function scheduleNextSteps(tenantId: string, runId: string): Promise<void> {
  // Get run
  const runRef = adminDb.collection("tenants").doc(tenantId).collection("runs").doc(runId);
  const runDoc = await runRef.get();
  
  if (!runDoc.exists) {
    throw new Error("Run not found");
  }
  
  const run = runDoc.data();
  if (run?.status !== 'active') {
    return; // Run is paused or completed
  }
  
  // Get sequence
  const sequenceRef = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("sequences")
    .doc(run.sequenceId);
  
  const sequenceDoc = await sequenceRef.get();
  const sequence = sequenceDoc.data();
  
  if (!sequence?.steps) {
    return;
  }
  
  // Get all active lead progress
  const progressSnapshot = await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("leadProgress")
    .where("runId", "==", runId)
    .where("status", "==", "active")
    .get();
  
  const now = new Date();
  
  for (const progressDoc of progressSnapshot.docs) {
    // Process steps in a loop until we hit a blocker (future wait or enqueue email)
    let maxIterations = 20; // Prevent infinite loops
    
    while (maxIterations-- > 0) {
      // Reload progress data to get fresh state after each update
      const freshProgressDoc = await progressDoc.ref.get();
      const progress = freshProgressDoc.data();
      
      if (!progress) break;
      
      const currentStepIndex = progress.currentStepIndex;
      
      // Check if there are more steps
      if (currentStepIndex >= sequence.steps.length) {
        // Sequence complete for this lead
        await progressDoc.ref.update({
          status: 'completed',
          updatedAt: new Date().toISOString(),
        });
        break;
      }
      
      const step = sequence.steps[currentStepIndex];
      
      if (step.type === 'wait') {
        // Calculate next send time based on wait duration
        const waitHours = step.waitHours || 24;
        
        // Use existing nextScheduledAt if set (prevents recalculation)
        // Otherwise calculate from lastSentAt or progress createdAt
        let nextScheduledAt: Date;
        if (progress.nextScheduledAt) {
          nextScheduledAt = new Date(progress.nextScheduledAt);
        } else {
          const anchor = progress.lastSentAt 
            ? new Date(progress.lastSentAt) 
            : new Date(progress.createdAt);
          nextScheduledAt = new Date(anchor.getTime() + waitHours * 60 * 60 * 1000);
        }
        
        // If wait is complete, advance to next step and continue loop
        if (nextScheduledAt <= now) {
          await progressDoc.ref.update({
            currentStepIndex: currentStepIndex + 1,
            nextScheduledAt: null,
            updatedAt: new Date().toISOString(),
          });
          // Continue loop - next iteration will reload fresh data
          continue;
        } else {
          // Wait is still pending, save scheduled time and stop processing
          // Only update if we just calculated it (not already set)
          if (!progress.nextScheduledAt) {
            await progressDoc.ref.update({
              nextScheduledAt: nextScheduledAt.toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
          break; // Stop processing this lead until wait expires
        }
      } else if (step.type === 'email') {
        // Check if already enqueued for this step (prevent duplicates)
        if (progress.enqueuedStepId === step.id) {
          // Already enqueued, waiting for send completion
          break;
        }
        
        // Schedule email send
        const leadRef = adminDb
          .collection("tenants")
          .doc(tenantId)
          .collection("leads")
          .doc(progress.leadId);
        
        const leadDoc = await leadRef.get();
        const lead = leadDoc.data();
        
        if (!lead) {
          break;
        }
        
        // Check suppression list before enqueuing
        const { isEmailSuppressed } = await import('./suppression');
        const leadEmail = lead.contact?.email;
        
        if (!leadEmail) {
          console.warn(`Lead ${progress.leadId} has no email, skipping sequence`);
          // Mark as failed/bounced since no email
          await progressDoc.ref.update({
            status: 'bounced',
            updatedAt: new Date().toISOString(),
          });
          break;
        }
        
        const suppressionCheck = await isEmailSuppressed(tenantId, leadEmail);
        if (suppressionCheck.suppressed) {
          console.log(`Email ${leadEmail} is suppressed (${suppressionCheck.reason}), stopping sequence`);
          // Mark progress as appropriate status based on suppression reason
          const status = suppressionCheck.reason === 'unsubscribe' ? 'unsubscribed' : 'bounced';
          await progressDoc.ref.update({
            status,
            updatedAt: new Date().toISOString(),
          });
          break;
        }
        
        // Calculate send time with quiet hours and send window
        const baseTime = progress.lastSentAt ? new Date(progress.lastSentAt) : now;
        const sendTime = calculateSendTime(
          baseTime,
          step.sendWindow ? {
            days: step.sendWindow.days,
            startHour: step.sendWindow.startHour,
            endHour: step.sendWindow.endHour,
          } : undefined,
          step.quietHours ? {
            start: step.quietHours.start,
            end: step.quietHours.end,
          } : undefined,
          // TODO: Get lead's timezone from lead.contact.timezone
          'America/New_York'
        );
        
        // Enqueue email
        try {
          await enqueueEmail({
            tenantId,
            leadId: progress.leadId,
            sequenceId: run.sequenceId,
            stepId: step.id,
            templateId: step.templateId || '',
            scheduledFor: sendTime,
          });
          
          // Mark as enqueued for this step (prevents duplicate enqueues)
          await progressDoc.ref.update({
            enqueuedStepId: step.id,
            nextScheduledAt: sendTime.toISOString(),
            updatedAt: new Date().toISOString(),
          });
          
          // Email enqueued, stop processing this lead for now
          break;
        } catch (error) {
          console.error(`Failed to enqueue email for lead ${progress.leadId}:`, error);
          break; // Stop on error
        }
      }
    } // End while loop processing steps for this lead
  } // End for loop over all leads
}

export async function markLeadAsReplied(params: {
  tenantId: string;
  leadId: string;
  runId: string;
  replyCategory?: 'positive' | 'neutral' | 'ooo' | 'not_interested' | 'booked';
}): Promise<void> {
  const { tenantId, leadId, runId, replyCategory } = params;
  
  // Update lead progress
  const progressRef = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("leadProgress")
    .doc(`${runId}_${leadId}`);
  
  const status = replyCategory === 'booked' ? 'booked' : 'replied';
  
  await progressRef.update({
    status,
    updatedAt: new Date().toISOString(),
  });
  
  // Update run stats
  const runRef = adminDb.collection("tenants").doc(tenantId).collection("runs").doc(runId);
  const { FieldValue } = await import('firebase-admin/firestore');
  
  await runRef.update({
    [`stats.${status}`]: FieldValue.increment(1),
  });
  
  // Update lead status
  await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("leads")
    .doc(leadId)
    .update({
      status: status === 'booked' ? 'booked' : 'replied',
      lastContactedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
}

export async function markStepComplete(params: {
  tenantId: string;
  leadId: string;
  runId: string;
}): Promise<void> {
  const { tenantId, leadId, runId } = params;
  
  const progressRef = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("leadProgress")
    .doc(`${runId}_${leadId}`);
  
  const progressDoc = await progressRef.get();
  const progress = progressDoc.data();
  
  if (!progress) return;
  
  // Move to next step and clear enqueued marker
  await progressRef.update({
    currentStepIndex: progress.currentStepIndex + 1,
    enqueuedStepId: null,
    lastSentAt: new Date().toISOString(),
    nextScheduledAt: null,
    updatedAt: new Date().toISOString(),
  });
  
  // Update run stats
  const runRef = adminDb.collection("tenants").doc(tenantId).collection("runs").doc(runId);
  const { FieldValue } = await import('firebase-admin/firestore');
  
  await runRef.update({
    'stats.contacted': FieldValue.increment(1),
  });
  
  // Immediately schedule next steps for this lead
  await scheduleNextSteps(tenantId, runId);
}

export async function pauseRun(tenantId: string, runId: string): Promise<void> {
  const runRef = adminDb.collection("tenants").doc(tenantId).collection("runs").doc(runId);
  
  await runRef.update({
    status: 'paused',
  });
}

export async function resumeRun(tenantId: string, runId: string): Promise<void> {
  const runRef = adminDb.collection("tenants").doc(tenantId).collection("runs").doc(runId);
  
  await runRef.update({
    status: 'active',
  });
  
  // Reschedule next steps
  await scheduleNextSteps(tenantId, runId);
}
