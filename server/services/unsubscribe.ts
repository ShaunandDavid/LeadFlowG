import { adminDb } from "../lib/firebase-admin";
import { suppressEmail } from "./suppression";
import crypto from "crypto";

/**
 * Generate unsubscribe token for a lead
 */
export function generateUnsubscribeToken(params: {
  tenantId: string;
  leadId: string;
  email: string;
}): string {
  const { tenantId, leadId, email } = params;
  
  // Create deterministic token from tenant + lead + email
  const data = `${tenantId}:${leadId}:${email}`;
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  
  // Encode as base64 for URL safety
  return Buffer.from(`${tenantId}:${leadId}:${hash}`).toString('base64url');
}

/**
 * Verify and decode unsubscribe token
 */
export async function verifyUnsubscribeToken(token: string): Promise<{
  valid: boolean;
  tenantId?: string;
  leadId?: string;
}> {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    
    if (parts.length !== 3) {
      return { valid: false };
    }
    
    const [tenantId, leadId, providedHash] = parts;
    
    // Verify the token by getting the lead email and recomputing the hash
    const { adminDb } = await import('../lib/firebase-admin');
    const leadDoc = await adminDb
      .collection("tenants")
      .doc(tenantId)
      .collection("leads")
      .doc(leadId)
      .get();
    
    if (!leadDoc.exists) {
      return { valid: false };
    }
    
    const lead = leadDoc.data();
    const email = lead?.contact?.email;
    
    if (!email) {
      return { valid: false };
    }
    
    // Recompute hash and verify
    const data = `${tenantId}:${leadId}:${email}`;
    const expectedHash = crypto.createHash('sha256').update(data).digest('hex');
    
    if (expectedHash !== providedHash) {
      return { valid: false };
    }
    
    return { valid: true, tenantId, leadId };
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Process unsubscribe request
 */
export async function processUnsubscribe(params: {
  token: string;
  userAgent?: string;
  ipAddress?: string;
}): Promise<{ success: boolean; email?: string; error?: string }> {
  const { token, userAgent, ipAddress } = params;
  
  const decoded = await verifyUnsubscribeToken(token);
  if (!decoded.valid || !decoded.tenantId || !decoded.leadId) {
    return { success: false, error: 'Invalid unsubscribe token' };
  }
  
  const { tenantId, leadId } = decoded;
  
  // Get lead
  const leadDoc = await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("leads")
    .doc(leadId)
    .get();
  
  if (!leadDoc.exists) {
    return { success: false, error: 'Lead not found' };
  }
  
  const lead = leadDoc.data();
  const email = lead?.contact?.email;
  
  if (!email) {
    return { success: false, error: 'Email not found' };
  }
  
  // Add to suppression list
  await suppressEmail({
    tenantId,
    email,
    reason: 'unsubscribe',
    source: 'unsubscribe-link',
    metadata: {
      unsubscribeLink: token,
    },
  });

  // Record analytics event for unsubscribe
  const { recordEvent } = await import('../lib/events');
  await recordEvent({
    tenantId,
    leadId,
    type: 'unsubscribe',
    userAgent,
    ipAddress,
    timestamp: new Date().toISOString(),
    metadata: {
      email,
    },
  });
  
  // Log unsubscribe event
  await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("unsubscribeEvents")
    .add({
      leadId,
      email,
      token,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
      timestamp: new Date().toISOString(),
    });
  
  // Stop any active sequences for this lead
  const progressSnapshot = await adminDb
    .collection("tenants")
    .doc(tenantId)
    .collection("leadProgress")
    .where("leadId", "==", leadId)
    .where("status", "==", "active")
    .get();
  
  const batch = adminDb.batch();
  progressSnapshot.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    batch.update(doc.ref, {
      status: 'unsubscribed',
      updatedAt: new Date().toISOString(),
    });
  });
  
  await batch.commit();
  
  return { success: true, email };
}

/**
 * Generate unsubscribe link for email template
 */
export function generateUnsubscribeLink(params: {
  tenantId: string;
  leadId: string;
  email: string;
  baseUrl?: string;
}): string {
  const { tenantId, leadId, email, baseUrl } = params;
  
  const token = generateUnsubscribeToken({ tenantId, leadId, email });
  const domain = baseUrl || process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
  const protocol = domain.includes('localhost') ? 'http' : 'https';
  
  return `${protocol}://${domain}/unsubscribe?token=${token}`;
}
