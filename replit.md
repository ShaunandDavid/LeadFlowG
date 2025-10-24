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

### Native Booking Page (NEW)
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