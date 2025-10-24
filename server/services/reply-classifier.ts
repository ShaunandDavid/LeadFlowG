// Reply classification service - uses OpenAI to classify email replies
import { isOpenAIAvailable } from './openai';
import { adminDb } from '../lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import OpenAI from 'openai';

export type ReplyCategory = 'positive' | 'neutral' | 'ooo' | 'not_interested' | 'booked' | 'unsubscribe';

export interface ClassificationResult {
  category: ReplyCategory;
  confidence: number;
  reason: string;
  extractedInfo?: {
    proposedDate?: string;
    proposedTime?: string;
    oooUntil?: string;
  };
}

/**
 * Classify an email reply using OpenAI
 */
export async function classifyReply(params: {
  subject: string;
  body: string;
  threadHistory?: string;
}): Promise<ClassificationResult> {
  const { subject, body, threadHistory } = params;

  if (!isOpenAIAvailable()) {
    // Fallback to simple keyword matching
    return classifyWithKeywords(body);
  }

  const prompt = `You are an expert at analyzing email replies in a B2B sales context. Classify the following email reply into one of these categories:

Categories:
- "positive": Interested, wants more info, asking questions, engaging positively
- "neutral": Acknowledging receipt, non-committal responses
- "ooo": Out of office, vacation, unavailable auto-reply
- "not_interested": Explicit rejection, not interested, stop contacting
- "booked": Proposing specific meeting times, accepting meeting invite, ready to schedule
- "unsubscribe": Requesting to unsubscribe, opt-out, remove from list

Email Subject: ${subject}

Email Body:
${body}

${threadHistory ? `Previous Thread Context:\n${threadHistory}\n` : ''}

Analyze this reply and respond in JSON format:
{
  "category": "<one of the categories above>",
  "confidence": <0.0 to 1.0>,
  "reason": "<brief explanation>",
  "extractedInfo": {
    "proposedDate": "<YYYY-MM-DD if booked category>",
    "proposedTime": "<HH:MM if booked category>",
    "oooUntil": "<YYYY-MM-DD if ooo category>"
  }
}`;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that classifies email replies. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    
    // Normalize category (trim, lowercase, validate)
    const rawCategory = (result.category || 'neutral').toString().trim().toLowerCase();
    const validCategories: ReplyCategory[] = ['positive', 'neutral', 'ooo', 'not_interested', 'booked', 'unsubscribe'];
    const category: ReplyCategory = validCategories.includes(rawCategory as ReplyCategory) 
      ? (rawCategory as ReplyCategory)
      : 'neutral';
    
    return {
      category,
      confidence: result.confidence || 0.5,
      reason: result.reason || 'AI classification',
      extractedInfo: result.extractedInfo,
    };
  } catch (error) {
    console.error('OpenAI classification failed:', error);
    return classifyWithKeywords(body);
  }
}

/**
 * Fallback keyword-based classification
 */
function classifyWithKeywords(body: string): ClassificationResult {
  const lowerBody = body.toLowerCase();

  // Unsubscribe detection
  const unsubKeywords = ['unsubscribe', 'opt out', 'opt-out', 'remove me', 'stop emailing', 'stop sending'];
  if (unsubKeywords.some(kw => lowerBody.includes(kw))) {
    return {
      category: 'unsubscribe',
      confidence: 0.95,
      reason: 'Contains unsubscribe keywords',
    };
  }

  // OOO detection
  const oooKeywords = ['out of office', 'out of the office', 'on vacation', 'away from', 'auto-reply', 'automatic reply'];
  if (oooKeywords.some(kw => lowerBody.includes(kw))) {
    return {
      category: 'ooo',
      confidence: 0.9,
      reason: 'Out of office auto-reply detected',
    };
  }

  // Not interested detection
  const notInterestedKeywords = ['not interested', 'no thank', 'no thanks', 'not at this time', 'not now', 'pass'];
  if (notInterestedKeywords.some(kw => lowerBody.includes(kw))) {
    return {
      category: 'not_interested',
      confidence: 0.85,
      reason: 'Contains rejection keywords',
    };
  }

  // Booked/scheduling detection
  const bookingKeywords = ['let\'s schedule', 'book a meeting', 'calendar', 'available on', 'meet on', 'tuesday at', 'monday at'];
  if (bookingKeywords.some(kw => lowerBody.includes(kw))) {
    return {
      category: 'booked',
      confidence: 0.8,
      reason: 'Contains scheduling keywords',
    };
  }

  // Positive engagement
  const positiveKeywords = ['interested', 'tell me more', 'more information', 'sounds good', 'yes', 'sure', 'absolutely'];
  if (positiveKeywords.some(kw => lowerBody.includes(kw))) {
    return {
      category: 'positive',
      confidence: 0.75,
      reason: 'Contains positive engagement keywords',
    };
  }

  return {
    category: 'neutral',
    confidence: 0.5,
    reason: 'No clear indicators detected',
  };
}

/**
 * Process a classified reply and update lead status
 */
export async function processClassifiedReply(params: {
  tenantId: string;
  leadId: string;
  classification: ClassificationResult;
  messageId: string;
  receivedAt: string;
}): Promise<void> {
  const { tenantId, leadId, classification, messageId, receivedAt } = params;

  const leadRef = adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('leads')
    .doc(leadId);

  const leadDoc = await leadRef.get();
  if (!leadDoc.exists) {
    console.warn(`Lead ${leadId} not found for reply processing`);
    return;
  }

  const lead = leadDoc.data();

  // Update lead based on classification
  const updates: any = {
    lastReplyAt: receivedAt,
    lastReplyCategory: classification.category,
  };

  // Handle each category
  switch (classification.category) {
    case 'unsubscribe':
      updates.status = 'unsubscribed';
      // Add to suppression list
      const { addToSuppression } = await import('./suppression');
      if (lead?.contact?.email) {
        await addToSuppression({
          tenantId,
          emails: [lead.contact.email],
          reason: 'unsubscribe',
          source: 'reply_classifier',
        });
      }
      break;

    case 'not_interested':
      updates.status = 'unsubscribed'; // Treat as unsubscribed
      if (lead?.contact?.email) {
        const { addToSuppression } = await import('./suppression');
        await addToSuppression({
          tenantId,
          emails: [lead.contact.email],
          reason: 'not_interested',
          source: 'reply_classifier',
        });
      }
      break;

    case 'booked':
      updates.status = 'booked';
      break;

    case 'positive':
      updates.status = 'replied';
      break;

    case 'ooo':
      // Don't change status, but we'll handle rescheduling separately
      updates.oooDetected = true;
      updates.oooDetectedAt = receivedAt;
      if (classification.extractedInfo?.oooUntil) {
        updates.oooUntil = classification.extractedInfo.oooUntil;
      }
      break;

    case 'neutral':
      updates.status = 'replied';
      break;
  }

  await leadRef.update(updates);

  // Record analytics event for reply
  const { recordEvent } = await import('../lib/events.js');
  await recordEvent({
    tenantId,
    leadId,
    type: classification.category === 'booked' ? 'booked' : 'reply',
    messageId,
    timestamp: receivedAt,
    metadata: {
      category: classification.category,
      confidence: classification.confidence,
      reason: classification.reason,
    },
  });

  // Log the reply event
  await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('events')
    .add({
      type: 'reply_classified',
      tenantId,
      leadId,
      category: classification.category,
      confidence: classification.confidence,
      reason: classification.reason,
      messageId,
      createdAt: receivedAt,
    });

  // Update sequence progress if lead is in a sequence
  const progressSnapshot = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('leadProgress')
    .where('leadId', '==', leadId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (!progressSnapshot.empty) {
    const progressDoc = progressSnapshot.docs[0];
    
    if (classification.category === 'unsubscribe' || classification.category === 'not_interested') {
      // Stop the sequence
      await progressDoc.ref.update({
        status: 'unsubscribed',
        updatedAt: new Date().toISOString(),
      });
    } else if (classification.category === 'booked') {
      // Mark as completed with success
      await progressDoc.ref.update({
        status: 'booked',
        updatedAt: new Date().toISOString(),
      });
    } else if (classification.category === 'ooo') {
      // Reschedule next step by 7 days
      const nextScheduledAt = progressDoc.data()?.nextScheduledAt;
      if (nextScheduledAt) {
        const currentDate = new Date(nextScheduledAt);
        const newDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        await progressDoc.ref.update({
          nextScheduledAt: newDate.toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    } else if (classification.category === 'positive') {
      // Mark as replied
      await progressDoc.ref.update({
        status: 'replied',
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // Update sequence stats
  const runSnapshot = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('runs')
    .where('leadIds', 'array-contains', leadId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (!runSnapshot.empty) {
    const runDoc = runSnapshot.docs[0];
    const updateField = classification.category === 'booked' ? 'stats.booked' : 'stats.replied';
    
    await runDoc.ref.update({
      [updateField]: FieldValue.increment(1),
    });
  }
}
