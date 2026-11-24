# MEDIIFY V2 — AI-Powered Medical Coding & Revenue Cycle Intelligence

**Clinical Intelligence. Coding Precision. Revenue Integrity.**

MEDIIFY is an enterprise healthcare SaaS platform for US medical coding, clinical documentation intelligence, deterministic payer rule validation, insurance eligibility verification, pre-submission denial prevention, and revenue integrity auditing.

## Architecture Highlights (V2 Production Architecture)

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, URL history routing (`window.history.pushState`), `Cmd/Ctrl+K` Command Palette, lazy-loaded views with React `ErrorBoundary`, and a resizable 3-panel Coding Workspace with authenticated binary document preview.
- **Backend & Persistence:** Express + TypeScript (`server.ts`) backed exclusively by **Supabase PostgreSQL** (`server/supabase.ts` via `pg` + `@supabase/supabase-js`) with Row-Level Security (`app.current_organization_id`), Supabase Auth, and Private Storage (`medical-records` bucket). Zero SQLite, zero mock/sandbox endpoints, and empty workspace initialization for every new organization.
- **Modular Server-Side AI Layer (`server/ai/providerRegistry.ts` & `server/services/aiJobQueue.ts`):**
  - **Google Gemini (`@google/genai`)** for multimodal clinical PDF/image extraction and structured coding generation.
  - **`inclusionAI/LingSante-3.1-air-VL`** via configurable authenticated backend HTTP inference (`LINGSANTE_API_URL` + `LINGSANTE_API_KEY`).
  - **Hugging Face Medical Endpoints** and **OpenAI-Compatible VPC Endpoints** with explicit error surfacing, latency telemetry, and zero silent cross-provider fallback.
- **Authoritative Coding Dataset Import (`server/services/codingDatasetImporter.ts`) & Deterministic Engine (`src/lib/codingValidator.ts`):**
  - CSV/JSON dataset importer for CMS ICD-10-CM/PCS, HCPCS Level II, Modifiers, NCCI PTP edits, LCD/NCD payer policies, and commercial AMA CPT (with mandatory license attestation).
  - Independent rules engine checks authoritative dataset availability (`MISSING_REFERENCE_DATASET`), NCCI bundling, MUE unit limits, LCD/NCD medical necessity, laterality, duplicate procedures, age/sex restrictions, global surgery modifiers (25/57), and DOS effective dates.
- **Security & Compliance (`server/auth.ts`, `src/lib/totp.ts`, `src/lib/fileValidator.ts`, `src/lib/promptSanitizer.ts`):**
  - Revocable DB-backed sessions, 12+ character password policy, RFC 6238 TOTP MFA enrollment with single-use recovery codes (zero live TOTP code leaks), magic-byte + active-PDF (`/JavaScript`, `/Launch`) upload scanning, prompt-injection neutralization, and immutable audit logs.

## Database Setup & Migrations

Apply the SQL migrations in order to your Supabase / HIPAA-eligible PostgreSQL instance:

1. `supabase/migrations/001_mediify_schema.sql` — Core multi-tenant tables, `pgvector`, RLS policies, and audit triggers.
2. `supabase/migrations/002_v2_production_upgrade.sql` — V2 sessions, MFA recovery codes, AI job queue, dataset import audit, coding draft/version history, annotations, notifications, and encounter filters.
3. `supabase/migrations/003_cleanup_synthetic_data.sql` — *(Existing V1 upgrades only)* Safely archives and removes V1 synthetic sandbox records while preserving legitimate tenant records and reference catalogs.
4. `supabase/seed_reference_catalog.sql` — *(Optional non-proprietary starter rules)* Seeds CMS-public NCCI/LCD starter metadata. For production coding validation, import full CMS ICD-10-CM/PCS, HCPCS, NCCI, and AMA-licensed CPT datasets via **Coding Intelligence -> Dataset Import**.

Create a **private** Supabase Storage bucket named `medical-records` (public access disabled).

## Quick Start

```bash
cp .env.example .env
# Populate DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET, and GEMINI_API_KEY
npm install
npm test
npm run lint
npm run build
npm run dev
```

Open `http://localhost:3000`. Create an organization account to initialize a clean, isolated clinical coding workspace.

## Production Deployment & Compliance Checklist

1. **Supabase / PostgreSQL:** Enforce SSL connections, Row-Level Security, and private bucket policies on `medical-records`.
2. **Vercel & Custom Domain Deployment:** `vercel.json` and `api/index.ts` route `/api/*` serverless endpoints and SPA routes cleanly. Configure `CUSTOM_DOMAIN_URL`, `APP_URL`, `SUPABASE_*`, `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_OAUTH_ENABLED`, and `EMAIL_VERIFICATION_REQUIRED` in Vercel Project Settings, then add your custom domain's `/auth/callback` and `/reset-password` URLs to Supabase Auth Redirect URLs.
3. **LingSante-3.1-air-VL:** Host `inclusionAI/LingSante-3.1-air-VL` inside a HIPAA-eligible GPU VPC and configure `LINGSANTE_API_URL` and `LINGSANTE_API_KEY` server-side.
4. **AMA CPT Licensing:** Execute a commercial CPT distribution license with the American Medical Association before importing CPT code sets.
5. **Clearinghouse & EHR Integrations:** Configure `CLEARINGHOUSE_API_URL`, `CLEARINGHOUSE_CLIENT_ID`, `CLEARINGHOUSE_CLIENT_SECRET`, and SMART on FHIR R4 credentials before running live X12 270/271 eligibility checks or claim submissions.
6. **HIPAA Governance:** Execute Business Associate Agreements (BAAs) with Supabase/cloud infrastructure, clearinghouse, and AI model hosting vendors before ingesting live ePHI.
