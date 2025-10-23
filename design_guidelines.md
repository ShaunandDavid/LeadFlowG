# Design Guidelines: LeadFlow B2B Outreach Platform

## Design Approach

**System Selected:** Linear-inspired with Stripe's data visualization principles

**Rationale:** This is a data-intensive B2B productivity tool requiring efficient information hierarchy, trustworthy aesthetics, and white-label flexibility. Drawing from Linear's clean workflows and Stripe's professional dashboard patterns ensures scalability across complex feature sets while maintaining visual coherence.

**Core Principles:**
1. Information clarity over decoration
2. Functional hierarchy with purposeful spacing
3. Data accessibility through consistent patterns
4. White-label neutrality (easily rebrandable)

---

## Typography

**Font Stack:**
- Primary: Inter (via Google Fonts CDN) - clean, readable at all sizes
- Monospace: JetBrains Mono - for code, API keys, technical data

**Hierarchy:**
- Page Titles: 30px (text-3xl), font-semibold, tracking-tight
- Section Headers: 20px (text-xl), font-semibold
- Card Titles: 16px (text-base), font-medium
- Body Text: 14px (text-sm), font-normal, leading-relaxed
- Captions/Meta: 12px (text-xs), font-normal, opacity-70
- Data Labels: 14px (text-sm), font-medium, uppercase tracking-wide for metrics
- Table Headers: 12px (text-xs), font-medium, uppercase tracking-wide

---

## Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16, 24
- Micro spacing (gaps, padding): p-2, p-4, gap-2
- Component spacing: p-6, p-8, gap-6
- Section spacing: py-12, py-16, gap-8
- Page margins: px-6 (mobile), px-8 (tablet), px-12 (desktop)

**Grid Patterns:**
- Dashboard cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6
- Main content area: max-w-7xl mx-auto
- Sidebar width: w-64 (navigation), w-80 (slide-over panels)
- Two-column layouts: grid-cols-1 lg:grid-cols-3 (1fr + 2fr split for settings)

**Container Structure:**
```
App Shell:
- Fixed sidebar (64px collapsed, 256px expanded)
- Top bar height: h-16
- Content area: flex-1 with max-width constraints
- Slide-over panels: w-80 or w-96 for details/forms
```

---

## Component Library

### Navigation
- **Sidebar:** Collapsed icons with tooltips, expanded with labels; active state with subtle accent background
- **Top Bar:** Tenant switcher (dropdown), search (cmd+k trigger), notifications badge, user avatar menu
- **Breadcrumbs:** text-xs with separator chevrons, last item non-interactive
- **Tabs:** Underline style for sub-navigation (leads status tabs, analytics views)

### Data Display
- **Tables:** Sticky headers, zebra striping (subtle), hover row highlight, checkbox column for bulk actions, sortable headers with arrow indicators, right-aligned numeric columns
- **Metric Cards:** Large number (text-2xl font-bold), label below (text-xs uppercase), trend indicator (arrow + percentage), sparkline chart for historical context
- **Status Badges:** Pill shape with dot indicator, semantic meanings (green=active/success, yellow=pending/warning, red=paused/error, gray=inactive)
- **Progress Bars:** Thin (h-2), rounded-full, with percentage label, warning thresholds (yellow at 80%, red at 95%)
- **Empty States:** Centered illustration placeholder, heading, description, primary CTA

### Forms & Inputs
- **Text Inputs:** h-10, rounded-md border, focus ring-2, label above (text-sm font-medium), helper text below (text-xs)
- **Select Dropdowns:** Chevron icon, same height as text inputs, searchable for long lists
- **Switches:** Toggle style for boolean settings (rounded-full track with sliding circle)
- **Radio Groups:** Card-style options for plan selection, stacked for simple choices
- **Multi-step Wizards:** Progress indicator at top (numbered steps with connectors), back/next buttons bottom-right, skip option where applicable

### Actions
- **Primary Button:** Solid fill, h-10, px-6, rounded-md, font-medium
- **Secondary Button:** Outlined, same dimensions
- **Ghost Button:** Text-only with hover background
- **Icon Buttons:** w-10 h-10, rounded-md, hover background
- **Dropdown Menus:** Right-aligned, rounded-lg shadow-lg, grouped sections with dividers, icons for visual scanning
- **Bulk Actions Bar:** Fixed bottom bar appearing on selection, with count indicator and action buttons

### Overlays
- **Modals:** Centered max-w-2xl, rounded-lg shadow-2xl, header with close button, footer with actions (cancel left, primary right)
- **Slide-over Panels:** Right-side w-96, full-height, for lead details, sequence step editing
- **Tooltips:** Dark background, rounded, text-xs, arrow pointer, max-w-xs with wrapping
- **Toast Notifications:** Top-right stack, auto-dismiss, status icon, close button

### Data Visualization
- **Line Charts:** Thin strokes, gradient fill below line, dot markers on hover, grid lines subtle
- **Bar Charts:** Rounded tops, spacing between bars, hover tooltip with exact value
- **Donut Charts:** Center metric display, legend with percentages, interactive segments
- **Funnel Chart:** Horizontal stages with conversion rates, width indicates volume
- **Heatmap:** Time-of-day grid, intensity-based shading, hover shows exact count

### Specialized Components
- **Sequence Step Builder:** Vertical timeline with step cards, drag handles, branch indicators, conditional logic badges
- **Email Template Editor:** Split view (variables sidebar + preview), syntax highlighting for variables, send test button
- **Guardrail Banners:** Full-width alert at page top, icon + message + action button, dismissible
- **Lead Score Display:** Letter grade (A/B/C) in circle badge, tooltip with AI-generated reason
- **Verification Badge:** Checkmark icon with status (passed/risky/failed), hover shows score details

---

## Animation Guidelines

**Use sparingly - only for feedback and micro-interactions:**
- Loading states: Skeleton screens (pulse animation), spinner for indeterminate
- Transitions: slide-over panels (300ms ease-out), modal fade-in (200ms)
- Hover feedback: button/card lift (translate-y-0.5), background opacity change
- Success confirmations: Checkmark animation on save, toast slide-in
- **Avoid:** Page transitions, scroll-triggered animations, decorative motion

---

## Page-Specific Layouts

### Dashboard
- Top row: 4 metric cards (emails sent, open rate, replies, bookings)
- Middle: 2-column grid (lead funnel chart left, recent activity feed right)
- Bottom: Guardrail status cards (bounce rate, verification health, sending capacity)

### Leads Table
- Filter bar: Status tabs + search + advanced filters dropdown
- Table: Sticky header, infinite scroll, bulk selection, quick actions menu per row
- Right panel (slide-over): Lead detail with tabs (info, activity, sequence history)

### Sequence Builder
- Left sidebar: Step library (email, SMS, wait, conditional)
- Center canvas: Vertical flow with connectable steps, drag-to-reorder
- Right panel: Step editor with template picker, variable inserter, preview

### Analytics
- Top: Date range picker + comparison toggle
- Tab navigation: Overview, Subject Lines, Send Times, Templates
- Charts in 2-column grid (funnel, performance over time, top templates, heatmap)

### Settings
- Vertical tab navigation (integrations, billing, branding, team, domain)
- Content area: Forms with clear sections, save button sticky bottom-right
- Integration cards: Logo, status badge, connect/disconnect button, settings link

### Onboarding Wizard
- Progress bar at top (5 steps)
- Centered card max-w-2xl with ample padding
- Step 1: Gmail OAuth (large button with Google logo)
- Step 2: Plan selection (card-style radio buttons with feature comparison)
- Step 3: Domain setup (wizard with DNS instruction copy buttons)
- Step 4: Import leads (dropzone + CSV template download)
- Step 5: Preview sequences (carousel of personalized samples)

---

## Images

**Hero Image (Marketing/Landing):** Not applicable - this is a SaaS application without public landing page in scope

**Dashboard Illustrations:** Use Streamline or Humaaans for empty states and onboarding wizard steps (e.g., connected inbox illustration, uploading CSV graphic)

**Integration Logos:** Display vendor logos (Gmail, Stripe, Twilio, NeverBounce) at actual size with consistent spacing in integration cards

**User Avatars:** Circular with initials fallback, w-8 h-8 for nav menu, w-10 h-10 for profiles