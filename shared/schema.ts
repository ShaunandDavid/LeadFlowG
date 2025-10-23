import { z } from "zod";

// ==================== TENANT SCHEMA ====================
export const tenantSchema = z.object({
  id: z.string(),
  plan: z.enum(["starter", "pro", "agency"]),
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  branding: z.object({
    logoUrl: z.string().optional(),
    primaryHex: z.string().optional(),
    domainFrom: z.string().optional(),
    fromName: z.string().optional(),
  }).optional(),
  limits: z.object({
    emailsPerDay: z.number(),
    verificationsPerMonth: z.number(),
    seats: z.number(),
    rampStage: z.number().default(0),
  }),
  usage: z.object({
    emailsSentMonth: z.number().default(0),
    verificationsMonth: z.number().default(0),
    leadsVerifiedMonth: z.number().default(0),
    lastResetAt: z.string(),
  }),
  status: z.object({
    paused: z.boolean().default(false),
    reason: z.string().optional(),
  }),
  createdAt: z.string(),
});

export const insertTenantSchema = tenantSchema.omit({ id: true, createdAt: true });
export type Tenant = z.infer<typeof tenantSchema>;
export type InsertTenant = z.infer<typeof insertTenantSchema>;

// ==================== USER SCHEMA ====================
export const userSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  photoURL: z.string().optional(),
  role: z.enum(["owner", "admin", "member"]),
  createdAt: z.string(),
});

export const insertUserSchema = userSchema.omit({ id: true, createdAt: true });
export type User = z.infer<typeof userSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;

// ==================== LEAD SCHEMA ====================
export const leadSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  listId: z.string().optional(),
  person: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    title: z.string().optional(),
    linkedinUrl: z.string().optional(),
  }).optional(),
  company: z.object({
    name: z.string().optional(),
    domain: z.string().optional(),
    revenue: z.number().optional(),
    employeeCount: z.number().optional(),
    industry: z.string().optional(),
    techStack: z.array(z.string()).optional(),
  }).optional(),
  contact: z.object({
    email: z.string().email(),
    phone: z.string().optional(),
  }),
  verify: z.object({
    status: z.enum(["passed", "failed", "risky", "pending"]).default("pending"),
    score: z.number().optional(),
  }).optional(),
  score: z.object({
    grade: z.enum(["A", "B", "C"]).optional(),
    value: z.number().optional(),
    reason: z.string().optional(),
  }).optional(),
  status: z.enum(["new", "queued", "contacted", "replied", "booked", "won", "lost"]).default("new"),
  suppression: z.object({
    global: z.boolean().default(false),
    reason: z.string().optional(),
  }).optional(),
  provenance: z.object({
    source: z.string(),
    importedAt: z.string(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const insertLeadSchema = leadSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type Lead = z.infer<typeof leadSchema>;
export type InsertLead = z.infer<typeof insertLeadSchema>;

// ==================== LIST SCHEMA ====================
export const listSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  leadsCount: z.number().default(0),
  createdAt: z.string(),
});

export const insertListSchema = listSchema.omit({ id: true, createdAt: true, leadsCount: true });
export type List = z.infer<typeof listSchema>;
export type InsertList = z.infer<typeof insertListSchema>;

// ==================== TEMPLATE SCHEMA ====================
export const templateSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  channel: z.enum(["email", "sms"]),
  name: z.string(),
  subject: z.string().optional(),
  body: z.string(),
  variables: z.array(z.string()),
  industry: z.enum(["roofing", "dental", "solar", "hvac", "plumbing", "general"]).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const insertTemplateSchema = templateSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type Template = z.infer<typeof templateSchema>;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;

// ==================== SEQUENCE SCHEMA ====================
export const sequenceStepSchema = z.object({
  id: z.string(),
  type: z.enum(["email", "sms", "wait"]),
  templateId: z.string().optional(),
  waitHours: z.number().optional(),
  quietHours: z.object({
    start: z.number(), // 0-23
    end: z.number(), // 0-23
  }).optional(),
  sendWindow: z.object({
    days: z.array(z.number()), // 0=Sunday, 6=Saturday
    startHour: z.number(),
    endHour: z.number(),
  }).optional(),
});

export const sequenceSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  steps: z.array(sequenceStepSchema),
  active: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const insertSequenceSchema = sequenceSchema.omit({ id: true, createdAt: true, updatedAt: true });
export type Sequence = z.infer<typeof sequenceSchema>;
export type SequenceStep = z.infer<typeof sequenceStepSchema>;
export type InsertSequence = z.infer<typeof insertSequenceSchema>;

// ==================== RUN SCHEMA ====================
export const runSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  sequenceId: z.string(),
  listId: z.string(),
  state: z.enum(["pending", "running", "paused", "done"]).default("pending"),
  stats: z.object({
    totalLeads: z.number().default(0),
    contacted: z.number().default(0),
    replied: z.number().default(0),
    booked: z.number().default(0),
  }).optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  createdAt: z.string(),
});

export const insertRunSchema = runSchema.omit({ id: true, createdAt: true });
export type Run = z.infer<typeof runSchema>;
export type InsertRun = z.infer<typeof insertRunSchema>;

// ==================== EVENT SCHEMA ====================
export const eventSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  type: z.enum([
    "send_ok",
    "bounce",
    "complaint",
    "reply_positive",
    "reply_neutral",
    "reply_ooo",
    "unsubscribe",
    "click",
    "open",
  ]),
  leadId: z.string().optional(),
  sequenceId: z.string().optional(),
  runId: z.string().optional(),
  step: z.number().optional(),
  messageId: z.string().optional(),
  meta: z.record(z.any()).optional(),
  createdAt: z.string(),
});

export const insertEventSchema = eventSchema.omit({ id: true, createdAt: true });
export type Event = z.infer<typeof eventSchema>;
export type InsertEvent = z.infer<typeof insertEventSchema>;

// ==================== OAUTH TOKEN SCHEMA ====================
export const oauthTokenSchema = z.object({
  tenantId: z.string(),
  provider: z.enum(["google", "twilio"]),
  email: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  phoneNumber: z.string().optional(),
  accountSid: z.string().optional(),
  expiresAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OAuthToken = z.infer<typeof oauthTokenSchema>;

// ==================== DOMAIN SETTINGS SCHEMA ====================
export const domainSettingsSchema = z.object({
  tenantId: z.string(),
  domain: z.string(),
  status: z.enum(["pending", "verified", "failed"]),
  dkimKeys: z.array(z.string()).optional(),
  spfRecord: z.string().optional(),
  dmarcRecord: z.string().optional(),
  verifiedAt: z.string().optional(),
  createdAt: z.string(),
});

export type DomainSettings = z.infer<typeof domainSettingsSchema>;

// ==================== ANALYTICS TYPES ====================
export type DashboardMetrics = {
  emailsSent: number;
  openRate: number;
  replyRate: number;
  bookingRate: number;
  bounceRate: number;
  verificationPassRate: number;
  dailyCapacity: number;
  dailyUsage: number;
};

export type FunnelData = {
  stage: string;
  count: number;
  percentage: number;
}[];

export type ChartDataPoint = {
  date: string;
  value: number;
  label?: string;
};
