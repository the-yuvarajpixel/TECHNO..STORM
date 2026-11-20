# Sentinel

**Sentinel** is a breach-minimal security monitoring and incident response platform designed so that even a compromise of the monitor itself exposes as little sensitive data as possible. It combines customer-edge HMAC redaction, machine-identity behavioral fingerprinting, stealth honey traps, blast-radius-checked response actions with 1-click undo, a tamper-evident hash-chained log vault, and real-time webhook/push alerting in a unified Admin Management Portal.

---

## Key Features

### Unified Admin Management Portal
All security operations and executive governance workflows live in a single authenticated workspace:

- **Overview & Alerts**: Live alert triage feed with blast-radius impact previews, narrow containment actions with 1-click undo, resolve/dismiss workflow (feeding false positives back into baseline learning), search & multi-filter bar (severity, source IP, timestamp range), CSV audit export, and **View Settings** with a 30-second auto-refresh toggle and live countdown.
- **Run Breach Drill (Sandbox)**: Automated multi-stage intrusion simulator (*Multi-System Kill Chain*, *Finance & Insider Fraud*, and *Deception & Honey-Trap Probe*) that replays anomalous activity across Helpdesk, CRM, Payroll, ERP, and Honey Traps so SecOps teams can validate alerting, edge redaction, and response runbooks safely.
- **Executive Posture & Governance**: Board-ready risk posture summary, control-drift KPIs, active incidents overview, regional data residency status, and BYOK KMS key posture.
- **Machine-Identity Fingerprints**: Per-service baseline tracking (active hours, expected IP allowlists, hourly volume bounds, and endpoint profiles) with visual drift inspection and automatic baseline learning.
- **Stealth Honey Traps**: Plantable decoy API keys, ERP vendor accounts, and fake endpoints that hide bait labels in attacker-facing views, trigger near-certain critical alerts on first touch, automatically block intruders, and support 1-click Admin release/unblock.
- **Tamper-Evident Log Vault & Ingest**: SHA-256 hash-chained audit ledger with deterministic single-byte tamper verification, live event ingestion tester, search/filtering, jump-to-exact-log-spot links from alerts, and CSV audit export.
- **Control-Drift Toolkit**: Dual-control payment hold verification for last-minute vendor bank changes, plus a live Helpdesk Ticket Secret Scanner that redacts leaked credentials and PII before storage.
- **Webhooks & Push Notifications**: Outbound Slack, Discord, PagerDuty, Teams, and custom HMAC-SHA256-signed webhooks with a built-in loopback verification receiver, real-time notification drawer with **Mark All as Read**, and browser push/chime toggles.
- **Security Analyst Assistant**: Multi-turn context-aware security analyst drawer grounded in the live alert queue, vault integrity state, and fingerprints, with Firestore-persisted operator conversation history.
- **Architecture & Data Plane**: Visual overview of the customer-edge redaction boundary, outbound-only ingestion flow, and regional storage guarantees.

### Interactive Demo Attacker Portal
A dedicated simulation workspace allowing operators to trigger credential abuse, vendor bank hijacking, helpdesk token leaks, and stealth honey-key probes against the live Sentinel backend to observe real-time detection and containment end-to-end.

---

## Security & Privacy Architecture

- **Zero Plaintext Secret Persistence**: Secrets, JWTs, IBANs, SSNs, card numbers, emails, and high-entropy tokens are stripped at the customer-edge boundary (`src/core/redaction.ts`) and replaced with deterministic HMAC-SHA256 pseudonymous tokens keyed by `SENTINEL_EDGE_SALT`.
- **Regional Data Residency & BYOK**: Configurable regional data plane (`SENTINEL_REGION`) and customer-managed KMS key metadata (`SENTINEL_BYOK_KEY_ID`).
- **Hash-Chained Vault Integrity**: Every ingested event, alert resolution, containment action, and undo step is appended to a SHA-256 linked audit chain verified on read.
- **Firebase Authentication & Strict Firestore Rules**: Operator sign-in via Firebase Auth with per-operator isolated Firestore preferences and chat history enforced by ESLint-audited `firestore.rules`.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vite 8, Lucide Icons, Motion
- **Backend**: Node.js 22+, Express 4, WebSockets (`ws`), `@google/genai`
- **Auth & Persistence**: Firebase Authentication & Cloud Firestore (operator profiles, alert preferences, analyst chat history) + regional persistent JSON state store
- **Serverless Deployment**: Netlify Functions (`netlify/functions/api.ts` via `serverless-http` & `esbuild`)

---

## Quick Start

### Prerequisites
- **Node.js 22+** (native TypeScript execution supported for production `node server.ts` and `node --test`)
- **npm** (or compatible package manager)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and populate the values for your environment:

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `SENTINEL_EDGE_SALT` | Secret per-customer HMAC salt for edge PII/secret redaction (server-side only; never exposed to the browser). |
| `SENTINEL_REGION` | Regional data-plane identifier (e.g. `ap-southeast-2`; auto-derived from `SENTINEL_BYOK_KEY_ID` ARN if omitted). |
| `SENTINEL_BYOK_KEY_ID` | Customer-managed AWS KMS / Cloud KMS key ARN for regional data-plane configuration. |
| `SENTINEL_STORAGE_PATH` | Absolute local filesystem path for regional state persistence (defaults to `/tmp/sentinel-regional-<region>-v4.json`). |
| `SENTINEL_WEBHOOK_SIGNING_SECRET` | Optional HMAC-SHA256 signing secret for outbound webhook deliveries. |
| `GEMINI_API_KEY` | Optional server-side API key enabling the Security Analyst Assistant. |
| `APP_URL` | Hosted application URL (must be added to Firebase Authorized Domains). |
| `VITE_API_BASE_URL` | Leave empty for same-origin `/api/*` routing (local Express server or Netlify Functions). |

### 3. Run Locally
```bash
npm run dev
```
The full-stack Express + Vite dev server starts on **`http://localhost:3000`**.

### 4. Production Build & Start
```bash
npm run build
npm start
```

---

## Testing & Quality Checks

```bash
# TypeScript type-checking
npm run lint

# Core security engine unit tests (11 tests: redaction, normalizer, vault tamper detection, fingerprints, honey traps, undo, webhooks)
node --test src/core/engine.test.ts

# Firestore security rules audit
npx eslint firestore.rules

# Production bundle build
npm run build
```

---

## Deploying to Netlify

The repository is pre-configured for Netlify via `netlify.toml`, `netlify/functions/api.ts`, `public/_headers`, and `public/_redirects`:

1. Connect the repository in Netlify (build command `npm run build`, publish directory `dist`, functions directory `netlify/functions`).
2. Add your server-side environment variables (`SENTINEL_EDGE_SALT`, `SENTINEL_BYOK_KEY_ID`, `SENTINEL_REGION`, and optionally `GEMINI_API_KEY` and `SENTINEL_WEBHOOK_SIGNING_SECRET`) in **Netlify Site Configuration → Environment variables**.
3. Leave `VITE_API_BASE_URL` unset so `/api/*` requests route seamlessly to `/.netlify/functions/api/:splat`.
4. Add your Netlify domain (e.g. `your-site.netlify.app`) to **Firebase Console → Authentication → Settings → Authorized domains** so popup sign-in works without errors.

---

## Project Structure

```text
├── server.ts                      # Express + WebSocket + Vite dev/prod entrypoint
├── netlify.toml                   # Netlify build, redirects, headers & Functions config
├── netlify/functions/api.ts       # Serverless Express adapter for Netlify Functions
├── firestore.rules                # Cloud Firestore security rules
├── firebase-blueprint.json        # Firestore data model schema
├── security_spec.md               # Security architecture & threat model specification
├── public/                        # Static assets, _headers, _redirects
└── src/
    ├── App.tsx                    # Root shell, unified Admin Portal & view routing
    ├── index.css                  # Design tokens & typography (Plus Jakarta Sans / DM Sans / JetBrains Mono)
    ├── components/                # UI views, Breach Drill panel, Chatbot drawer, Search/Filter bar
    ├── core/                      # Edge redaction, pipeline, fingerprints, breach drill, vault store & tests
    ├── lib/                       # API client, Firebase Auth/Firestore helpers, CSV export, i18n
    └── server/                    # Express API routes & server-side Security Analyst integration
```
