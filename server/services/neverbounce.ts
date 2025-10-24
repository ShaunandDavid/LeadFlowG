// NeverBounce email verification service
// Verifies email addresses before first send to improve deliverability

let neverBounceAvailable: boolean | null = null;

export function isNeverBounceAvailable(): boolean {
  if (neverBounceAvailable === null) {
    neverBounceAvailable = !!process.env.NEVERBOUNCE_API_KEY;
  }
  return neverBounceAvailable;
}

export interface VerificationResult {
  email: string;
  status: 'valid' | 'invalid' | 'disposable' | 'catchall' | 'unknown';
  score: number; // 0-100
  flags: string[];
}

export async function verifyEmail(email: string): Promise<VerificationResult> {
  if (!isNeverBounceAvailable()) {
    throw new Error('NeverBounce API key not configured');
  }

  try {
    const response = await fetch(`https://api.neverbounce.com/v4/single/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: process.env.NEVERBOUNCE_API_KEY,
        email,
        address_info: 1,
        credits_info: 1,
        timeout: 5,
      }),
    });

    if (!response.ok) {
      throw new Error(`NeverBounce API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Map NeverBounce results to our internal status
    let status: VerificationResult['status'];
    const nbResult = data.result;
    
    switch (nbResult) {
      case 'valid':
        status = 'valid';
        break;
      case 'invalid':
        status = 'invalid';
        break;
      case 'disposable':
        status = 'disposable';
        break;
      case 'catchall':
        status = 'catchall';
        break;
      default:
        status = 'unknown';
    }

    const flags: string[] = [];
    if (data.flags) {
      if (data.flags.includes('role_account')) flags.push('role_account');
      if (data.flags.includes('free_email')) flags.push('free_email');
    }

    // Calculate score (valid=100, catchall=75, unknown=50, disposable=25, invalid=0)
    const scoreMap: Record<string, number> = {
      valid: 100,
      catchall: 75,
      unknown: 50,
      disposable: 25,
      invalid: 0,
    };

    return {
      email,
      status,
      score: scoreMap[status] || 50,
      flags,
    };
  } catch (error) {
    console.error('NeverBounce verification error:', error);
    throw error;
  }
}

export async function verifyEmailBatch(emails: string[]): Promise<VerificationResult[]> {
  if (!isNeverBounceAvailable()) {
    throw new Error('NeverBounce API key not configured');
  }

  // For now, verify one at a time (NeverBounce bulk API requires different setup)
  // TODO: Implement proper bulk verification with job-based API
  const results: VerificationResult[] = [];
  
  for (const email of emails) {
    try {
      const result = await verifyEmail(email);
      results.push(result);
    } catch (error) {
      results.push({
        email,
        status: 'unknown',
        score: 50,
        flags: ['verification_failed'],
      });
    }
  }

  return results;
}
