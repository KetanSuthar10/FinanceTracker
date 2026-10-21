# Decisions

Short log of choices and why. Add a line when something changes.

## Made

| # | Date | Decision | Why |
| --- | --- | --- | --- |
| 1 | 2026-10-21 | Start fresh in a new codebase instead of repairing v1 | v1's design (all history in the browser, stored totals that can disagree, owner bootstrap, demo fallbacks) was the source of most bugs |
| 2 | 2026-10-21 | Remove receipt/screenshot OCR | Complex, unreliable, rarely worth it for daily use |
| 3 | 2026-10-21 | Keep live voice-to-text via the browser, parsed locally | Fast entry on phone, no server or cost |
| 4 | 2026-10-21 | One `transactions` table with 4 types instead of events + postings | Covers card purchases, bill payments, transfers and refunds correctly with far less code |
| 5 | 2026-10-21 | EMIs: card EMI purchase counted once; loan EMIs are expenses; recurring items are reminders | Practical cash-flow view without modelling bank schedules |
| 6 | 2026-10-21 | CSV/XLSX import only, no PDF | Banks offer CSV/XLS downloads; PDF parsing is per-bank and fragile |
| 7 | 2026-10-21 | Google sign-in only; sign-ups disabled after first login; RLS per user | Simplest secure single-user setup; no owner tables or bootstrap pages |
| 8 | 2026-10-21 | Money formulas in TypeScript `domain/`, SQL only sums and filters | Formulas are unit-testable without a database; nothing loads full history |
| 9 | 2026-10-21 | Supabase + Vercel + React/TS/Vite/Tailwind kept | Already familiar and free for this size |
| 10 | 2026-10-21 | AI assistant moved to an optional final phase | Core tracking must not depend on it; the data-policy and cost question is unresolved |
| 11 | 2026-10-21 | Docs reduced to 5 files + README + AGENTS | v1 had ~55 docs with conflicting status |

## Open — needed before the phase shown

| Question | Needed by | Default if not answered |
| --- | --- | --- |
| Which bank(s) and card(s)? Which download formats do they offer (CSV/XLS)? | Phase 3 | Build the generic column-mapping importer; verify with your files later |
| New GitHub repo, or replace the old repo's contents? | Phase 0 | New repo `finance-tracker`; old repo kept read-only for reference |
| Is the old Supabase project (`mpjjetxtpekrxeyivlkv`) deleted? | Phase 0 | Create a new project; delete the old one |
| Want the AI assistant at all? Willing to use Gemini's paid tier (needed for real financial data)? | Phase 6 | Not built |
| Starter category list OK? | Phase 1 | List in ARCHITECTURE.md |
