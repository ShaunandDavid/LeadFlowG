# B2B Outreach Automation Platform

## Overview
A production-grade, white-label B2B outreach automation platform designed with a multi-tenant architecture. It features AI-powered lead intelligence, comprehensive email sequence management, advanced deliverability safeguards, native booking page with Google Calendar integration, and metered billing capabilities. The platform aims to streamline B2B outreach processes, enhance lead engagement, and provide robust tools for efficient campaign management.

## User Preferences
I prefer clear and direct communication. I value a development process that is iterative and allows for frequent feedback. Please ask for my approval before implementing any major architectural changes or introducing new external dependencies. I also prefer detailed explanations for complex technical decisions. Do not make changes to the `server/services/tenant-provisioning.ts` file, and do not modify any files within the `node_modules` directory.

## System Architecture
The platform employs a multi-tenant design with complete data isolation, using Firebase custom claims for `tenantId` and `role` to scope all data. The technology stack includes React 18, TypeScript, Wouter, TanStack Query, Tailwind CSS, and Shadcn UI for the frontend; Node.js and Express with Firebase Admin SDK for the backend; and Cloud Firestore as the primary database. Authentication is handled via Firebase Authentication with Google OAuth.

The UI/UX follows a Linear-inspired professional B2B SaaS design, featuring the Inter font family, JetBrains Mono for code, dark mode support, and a responsive, mobile-first approach with consistent spacing and typography. Key features include a 5-step onboarding wizard, a real-time dashboard for metrics and activity, advanced lead management with AI scoring, a multi-step email sequence builder with templates, native booking page for lead meeting scheduling, AI-powered reply classification with automatic lead status updates, and comprehensive analytics. Critical implementations include robust tenant provisioning, graceful service degradation handling for external APIs (Stripe, OpenAI), and a resilient Firebase Admin initialization.

## External Dependencies
- **Stripe**: For subscription management, metered billing, and checkout processes.
- **OpenAI**: Utilized for AI-powered lead scoring, reply sentiment classification, and email content generation.
- **Gmail OAuth**: Integrated for email sending capabilities through the Gmail API, including token management and RFC822 email formatting.
- **Google Calendar API**: Used for booking page functionality, including availability calculation, meeting scheduling, and automatic Google Meet link generation. Shares OAuth scopes with Gmail integration.
- **NeverBounce**: Used for single and batch email verification, including usage metering and limit enforcement.

## Production-Ready Features

### Email Deliverability Safeguards
Comprehensive compliance and deliverability protection system:
- **Unsubscribe System**: Cryptographically-signed tokens, automatic link embedding in all emails, public unsubscribe page
- **Bounce Detection**: Automated Gmail API monitoring every 5 minutes, parses bounce notifications (mailer-daemon, postmaster), categorizes hard vs. soft bounces
- **Suppression List Management**: Global do-not-contact enforcement, prevents sends to unsubscribed/bounced addresses, tenant-scoped and platform-level blocking
- **Automatic Lead Status Updates**: Lead status updates to "unsubscribed" or "bounced" based on suppression reason
- **Compliance UI**: Admin interface for viewing/searching suppressed emails, manual add/remove, bulk operations, CSV export
- **Email Worker Integration**: Pre-send suppression checks prevent emails to blocked addresses, unsubscribe links auto-embedded in all outreach

### Native Booking Page
A white-label booking page that allows leads to schedule meetings directly from outreach emails. Features include:
- **Public Booking Interface**: Accessible at `/book/:tenantId/:leadId` without authentication
- **Configurable Meeting Types**: Multiple meeting types with customizable durations, descriptions, locations (Google Meet, Zoom, Phone, In-Person)
- **Smart Availability Calculation**: Timezone-aware scheduling with automatic conflict detection against existing Google Calendar events
- **Buffer Time Management**: Configurable buffer time between meetings to allow for preparation
- **Minimum Notice & Maximum Advance**: Control how far in advance and how last-minute bookings can be made
- **Automatic Calendar Integration**: Creates Google Calendar events with Meet links, updates lead status to "booked"
- **Weekly Availability Scheduling**: Flexible time slot configuration with support for multiple slots per day
- **Admin Settings UI**: Comprehensive configuration interface in Settings → Booking tab

### Reply Classifier
AI-powered email reply classification system that automatically categorizes lead responses:
- **Classification Categories**: Positive, Out of Office, Unsubscribe Request, Not Interested, Meeting Booked
- **Automatic Lead Status Updates**: Updates lead status based on reply sentiment
- **HTML Email Parsing**: Extracts text from HTML emails with fallback to keyword detection
- **OpenAI Integration**: Uses GPT-4 for accurate sentiment analysis with graceful degradation

### Campaign Analytics & Reporting
Comprehensive analytics system for tracking and optimizing outreach performance:
- **Tracking Infrastructure**: HMAC-signed tracking tokens (14-day expiry) for secure pixel and click tracking
- **Open Tracking**: 1x1 pixel tracker embedded in all HTML emails, tracks when leads open emails
- **Click Tracking**: Transparent redirect system wraps all email links to track clicks before redirecting to destination
- **8 Event Types**: send_ok, open, click, reply, booked, bounce, complaint, unsubscribe
- **Real-time Rollup Aggregation**: Automatic daily aggregation at tenant, sequence, and template levels using atomic Firebase increments
- **Comprehensive Dashboard**: KPI cards (sends, open rate, click rate, reply rate), booking conversion metrics, engagement funnel visualization
- **Date Range Filtering**: 7-day, 30-day, and 90-day views
- **CSV Export**: Download raw analytics data for external analysis
- **Timestamp Validation**: Multi-layer validation prevents corrupt rollup data with missing/invalid timestamps
- **Event Sources**: Integrated across email worker, reply classifier, booking service, bounce detector, and unsubscribe handler