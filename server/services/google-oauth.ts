// Google OAuth service - handles Gmail OAuth flow and token management
import { google } from 'googleapis';
import { adminDb } from '../lib/firebase-admin';
import crypto from 'crypto';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_OAUTH_REDIRECT_URI
);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar',
];

// Encryption key for storing refresh tokens (derived from SESSION_SECRET)
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(process.env.SESSION_SECRET || 'fallback-secret')
  .digest();

// Simple encryption for tokens
function encryptToken(token: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptToken(encryptedToken: string): string {
  const parts = encryptedToken.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  email: string;
  connectedAt: string;
}

/**
 * Generate OAuth URL for user to authorize Gmail access
 */
export function getAuthUrl(tenantId: string): string {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: tenantId, // Pass tenantId in state to retrieve on callback
    prompt: 'consent', // Force consent screen to get refresh token
  });
  return authUrl;
}

/**
 * Exchange authorization code for tokens and store them
 */
export async function handleOAuthCallback(params: {
  code: string;
  state: string; // tenantId
}): Promise<{ success: boolean; email: string }> {
  const { code, state: tenantId } = params;

  // Exchange code for tokens
  const { tokens } = await oauth2Client.getToken(code);
  
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to obtain tokens from Google');
  }

  // Set credentials to get user info
  oauth2Client.setCredentials(tokens);
  
  // Get user email
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();
  
  if (!data.email) {
    throw new Error('Failed to get user email from Google');
  }

  // Store encrypted tokens in Firestore
  const tokenData: GoogleTokens = {
    accessToken: encryptToken(tokens.access_token),
    refreshToken: encryptToken(tokens.refresh_token),
    expiryDate: tokens.expiry_date || Date.now() + 3600000,
    email: data.email,
    connectedAt: new Date().toISOString(),
  };

  await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('tokens')
    .doc('google')
    .set(tokenData);

  return { success: true, email: data.email };
}

/**
 * Get authenticated Gmail client for a tenant (auto-refreshes tokens)
 */
export async function getGmailClient(tenantId: string) {
  const tokenDoc = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('tokens')
    .doc('google')
    .get();

  if (!tokenDoc.exists) {
    throw new Error('Gmail not connected for this tenant');
  }

  const tokenData = tokenDoc.data() as GoogleTokens;

  // Decrypt tokens
  const accessToken = decryptToken(tokenData.accessToken);
  const refreshToken = decryptToken(tokenData.refreshToken);

  // Create new OAuth client
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );

  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: tokenData.expiryDate,
  });

  // Set up auto-refresh listener
  client.on('tokens', async (tokens) => {
    // Update stored tokens with new access token
    const updates: Partial<GoogleTokens> = {
      accessToken: encryptToken(tokens.access_token!),
      expiryDate: tokens.expiry_date || Date.now() + 3600000,
    };

    // If we got a new refresh token, update that too
    if (tokens.refresh_token) {
      updates.refreshToken = encryptToken(tokens.refresh_token);
    }

    await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('tokens')
      .doc('google')
      .update(updates);
  });

  const gmail = google.gmail({ version: 'v1', auth: client });
  return { gmail, client, email: tokenData.email };
}

/**
 * Send email via Gmail API
 */
export async function sendViaGmail(params: {
  tenantId: string;
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  unsubscribeUrl: string;
}): Promise<{ messageId: string }> {
  const { tenantId, to, subject, htmlBody, textBody, unsubscribeUrl } = params;

  const { gmail, email: fromEmail } = await getGmailClient(tenantId);

  // Build RFC822 email message
  const messageParts = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="boundary-string"',
    `List-Unsubscribe: <${unsubscribeUrl}>`,
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    '',
    '--boundary-string',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    textBody,
    '',
    '--boundary-string',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    htmlBody,
    '',
    '--boundary-string--',
  ];

  const message = messageParts.join('\n');
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    },
  });

  if (!response.data.id) {
    throw new Error('Failed to send email via Gmail');
  }

  return { messageId: response.data.id };
}

/**
 * Check if Gmail is connected for a tenant
 */
export async function isGmailConnected(tenantId: string): Promise<boolean> {
  const tokenDoc = await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('tokens')
    .doc('google')
    .get();

  return tokenDoc.exists;
}

/**
 * Disconnect Gmail for a tenant
 */
export async function disconnectGmail(tenantId: string): Promise<void> {
  await adminDb
    .collection('tenants')
    .doc(tenantId)
    .collection('tokens')
    .doc('google')
    .delete();
}
