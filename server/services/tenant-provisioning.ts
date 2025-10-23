// Tenant provisioning service - handles onboarding and custom claims setup
import { adminAuth, adminDb } from '../lib/firebase-admin';
import { PLAN_CONFIGS } from './stripe';

export interface ProvisionTenantParams {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  plan?: 'starter' | 'pro' | 'agency';
}

export async function provisionTenant(params: ProvisionTenantParams) {
  try {
    // Create tenant document
    const tenantRef = adminDb.collection('tenants').doc();
    const tenantId = tenantRef.id;
    
    const plan = params.plan || 'starter';
    const limits = PLAN_CONFIGS[plan];
    
    const now = new Date().toISOString();
    
    await tenantRef.set({
      id: tenantId,
      plan,
      limits: {
        ...limits,
        rampStage: 0,
      },
      usage: {
        emailsSentMonth: 0,
        verificationsMonth: 0,
        leadsVerifiedMonth: 0,
        lastResetAt: now,
      },
      status: {
        paused: false,
      },
      createdAt: now,
    });

    // Create user document within tenant
    const userRef = tenantRef.collection('users').doc(params.uid);
    await userRef.set({
      id: params.uid,
      tenantId,
      email: params.email,
      displayName: params.displayName,
      photoURL: params.photoURL,
      role: 'owner',
      createdAt: now,
    });

    // Set custom claims on the user's ID token
    await adminAuth.setCustomUserClaims(params.uid, {
      tenantId,
      role: 'owner',
    });

    console.log(`Provisioned tenant ${tenantId} for user ${params.uid}`);
    
    return {
      tenantId,
      userId: params.uid,
    };
  } catch (error) {
    console.error('Tenant provisioning error:', error);
    throw error;
  }
}

export async function getTenantForUser(uid: string): Promise<{ tenantId: string; role: string } | null> {
  try {
    // Check if user already has custom claims
    const user = await adminAuth.getUser(uid);
    
    if (user.customClaims?.tenantId) {
      return {
        tenantId: user.customClaims.tenantId as string,
        role: user.customClaims.role as string,
      };
    }

    return null;
  } catch (error) {
    console.error('Get tenant for user error:', error);
    return null;
  }
}
