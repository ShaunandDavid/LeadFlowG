import { adminDb } from "../lib/firebase-admin";
import { suppressEmail } from "./suppression";

export interface BounceEvent {
  leadId: string;
  email: string;
  bounceType: 'hard' | 'soft' | 'transient';
  bounceSubType?: string;
  diagnosticCode?: string;
  timestamp: string;
  rawEvent?: any;
}

export interface ComplaintEvent {
  leadId: string;
  email: string;
  complaintType: string;
  timestamp: string;
  feedbackId?: string;
  rawEvent?: any;
}

/**
 * Process bounce notification
 */
export async function processBounce(params: {
  tenantId: string;
  bounce: BounceEvent;
}): Promise<void> {
  const { tenantId, bounce } = params;
  
  // Log bounce event
  await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("bounceEvents")
    .add({
      ...bounce,
      processedAt: new Date().toISOString(),
    });
  
  // Hard bounces and permanent failures -> suppress immediately
  if (bounce.bounceType === 'hard') {
    await suppressEmail({
      tenantId,
      email: bounce.email,
      reason: 'bounce',
      source: 'bounce-handler',
      metadata: {
        bounceType: 'hard',
      },
    });
    
    // Update lead status
    const leadsSnapshot = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("leads")
      .where("contact.email", "==", bounce.email.toLowerCase())
      .get();
    
    const batch = adminDb.batch();
    leadsSnapshot.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      batch.update(doc.ref, {
        status: 'bounced',
        'metadata.bounceType': 'hard',
        'metadata.lastBounceAt': new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    
    await batch.commit();
  } else if (bounce.bounceType === 'soft') {
    // Soft bounces -> track count, suppress after threshold
    const email = bounce.email.toLowerCase();
    const bounceCountRef = adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("bounceTracking")
      .doc(email);
    
    const bounceCountDoc = await bounceCountRef.get();
    const currentCount = bounceCountDoc.exists ? (bounceCountDoc.data()?.count || 0) : 0;
    const newCount = currentCount + 1;
    
    await bounceCountRef.set({
      email,
      count: newCount,
      lastBounceAt: new Date().toISOString(),
      firstBounceAt: bounceCountDoc.exists 
        ? bounceCountDoc.data()?.firstBounceAt 
        : new Date().toISOString(),
    });
    
    // Suppress after 3 soft bounces
    if (newCount >= 3) {
      await suppressEmail({
        tenantId,
        email,
        reason: 'bounce',
        source: 'bounce-handler',
        metadata: {
          bounceType: 'soft',
        },
      });
    }
  }
  
  // Stop any active sequences for this email
  if (bounce.bounceType === 'hard') {
    const progressSnapshot = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("leadProgress")
      .where("status", "==", "active")
      .get();
    
    const batch = adminDb.batch();
    for (const progressDoc of progressSnapshot.docs) {
      const progress = progressDoc.data();
      const leadDoc = await adminDb
        .collection("tenants")
        .doc(tenantId)
        .collection("leads")
        .doc(progress.leadId)
        .get();
      
      const lead = leadDoc.data();
      if (lead?.contact?.email?.toLowerCase() === bounce.email.toLowerCase()) {
        batch.update(progressDoc.ref, {
          status: 'bounced',
          updatedAt: new Date().toISOString(),
        });
      }
    }
    
    await batch.commit();
  }
}

/**
 * Process complaint notification (spam report)
 */
export async function processComplaint(params: {
  tenantId: string;
  complaint: ComplaintEvent;
}): Promise<void> {
  const { tenantId, complaint } = params;
  
  // Log complaint event
  await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("complaintEvents")
    .add({
      ...complaint,
      processedAt: new Date().toISOString(),
    });
  
  // Suppress immediately - complaints are serious
  await suppressEmail({
    tenantId,
    email: complaint.email,
    reason: 'complaint',
    source: 'complaint-handler',
    metadata: {
      complaintType: complaint.complaintType,
    },
  });
  
  // Stop all active sequences for this email
  const progressSnapshot = await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("leadProgress")
    .where("status", "==", "active")
    .get();
  
  const batch = adminDb.batch();
  for (const progressDoc of progressSnapshot.docs) {
    const progress = progressDoc.data();
    const leadDoc = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("leads")
      .doc(progress.leadId)
      .get();
    
    const lead = leadDoc.data();
    if (lead?.contact?.email?.toLowerCase() === complaint.email.toLowerCase()) {
      batch.update(progressDoc.ref, {
        status: 'unsubscribed',
        updatedAt: new Date().toISOString(),
      });
    }
  }
  
  await batch.commit();
}

/**
 * Get bounce statistics for a tenant
 */
export async function getBounceStats(tenantId: string): Promise<{
  hardBounces: number;
  softBounces: number;
  complaints: number;
  suppressedEmails: number;
}> {
  const [hardBounces, softBounces, complaints, suppressed] = await Promise.all([
    adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("bounceEvents")
      .where("bounceType", "==", "hard")
      .count()
      .get(),
    adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("bounceEvents")
      .where("bounceType", "==", "soft")
      .count()
      .get(),
    adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("complaintEvents")
      .count()
      .get(),
    adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("suppressions")
      .count()
      .get(),
  ]);
  
  return {
    hardBounces: hardBounces.data().count,
    softBounces: softBounces.data().count,
    complaints: complaints.data().count,
    suppressedEmails: suppressed.data().count,
  };
}
