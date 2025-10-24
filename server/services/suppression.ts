import { adminDb } from "../lib/firebase-admin";

export interface SuppressionEntry {
  email: string;
  reason: 'unsubscribe' | 'bounce' | 'complaint' | 'manual';
  source?: string; // e.g., "sequence:abc123", "manual", "gmail-webhook"
  addedAt: string;
  metadata?: {
    bounceType?: 'hard' | 'soft';
    complaintType?: string;
    unsubscribeLink?: string;
  };
}

/**
 * Add email to tenant suppression list
 */
export async function suppressEmail(params: {
  tenantId: string;
  email: string;
  reason: 'unsubscribe' | 'bounce' | 'complaint' | 'manual';
  source?: string;
  metadata?: SuppressionEntry['metadata'];
}): Promise<void> {
  const { tenantId, email, reason, source, metadata } = params;
  
  const normalizedEmail = email.toLowerCase().trim();
  
  const suppressionRef = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("suppressions")
    .doc(normalizedEmail);
  
  await suppressionRef.set({
    email: normalizedEmail,
    reason,
    source: source || 'manual',
    addedAt: new Date().toISOString(),
    metadata: metadata || {},
  });
  
  // Update lead status if exists
  const leadsSnapshot = await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("leads")
    .where("contact.email", "==", normalizedEmail)
    .get();
  
  const batch = adminDb.batch();
  leadsSnapshot.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    batch.update(doc.ref, {
      status: reason === 'unsubscribe' ? 'unsubscribed' : 'bounced',
      updatedAt: new Date().toISOString(),
    });
  });
  
  await batch.commit();
}

/**
 * Check if email is suppressed
 */
export async function isEmailSuppressed(
  tenantId: string,
  email: string
): Promise<{ suppressed: boolean; reason?: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  
  // Check tenant-level suppression
  const tenantSuppressionDoc = await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("suppressions")
    .doc(normalizedEmail)
    .get();
  
  if (tenantSuppressionDoc.exists) {
    const data = tenantSuppressionDoc.data();
    return { suppressed: true, reason: data?.reason };
  }
  
  // Check global suppression list (optional - for platform-wide blocks)
  const globalSuppressionDoc = await adminDb
    .collection("globalSuppressions")
    .doc(normalizedEmail)
    .get();
  
  if (globalSuppressionDoc.exists) {
    const data = globalSuppressionDoc.data();
    return { suppressed: true, reason: data?.reason || 'global' };
  }
  
  return { suppressed: false };
}

/**
 * Remove email from suppression list
 */
export async function unsuppressEmail(
  tenantId: string,
  email: string
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  
  await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("suppressions")
    .doc(normalizedEmail)
    .delete();
}

/**
 * Get all suppressed emails for a tenant
 */
export async function getSuppressionList(params: {
  tenantId: string;
  limit?: number;
  startAfter?: string;
}): Promise<SuppressionEntry[]> {
  const { tenantId, limit = 100, startAfter } = params;
  
  let query = adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("suppressions")
    .orderBy("addedAt", "desc")
    .limit(limit);
  
  if (startAfter) {
    query = query.startAfter(startAfter);
  }
  
  const snapshot = await query.get();
  return snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as SuppressionEntry);
}

/**
 * Bulk suppress emails
 */
export async function bulkSuppressEmails(params: {
  tenantId: string;
  emails: string[];
  reason: 'unsubscribe' | 'bounce' | 'complaint' | 'manual';
  source?: string;
}): Promise<{ suppressed: number }> {
  const { tenantId, emails, reason, source } = params;
  
  let batch = adminDb.batch();
  let count = 0;
  let batchCount = 0;
  
  for (const email of emails) {
    const normalizedEmail = email.toLowerCase().trim();
    const suppressionRef = adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("suppressions")
      .doc(normalizedEmail);
    
    batch.set(suppressionRef, {
      email: normalizedEmail,
      reason,
      source: source || 'bulk-manual',
      addedAt: new Date().toISOString(),
      metadata: {},
    });
    
    count++;
    batchCount++;
    
    // Firestore batch limit is 500
    if (batchCount >= 500) {
      await batch.commit();
      // Create fresh batch for next chunk
      batch = adminDb.batch();
      batchCount = 0;
    }
  }
  
  // Commit remaining writes
  if (batchCount > 0) {
    await batch.commit();
  }
  
  return { suppressed: count };
}

/**
 * Alias for bulkSuppressEmails (used by reply classifier)
 */
export async function addToSuppression(params: {
  tenantId: string;
  emails: string[];
  reason: string;
  source?: string;
}): Promise<void> {
  await bulkSuppressEmails({
    ...params,
    reason: params.reason as any,
  });
}
