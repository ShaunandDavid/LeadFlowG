import crypto from 'crypto';

const SECRET = process.env.SESSION_SECRET || 'fallback-tracking-secret';
const EXPIRY_DAYS = 14;

export interface TrackingPayload {
  tenantId: string;
  leadId?: string;
  sequenceId?: string;
  stepId?: string;
  messageId?: string;
  templateId?: string;
  url?: string;
  expiresAt?: number;
}

/**
 * Mint a signed tracking ID from payload
 * @param payload - Data to encode in the tracking token
 * @returns Base64url-encoded token with HMAC signature
 */
export function mintTrackingToken(payload: TrackingPayload): string {
  const data = {
    ...payload,
    expiresAt: Date.now() + (EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  };
  
  const json = JSON.stringify(data);
  const encoded = Buffer.from(json).toString('base64url');
  
  // Create HMAC signature
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(encoded);
  const signature = hmac.digest('base64url');
  
  return `${encoded}.${signature}`;
}

/**
 * Verify and decode a tracking token
 * @param token - Signed tracking token
 * @returns Decoded payload if valid
 * @throws Error if token is invalid or expired
 */
export function verifyTrackingToken(token: string): TrackingPayload {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid token format');
  }
  
  const [encoded, providedSignature] = parts;
  
  // Verify signature using timing-safe comparison (P0 Security)
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(encoded);
  const expectedSignature = hmac.digest('base64url');
  
  // Use crypto.timingSafeEqual to prevent timing attacks
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  
  if (expectedBuffer.length !== providedBuffer.length) {
    throw new Error('Invalid token signature');
  }
  
  if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    throw new Error('Invalid token signature');
  }
  
  // Decode payload
  const json = Buffer.from(encoded, 'base64url').toString('utf-8');
  const payload = JSON.parse(json) as TrackingPayload;
  
  // Check expiry
  if (payload.expiresAt && payload.expiresAt < Date.now()) {
    throw new Error('Token expired');
  }
  
  return payload;
}
