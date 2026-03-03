# Amble AI — Comprehensive UI/UX Audit Report

**Date:** July 2025  
**Scope:** Full source audit of `src/` — every component, context, hook, page, and global style  
**Framework:** Next.js 15 (App Router) + Tailwind CSS v4 + Firebase  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Design System & Theme](#3-design-system--theme)
4. [Per-Component Analysis](#4-per-component-analysis)
5. [Mobile Responsiveness](#5-mobile-responsiveness)
6. [Dark Mode](#6-dark-mode)
7. [Animations & Transitions](#7-animations--transitions)
8. [Loading, Error & Empty States](#8-loading-error--empty-states)
9. [Accessibility (a11y)](#9-accessibility-a11y)
10. [Performance](#10-performance)
11. [Security Concerns](#11-security-concerns)
12. [Code Quality Issues](#12-code-quality-issues)
13. [Hook Library Assessment](#13-hook-library-assessment)
14. [Priority Recommendations](#14-priority-recommendations)

---

## 1. Executive Summary

Amble AI is a feature-rich Next.js application combining: an AI Chat interface, a Billing/Dispute Resolution workspace, a Media Studio (image/video/audio), a Knowledge Base browser (Google Drive integration), Pharmacy iframe embeds, and an admin panel with usage analytics.

### Strengths
- **Polished visual design** — Glassmorphism, gradient themes (indigo→purple→pink), well-executed dark mode CSS variables
- **Rich hook library** — 30+ custom hooks covering accessibility, responsiveness, feature flags, themes, undo/redo, virtual lists, keyboard shortcuts
- **Good code splitting** — Heavy views (Billing, Studio, KB, Pharmacies) and all modals loaded via `next/dynamic`
- **Streaming chat** — SSE streaming with batched UI updates (50ms intervals), thinking/reasoning display
- **Multi-model support** — OpenAI (GPT-5 Mini, GPT-5, o3) and Google (Gemini 3 Flash, Gemini 3 Pro) with rich model selector
- **Offline resilience** — localStorage fallbacks for sessions, messages, and theme preferences

### Critical Issues
| # | Issue | Severity | Location |
|---|-------|----------|----------|
| 1 | **`dangerouslySetInnerHTML` for markdown** — XSS risk | 🔴 Critical | Message.tsx, MarkdownRenderer.tsx |
| 2 | **Dual `<Toaster>` rendering** — doubled toast notifications | 🟡 Medium | AmbleApp.tsx |
| 3 | **No mobile navigation** — sidebar has no hamburger/drawer on mobile | 🔴 Critical | Sidebar.tsx |
| 4 | **Missing ARIA attributes** across most interactive components | 🟡 Medium | Widespread |
| 5 | **Console.log debug statements left in production code** | 🟡 Medium | ProjectSidebar, BillingView, ConfirmationModal |
| 6 | **Legacy Toast.tsx** unused alongside Sonner | 🟢 Low | Toast.tsx |
| 7 | **Google API key exposed client-side** (`NEXT_PUBLIC_GEMINI_API_KEY`) | 🔴 Critical | LiveStudio.tsx |
| 8 | **ProfileModal is 785 lines** — does too much, hard to maintain | 🟡 Medium | ProfileModal.tsx |
| 9 | **UserManagementModal is 1,337 lines** — massive single component | 🟡 Medium | UserManagementModal.tsx |
| 10 | **KnowledgeBaseView is 1,219 lines** — should be split | 🟡 Medium | KnowledgeBaseView.tsx |

---

## 2. Architecture Overview

```
src/
├── app/
│   ├── page.tsx              (8 lines — renders AmbleApp)
│   ├── layout.tsx            (42 lines — Geist fonts, metadata)
│   ├── globals.css           (366 lines — full design system)
│   └── embed/page.tsx        (20 lines — embeddable chat)
├── components/
│   ├── AmbleApp.tsx          (563 lines — main orchestrator)
│   ├── admin/                (2 files — KB admin, Usage report)
│   ├── ai/                   (2 files — Capabilities dock, KB badge)
│   ├── auth/                 (2 files — Login, Auth context)
│   ├── billing/              (3 files — Settings, Tracker, index)
│   ├── chat/                 (10 files — full chat system)
│   ├── gallery/              (1 file — asset gallery)
│   ├── layout/               (5 files — sidebars, command center, router)
│   ├── modals/               (6 files — Help, Profile, Users, etc.)
│   ├── organization/         (1 file — Org switcher)
│   ├── settings/             (empty directory)
│   ├── studio/               (4 files — Image, Video, Live, MediaStudio)
│   ├── ui/                   (4 files — typing indicators, toast, markdown, model selector)
│   ├── veo/                  (4 files — prompt form, video result, icons, loading)
│   └── views/                (3 files — Billing, KB, Pharmacy)
├── contexts/
│   ├── ChatContextRefactored.tsx  (840 lines)
│   └── OrganizationContext.tsx    (170 lines)
└── hooks/                    (31 files + chat/ subdirectory)
```

**Total estimated component LOC:** ~12,000+

---

## 3. Design System & Theme

### CSS Variable Architecture (globals.css — 366 lines)

**Approach:** CSS custom properties on `:root` / `:root.dark` with Tailwind v4 `@theme inline` mapping.

```
Light:  --background: #ffffff, --foreground: #0f172a, --primary: #6366f1
Dark:   --background: #0f172a, --foreground: #f8fafc, --primary: #818cf8
```

**Utility Classes Defined:**
- `.glass` / `.glass-card` — Glassmorphism with `backdrop-blur-xl`, semi-transparent backgrounds
- `.gradient-text` — Indigo→purple→pink text gradient
- `.glow-effect` — Indigo box shadow glow
- `.futuristic-button` — Gradient background with shimmer animation
- Custom scrollbar styling (Webkit)

**Animations:** fade-in, slide-up, shimmer, float, glow-pulse, typing-bounce, typing-wave, orbit, pulse-ring

### Issues

| Issue | Details |
|-------|---------|
| **No component library / design tokens** | Every component hand-rolls Tailwind classes. No shared Button, Input, Card, or Badge primitives. This leads to visual inconsistency (e.g., `rounded-lg` vs `rounded-xl` vs `rounded-2xl` used interchangeably). |
| **Glassmorphism overuse** | `.glass-card` uses `background: rgba(255,255,255,0.05)` which is nearly invisible in light mode. The utility is dark-mode-first but the app supports both. |
| **Color inconsistency** | KnowledgeBaseAdmin uses raw `bg-white`, `border`, `text-gray-500` (no dark mode support) while other components use `dark:` variants. Similarly, AssetGallery uses hardcoded `bg-gray-800`, `bg-gray-900` dark colors without light mode alternatives. |
| **Typography scale undefined** | No `@theme` tokens for font sizes. Components use arbitrary sizes (`text-[10px]`, `text-xs`, `text-sm`, `text-lg`, `text-3xl`) without a consistent scale. |
| **Spacing inconsistency** | Padding varies between `p-3`, `p-4`, `p-6` within similar contexts. No spacing tokens. |

### Recommendations
1. Create a shared UI primitive library: `<Button>`, `<Input>`, `<Card>`, `<Badge>`, `<Modal>`, `<Dropdown>`
2. Define design tokens for typography scale, spacing, and border radius
3. Audit all components for `dark:` variant coverage — flag any using `gray-*` without `dark:` pairs
4. Consider adopting shadcn/ui or Radix primitives as a foundation

---

## 4. Per-Component Analysis

### 4.1 Core App

#### AmbleApp.tsx (563 lines)
- **Purpose:** Main orchestrator — wraps everything in `AuthProvider` → `OrganizationProvider` → `AmbleAppContent`
- **UI/UX Issues:**
  - ⚠️ **Dual `<Toaster>` components** at lines ~340 and ~400 — users see doubled toasts
  - ⚠️ Extremely prop-heavy — 15+ props passed to child components manually; consider using context or composition
  - The dark mode toggle uses `localStorage` directly instead of the `useTheme` hook that exists in hooks/
  - Voice command router (`CommandRouter`) is initialized but unclear if it has a UI indicator showing it's listening
- **Missing:** No loading/splash screen while Firebase auth initializes

#### FeatureRouter.tsx (~120 lines)
- **Purpose:** Renders active view based on `activeView` state
- **Good:** Uses `next/dynamic` for code splitting all heavy views
- **Issue:** Loading state is a centered spinner — no skeleton placeholder matching the target view

---

### 4.2 Chat Components

#### ChatInterface.tsx (~190 lines)
- **Good:** Clean composition — ChatHeader + SessionSync + ChatLayout
- **Issue:** The share/visibility toggle in ChatHeader uses inline `<select>` without styling — looks like a default browser control

#### Composer.tsx (~500 lines)
- **Purpose:** Rich message input with dictation, file attachments, reasoning mode selection
- **Good:** Textarea auto-resize, paste-to-screenshot, drag-and-drop images, voice dictation with interim preview
- **Issues:**
  - Missing `aria-label` on the send button
  - Reasoning mode toolbar (Instant/Thinking/Planner/Researcher/Coder) has no tooltip explaining what each mode does
  - No character/token count indicator
  - Max width `4xl` — on ultra-wide monitors, the composer is narrow and centered
  - File attachment buttons lack loading state while files are being processed

#### Message.tsx (~500 lines)
- **Purpose:** Message bubble rendering
- **Critical:** Uses `dangerouslySetInnerHTML` via `MarkdownRenderer` — if AI-generated content contains script tags or event handlers, it's an XSS vector. The markdown-it library must be configured with `html: false` or use DOMPurify.
- **Issues:**
  - Inline SVGs for thumbs up/down instead of reusing a shared icon component
  - Thinking/reasoning block parse uses regex on raw content — fragile if format changes
  - Source citation chips are not clickable/linkable
  - No copy-to-clipboard indicator (success/failure) after clicking copy

#### MessageList.tsx (~300 lines)
- **Good:** Welcome screen with gradient logo, auto-scroll, loading skeleton
- **Issue:** ThinkingProcess component shows phases (planning→executing→verifying) but the phase detection is hardcoded — won't adapt to new thinking patterns

#### Sidebar.tsx (chat) (~300 lines)
- **Good:** Search, date-grouped sessions, glassmorphism styling
- **Issues:**
  - Delete button appears on every session with no undo — easy to accidentally delete
  - No pagination or virtual scrolling for long session lists
  - Empty state message is generic — could suggest creating a new chat

#### ArtifactsPanel.tsx (~200 lines) / ArtifactRenderer.tsx (~150 lines)
- **Good:** Version history, prev/next navigation, download with auto-naming
- **Issue:** HTML artifacts rendered in sandboxed iframe — good for security, but no size controls

#### ChatErrorBoundary.tsx (241 lines)
- **Good:** Class-based error boundary with retry (max 3), error reporting TODO
- **Issue:** `// TODO: Send to Sentry` — error reporting not implemented

#### MessageFeedback.tsx (299 lines)
- **Good:** Thumbs up/down with detailed category feedback (accurate, helpful, clear, etc.)
- **Issue:** `sr-only` labels present — one of the few components with accessibility annotations

#### EmbedChat.tsx (~50 lines)
- **Minimal:** Header ("Customer Support"), MessageList, Composer
- **Issue:** No customization props for branding — hardcoded title and "online" indicator

---

### 4.3 Layout Components

#### Sidebar.tsx (main) (~500 lines)
- **Purpose:** Main app sidebar with navigation, profile menu
- **Good:** Collapsible with hover expand (64px→256px), permission-based visibility, OrgSwitcher
- **Critical Issues:**
  - **No mobile support** — sidebar is 64px wide and fixed, no hamburger menu or drawer
  - No `aria-navigation` landmark
  - Profile popover creates its own manual dropdown — should use a proper Popover component

#### ProjectSidebar.tsx (~400 lines)
- **Purpose:** Project/chat tree with CRUD operations
- **Issues:**
  - `console.log("DELETING PROJECT...")` debug statements left in code
  - Delete operations use `window.confirm()` — inconsistent with the rest of the app's modal system
  - No drag-and-drop to organize chats between projects

#### GlobalCommandCenter.tsx (~200 lines)
- **Purpose:** Top header bar with model selector, view-specific controls
- **Good:** Sticky, glassmorphism backdrop, mode context tooltip
- **Issue:** Only shows "New Patient" button for billing view — other views have no contextual actions

#### PharmacySidebar.tsx (~200 lines)
- **Good:** Collapsible, hover expand, active state styling
- **Issue:** Only 2 pharmacy options (Revive/Align) — hardcoded, not configurable

---

### 4.4 Auth Components

#### LoginRefactored.tsx (375 lines)
- **Purpose:** Email/password login, Google Sign-In, password reset (3 views)
- **Good:** Clean tabbed flow (login → reset → sent confirmation)
- **Issues:**
  - No "Remember me" checkbox
  - No password strength indicator
  - Error messages are generic — Firebase error codes mapped but some return raw codes
  - No rate limiting indication to user

#### AuthContextRefactored.tsx (~300 lines)
- **Good:** SSR-safe with mounted state check, Firebase auth integration
- **Issues:**
  - `resetPassword` returns `false` with a `// TODO: implement` comment
  - `updateUserConfig` has a TODO comment — partially unimplemented

---

### 4.5 UI Component Library

#### TypingIndicator.tsx (~230 lines)
- **Good:** 3 variants (dots, pulse, wave), AIAvatar with orbiting particles, MessageSkeleton
- **Issue:** All variants always animate — no `prefers-reduced-motion` support

#### Toast.tsx (~45 lines)
- **Unused:** App uses Sonner `<Toaster>` — this legacy component should be removed

#### MarkdownRenderer.tsx (~25 lines)
- **Critical:** Uses `markdown-it` with `dangerouslySetInnerHTML`. No DOMPurify sanitization.
- **Issue:** Minimal wrapper — doesn't leverage markdown-it plugins for tables, task lists, etc.

#### ModelSelector.tsx (439 lines)
- **Good:** Full keyboard navigation (arrows, Enter, Escape), search, categories, badges (NEW, POPULAR, FAST, PRO)
- **Issues:**
  - 3 variants (default, compact, pill) with significant code duplication
  - Missing `role="listbox"` / `role="option"` ARIA attributes
  - No loading state if models are fetched dynamically

---

### 4.6 Views

#### BillingView.tsx (741 lines)
- **Purpose:** Dispute resolution workspace — dual-pane (dispute details + case notes), voice dictation, PII redaction, PDF export
- **Good:** Push-to-talk (spacebar), append/replace dictation modes, image paste, streaming reply
- **Issues:**
  - `console.log` statements in streaming handler
  - PDF export uses dynamic `@react-pdf/renderer` import — good for bundle size, but no progress indicator
  - PII redaction regex is basic — misses many PII patterns (addresses, names, etc.)
  - Keyboard shortcuts bound in `useEffect` without proper cleanup of stale closures
  - Reply area `max-h-[400px]` — can feel cramped for long replies

#### KnowledgeBaseView.tsx (1,219 lines)
- **Purpose:** Google Drive file browser with preview pane
- **Issues:**
  - **Massive single component** — file tree, file preview, image viewer, text viewer, drive API all in one file
  - No dark mode support in many sections (hardcoded `bg-white`, `text-gray-500`)
  - File preview uses multiple Google Drive iframe URLs — some blocked by CORS/CSP policies
  - No breadcrumb navigation in file tree
  - Image zoom controls but no pan support

#### PharmacyView.tsx (~170 lines)
- **Good:** Persistent iframe mounting across view switches, loading/error states, refresh/open-in-new-tab
- **Clean implementation** — one of the better-designed view components

---

### 4.7 Admin Components

#### UsageReport.tsx (954 lines)
- **Purpose:** Admin usage analytics with charts (recharts: BarChart, PieChart, AreaChart)
- **Issues:**
  - Charts use hardcoded colors — no dark mode adaptation on chart backgrounds
  - No responsive chart sizing
  - Batch deletion with `Promise.all` — could timeout on large datasets
  - No export/download option for reports

#### KnowledgeBaseAdmin.tsx (455 lines)
- **Good:** Status dashboard, sync controls, test search, configuration display
- **Issues:**
  - No dark mode classes — uses raw `bg-white`, `border`, `hover:bg-gray-50`
  - `confirm()` dialog for rebuild — inconsistent with modal system
  - Auto-refresh every 30 seconds — no visual indicator of refresh timing

---

### 4.8 Studio Components

#### MediaStudio.tsx (~65 lines)
- **Good:** Clean tab router (Image/Video/Audio) with sidebar navigation
- **Minimal issues** — well-composed container

#### ImageStudio.tsx (409 lines)
- **Purpose:** Image generation (DALL-E 3 / Gemini), style transfer, in-paint editing
- **Good:** Canvas-based mask editing with brush size control, undo history
- **Issues:**
  - Alert dialogs (`alert("Please upload a content image first")`) — should use toast/modal
  - Canvas coordinate mapping may drift on high-DPI displays
  - No image size/dimension selection UI

#### VideoStudio.tsx (420 lines)
- **Purpose:** Video generation (Veo 3, Sora 2) and video analysis
- **Good:** Upload progress indicator, model selector, gallery tab
- **Issues:**
  - Error messages use raw server text — no user-friendly mapping
  - Video extend feature requires 720p — constraint not clearly communicated to user

#### LiveStudio.tsx (612 lines)
- **Purpose:** Real-time audio (Gemini Live) and TTS
- **Critical:** `process.env.NEXT_PUBLIC_GEMINI_API_KEY` — API key exposed to client bundle
- **Issues:**
  - OpenAI Realtime falls back to Gemini with an alert — confusing UX
  - Uses deprecated `createScriptProcessor` — should use `AudioWorklet`
  - No visual audio level indicator (waveform/VU meter) during live session
  - Tool function management (add/remove) feels like a developer debug feature

---

### 4.9 Modals

#### HelpModal.tsx (~180 lines)
- **Good:** Clean help guide with icons, sections, and keyboard shortcut documentation
- **No issues** — well-designed

#### ProfileModal.tsx (785 lines)
- **Critical size issue** — handles profile editing, security, AI config (Amble + CX), usage stats, premium settings
- **Should be split** into ProfileSettings, SecuritySettings, AIConfig, UsageView sub-components
- **Issues:**
  - 7 tabs in one modal — overwhelming for users
  - Some tabs (users, premium) are hidden conditionally but state is still initialized

#### UserManagementModal.tsx (1,337 lines)
- **Largest component in the codebase**
- **Should be split** into UserList, UserEditor, UserCreator, UsageAnalytics sub-components
- **Issues:**
  - `window.location.reload()` after saving user settings — breaks SPA experience
  - Multiple nested modals (delete confirmation inside user editor inside user management)

#### ClearDataModal.tsx (~50 lines) / ConfirmationModal.tsx (~70 lines)
- **Good:** Clean, reusable confirmation dialogs
- **Issue in ConfirmationModal:** `console.log("ConfirmationModal: Inner Button Clicked")` left in

#### ProjectSettingsModal.tsx (225 lines)
- **Good:** Project name, description, system prompt, policies CRUD — well-scoped

---

### 4.10 AI & Organization Components

#### CapabilitiesDock.tsx (~140 lines)
- **Good:** Right-slide panel with toggle switches for capabilities (voice, web browse, code interpreter, etc.)
- **Issues:**
  - Custom checkbox toggle with complex Tailwind (`peer-checked:after:translate-x-full`) — should be a shared `<Toggle>` component
  - No animation on capability enable/disable

#### KBStatusBadge.tsx (138 lines)
- **Good:** Compact status indicator, auto-refresh every 60 seconds
- **No major issues**

#### OrgSwitcher.tsx (~60 lines)
- **Good:** Simple dropdown for organization switching
- **Issue:** Manual dropdown implementation — click-outside uses `fixed inset-0` overlay. Should use a proper Dropdown component.

---

## 5. Mobile Responsiveness

### Current State: 🔴 Poor

| Component | Mobile Support |
|-----------|---------------|
| Main Sidebar | ❌ Fixed 64px, no hamburger/drawer |
| Chat Sidebar | ❌ Always visible on lg:, hidden otherwise with no toggle |
| ProjectSidebar | ❌ No mobile toggle |
| PharmacySidebar | ❌ No mobile toggle |
| BillingView | ⚠️ `md:flex-row` — stacks vertically, but cramped |
| Chat messages | ✅ Responsive widths |
| MediaStudio | ❌ 264px fixed sidebar, no collapse on mobile |
| CommandCenter | ⚠️ Renders but model selector may overflow |
| ImageStudio | ❌ Fixed 320px sidebar, no mobile layout |
| KnowledgeBaseView | ❌ Dual-pane layout doesn't collapse |
| Modals | ✅ Most use `mx-4` for mobile margins |

### Key Missing Patterns
- No `useResponsive` hook usage in components (hook exists but isn't integrated)
- No mobile navigation drawer
- No bottom tab bar for mobile
- No responsive breakpoint for sidebar collapse
- `hidden sm:inline` used sporadically but not systematically

---

## 6. Dark Mode

### Current State: ✅ Good (with gaps)

**Implementation:** Class-based (`.dark` on `:root`) stored in `localStorage`, toggled via sidebar profile menu.

**Well-Implemented:**
- All chat components
- Main sidebar
- Composer
- Modals (Help, Clear, Confirmation, Project)
- BillingView
- PharmarmacyView (uses dark iframe backgrounds)

**Missing dark mode:**
- ❌ KnowledgeBaseAdmin — uses raw `bg-white`, `text-gray-500`, `border`, `hover:bg-gray-50`
- ❌ Parts of UsageReport — chart backgrounds hardcoded white
- ❌ AssetGallery — uses `bg-gray-800` hardcoded (only dark mode)
- ❌ Veo components — mixed: some use `dark:` variants, LoadingIndicator does, but VideoResult uses `bg-gray-*` only

### Recommendation
Use the existing `useTheme` hook (375 lines, full-featured with system preference) instead of the manual `localStorage.getItem('darkMode')` toggling in AmbleApp.tsx.

---

## 7. Animations & Transitions

### Current State: ✅ Good

**Defined in globals.css:**
- `fade-in` (opacity 0→1)
- `slide-up` (translateY 10px→0)
- `shimmer` (shimmer gradient sweep)
- `float` (translateY oscillation)
- `glow-pulse` (box-shadow pulse)
- `typing-bounce` / `typing-wave` (typing indicator)
- `orbit` (rotating elements)
- `pulse-ring` (expanding rings)

**Used extensively in:**
- Message appearance (`animate-in fade-in`)
- Modal entry (`animate-in zoom-in-95`)
- Sidebar hover transitions
- Typing indicators
- AI Avatar orbiting particles

### Issues
- **No `prefers-reduced-motion` support** — animations play regardless of user preference
- **Missing:** Page/view transition animations when switching between Amble/Billing/Studio/KB
- The `TypingIndicator` variants always animate — should respect `useAccessibility`'s `useReducedMotion` hook

---

## 8. Loading, Error & Empty States

### Loading States

| Component | State | Quality |
|-----------|-------|---------|
| Chat messages | Skeleton loader (MessageSkeleton) | ✅ Good |
| Feature views | Centered spinner via dynamic import | ⚠️ Generic |
| BillingView | Button spinner during generation | ✅ Good |
| KnowledgeBaseView | Spinner + "Loading..." text | ⚠️ Basic |
| UsageReport | Spinner | ⚠️ Basic |
| Auth | No loading indicator during login | ❌ Missing |
| Studio operations | Spinner during generation | ✅ Good |
| Video generation | Fun rotating messages | ✅ Great |

### Error States

| Component | State | Quality |
|-----------|-------|---------|
| ChatErrorBoundary | Full error UI with retry | ✅ Good |
| PharmacyView | Error with retry button | ✅ Good |
| BillingView | Toast error messages | ✅ Adequate |
| KnowledgeBaseView | Error text display | ⚠️ Basic |
| Auth login | Error message below form | ✅ Good |
| Studio | Console.error + alert() | ❌ Poor |

### Empty States

| Component | State | Quality |
|-----------|-------|---------|
| Chat (no messages) | Welcome screen with gradient logo | ✅ Great |
| BillingView (empty) | Action cards (dictation, upload, manual entry) | ✅ Great |
| Chat sidebar (no sessions) | "No conversations yet" text | ⚠️ Basic |
| AssetGallery (empty) | "No generated assets found. Start creating!" | ⚠️ Basic |
| KB file preview | "Select a file to preview" with icon | ✅ Good |
| PharmacyView (no selection) | "Select a Pharmacy" with arrow | ✅ Good |

---

## 9. Accessibility (a11y)

### Current State: 🟡 Fair (infrastructure exists, not applied)

**Infrastructure Available (but largely unused):**
- `useAccessibility` hook (422 lines) — live region announcements, focus management, focus trapping, skip links, reduced motion detection, high contrast detection
- `useKeyboardShortcuts` hook (308 lines) — configurable shortcuts with scope support
- `MessageFeedback` — has `sr-only` labels on feedback buttons

**Critical Gaps:**

| Issue | Impact | Location |
|-------|--------|----------|
| No `role="navigation"` on sidebars | Screen readers can't identify nav regions | Sidebar.tsx, ProjectSidebar.tsx |
| No `aria-label` on icon-only buttons | Buttons are unlabeled for screen readers | Composer send, sidebar collapse, delete buttons |
| `ModelSelector` dropdown lacks `role="listbox"` | Not navigable by assistive tech | ModelSelector.tsx |
| Form inputs lack associated `<label>` elements | Forms not properly labeled | Login, BillingView, ProjectSettings |
| No skip navigation link | Keyboard users can't skip to content | layout.tsx |
| No focus visible indicators beyond browser defaults | Custom focus rings not defined | Global |
| Modal focus trapping not implemented | Focus escapes modals to background | All modals |
| Color contrast not verified | Small text at `text-[10px]` with `text-muted-foreground` may fail WCAG | UsageTracker, BillingSettings |
| `useAccessibility` hook exists but is never imported by any component | Full a11y infrastructure sitting unused | hooks/useAccessibility.tsx |

### Recommendation
The `useAccessibility` hook is well-built (live regions, focus trap, reduced motion). Actually integrate it:
- Add `useAnnounce()` to chat for "Message sent", "New response received"
- Add `useFocusTrap()` to every modal
- Add `useReducedMotion()` check before animations
- Add `useSkipLink()` to layout

---

## 10. Performance

### Positive Patterns
- **Code splitting:** All heavy views and modals loaded via `next/dynamic` with `{ ssr: false }`
- **Streaming batching:** Chat context batches UI updates during streaming at 50ms intervals
- **PDF dynamic import:** `@react-pdf/renderer` imported only when export is triggered (~100KB savings)
- **Lazy session hydration:** Sessions load from localStorage first, then Firestore with 10-second timeout
- **Persistent pharmacy iframes:** Iframes remain mounted across view switches (avoid re-login)

### Concerns
- **No virtual scrolling for chat messages** — `useVirtualList` hook exists but MessageList renders all messages
- **Recharts in UsageReport** — Full recharts bundle loaded for admin page
- **Image attachments stored as base64** in Firestore messages — large payloads
- **No image optimization** — `<img>` tags used directly instead of Next.js `<Image>` component
- **UsageReport fetches all usage_logs** without server-side pagination — will scale poorly
- **30+ hooks imported individually** — some could be tree-shaken if barrel exports are cleaned up
- **FilePreview creates blob URLs** but cleanup only happens on file change, not unmount

---

## 11. Security Concerns

| Issue | Severity | Details |
|-------|----------|---------|
| `dangerouslySetInnerHTML` | 🔴 Critical | Used in Message.tsx and MarkdownRenderer.tsx for AI output. If markdown-it `html` option is enabled, XSS is possible. **Fix:** Add DOMPurify or set `html: false`. |
| Client-side API key | 🔴 Critical | `process.env.NEXT_PUBLIC_GEMINI_API_KEY` in LiveStudio.tsx — visible in client bundle. Should proxy through API route. |
| PII redaction is client-side only | 🟡 Medium | BillingView's `redactPII()` runs in browser — PII is still sent to the AI API unredacted. |
| No CSRF protection | 🟡 Medium | API routes called with simple JSON — no CSRF tokens. |
| `window.confirm()` for destructive actions | 🟢 Low | Used in KnowledgeBaseAdmin and ProjectSidebar instead of custom modals. |
| Iframe sandbox permissions | 🟡 Medium | PharmacyView grants `allow-same-origin allow-scripts` — standard but allows pharmacy apps full JS execution. |

---

## 12. Code Quality Issues

| Issue | Location | Fix |
|-------|----------|-----|
| `console.log` in production code | BillingView streaming, ProjectSidebar delete, ConfirmationModal click, UsageReport tracking | Remove or replace with structured logging |
| `window.location.reload()` | UserManagementModal after save | Use state update or router refresh |
| `alert()` calls | ImageStudio, LiveStudio | Replace with toast notifications |
| Empty `settings/` directory | src/components/settings/ | Remove or implement |
| Legacy `Toast.tsx` component | ui/Toast.tsx | Remove — app uses Sonner |
| Inconsistent error handling | Some use toast, some use alert(), some silently catch | Standardize on toast (Sonner) |
| TODO comments unresolved | AuthContext (`resetPassword`), AuthContext (`updateUserConfig`), ChatErrorBoundary (Sentry) | Implement or track |
| `any` types widespread | Most component props, hook returns | Add proper TypeScript types |
| Deprecated Web API | `createScriptProcessor` in LiveStudio | Migrate to `AudioWorklet` |
| Component size | UserManagementModal (1,337 lines), KnowledgeBaseView (1,219 lines), UsageReport (954 lines), ProfileModal (785 lines) | Split into sub-components |

---

## 13. Hook Library Assessment

The hooks library is **impressively comprehensive** — 31 hooks + chat/ subdirectory. However, **most hooks are not actually used by any component**.

### Hooks: Used vs. Unused

| Hook | Used? | Notes |
|------|-------|-------|
| useAiDictation | ✅ | Composer, BillingView |
| useStandardDictation | ✅ | BillingView |
| useAppNavigation | ✅ | AmbleApp |
| useModelSelection | ✅ | AmbleApp |
| useProjectState | ✅ | AmbleApp |
| useAmbleConfig | ✅ | AmbleApp |
| useHotkeys | ✅ | AmbleApp |
| useFirebaseAuth | ✅ | AuthContext |
| useLocalStorage | Likely | Common pattern |
| useDebounce | Likely | Common pattern |
| **useAccessibility** | ❌ | 422 lines, fully built, never imported |
| **useTheme** | ❌ | 375 lines, full theme system, AmbleApp uses manual localStorage |
| **useResponsive** | ❌ | 282 lines, breakpoint hooks, no component uses it |
| **useKeyboardShortcuts** | ❌ | 308 lines, AmbleApp uses useHotkeys instead |
| **useFeatureFlags** | ❌ | 326 lines, full flag system with rollouts, never used |
| **useConnectionStatus** | ❌ | 230 lines, connection quality monitoring, never used |
| **useCommandPalette** | ❌ | Not integrated into any UI |
| **useVirtualList** | ❌ | MessageList renders all messages directly |
| **useUndoRedo** | ❌ | Not used in any editor/form |
| **useMessageSearch** | ❌ | Chat sidebar has its own search |
| **useToast** | ❌ | App uses Sonner directly |
| **useConfirm** | ❌ | Components use window.confirm() or custom modals |

### Recommendation
Either integrate these hooks or remove them. Unused code:
- Increases bundle size
- Creates maintenance burden
- Misleads developers about available features

---

## 14. Priority Recommendations

### 🔴 P0 — Fix Immediately

1. **Sanitize markdown output** — Add DOMPurify to `MarkdownRenderer.tsx` and `Message.tsx`
2. **Remove client-side API key** — Move Gemini Live API calls to a server-side API route
3. **Fix dual Toaster** — Remove the duplicate `<Toaster>` in AmbleApp.tsx
4. **Add mobile navigation** — Implement hamburger menu / drawer for all sidebars

### 🟡 P1 — Fix Soon

5. **Integrate accessibility hook** — Add focus trapping to modals, screen reader announcements to chat, skip navigation link
6. **Add `prefers-reduced-motion` support** — Gate all animations behind `useReducedMotion()`
7. **Split mega-components** — UserManagementModal, KnowledgeBaseView, UsageReport, ProfileModal
8. **Remove stale code** — Legacy Toast.tsx, empty settings/ directory, console.log statements, TODO comments
9. **Integrate `useTheme` hook** — Replace manual localStorage dark mode toggle
10. **Fix dark mode gaps** — KnowledgeBaseAdmin, UsageReport charts, AssetGallery, Veo components

### 🟢 P2 — Improve

11. **Create shared UI primitives** — Button, Input, Card, Modal, Toggle, Dropdown, Badge
12. **Integrate `useResponsive`** — Use breakpoint hooks for adaptive layouts
13. **Add virtual scrolling** — Integrate `useVirtualList` for MessageList and session lists
14. **Replace `alert()`/`confirm()`** — Use Sonner toasts and ConfirmationModal consistently
15. **Add page transition animations** — Animate between Amble/Billing/Studio/KB views
16. **Add connection status indicator** — Use `useConnectionStatus` to show offline banners
17. **Use Next.js `<Image>`** — Replace `<img>` tags for optimized image loading
18. **Add proper TypeScript types** — Replace `any` with specific interfaces

---

*End of audit. This report covers all 50+ component files, 31 hooks, 2 context providers, 2 pages, and the global design system.*
