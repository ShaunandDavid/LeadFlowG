import type { Express } from "express";
import { createServer, type Server } from "http";
import { adminAuth, adminDb } from "./lib/firebase-admin";
import { authenticateToken, requireRole, AuthRequest } from "./middleware/auth";
import { scoreLead, classifyReply } from "./services/openai";
import { stripe, createCheckoutSession, createBillingPortalSession, PLAN_CONFIGS } from "./services/stripe";
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
      
      res.json({
        needsOnboarding: !tenantInfo,
        tenantId: tenantInfo?.tenantId,
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
        return res.json({ tenantId: existing.tenantId, alreadyProvisioned: true });
      }
      
      const { plan } = req.body;
      
      const result = await provisionTenant({
        uid: decodedToken.uid,
        email: decodedToken.email || '',
        displayName: decodedToken.name || decodedToken.email || 'User',
        photoURL: decodedToken.picture,
        plan: plan || 'starter',
      });

      res.json(result);
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

  app.post("/api/leads/:id/score", authenticateToken, async (req: AuthRequest, res) => {
    try {
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
