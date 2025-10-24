# B2B Outreach Automation Platform

## Overview
Production-grade white-label B2B outreach automation platform with multi-tenant architecture, AI-powered lead intelligence, email sequence management, deliverability safeguards, and metered billing.

## Project Status
✅ **Fully Implemented** - All core features, authentication, multi-tenancy, integrations, and critical fixes complete

## Recent Changes (Current Session - Autonomous Development)

### Completed Tasks (1-10)
1. **Lead Import & Management** ✅
   - CSV import with deduplication by email and domain+name
   - Bulk operations: tag, export, delete, updateStatus, suppress
   - Frontend UI with import dialog and bulk actions toolbar

2. **Email Verification Integration** ✅
   - NeverBounce service with single and batch verification
   - Usage metering and monthly limit enforcement
   - Verification status mapping (passed/failed/risky)

3. **AI Lead Scoring Enhancement** ✅
   - Hybrid rules-based baseline + OpenAI tiebreaker
   - Cost optimization: skip OpenAI for clear A/C grades (only use for borderline B grades)
   - Scoring factors: title, revenue, employee count

4. **Email Template System** ✅
   - Variable substitution engine with {{variable}} syntax
   - Industry template packs (roofing, dental, solar, hvac, general)
   - Iterative quiet hours + send window constraint satisfaction
   - Fixed midnight-wrapping bug and day-of-week filtering

5. **Send Queue System** ✅
   - Firestore-backed queue with per-tenant throttling
   - Warmup stages: 25→50→75→100 daily email limits
   - Fixed all concurrency bugs:
     - Atomic counters via FieldValue.increment()
     - Deterministic idempotency keys (no timestamp)
     - Transactional job claims to prevent double-sends
   - Retry logic with exponential backoff (3 attempts)

6. **Sequence Execution Engine** ✅
   - Multi-step sequence orchestration
   - Lead progress tracking with currentStepIndex
   - Step types: email, wait
   - Auto-scheduling with quiet hours and send windows
   - Pause/resume functionality
   - Reply tracking and stats updates
   - Duplicate send prevention via enqueuedStepId
   - markStepComplete triggers next step scheduling
   - processAllPendingSteps() cron endpoint for wait resumption
   - Fresh state reload each iteration (fixes stale snapshot issue)
   - Autonomous progression through wait→email→wait chains

7. **Suppression List System** ✅
   - Global and tenant-level suppression collections
   - Bulk suppression operations (handles 10,000+ emails efficiently)
   - Firestore batch management with fresh batch every 500 writes
   - Integration into sequence engine (checks before enqueuing)

8. **Unsubscribe System** ✅
   - SHA-256 verified unsubscribe tokens (prevents forgery)
   - Public unsubscribe page with success/error states
   - Token generation recomputes hash from lead data
   - Automatic lead progress updates and suppression

9. **Bounce/Complaint Handling** ✅
   - Webhook endpoints for bounce and complaint processing
   - Intelligent suppression rules:
     - Hard bounces → immediate suppression
     - Soft bounces → suppress after 3 occurrences
     - Complaints → immediate suppression
   - Bounce stats tracking and reporting

10. **Gmail OAuth Integration** ✅
    - OAuth 2.0 flow with Gmail API scopes (gmail.send, calendar, userinfo.email)
    - Encrypted token storage in Firestore (AES-256-CBC)
    - Auto-refresh token management via googleapis library
    - Email worker service processes queue every 60 seconds
    - RFC822 email formatting with List-Unsubscribe headers
    - Settings UI component for connection management
    - Routes: /api/oauth/google/start, /callback, /status, /disconnect

## Recent Changes (Previous Session)

### Critical Fixes Implemented
1. **Tenant Provisioning Flow**
   - Created tenant provisioning service with custom claims (`server/services/tenant-provisioning.ts`)
   - Provision endpoint mints custom tokens immediately after setting claims
   - Onboarding check endpoint returns custom tokens for existing tenants
   - Client auth context exchanges custom tokens to ensure fresh ID tokens before protected routes
   - Eliminates 403 loops from stale tenant claims

2. **Graceful Service Degradation**
   - Added availability checks (`isStripeAvailable()`, `isOpenAIAvailable()`)
   - All Stripe/OpenAI routes check availability before calling services
   - Server boots successfully without API keys
   - Returns 503 with clear error messages when services unavailable
   - Prevents server crashes from missing credentials

3. **Robust Firebase Admin Initialization**
   - Reads backend-specific `FIREBASE_PROJECT_ID` env var
   - Detects and uses Firebase emulator automatically
   - Falls back to Application Default Credentials for GCP
   - Graceful fallback for local development with warnings
   - Works in development, staging, and production environments

## Architecture

### Multi-Tenant Design
- Firebase custom claims store `tenantId` and `role` on user tokens
- All data scoped to tenant collections: `/tenants/{tenantId}/leads`, `/tenants/{tenantId}/sequences`, etc.
- Middleware validates tenant access on every protected route
- Complete tenant isolation for security and data privacy

### Technology Stack
- **Frontend**: React 18, TypeScript, Wouter, TanStack Query, Tailwind CSS, Shadcn UI
- **Backend**: Node.js, Express, Firebase Admin SDK
- **Database**: Cloud Firestore (Firebase)
- **Auth**: Firebase Authentication with Google OAuth
- **Integrations**: Stripe (billing), OpenAI (AI scoring), Gmail OAuth (sending)

### Design System
- Linear-inspired professional B2B SaaS design
- Inter font family with JetBrains Mono for code
- Dark mode support via ThemeProvider
- Consistent spacing, typography hierarchy, and component patterns
- Responsive design with mobile-first approach

## Features

### Authentication & Onboarding
- Google OAuth sign-in via Firebase
- 5-step onboarding wizard:
  1. Gmail connection authorization
  2. Plan selection (Starter/Pro/Agency)
  3. Domain configuration and verification
  4. Lead import (CSV/enrichment APIs)
  5. Preview & launch
- Custom claims provisioning for multi-tenant access
- Protected route handling with automatic onboarding redirect

### Dashboard
- Real-time metrics: active sequences, leads processed, reply rate, meetings booked
- Funnel visualization (sent → opened → replied → booked)
- Recent activity feed
- Deliverability health indicators
- Quick action cards

### Lead Management
- Lead table with advanced filtering (status, score, tags, company)
- Bulk actions: tag, score, export, delete
- AI-powered lead scoring (A/B/C grades via OpenAI)
- CSV import with deduplication
- Contact enrichment placeholders
- Lead detail views

### Email Sequences
- Sequence builder with multi-step flows
- Template library with industry-specific packs
- A/B testing support
- Send time optimization
- Automated follow-ups
- Unsubscribe compliance

### Analytics
- Funnel analysis (sequence performance)
- Subject line A/B testing results
- Send time heatmap
- Template performance metrics
- Reply sentiment classification

### Settings
- **Integrations**: Gmail OAuth, NeverBounce, enrichment APIs
- **Billing**: Stripe subscription management, usage metering
- **Branding**: Logo, colors, email signature customization
- **Team**: User management and role assignment
- **Domain**: SPF/DKIM setup, warm-up configuration

## API Routes

### Authentication
- `POST /api/auth/check-onboarding` - Check if user needs onboarding, returns custom token if provisioned
- `POST /api/auth/provision` - Provision new tenant with custom claims
- `GET /api/auth/me` - Get current user with tenant info (protected)

### Dashboard
- `GET /api/dashboard/metrics` - Get tenant metrics (protected)

### Leads
- `GET /api/leads` - List leads with filtering (protected)
- `POST /api/leads` - Create new lead (protected)
- `GET /api/leads/:id` - Get lead details (protected)
- `PUT /api/leads/:id` - Update lead (protected)
- `DELETE /api/leads/:id` - Delete lead (protected)
- `POST /api/leads/:id/score` - AI score lead with OpenAI (protected, requires OPENAI_API_KEY)
- `POST /api/leads/import` - Bulk import leads from CSV (protected)

### Sequences
- `GET /api/sequences` - List sequences (protected)
- `POST /api/sequences` - Create sequence (protected)
- `GET /api/sequences/:id` - Get sequence details (protected)
- `PUT /api/sequences/:id` - Update sequence (protected)
- `DELETE /api/sequences/:id` - Delete sequence (protected)

### Templates
- `GET /api/templates` - List email templates (protected)
- `POST /api/templates` - Create template (protected)

### Billing
- `POST /api/stripe/checkout` - Create Stripe checkout session (protected, requires STRIPE_SECRET_KEY)
- `POST /api/stripe/create-portal` - Create billing portal session (protected, requires STRIPE_SECRET_KEY)

## Environment Variables

### Required (Backend)
```env
# Firebase Admin (backend)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}  # Production only

# Firebase Client (frontend)
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your-app-id

# Session
SESSION_SECRET=your-session-secret
```

### Optional (Features)
```env
# Stripe (billing features)
STRIPE_SECRET_KEY=sk_test_...
VITE_STRIPE_PUBLIC_KEY=pk_test_...

# OpenAI (AI scoring)
OPENAI_API_KEY=sk-...

# Firebase Emulator (local development)
FIREBASE_EMULATOR_HOST=localhost:9099
FIRESTORE_EMULATOR_HOST=localhost:8080
```

### Development vs Production
- **Development**: Set `VITE_FIREBASE_PROJECT_ID` or use Firebase emulator
- **Production**: Set `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT`
- **Without Keys**: Application boots successfully, features return 503 when accessed

## Data Model

### Tenant
```typescript
{
  id: string;
  plan: 'starter' | 'pro' | 'agency';
  limits: { emailsPerDay, verificationsPerMonth, seats, rampStage };
  usage: { emailsSentMonth, verificationsMonth, leadsVerifiedMonth };
  status: { paused };
  createdAt: string;
}
```

### User (subcollection of Tenant)
```typescript
{
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: string;
}
```

### Lead (subcollection of Tenant)
```typescript
{
  id: string;
  tenantId: string;
  status: 'new' | 'contacted' | 'replied' | 'booked' | 'unsubscribed';
  contact: { email, phone?, linkedin? };
  person: { firstName, lastName, title, photoUrl? };
  company: { name, website, industry, size, revenue, employeeCount? };
  score?: { grade: 'A'|'B'|'C', value: number, reason: string };
  tags: string[];
  customFields: Record<string, any>;
  importedAt: string;
  lastContactedAt?: string;
}
```

### Sequence (subcollection of Tenant)
```typescript
{
  id: string;
  tenantId: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  steps: Array<{
    id: string;
    type: 'email' | 'wait' | 'condition';
    templateId?: string;
    waitDays?: number;
    sendTimeWindow?: { start: string, end: string };
  }>;
  stats: { sent, opened, replied, booked, unsubscribed };
  createdAt: string;
}
```

## Services

### Tenant Provisioning Service
- Creates tenant and user documents in Firestore
- Sets Firebase custom claims (tenantId, role)
- Generates custom tokens for immediate authentication
- Handles idempotency for re-provisioning

### Stripe Service
- Subscription checkout session creation
- Billing portal management
- Metered usage tracking
- Plan limits configuration
- Lazy initialization (works without keys)

### OpenAI Service
- AI-powered lead scoring (GPT-5)
- Reply sentiment classification
- Email content generation
- Lazy initialization (works without keys)

## Security Features
- Firebase Authentication with Google OAuth
- Custom claims for multi-tenant authorization
- Middleware validates tenant access on every route
- Input validation with Zod schemas
- SQL injection prevention via Firestore SDK
- Rate limiting ready (implement in middleware)
- Secrets management via environment variables

## Testing Strategy
- End-to-end testing recommended for:
  - Sign-in flow
  - Onboarding wizard (all 5 steps)
  - Tenant provisioning and custom claims
  - Dashboard metrics loading
  - Lead creation and AI scoring
  - Billing integration (with test keys)
- Test both with and without API keys to verify graceful degradation

## Deployment Checklist
1. Set all required environment variables in Replit Secrets
2. Configure Firebase project and enable Google OAuth
3. Set up Stripe webhook endpoints (if using metered billing)
4. Test onboarding flow end-to-end
5. Verify custom claims are set correctly
6. Test graceful degradation without optional API keys
7. Monitor logs for warnings during first deployment

## Next Steps (Future Enhancements)
- Gmail API integration for email sending
- NeverBounce integration for email verification
- Real-time websocket updates for sequence runs
- Advanced analytics and reporting
- Webhook support for external integrations
- Team collaboration features
- White-label domain configuration
- SMTP relay setup and warm-up automation
