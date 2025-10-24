// Email worker - processes the send queue and sends emails via Gmail
import { adminDb } from '../lib/firebase-admin';
import { getNextBatch, markAsProcessing, markAsSent, markAsFailed } from './send-queue';
import { sendViaGmail, isGmailConnected } from './google-oauth';
import { substituteVariables } from './template';
import { generateUnsubscribeToken } from './unsubscribe';

interface QueuedEmail {
  id: string;
  tenantId: string;
  leadId: string;
  sequenceId: string;
  stepId: string;
  templateId: string;
  scheduledFor: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  idempotencyKey: string;
  attemptCount?: number;
  error?: string;
  createdAt: string;
}

/**
 * Process a single email from the queue
 */
async function processSingleEmail(email: QueuedEmail): Promise<void> {
  const { tenantId, leadId, templateId, id: emailId } = email;

  try {
    // Check if Gmail is connected
    const connected = await isGmailConnected(tenantId);
    if (!connected) {
      throw new Error('Gmail not connected for tenant');
    }

    // Get lead data
    const leadDoc = await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('leads')
      .doc(leadId)
      .get();

    if (!leadDoc.exists) {
      throw new Error('Lead not found');
    }

    const lead = leadDoc.data();
    if (!lead?.contact?.email) {
      throw new Error('Lead has no email address');
    }

    // Get template
    const templateDoc = await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('templates')
      .doc(templateId)
      .get();

    if (!templateDoc.exists) {
      throw new Error('Template not found');
    }

    const template = templateDoc.data();
    if (!template) {
      throw new Error('Template data missing');
    }

    // Substitute variables in subject and body
    const subject = substituteVariables(template.subject || 'Hello', lead);
    const htmlBody = substituteVariables(template.body || '', lead);
    
    // Create text version (simple HTML strip)
    const textBody = htmlBody.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');

    // Generate unsubscribe URL
    const unsubscribeToken = generateUnsubscribeToken({
      tenantId,
      leadId,
      email: lead.contact.email,
    });

    const baseUrl = process.env.REPLIT_DOMAINS 
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
      : 'http://localhost:5000';
    
    const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${unsubscribeToken}`;

    // Add unsubscribe link to HTML body
    const htmlWithUnsubscribe = `
      ${htmlBody}
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
        <p>Don't want to receive these emails? <a href="${unsubscribeUrl}" style="color: #3b82f6;">Unsubscribe</a></p>
      </div>
    `;

    // Send via Gmail API
    const result = await sendViaGmail({
      tenantId,
      to: lead.contact.email,
      subject,
      htmlBody: htmlWithUnsubscribe,
      textBody: textBody + `\n\nUnsubscribe: ${unsubscribeUrl}`,
      unsubscribeUrl,
    });

    console.log(`Email sent successfully: ${result.messageId} to ${lead.contact.email}`);

    // Mark as sent and update lead
    await markAsSent(tenantId, emailId);

    // Update lead's lastContactedAt
    await leadDoc.ref.update({
      lastContactedAt: new Date().toISOString(),
      status: 'contacted',
    });

    // Mark step as complete in sequence engine (triggers next step)
    const { markStepComplete } = await import('./sequence-engine');
    await markStepComplete({
      tenantId,
      leadId,
      sequenceId: email.sequenceId,
      stepId: email.stepId,
    });

  } catch (error) {
    console.error(`Failed to send email ${emailId}:`, error);
    await markAsFailed(
      tenantId,
      emailId,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

/**
 * Process emails from the queue (batch processing)
 */
export async function processEmailQueue(batchSize: number = 10): Promise<void> {
  try {
    // Get all tenants
    const tenantsSnapshot = await adminDb.collection('tenants').get();

    for (const tenantDoc of tenantsSnapshot.docs) {
    const tenantId = tenantDoc.id;

    try {
      // Get batch of emails to send
      const batch = await getNextBatch(tenantId, batchSize);

      if (batch.length === 0) {
        continue; // No emails to send for this tenant
      }

      console.log(`Processing ${batch.length} emails for tenant ${tenantId}`);

      // Process emails sequentially (respecting rate limits)
      for (const email of batch) {
        // Try to claim the email
        const claimed = await markAsProcessing(tenantId, email.id);
        
        if (!claimed) {
          continue; // Already being processed by another worker
        }

        // Process the email
        await processSingleEmail(email as QueuedEmail);

        // Small delay to avoid overwhelming Gmail API
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`Error processing queue for tenant ${tenantId}:`, error);
    }
  }
  } catch (error: any) {
    // Silently skip if Firestore not configured (dev environment)
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('metadata') || error.code === 2) {
      return;
    }
    console.error('Error processing email queue:', error);
  }
}

/**
 * Start the email worker (call this from a cron job or interval)
 */
export function startEmailWorker(intervalMs: number = 60000): NodeJS.Timeout {
  console.log('Email worker started');
  
  // Process immediately
  processEmailQueue().catch(console.error);

  // Then process on interval
  const interval = setInterval(() => {
    processEmailQueue().catch(console.error);
  }, intervalMs);

  return interval;
}
