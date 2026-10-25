# Finance Tracker

A simple personal finance app for one person in India. Add expenses by typing or speaking, track bank, cash and credit-card balances, see where the money went each month, and never miss a bill or EMI.

**Status:** Phases 0–5 built and tested (daily tracking, bills/EMIs/budgets, statement import, backup, installable app). Waiting for the one-time setup in [docs/SETUP.md](docs/SETUP.md) and real-world use. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Documents

| File | What it covers |
| --- | --- |
| [docs/PRODUCT.md](docs/PRODUCT.md) | What the app does, what it deliberately doesn't do, and the screens |
| [docs/MONEY_RULES.md](docs/MONEY_RULES.md) | How every number is calculated, the test fixture, and quick-text parsing examples |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, folders, database tables, security |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phases, checklists and current status |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why things are the way they are, and open questions |
| [docs/SETUP.md](docs/SETUP.md) | One-time owner setup: Supabase, sign-in, Netlify or Vercel |
| [AGENTS.md](AGENTS.md) | Rules for AI coding assistants working on this repo |

## Stack

React · TypeScript · Vite · Tailwind · TanStack Query · Supabase (Postgres + Auth) · Netlify or Vercel

## Running locally

```bash
cp .env.example .env.local   # fill in your Supabase URL and publishable key
npm install
npm run dev                  # http://localhost:5173
npm run check                # typecheck + lint + tests (including database tests)
npm run build                # production build
./e2e/run.sh                 # browser tests (see e2e/README.md)
```
