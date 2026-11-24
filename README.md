# MEDIIFY — AI-Powered Medical Coding & Revenue Cycle Intelligence

**Clinical Intelligence. Coding Precision. Revenue Integrity.**

MEDIIFY is a full-stack healthcare SaaS platform for US medical coding, clinical documentation intelligence, deterministic payer rule validation, insurance eligibility verification, pre-submission denial prevention, and revenue integrity auditing.

## Architecture Highlights

- **Frontend:** React 19, TypeScript, Tailwind CSS v4.
- **Backend:** Express + TypeScript (`server.ts`) with SQLite persistence (`data/mediify.db`) for local/container operation and production PostgreSQL + `pgvector` migrations (`supabase/migrations/001_mediify_schema.sql`).
- **Modular Server-Side AI Layer (`server/ai/providerRegistry.ts`):**
  - **Google Gemini (`@google/genai`)** using `gemini-4-hydrogen` for initial development and multimodal PDF/image OCR.
  - **`inclusionAI/LingSante-3.1-air-VL`** via configurable authenticated backend HTTP inference (`LINGSANTE_API_URL` + `LINGSANTE_API_KEY`).
  - **Hugging Face Medical Endpoints** and **OpenAI-Compatible VPC Endpoints**.
- **Deterministic Medical Coding Rules Engine (`src/lib/codingValidator.ts`):**
  - Independent NCCI Procedure-to-Procedure edits, Medically Unlikely Edits (MUE), LCD/NCD medical necessity checks, laterality validation, global surgery modifier 25/57 rules, duplicate procedure detection, age/sex restrictions, and DOS effective/expiration dates.
- **Security & Reliability (`server/auth.ts`, `src/lib/promptSanitizer.ts`):**
  - `scrypt` password hashing, HMAC-SHA256 in-memory Bearer sessions, TOTP MFA enrollment, RBAC, organization tenant isolation, prompt-injection detection/neutralization, authoritative catalog hallucination blocking, and immutable audit logging.

## Quick Start

```bash
npm install
npm run test
npm run dev
```

Open `http://localhost:3000`. Use the **Explore Synthetic Sandbox** button (or `?autostart=1`) to evaluate pre-loaded clearly labeled synthetic clinical encounters.

## Production Deployment & Configuration Requirements

1. **Database:** Apply `supabase/migrations/001_mediify_schema.sql` to your HIPAA-eligible PostgreSQL + `pgvector` instance.
2. **LingSante-3.1-air-VL:** Deploy `inclusionAI/LingSante-3.1-air-VL` inside a private GPU VPC and configure `LINGSANTE_API_URL` and `LINGSANTE_API_KEY` on the server.
3. **CPT Licensing:** Obtain a commercial license from the American Medical Association (AMA) before loading full proprietary CPT descriptors into production.
4. **Clearinghouse & EHR Integrations:** Configure `CLEARINGHOUSE_API_URL`, `CLEARINGHOUSE_CLIENT_ID`, `CLEARINGHOUSE_CLIENT_SECRET`, and SMART on FHIR R4 credentials before processing live eligibility (X12 270/271) or EHR syncs.
5. **HIPAA Governance:** Execute Business Associate Agreements (BAAs) with all cloud, storage, and AI vendors before enabling production ePHI.
