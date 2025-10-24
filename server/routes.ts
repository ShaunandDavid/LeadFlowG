import type { Express } from "express";
import { createServer, type Server } from "http";
import { adminAuth, adminDb } from "./lib/firebase-admin";
import { authenticateToken, requireRole, AuthRequest } from "./middleware/auth";
import { scoreLead, classifyReply, isOpenAIAvailable } from "./services/openai";
import { stripe, createCheckoutSession, createBillingPortalSession, isStripeAvailable, PLAN_CONFIGS } from "./services/stripe";
import { provisionTenant, getTenantForUser } from "./services/tenant-provisioning";
import { verifyEmail, verifyEmailBatch, isNeverBounceAvailable } from "./services/neverbounce";
import { getThrottleStatus, enqueueEmail, getNextBatch, advanceWarmupStage } from "./services/send-queue";
import { startSequenceRun, pauseRun, resumeRun, markLeadAsReplied, scheduleNextSteps } from "./services/sequence-engine";
import { insertLeadSchema, insertSequenceSchema, insertTemplateSchema, insertListSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // ==================== AUTH ROUTES ====================
  
  // Check if user needs onboarding (no tenant provisioned yet)
  app.post("/api/auth/check-onboarding", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.substring(7);
      const decodedToken = await adminAuth.verifyIdToken(token);
      
      const tenantInfo = await getTenantForUser(decodedToken.uid);
      
      if (tenantInfo) {
        // User already has tenant - generate fresh custom token with claims
        const customToken = await adminAuth.createCustomToken(decodedToken.uid, {
          tenantId: tenantInfo.tenantId,
          role: tenantInfo.role,
        });
        
        return res.json({
          needsOnboarding: false,
          tenantId: tenantInfo.tenantId,
          customToken,
        });
      }
      
      res.json({
        needsOnboarding: true,
        tenantId: null,
      });
    } catch (error) {
      console.error("Check onboarding error:", error);
      res.status(500).json({ error: "Failed to check onboarding status" });
    }
  });

  // Provision new tenant during onboarding
  app.post("/api/auth/provision", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.substring(7);
      const decodedToken = await adminAuth.verifyIdToken(token);
      
      // Check if already provisioned
      const existing = await getTenantForUser(decodedToken.uid);
      if (existing) {
        // Generate new token with fresh claims for consistency
        const customToken = await adminAuth.createCustomToken(decodedToken.uid, {
          tenantId: existing.tenantId,
          role: existing.role,
        });
        return res.json({ 
          tenantId: existing.tenantId, 
          alreadyProvisioned: true,
          customToken,
        });
      }
      
      const { plan } = req.body;
      
      const result = await provisionTenant({
        uid: decodedToken.uid,
        email: decodedToken.email || '',
        displayName: decodedToken.name || decodedToken.email || 'User',
        photoURL: decodedToken.picture,
        plan: plan || 'starter',
      });

      // Generate a new custom token with the fresh claims
      // This ensures the client can immediately sign in with the new claims
      const customToken = await adminAuth.createCustomToken(decodedToken.uid, {
        tenantId: result.tenantId,
        role: 'owner',
      });

      res.json({ ...result, customToken });
    } catch (error) {
      console.error("Provision tenant error:", error);
      res.status(500).json({ error: "Failed to provision tenant" });
    }
  });
  
  // Get current user with tenant claims
  app.get("/api/auth/me", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // If no tenantId, user needs onboarding
      if (!req.user.tenantId) {
        return res.status(403).json({ error: "User not provisioned", needsOnboarding: true });
      }

      const userDoc = await adminDb
        .collection("tenants")
        .doc(req.user.tenantId)
        .collection("users")
        .doc(req.user.uid)
        .get();

      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        id: req.user.uid,
        ...userDoc.data(),
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // ==================== DASHBOARD ROUTES ====================
  
  app.get("/api/dashboard/metrics", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      // Mock metrics for now - in production, aggregate from events collection
      const metrics = {
        emailsSent: 1250,
        openRate: 42.5,
        replyRate: 12.8,
        bookingRate: 3.6,
        bounceRate: 1.2,
        verificationPassRate: 92.5,
        dailyCapacity: 100,
        dailyUsage: 45,
      };

      res.json(metrics);
    } catch (error) {
      console.error("Dashboard metrics error:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });

  // ==================== LEADS ROUTES ====================
  
  app.get("/api/leads", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const { status, search } = req.query;
      
      let query = adminDb
        .collection("tenants")
        .doc(tenantId)
        .collection("leads")
        .limit(100);

      if (status && status !== "all") {
        query = query.where("status", "==", status);
      }

      const snapshot = await query.get();
      const leads = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json(leads);
    } catch (error) {
      console.error("Fetch leads error:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  app.post("/api/leads", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const validated = insertLeadSchema.parse(req.body);
      
      const leadRef = adminDb
        .collection("tenants")
        .doc(tenantId)
        .collection("leads")
        .doc();

      const now = new Date().toISOString();
      const leadData = {
        ...validated,
        tenantId,
        createdAt: now,
        updatedAt: now,
      };

      await leadRef.set(leadData);

      res.status(201).json({
        id: leadRef.id,
        ...leadData,
      });
    } catch (error) {
      console.error("Create lead error:", error);
      res.status(500).json({ error: "Failed to create lead" });
    }
  });

  // CSV Import with deduplication
  app.post("/api/leads/import", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { csv, listId } = req.body;
      const tenantId = req.user?.tenantId;
      
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      if (!csv || typeof csv !== 'string') {
        return res.status(400).json({ error: "CSV data required" });
      }

      // Parse CSV (expecting: email, firstName, lastName, title, company, domain, phone, industry, revenue, employeeCount)
      const Papa = await import('papaparse');
      const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
      
      if (parsed.errors.length > 0) {
        return res.status(400).json({ error: "CSV parsing error", details: parsed.errors });
      }

      const rows = parsed.data as any[];
      
      // Get existing leads for deduplication
      const existingLeadsSnapshot = await adminDb
        .collection("tenants")
        .doc(tenantId)
        .collection("leads")
        .get();

      const existingEmails = new Set<string>();
      const existingDomainNames = new Set<string>();
      
      existingLeadsSnapshot.docs.forEach(doc => {
        const lead = doc.data();
        if (lead.contact?.email) {
          existingEmails.add(lead.contact.email.toLowerCase());
        }
        if (lead.company?.domain && lead.person?.lastName) {
          existingDomainNames.add(`${lead.company.domain.toLowerCase()}:${lead.person.lastName.toLowerCase()}`);
        }
      });

      const imported: any[] = [];
      const skipped: any[] = [];
      const now = new Date().toISOString();

      for (const row of rows) {
        const email = row.email?.trim().toLowerCase();
        if (!email) {
          skipped.push({ row, reason: "Missing email" });
          continue;
        }

        // Dedup by email
        if (existingEmails.has(email)) {
          skipped.push({ row, reason: "Duplicate email" });
          continue;
        }

        // Dedup by domain + name
        const domain = row.domain?.trim().toLowerCase() || row.company?.toLowerCase();
        const lastName = row.lastName?.trim().toLowerCase();
        if (domain && lastName) {
          const key = `${domain}:${lastName}`;
          if (existingDomainNames.has(key)) {
            skipped.push({ row, reason: "Duplicate domain+name" });
            continue;
          }
          existingDomainNames.add(key);
        }

        existingEmails.add(email);

        // Create lead
        const leadRef = adminDb
          .collection("tenants")
          .doc(tenantId)
          .collection("leads")
          .doc();

        const leadData = {
          id: leadRef.id,
          tenantId,
          listId: listId || null,
          person: {
            firstName: row.firstName?.trim() || null,
            lastName: row.lastName?.trim() || null,
            title: row.title?.trim() || null,
          },
          company: {
            name: row.company?.trim() || null,
            domain: domain || null,
            revenue: row.revenue ? parseFloat(row.revenue) : null,
            employeeCount: row.employeeCount ? parseInt(row.employeeCount) : null,
            industry: row.industry?.trim() || null,
          },
          contact: {
            email,
            phone: row.phone?.trim() || null,
          },
          verify: {
            status: "pending",
          },
          status: "new",
          provenance: {
            source: "csv_import",
            importedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        };

        await leadRef.set(leadData);
        imported.push(leadData);
      }

      // Update list count if applicable
      if (listId) {
        const listRef = adminDb.collection("tenants").doc(tenantId).collection("lists").doc(listId);
        const listDoc = await listRef.get();
        if (listDoc.exists) {
          await listRef.update({
            leadsCount: (listDoc.data()?.leadsCount || 0) + imported.length,
          });
        }
      }

      res.json({
        imported: imported.length,
        skipped: skipped.length,
        total: rows.length,
        details: { imported, skipped },
      });
    } catch (error) {
      console.error("CSV import error:", error);
      res.status(500).json({ error: "Failed to import leads" });
    }
  });

  // Bulk operations
  app.post("/api/leads/bulk", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { operation, leadIds, data } = req.body;
      const tenantId = req.user?.tenantId;
      
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      if (!operation || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: "Operation and leadIds required" });
      }

      const batch = adminDb.batch();
      const now = new Date().toISOString();

      for (const leadId of leadIds) {
        const leadRef = adminDb.collection("tenants").doc(tenantId).collection("leads").doc(leadId);
        
        switch (operation) {
          case "tag":
            if (!data?.tags) {
              return res.status(400).json({ error: "Tags data required" });
            }
            batch.update(leadRef, {
              tags: data.tags,
              updatedAt: now,
            });
            break;
          
          case "delete":
            batch.delete(leadRef);
            break;
          
          case "suppress":
            batch.update(leadRef, {
              suppression: {
                global: true,
                reason: data?.reason || "Manual suppression",
              },
              updatedAt: now,
            });
            break;
          
          case "updateStatus":
            if (!data?.status) {
              return res.status(400).json({ error: "Status data required" });
            }
            batch.update(leadRef, {
              status: data.status,
              updatedAt: now,
            });
            break;
          
          default:
            return res.status(400).json({ error: "Invalid operation" });
        }
      }

      await batch.commit();
      
      res.json({ success: true, affected: leadIds.length });
    } catch (error) {
      console.error("Bulk operation error:", error);
      res.status(500).json({ error: "Failed to perform bulk operation" });
    }
  });

  // Export leads as CSV
  app.get("/api/leads/export", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const leadsSnapshot = await adminDb
        .collection("tenants")
        .doc(tenantId)
        .collection("leads")
        .get();

      const rows = leadsSnapshot.docs.map(doc => {
        const lead = doc.data();
        return {
          email: lead.contact?.email || '',
          firstName: lead.person?.firstName || '',
          lastName: lead.person?.lastName || '',
          title: lead.person?.title || '',
          company: lead.company?.name || '',
          domain: lead.company?.domain || '',
          phone: lead.contact?.phone || '',
          industry: lead.company?.industry || '',
          revenue: lead.company?.revenue || '',
          employeeCount: lead.company?.employeeCount || '',
          status: lead.status || 'new',
          score: lead.score?.grade || '',
          verifyStatus: lead.verify?.status || 'pending',
        };
      });

      const Papa = await import('papaparse');
      const csv = Papa.unparse(rows);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=leads_export.csv');
      res.send(csv);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ error: "Failed to export leads" });
    }
  });

  // Verify single lead
  app.post("/api/leads/:id/verify", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!isNeverBounceAvailable()) {
        return res.status(503).json({ 
          error: "Email verification is not available - NeverBounce API key not configured" 
        });
      }

      const tenantId = req.user?.tenantId;
      const { id } = req.params;
      
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const leadRef = adminDb.collection("tenants").doc(tenantId).collection("leads").doc(id);
      const leadDoc = await leadRef.get();
      
      if (!leadDoc.exists) {
        return res.status(404).json({ error: "Lead not found" });
      }

      const lead = leadDoc.data();
      const email = lead?.contact?.email;
      
      if (!email) {
        return res.status(400).json({ error: "Lead has no email address" });
      }

      // Check usage limits
      const tenantRef = adminDb.collection("tenants").doc(tenantId);
      const tenantDoc = await tenantRef.get();
      const tenant = tenantDoc.data();
      
      if (tenant?.usage?.verificationsMonth >= tenant?.limits?.verificationsPerMonth) {
        return res.status(429).json({ error: "Monthly verification limit exceeded" });
      }

      const verificationResult = await verifyEmail(email);
      
      // Map to our verification status
      let verifyStatus: "passed" | "failed" | "risky" | "pending";
      if (verificationResult.status === 'valid') {
        verifyStatus = 'passed';
      } else if (verificationResult.status === 'invalid') {
        verifyStatus = 'failed';
      } else if (verificationResult.status === 'disposable') {
        verifyStatus = 'failed';
      } else {
        verifyStatus = 'risky';
      }

      // Update lead verification status
      await leadRef.update({
        verify: {
          status: verifyStatus,
          score: verificationResult.score,
          flags: verificationResult.flags,
          verifiedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      });

      // Update tenant usage
      await tenantRef.update({
        'usage.verificationsMonth': (tenant?.usage?.verificationsMonth || 0) + 1,
        'usage.leadsVerifiedMonth': (tenant?.usage?.leadsVerifiedMonth || 0) + 1,
      });

      res.json({ ...verificationResult, verifyStatus });
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({ error: "Failed to verify email" });
    }
  });

  // Bulk verify leads
  app.post("/api/leads/bulk-verify", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!isNeverBounceAvailable()) {
        return res.status(503).json({ 
          error: "Email verification is not available - NeverBounce API key not configured" 
        });
      }

      const { leadIds } = req.body;
      const tenantId = req.user?.tenantId;
      
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: "Lead IDs required" });
      }

      // Check usage limits
      const tenantRef = adminDb.collection("tenants").doc(tenantId);
      const tenantDoc = await tenantRef.get();
      const tenant = tenantDoc.data();
      
      const remaining = (tenant?.limits?.verificationsPerMonth || 0) - (tenant?.usage?.verificationsMonth || 0);
      if (remaining < leadIds.length) {
        return res.status(429).json({ 
          error: `Insufficient verification credits. Need ${leadIds.length}, have ${remaining}` 
        });
      }

      // Get leads and extract emails
      const leadsSnapshot = await adminDb
        .collection("tenants")
        .doc(tenantId)
        .collection("leads")
        .where('__name__', 'in', leadIds.slice(0, 10)) // Firestore 'in' limit
        .get();

      const emails = leadsSnapshot.docs
        .map(doc => doc.data()?.contact?.email)
        .filter(Boolean) as string[];

      // Verify in batch
      const results = await verifyEmailBatch(emails);
      
      // Update leads
      const batch = adminDb.batch();
      const now = new Date().toISOString();
      
      results.forEach((result, idx) => {
        const doc = leadsSnapshot.docs[idx];
        if (doc) {
          let verifyStatus: "passed" | "failed" | "risky";
          if (result.status === 'valid') {
            verifyStatus = 'passed';
          } else if (result.status === 'invalid' || result.status === 'disposable') {
            verifyStatus = 'failed';
          } else {
            verifyStatus = 'risky';
          }

          batch.update(doc.ref, {
            verify: {
              status: verifyStatus,
              score: result.score,
              flags: result.flags,
              verifiedAt: now,
            },
            updatedAt: now,
          });
        }
      });

      await batch.commit();

      // Update tenant usage
      await tenantRef.update({
        'usage.verificationsMonth': (tenant?.usage?.verificationsMonth || 0) + results.length,
        'usage.leadsVerifiedMonth': (tenant?.usage?.leadsVerifiedMonth || 0) + results.length,
      });

      res.json({ verified: results.length, results });
    } catch (error) {
      console.error("Bulk verification error:", error);
      res.status(500).json({ error: "Failed to verify emails" });
    }
  });

  app.post("/api/leads/:id/score", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!isOpenAIAvailable()) {
        return res.status(503).json({ 
          error: "AI scoring is not available - OpenAI API key not configured" 
        });
      }

      const tenantId = req.user?.tenantId;
      const { id } = req.params;
      
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const leadRef = adminDb
        .collection("tenants")
        .doc(tenantId)
        .collection("leads")
        .doc(id);

      const leadDoc = await leadRef.get();
      if (!leadDoc.exists) {
        return res.status(404).json({ error: "Lead not found" });
      }

      const leadData = leadDoc.data();
      const scoreResult = await scoreLead(leadData as any);

      await leadRef.update({
        score: scoreResult,
        updatedAt: new Date().toISOString(),
      });

      res.json(scoreResult);
    } catch (error) {
      console.error("Score lead error:", error);
      res.status(500).json({ error: "Failed to score lead" });
    }
  });

  // ==================== SEQUENCES ROUTES ====================
  
  app.get("/api/sequences", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const snapshot = await adminDb
        .collection("tenants")
        .doc(tenantId)
        .collection("sequences")
        .get();

      const sequences = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json(sequences);
    } catch (error) {
      console.error("Fetch sequences error:", error);
      res.status(500).json({ error: "Failed to fetch sequences" });
    }
  });

  app.post("/api/sequences", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const validated = insertSequenceSchema.parse(req.body);
      
      const sequenceRef = adminDb
        .collection("tenants")
        .doc(tenantId)
        .collection("sequences")
        .doc();

      const now = new Date().toISOString();
      const sequenceData = {
        ...validated,
        tenantId,
        createdAt: now,
        updatedAt: now,
      };

      await sequenceRef.set(sequenceData);

      res.status(201).json({
        id: sequenceRef.id,
        ...sequenceData,
      });
    } catch (error) {
      console.error("Create sequence error:", error);
      res.status(500).json({ error: "Failed to create sequence" });
    }
  });

  // ==================== TEMPLATES ROUTES ====================
  
  // Get industry template packs (predefined templates)
  app.get("/api/templates/industry-packs", authenticateToken, async (req: AuthRequest, res) => {
    const { INDUSTRY_TEMPLATES } = await import('./services/template');
    res.json(INDUSTRY_TEMPLATES);
  });

  app.get("/api/templates", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const { channel, industry } = req.query;
      
      let query = adminDb
        .collection("tenants")
        .doc(tenantId)
        .collection("templates");

      if (channel) {
        query = query.where("channel", "==", channel) as any;
      }

      if (industry) {
        query = query.where("industry", "==", industry) as any;
      }

      const snapshot = await query.get();
      const templates = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json(templates);
    } catch (error) {
      console.error("Fetch templates error:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.post("/api/templates", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const validated = insertTemplateSchema.parse(req.body);
      const { extractVariables } = await import('./services/template');
      
      // Extract variables from body and subject
      const bodyVariables = extractVariables(validated.body);
      const subjectVariables = validated.subject ? extractVariables(validated.subject) : [];
      const allVariables = Array.from(new Set([...bodyVariables, ...subjectVariables]));
      
      const templateRef = adminDb
        .collection("tenants")
        .doc(tenantId)
        .collection("templates")
        .doc();

      const now = new Date().toISOString();
      const templateData = {
        ...validated,
        tenantId,
        variables: allVariables,
        createdAt: now,
        updatedAt: now,
      };

      await templateRef.set(templateData);

      res.status(201).json({
        id: templateRef.id,
        ...templateData,
      });
    } catch (error) {
      console.error("Create template error:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  // ==================== QUEUE ROUTES ====================
  
  app.get("/api/queue/throttle", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const status = await getThrottleStatus(tenantId);
      res.json(status);
    } catch (error) {
      console.error("Get throttle status error:", error);
      res.status(500).json({ error: "Failed to get throttle status" });
    }
  });

  app.get("/api/queue/next", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const batchSize = parseInt(req.query.batchSize as string) || 10;
      const emails = await getNextBatch(tenantId, batchSize);
      res.json(emails);
    } catch (error) {
      console.error("Get next batch error:", error);
      res.status(500).json({ error: "Failed to get next batch" });
    }
  });

  app.post("/api/queue/advance-warmup", authenticateToken, requireRole(['admin']), async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      await advanceWarmupStage(tenantId);
      const status = await getThrottleStatus(tenantId);
      res.json(status);
    } catch (error) {
      console.error("Advance warmup error:", error);
      res.status(500).json({ error: "Failed to advance warmup stage" });
    }
  });

  // Cron job endpoint for processing pending sequence steps
  // Should be called periodically (e.g., every 5 minutes) by external scheduler
  app.post("/api/queue/process-pending-steps", async (req: AuthRequest, res) => {
    try {
      const { processAllPendingSteps } = await import('./services/send-queue');
      await processAllPendingSteps();
      res.json({ success: true });
    } catch (error) {
      console.error("Process pending steps error:", error);
      res.status(500).json({ error: "Failed to process pending steps" });
    }
  });

  // ==================== SEQUENCE RUN ROUTES ====================
  
  app.post("/api/runs", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const { sequenceId, leadIds } = req.body;
      
      if (!sequenceId || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: "Sequence ID and lead IDs required" });
      }

      const run = await startSequenceRun({ tenantId, sequenceId, leadIds });
      res.status(201).json(run);
    } catch (error) {
      console.error("Start sequence run error:", error);
      res.status(500).json({ error: "Failed to start sequence run" });
    }
  });

  app.post("/api/runs/:id/pause", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;
      
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      await pauseRun(tenantId, id);
      res.json({ success: true });
    } catch (error) {
      console.error("Pause run error:", error);
      res.status(500).json({ error: "Failed to pause run" });
    }
  });

  app.post("/api/runs/:id/resume", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;
      
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      await resumeRun(tenantId, id);
      res.json({ success: true });
    } catch (error) {
      console.error("Resume run error:", error);
      res.status(500).json({ error: "Failed to resume run" });
    }
  });

  app.post("/api/runs/:id/lead-replied", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;
      const { leadId, replyCategory } = req.body;
      
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      await markLeadAsReplied({ tenantId, leadId, runId: id, replyCategory });
      res.json({ success: true });
    } catch (error) {
      console.error("Mark lead replied error:", error);
      res.status(500).json({ error: "Failed to mark lead as replied" });
    }
  });

  // ==================== STRIPE ROUTES ====================
  
  app.post("/api/stripe/create-checkout", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const { plan } = req.body;
      
      if (!isStripeAvailable()) {
        return res.status(503).json({ 
          error: "Billing is not available - Stripe not configured" 
        });
      }

      if (!['starter', 'pro', 'agency'].includes(plan)) {
        return res.status(400).json({ error: "Invalid plan" });
      }

      const session = await createCheckoutSession({
        tenantId,
        plan,
        successUrl: `${req.headers.origin}/dashboard?checkout=success`,
        cancelUrl: `${req.headers.origin}/settings/billing?checkout=cancelled`,
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Create checkout error:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.post("/api/stripe/create-portal", authenticateToken, async (req: AuthRequest, res) => {
    try {
      if (!isStripeAvailable()) {
        return res.status(503).json({ 
          error: "Billing portal is not available - Stripe not configured" 
        });
      }
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
      const tenantData = tenantDoc.data();
      
      if (!tenantData?.stripeCustomerId) {
        return res.status(400).json({ error: "No Stripe customer ID" });
      }

      const session = await createBillingPortalSession(
        tenantData.stripeCustomerId,
        `${req.headers.origin}/settings/billing`
      );

      res.json({ url: session.url });
    } catch (error) {
      console.error("Create portal error:", error);
      res.status(500).json({ error: "Failed to create portal session" });
    }
  });

  // ==================== SUPPRESSION ROUTES ====================

  app.get("/api/suppressions", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const { getSuppressionList } = await import('./services/suppression');
      const { limit, startAfter } = req.query;
      
      const suppressions = await getSuppressionList({
        tenantId,
        limit: limit ? parseInt(limit as string) : undefined,
        startAfter: startAfter as string,
      });

      res.json(suppressions);
    } catch (error) {
      console.error("Get suppressions error:", error);
      res.status(500).json({ error: "Failed to get suppression list" });
    }
  });

  app.post("/api/suppressions", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const { suppressEmail } = await import('./services/suppression');
      const { email, reason, source } = req.body;

      if (!email || !reason) {
        return res.status(400).json({ error: "Email and reason required" });
      }

      await suppressEmail({ tenantId, email, reason, source });
      res.status(201).json({ success: true });
    } catch (error) {
      console.error("Suppress email error:", error);
      res.status(500).json({ error: "Failed to suppress email" });
    }
  });

  app.post("/api/suppressions/bulk", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const { bulkSuppressEmails } = await import('./services/suppression');
      const { emails, reason, source } = req.body;

      if (!Array.isArray(emails) || emails.length === 0 || !reason) {
        return res.status(400).json({ error: "Emails array and reason required" });
      }

      const result = await bulkSuppressEmails({ tenantId, emails, reason, source });
      res.json(result);
    } catch (error) {
      console.error("Bulk suppress error:", error);
      res.status(500).json({ error: "Failed to bulk suppress emails" });
    }
  });

  app.delete("/api/suppressions/:email", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const { unsuppressEmail } = await import('./services/suppression');
      const { email } = req.params;

      await unsuppressEmail(tenantId, decodeURIComponent(email));
      res.json({ success: true });
    } catch (error) {
      console.error("Unsuppress email error:", error);
      res.status(500).json({ error: "Failed to unsuppress email" });
    }
  });

  // ==================== UNSUBSCRIBE ROUTES ====================

  app.get("/api/unsubscribe", async (req, res) => {
    try {
      const { processUnsubscribe } = await import('./services/unsubscribe');
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: "Unsubscribe token required" });
      }

      const result = await processUnsubscribe({
        token,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      if (result.success) {
        // Return HTML page for better UX
        res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Unsubscribed Successfully</title>
              <style>
                body { font-family: system-ui; max-width: 600px; margin: 100px auto; text-align: center; }
                h1 { color: #10b981; }
              </style>
            </head>
            <body>
              <h1>✓ Unsubscribed Successfully</h1>
              <p>You have been removed from our mailing list.</p>
              <p>Email: ${result.email}</p>
            </body>
          </html>
        `);
      } else {
        res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Unsubscribe Failed</title>
              <style>
                body { font-family: system-ui; max-width: 600px; margin: 100px auto; text-align: center; }
                h1 { color: #ef4444; }
              </style>
            </head>
            <body>
              <h1>✗ Unsubscribe Failed</h1>
              <p>${result.error}</p>
            </body>
          </html>
        `);
      }
    } catch (error) {
      console.error("Unsubscribe error:", error);
      res.status(500).send("Internal server error");
    }
  });

  // ==================== BOUNCE/COMPLAINT WEBHOOKS ====================

  app.post("/api/webhooks/bounce", async (req, res) => {
    try {
      const { processBounce } = await import('./services/bounce-handler');
      const { tenantId, bounce } = req.body;

      if (!tenantId || !bounce) {
        return res.status(400).json({ error: "Tenant ID and bounce data required" });
      }

      await processBounce({ tenantId, bounce });
      res.json({ success: true });
    } catch (error) {
      console.error("Process bounce error:", error);
      res.status(500).json({ error: "Failed to process bounce" });
    }
  });

  app.post("/api/webhooks/complaint", async (req, res) => {
    try {
      const { processComplaint } = await import('./services/bounce-handler');
      const { tenantId, complaint } = req.body;

      if (!tenantId || !complaint) {
        return res.status(400).json({ error: "Tenant ID and complaint data required" });
      }

      await processComplaint({ tenantId, complaint });
      res.json({ success: true });
    } catch (error) {
      console.error("Process complaint error:", error);
      res.status(500).json({ error: "Failed to process complaint" });
    }
  });

  app.get("/api/bounce-stats", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const { getBounceStats } = await import('./services/bounce-handler');
      const stats = await getBounceStats(tenantId);

      res.json(stats);
    } catch (error) {
      console.error("Get bounce stats error:", error);
      res.status(500).json({ error: "Failed to get bounce stats" });
    }
  });

  // ==================== EMAIL QUEUE PROCESSING ====================

  app.post("/api/queue/process", authenticateToken, requireRole(['owner', 'admin']), async (req: AuthRequest, res) => {
    try {
      const { processEmailQueue } = await import('./services/email-worker');
      
      // Trigger immediate processing (don't await - run in background)
      processEmailQueue().catch(console.error);
      
      res.json({ success: true, message: 'Email queue processing triggered' });
    } catch (error) {
      console.error("Process queue error:", error);
      res.status(500).json({ error: "Failed to process queue" });
    }
  });

  // ==================== GOOGLE OAUTH ROUTES ====================

  app.get("/api/oauth/google/start", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.uid;
      
      if (!tenantId || !userId) {
        return res.status(400).json({ error: "No tenant ID or user ID" });
      }

      const { getAuthUrl } = await import('./services/google-oauth');
      const authUrl = await getAuthUrl(tenantId, userId);

      res.json({ authUrl });
    } catch (error) {
      console.error("Google OAuth start error:", error);
      res.status(500).json({ error: "Failed to generate OAuth URL" });
    }
  });

  app.get("/api/oauth/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query;

      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        return res.status(400).send("Missing code or state parameter");
      }

      const { handleOAuthCallback } = await import('./services/google-oauth');
      const result = await handleOAuthCallback({ code, state });

      // Return success page
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Gmail Connected</title>
            <style>
              body { font-family: system-ui; max-width: 600px; margin: 100px auto; text-align: center; }
              h1 { color: #10b981; }
              .email { background: #f3f4f6; padding: 8px 16px; border-radius: 6px; display: inline-block; }
            </style>
          </head>
          <body>
            <h1>✓ Gmail Connected Successfully</h1>
            <p>Your Gmail account has been connected:</p>
            <div class="email">${result.email}</div>
            <p style="margin-top: 32px;">You can close this window and return to the app.</p>
            <script>
              // Auto-close after 3 seconds
              setTimeout(() => {
                window.close();
              }, 3000);
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Connection Failed</title>
            <style>
              body { font-family: system-ui; max-width: 600px; margin: 100px auto; text-align: center; }
              h1 { color: #ef4444; }
            </style>
          </head>
          <body>
            <h1>✗ Connection Failed</h1>
            <p>Failed to connect Gmail. Please try again.</p>
            <p style="color: #6b7280; font-size: 14px;">${error instanceof Error ? error.message : 'Unknown error'}</p>
          </body>
        </html>
      `);
    }
  });

  app.get("/api/oauth/google/status", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const { isGmailConnected } = await import('./services/google-oauth');
      const connected = await isGmailConnected(tenantId);

      if (connected) {
        // Get email address
        const tokenDoc = await adminDb
          .collection('tenants')
          .doc(tenantId)
          .collection('tokens')
          .doc('google')
          .get();
        
        const tokenData = tokenDoc.data();
        res.json({ connected: true, email: tokenData?.email || null });
      } else {
        res.json({ connected: false, email: null });
      }
    } catch (error) {
      console.error("Google OAuth status error:", error);
      res.status(500).json({ error: "Failed to check connection status" });
    }
  });

  app.delete("/api/oauth/google/disconnect", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: "No tenant ID" });
      }

      const { disconnectGmail } = await import('./services/google-oauth');
      await disconnectGmail(tenantId);

      res.json({ success: true });
    } catch (error) {
      console.error("Google OAuth disconnect error:", error);
      res.status(500).json({ error: "Failed to disconnect Gmail" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
