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
| 12 | 2026-10-22 | No chart library; Home uses plain bars with the numbers written next to them | Charts here are simple; a library adds ~100 kB and hides numbers behind hover |
| 13 | 2026-10-22 | Database tests run the real migrations in PGlite (Postgres in WebAssembly) | Tests RLS, constraints and atomic functions in CI without Docker |
| 14 | 2026-10-22 | "Mark as paid" goes through `pay_recurring(item, expected_due, tx)` | Saves the payment and advances the reminder together; a second tap or device can't record it twice |
| 15 | 2026-10-22 | Quick text also matches category names ("groceries" → Groceries) when there's no recipient memory | Useful from day one, before anything is remembered; documented in MONEY_RULES |
| 16 | 2026-10-22 | Spreadsheets: Papa Parse (CSV) + read-excel-file (.xlsx); old .xls not supported | The maintained SheetJS build is only on its own CDN (unreachable from the build sandbox) and the npm copy has known advisories. .xls files can be saved as .xlsx/CSV; revisit if your bank only offers .xls |
| 17 | 2026-10-22 | Import duplicates: fingerprint per row, and "possibly entered" only suggests skipping | Two genuine ₹120 coffees on one day stay two; equal amount/date never deletes or merges anything |

## Open — needed before the phase shown

| Question | Needed by | Default if not answered |
| --- | --- | --- |
| Which bank(s) and card(s)? Which download formats do they offer (CSV/XLSX/XLS)? | Live use of Phase 3 | Generic column-mapping importer is built; verify with your files; .xls needs saving as .xlsx/CSV |
| ~~New GitHub repo or replace?~~ Decided 2026-10-21: same repo; old code kept on branch `legacy-v1` | — | — |
| Is the old Supabase project (`mpjjetxtpekrxeyivlkv`) deleted? | Phase 0 | Create a new project; delete the old one |
| Want the AI assistant at all? Willing to use Gemini's paid tier (needed for real financial data)? | Phase 6 | Not built |
| Starter category list OK? | Phase 1 | List in ARCHITECTURE.md |
