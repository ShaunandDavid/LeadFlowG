// Gmail monitoring service - polls for new replies and classifies them
import { getGmailClient } from './google-oauth';
import { classifyReply, processClassifiedReply } from './reply-classifier';
import { adminDb } from '../lib/firebase-admin';

interface GmailMonitorState {
  historyId: string;
  lastCheckedAt: string;
  email: string;
}

/**
 * Fetch and process new Gmail messages for a tenant
 */
export async function checkForNewReplies(tenantId: string): Promise<void> {
  try {
    const { gmail, email } = await getGmailClient(tenantId);

    // Get or initialize monitoring state
    const stateRef = adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('gmailMonitor')
      .doc('state');

    const stateDoc = await stateRef.get();
    let state: GmailMonitorState | null = stateDoc.exists
      ? (stateDoc.data() as GmailMonitorState)
      : null;

    // If no state, do initial fetch
    if (!state) {
      // Get current history ID
      const profile = await gmail.users.getProfile({ userId: 'me' });
      const historyId = profile.data.historyId;

      if (!historyId) {
        console.warn(`No historyId for tenant ${tenantId}`);
        return;
      }

      // Initialize state
      state = {
        historyId,
        lastCheckedAt: new Date().toISOString(),
        email,
      };

      await stateRef.set(state);
      console.log(`Initialized Gmail monitor for tenant ${tenantId}`);
      return;
    }

    // Fetch history since last check
    const historyResponse = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: state.historyId,
      historyTypes: ['messageAdded'],
      labelId: 'INBOX',
    });

    if (!historyResponse.data.history || historyResponse.data.history.length === 0) {
      // No new messages
      return;
    }

    // Process new messages
    for (const historyRecord of historyResponse.data.history) {
      if (!historyRecord.messagesAdded) continue;

      for (const messageAdded of historyRecord.messagesAdded) {
        const messageId = messageAdded.message?.id;
        if (!messageId) continue;

        // Fetch full message
        const message = await gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'full',
        });

        // Check if this is a reply to one of our sent emails
        const headers = message.data.payload?.headers || [];
        const inReplyTo = headers.find(h => h.name?.toLowerCase() === 'in-reply-to')?.value;
        const references = headers.find(h => h.name?.toLowerCase() === 'references')?.value;
        const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value;
        const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';

        if (!from) continue;

        // Extract email from "Name <email>" format
        const emailMatch = from.match(/<(.+)>/);
        const senderEmail = emailMatch ? emailMatch[1] : from;

        // Find lead by email
        const leadSnapshot = await adminDb
          .collection('tenants')
          .doc(tenantId)
          .collection('leads')
          .where('contact.email', '==', senderEmail)
          .limit(1)
          .get();

        if (leadSnapshot.empty) {
          console.log(`No lead found for reply from ${senderEmail}`);
          continue;
        }

        const leadDoc = leadSnapshot.docs[0];
        const leadId = leadDoc.id;

        // Get message body (prefer text/plain, fallback to HTML with tag stripping)
        let body = '';
        let htmlBody = '';
        
        const extractBody = (parts: any[]): void => {
          for (const part of parts) {
            if (part.parts) {
              // Recursive for nested multipart
              extractBody(part.parts);
            } else if (part.mimeType === 'text/plain' && part.body?.data) {
              body += Buffer.from(part.body.data, 'base64').toString('utf-8');
            } else if (part.mimeType === 'text/html' && part.body?.data) {
              htmlBody += Buffer.from(part.body.data, 'base64').toString('utf-8');
            }
          }
        };
        
        if (message.data.payload?.parts) {
          // Multipart message
          extractBody(message.data.payload.parts);
        } else if (message.data.payload?.body?.data) {
          // Simple message
          const mimeType = message.data.payload.mimeType;
          const bodyData = Buffer.from(message.data.payload.body.data, 'base64').toString('utf-8');
          if (mimeType === 'text/plain') {
            body = bodyData;
          } else if (mimeType === 'text/html') {
            htmlBody = bodyData;
          }
        }

        // If no plain text, strip HTML tags from HTML body
        if (!body && htmlBody) {
          body = htmlBody
            .replace(/<style[^>]*>.*?<\/style>/gis, '')
            .replace(/<script[^>]*>.*?<\/script>/gis, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
        }

        if (!body) {
          console.log(`No body found in message ${messageId}`);
          continue;
        }

        // Classify the reply
        console.log(`Classifying reply from ${senderEmail} for lead ${leadId}`);
        const classification = await classifyReply({
          subject,
          body,
        });

        console.log(`Classification: ${classification.category} (${classification.confidence}) - ${classification.reason}`);

        // Process the classified reply
        await processClassifiedReply({
          tenantId,
          leadId,
          classification,
          messageId,
          receivedAt: new Date(parseInt(message.data.internalDate || '0')).toISOString(),
        });
      }
    }

    // Update state with new historyId
    const newHistoryId = historyResponse.data.historyId;
    if (newHistoryId) {
      await stateRef.update({
        historyId: newHistoryId,
        lastCheckedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Gmail not connected')) {
      console.log(`Gmail not connected for tenant ${tenantId}, skipping reply check`);
    } else {
      console.error(`Error checking replies for tenant ${tenantId}:`, error);
    }
  }
}

/**
 * Poll for new replies across all tenants
 */
export async function pollAllTenantsForReplies(): Promise<void> {
  try {
    const tenantsSnapshot = await adminDb.collection('tenants').get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      const tenantId = tenantDoc.id;
      await checkForNewReplies(tenantId);
    }
  } catch (error: any) {
    // Silently skip if Firestore not configured (dev environment)
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('metadata') || error.code === 2) {
      return;
    }
    console.error('Error polling tenants for replies:', error);
  }
}

/**
 * Start the Gmail monitoring service
 */
export function startGmailMonitor(intervalMs: number = 60000): NodeJS.Timeout {
  console.log('Gmail monitor started');
  
  // Poll immediately
  pollAllTenantsForReplies().catch(console.error);

  // Then poll on interval
  const interval = setInterval(() => {
    pollAllTenantsForReplies().catch(console.error);
  }, intervalMs);

  return interval;
}
