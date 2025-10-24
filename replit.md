# B2B Outreach Automation Platform

## Overview
A production-grade, white-label B2B outreach automation platform designed with a multi-tenant architecture. It features AI-powered lead intelligence, comprehensive email sequence management, advanced deliverability safeguards, and metered billing capabilities. The platform aims to streamline B2B outreach processes, enhance lead engagement, and provide robust tools for efficient campaign management.

## User Preferences
I prefer clear and direct communication. I value a development process that is iterative and allows for frequent feedback. Please ask for my approval before implementing any major architectural changes or introducing new external dependencies. I also prefer detailed explanations for complex technical decisions. Do not make changes to the `server/services/tenant-provisioning.ts` file, and do not modify any files within the `node_modules` directory.

## System Architecture
The platform employs a multi-tenant design with complete data isolation, using Firebase custom claims for `tenantId` and `role` to scope all data. The technology stack includes React 18, TypeScript, Wouter, TanStack Query, Tailwind CSS, and Shadcn UI for the frontend; Node.js and Express with Firebase Admin SDK for the backend; and Cloud Firestore as the primary database. Authentication is handled via Firebase Authentication with Google OAuth.

The UI/UX follows a Linear-inspired professional B2B SaaS design, featuring the Inter font family, JetBrains Mono for code, dark mode support, and a responsive, mobile-first approach with consistent spacing and typography. Key features include a 5-step onboarding wizard, a real-time dashboard for metrics and activity, advanced lead management with AI scoring, a multi-step email sequence builder with templates, and comprehensive analytics. Critical implementations include robust tenant provisioning, graceful service degradation handling for external APIs (Stripe, OpenAI), and a resilient Firebase Admin initialization.

## External Dependencies
- **Stripe**: For subscription management, metered billing, and checkout processes.
- **OpenAI**: Utilized for AI-powered lead scoring, reply sentiment classification, and email content generation.
- **Gmail OAuth**: Integrated for email sending capabilities through the Gmail API, including token management and RFC822 email formatting.
- **NeverBounce**: Used for single and batch email verification, including usage metering and limit enforcement.