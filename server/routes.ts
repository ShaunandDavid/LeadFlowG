import type { Express } from "express";
import { createServer, type Server } from "http";
import { adminAuth, adminDb } from "./lib/firebase-admin";
import { authenticateToken, requireRole, AuthRequest } from "./middleware/auth";
import { scoreLead, classifyReply, isOpenAIAvailable } from "./services/openai";
import { stripe, createCheckoutSession, createBillingPortalSession, isStripeAvailable, PLAN_CONFIGS } from "./services/stripe";
import { provisionTenant, getTenantForUser } from "./services/tenant-provisioning";
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

  const httpServer = createServer(app);

  return httpServer;
}
