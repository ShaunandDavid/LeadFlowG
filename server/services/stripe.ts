// Stripe service for subscription billing - based on javascript_stripe blueprint
import Stripe from "stripe";

// Deferred initialization to avoid crashing server when secret is missing
let stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('Stripe operations require STRIPE_SECRET_KEY environment variable');
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    });
  }
  return stripe;
}

export { getStripe as stripe };

export interface PlanLimits {
  emailsPerDay: number;
  verificationsPerMonth: number;
  seats: number;
}

export const PLAN_CONFIGS: Record<string, PlanLimits> = {
  starter: {
    emailsPerDay: 100,
    verificationsPerMonth: 1000,
    seats: 2,
  },
  pro: {
    emailsPerDay: 1000,
    verificationsPerMonth: 10000,
    seats: 5,
  },
  agency: {
    emailsPerDay: 10000,
    verificationsPerMonth: 100000,
    seats: 999,
  },
};

export async function createCheckoutSession(params: {
  tenantId: string;
  plan: 'starter' | 'pro' | 'agency';
  successUrl: string;
  cancelUrl: string;
}) {
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: process.env[`STRIPE_PRICE_${params.plan.toUpperCase()}`],
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.tenantId,
      metadata: {
        tenantId: params.tenantId,
        plan: params.plan,
      },
    });

    return session;
  } catch (error) {
    console.error('Stripe checkout session creation error:', error);
    throw error;
  }
}

export async function createBillingPortalSession(customerId: string, returnUrl: string) {
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return session;
  } catch (error) {
    console.error('Stripe billing portal session creation error:', error);
    throw error;
  }
}

export async function recordUsageEvent(params: {
  subscriptionItemId: string;
  quantity: number;
  action: 'increment' | 'set';
}) {
  try {
    const usageRecord = await getStripe().subscriptionItems.createUsageRecord(
      params.subscriptionItemId,
      {
        quantity: params.quantity,
        action: params.action,
      }
    );

    return usageRecord;
  } catch (error) {
    console.error('Stripe usage record error:', error);
    throw error;
  }
}
