import { google } from 'googleapis';
import { adminDb } from '../lib/firebase-admin';
import { getGmailClient } from './google-oauth';
import { suppressEmail } from './suppression';

interface BounceDetection {
  email: string;
  bounceType: 'hard' | 'soft';
  reason: string;
  messageId?: string;
}

/**
 * Parse Gmail message to detect bounce notifications
 */
function parseBounceMessage(message: any): BounceDetection | null {
  try {
    const headers = message.payload?.headers || [];
    const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
    const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
    
    // Check if this is a bounce notification
    const isBounce = 
      from.toLowerCase().includes('mailer-daemon') ||
      from.toLowerCase().includes('postmaster') ||
      subject.toLowerCase().includes('delivery status notification') ||
      subject.toLowerCase().includes('undelivered') ||
      subject.toLowerCase().includes('returned mail') ||
      subject.toLowerCase().includes('delivery failure');
    
    if (!isBounce) {
      return null;
    }

    // Extract email body
    let body = '';
    if (message.payload?.body?.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    } else if (message.payload?.parts) {
      for (const part of message.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
    }

    // Extract bounced email address
    const emailMatch = body.match(/(?:to|recipient):\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i) ||
      body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    
    if (!emailMatch) {
      return null;
    }

    const bouncedEmail = emailMatch[1].toLowerCase();

    // Determine bounce type (hard vs soft)
    const hardBounceIndicators = [
      'user unknown',
      'does not exist',
      'invalid recipient',
      'no such user',
      'recipient address rejected',
      '550',
      '5.1.1',
    ];

    const softBounceIndicators = [
      'mailbox full',
      'quota exceeded',
      'temporarily unavailable',
      '452',
      '4.2.2',
    ];

    let bounceType: 'hard' | 'soft' = 'hard'; // Default to hard
    const lowerBody = body.toLowerCase();

    if (softBounceIndicators.some(indicator => lowerBody.includes(indicator))) {
      bounceType = 'soft';
    }

    let reason = 'Email bounced';
    if (lowerBody.includes('user unknown') || lowerBody.includes('does not exist')) {
      reason = 'User does not exist';
    } else if (lowerBody.includes('mailbox full')) {
      reason = 'Mailbox full';
    } else if (lowerBody.includes('invalid recipient')) {
      reason = 'Invalid recipient';
    }

    return {
      email: bouncedEmail,
      bounceType,
      reason,
      messageId: message.id,
    };
  } catch (error) {
    console.error('Error parsing bounce message:', error);
    return null;
  }
}

/**
 * Process a bounce notification
 */
async function processBounce(params: {
  tenantId: string;
  bounce: BounceDetection;
}): Promise<void> {
  const { tenantId, bounce } = params;

  console.log(`Processing ${bounce.bounceType} bounce for ${bounce.email}: ${bounce.reason}`);

  // Add to suppression list (only hard bounces should be permanently suppressed)
  if (bounce.bounceType === 'hard') {
    await suppressEmail({
      tenantId,
      email: bounce.email,
      reason: 'bounce',
      source: 'bounce-detector',
      metadata: {
        bounceType: bounce.bounceType,
      },
    });
  }

  // Log bounce event
  await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('bounceEvents')
    .add({
      email: bounce.email,
      bounceType: bounce.bounceType,
      reason: bounce.reason,
      messageId: bounce.messageId,
      timestamp: new Date().toISOString(),
    });
}

/**
 * Check for bounce messages in Gmail
 */
export async function checkForBounces(tenantId: string): Promise<{ processed: number }> {
  try {
    // Get Gmail client
    const gmail = await getGmailClient(tenantId);
    if (!gmail) {
      return { processed: 0 };
    }

    // Search for bounce messages in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const query = `from:(mailer-daemon OR postmaster) after:${Math.floor(oneDayAgo.getTime() / 1000)}`;

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50,
    });

    const messages = response.data.messages || [];
    let processed = 0;

    for (const message of messages) {
      try {
        // Get full message details
        const fullMessage = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
        });

        // Parse bounce
        const bounce = parseBounceMessage(fullMessage.data);
        if (bounce) {
          await processBounce({ tenantId, bounce });
          processed++;
        }
      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error);
      }
    }

    return { processed };
  } catch (error: any) {
    // Silently skip if Gmail not connected or API error
    if (error.code === 401 || error.message?.includes('invalid_grant')) {
      console.log(`Gmail not connected for tenant ${tenantId}`);
      return { processed: 0 };
    }
    console.error('Error checking for bounces:', error);
    return { processed: 0 };
  }
}

/**
 * Check all tenants for bounces
 */
export async function checkAllTenantsForBounces(): Promise<void> {
  try {
    const tenantsSnapshot = await adminDb.collection('tenants').get();

    for (const tenantDoc of tenantsSnapshot.docs) {
      try {
        const result = await checkForBounces(tenantDoc.id);
        if (result.processed > 0) {
          console.log(`Processed ${result.processed} bounces for tenant ${tenantDoc.id}`);
        }
      } catch (error) {
        console.error(`Error checking bounces for tenant ${tenantDoc.id}:`, error);
      }
    }
  } catch (error: any) {
    // Silently skip if Firestore not configured
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('metadata') || error.code === 2) {
      return;
    }
    console.error('Error checking all tenants for bounces:', error);
  }
}

/**
 * Start bounce detection worker
 */
export function startBounceDetector(intervalMs: number = 300000): NodeJS.Timeout {
  console.log('Bounce detector started');
  
  // Check immediately
  checkAllTenantsForBounces().catch(console.error);

  // Then check on interval (default: every 5 minutes)
  const interval = setInterval(() => {
    checkAllTenantsForBounces().catch(console.error);
  }, intervalMs);

  return interval;
}
