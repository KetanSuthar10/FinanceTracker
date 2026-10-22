# Product

A simple personal finance tracker for one person, in INR, used on phone and laptop.

**Goal:** in under 10 seconds, add an expense by typing or speaking. At any time, see where the money went this month, what each account holds, and what bills are coming up.

**Principle:** practical over clever. Every feature must be something you will actually use weekly. If a feature needs a long explanation, it is not in v1.

## Who it is for

One owner (you). Salary plus irregular income, several bank accounts, cash, one or more credit cards, some EMIs and recurring bills.

## Features in scope

### 1. Accounts
- Types: **Bank**, **Cash**, **Credit card**.
- Each account has a name, an opening balance and an opening date.
- A credit card can optionally have a **bill due day** (e.g. the 5th) for reminders.
- Accounts can be archived but not hard-deleted while they have transactions.

### 2. Add a transaction (the most important screen)
Three ways, all ending in the **same confirmation form**:

1. **Quick text:** type `120 cafe upi`, `450 groceries hdfc yesterday` or `got 50000 salary`.
2. **Voice:** tap the mic and say the same sentence. Speech becomes text, then follows the quick-text path.
3. **Form:** fill in the fields directly.

The app parses the text into a **draft** (amount, type, date, account, recipient, category). You check or edit it and press Save. Nothing is saved without that confirmation.

Transaction types:

| Type | Example | Effect |
| --- | --- | --- |
| Expense | Cafe ₹120 from bank | Counts as spending |
| Income | Salary ₹50,000 into bank | Counts as income |
| Transfer | Bank → Cash ₹2,000; Bank → Card ₹8,000 (card bill payment) | Moves money, not income or spending |
| Refund | Amazon refund ₹500 to card | Reduces spending in its category |

### 3. Recipient memory
- When you save a transaction for a recipient (e.g. "Third Wave Coffee") with a category, the app remembers it.
- Next time you type that recipient, the category is pre-filled. You can always change it.
- Recipients have simple aliases, so "twc" and "third wave" can point to the same recipient.
- No complex rule engine. Memory is "last confirmed category for this recipient", editable on the Recipients screen.

### 4. Transactions list
- Grouped by day, newest first.
- Search by recipient or note; filter by month, account, category and type.
- Tap to edit or delete.

### 5. Home (dashboard)
For the selected month (default: current month):
- **Income**, **Spending**, **Saved** (income − spending).
- **Account balances**: each account's current balance, total in bank + cash, and total card outstanding.
- **Spending by category** (bar list with amounts, not just a chart).
- **Top recipients** this month.
- **Upcoming in the next 7 days** (recurring bills, EMIs, card due dates).
- **Budget warnings**, if budgets are set.

### 6. Recurring payments (bills, EMIs, subscriptions)
- Create a recurring item with name, amount, account, category, day of month, and optionally the number of instalments left (for EMIs).
- The Upcoming list shows what is due in the next 30 days.
- **Mark as paid** creates the real transaction (pre-filled, editable) and moves the item to its next due date.
- An EMI with "12 left" counts down and stops at 0.
- Nothing is auto-created without you pressing "Mark as paid".

### 7. Budgets (simple)
- Optional monthly limit per category.
- Shown as progress on Home: green under 80%, amber 80–100%, red over (with text labels, not colour only).

### 8. Statement import (CSV / Excel)
- Choose an account and upload the CSV/XLSX downloaded from your bank or card.
- **First time per account:** map the columns (date, description, debit, credit or amount) once. The mapping is saved.
- **Preview** shows every row with a status:
  - *New* — will be added.
  - *Already imported* — the same row exists from an earlier import; skipped automatically.
  - *Possibly already entered* — a manual entry on the same account has the same amount within ±3 days. You choose: skip or add. The default is skip, and the matching entry is shown next to it.
  - *Error* — row could not be read (bad date or amount); shown with the reason, never silently dropped.
- Recipient memory pre-fills categories; uncategorised rows can be filled in the preview.
- **Undo import** removes exactly the rows that import added.
- PDF statements are **not** supported in v1, and neither are old Excel `.xls` files (save them as .xlsx or CSV). Most banks offer CSV or Excel download.

### 9. Export
- Export all transactions as CSV (for Excel or Sheets).
- Full JSON backup of all data. Restore comes in a later phase. The Supabase free tier has no automatic backups, so export regularly.

### 10. Install on phone
- The app can be added to the home screen (PWA manifest + icon).
- No offline mode: saving needs an internet connection, and the app says so clearly when offline.

## Out of scope (deliberately removed)

- Receipt or screenshot image capture / OCR
- Recorded voice-note uploads (live voice-to-text only)
- PDF statement parsing
- Complex reconciliation engine, payment-to-statement allocation, EMI conversion lifecycle
- Owner bootstrap, demo mode, local-storage fallback
- Multi-user, multi-currency, investments, tax, bank login / open banking
- n8n, Google Drive, notifications by SMS/WhatsApp/email
- AI assistant in v1. It is an optional later phase: see [ROADMAP.md](ROADMAP.md).

## Screens

Phone bottom navigation: **Home · Transactions · (+) Add · Upcoming · More**

| Screen | Contents |
| --- | --- |
| Home | Month picker, Income/Spending/Saved, balances, categories, top recipients, upcoming 7 days |
| Transactions | Search, filters, day-grouped list, edit drawer |
| Add (sheet) | Quick text box with mic button → draft form → Save |
| Upcoming | Recurring items due in 30 days, Mark as paid, card due dates |
| More | Accounts, Categories, Recipients, Budgets, Import, Export, Settings, Sign out |

Computer (1024px and wider): the same screens with a left sidebar instead of bottom navigation, using the extra width:
- Transactions and statement review are compact tables (about 20 rows on one screen); click a row to edit.
- Home shows its cards in two columns, three on wide screens.
- Add has a "Latest entries" panel beside the form, so you can see what you've already entered.
- Upcoming, Categories and Settings sit in two columns.
- Shortcuts: **N** adds a transaction (cursor ready in quick add); **/** jumps to search.

## UI guidelines

- Light theme, one accent colour, neutral greys; dark mode follows the device or a setting.
- Big, readable amounts in Indian format: ₹1,20,000.50.
- Every list has an empty state that says what to do next ("No transactions yet — tap + to add one").
- Loading and error states on every screen; a failed save keeps what you typed.
- No technical words on screen (no "paise", "RPC", "invariant", task IDs or debug panels).
- Works at 360px phone width and 1024–1920px computer widths; keyboard accessible; zoom not disabled.
- Status is shown with text or icons as well as colour.
