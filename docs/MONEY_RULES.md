# Money rules

These rules decide every number the app shows. Code and tests must follow them exactly. If a rule needs to change, update this file first.

## Basics

- Currency is INR only. Amounts are stored as **integer paise** (₹120.50 → `12050`). Never use floating point for money.
- Every stored `amount_paise` is **positive**. The transaction **type** decides the direction.
- Dates are calendar dates in **Asia/Kolkata**. "Today" means today in India, not UTC.
- Months run from the 1st to the last day of the month (Asia/Kolkata).

## Transaction types and their effect

| Type | Fields | Effect on account balance | Income | Spending |
| --- | --- | --- | --- | --- |
| `expense` | account, category | account − amount | 0 | + amount |
| `income` | account, category | account + amount | + amount | 0 |
| `transfer` | from account, to account (different) | from − amount, to + amount | 0 | 0 |
| `refund` | account, category | account + amount | 0 | − amount (in that category) |

This one rule covers everything:
- **Card purchase:** an `expense` on the card account. The card balance goes more negative, meaning you owe more.
- **Card bill payment:** a `transfer` from the bank to the card. Bank goes down, card debt goes down. Not spending, because the purchases were already counted.
- **Cash withdrawal:** a `transfer` from the bank to cash.
- **Moving money between your own banks:** a `transfer`.
- **Card fee / interest / late charge:** an `expense` on the card, category *Fees & interest*.
- **Refund:** a `refund` to the account that was charged. It reduces spending in its category. The month total can be negative for a category if the refund is larger than that month's purchases; show that honestly.

## Account balances

```
balance = opening_balance
        + income into account
        + refunds into account
        + transfers into account
        − expenses from account
        − transfers out of account
```

Only transactions dated **on or after** the account's opening date count. Activity before the opening date is already inside the opening balance.

- Bank and cash: a positive balance is money you have.
- Credit card: a negative balance is money owed. Display it as **"Outstanding ₹X"**. A positive card balance is shown as **"Credit ₹X"** (overpaid).
- The opening balance is **not income**.

## Dashboard figures

- **Income (month)** = sum of `income` in the month.
- **Spending (month)** = sum of `expense` − sum of `refund` in the month.
- **Saved (month)** = Income − Spending.
- **Money in hand** = sum of bank + cash balances. Credit limits never count as money.
- **Card outstanding** = sum of negative card balances, shown as positive.
- **Net position** = sum of all account balances, with cards counting as negative.

Check that must always hold for any period:

```
net position at end of period = net position at start + income − spending
```

Transfers cancel out, so they never affect this.

## EMIs (kept simple on purpose)

- **Credit-card EMI:** record the original purchase once as an `expense` on the card. The monthly instalments are part of the card bill, which you pay with a `transfer`, so they are **not** recorded again as spending. Interest and processing fees, if you know them, are `expense` with category *Fees & interest*. A recurring item may be created only as a reminder of the amount on future bills.
- **Loan EMI from a bank account** (e.g. personal or vehicle loan): each instalment is an `expense` with category *Loan EMI*, created through the recurring item's "Mark as paid". This is a cash-flow view. The loan itself is not tracked as an account in v1.
- The app never calculates interest or payoff amounts. It only records what you enter.

## Recurring items

- A recurring item is a **reminder template**, not a transaction. It affects no balance until you press "Mark as paid".
- "Mark as paid" opens a pre-filled draft. Saving it creates the transaction and moves `next_due_date` forward by one month.
  - If the item has `instalments_left`, it decreases by 1. At 0 the item becomes inactive.
- Due day 29–31 in a shorter month falls on the last day of that month.

## Import duplicate rules

- Each imported row gets an `import_hash` built from: account id + date + amount + direction + normalised description + occurrence number. The occurrence number counts repeats of the same row within the same file, so two genuine identical ₹120 cafe payments on one day stay two transactions.
- A row whose hash already exists for that account is **Already imported** and skipped. Re-importing the same file adds nothing.
- A row that has no hash match but a **manual** transaction on the same account, same amount, same direction, within ±3 days, is **Possibly already entered**. The user decides. The default is skip. Equal amount alone never silently merges or deletes anything.
- Undoing an import deletes only rows whose `import_batch_id` is that batch.

## Reference fixture — tests must reproduce these exact numbers

Openings as of 30 Sep 2026: Bank A ₹1,000 · Bank B ₹0 · Cash ₹200 · Card C ₹0.

| Date (Oct 2026) | Transaction | Type |
| --- | --- | --- |
| 01 | Salary ₹5,000 → Bank A | income |
| 03 | Cafe ₹120 from Bank A | expense |
| 03 | Cafe ₹120 from Bank A (a second, genuine payment) | expense |
| 04 | Pharmacy ₹120 from Bank A | expense |
| 04 | Parking ₹60 from Cash | expense |
| 05 | Groceries ₹800 on Card C | expense |
| 07 | Card bill payment ₹300, Bank A → Card C | transfer |
| 08 | Cash withdrawal ₹100, Bank A → Cash | transfer |
| 09 | Own transfer ₹50, Bank A → Bank B | transfer |
| 10 | Freelance ₹1,000 → Bank A | income |
| 12 | Grocery refund ₹100 → Card C | refund |
| 14 | Card fee ₹20 on Card C | expense |

**Expected for 1–31 Oct:**
- Income ₹6,000; Spending ₹1,140; Saved ₹4,860.
- Bank A ₹6,190; Bank B ₹50; Cash ₹240; Card C −₹420 (Outstanding ₹420).
- Money in hand ₹6,480; Card outstanding ₹420; Net position ₹6,060.
- Check: opening ₹1,200 + ₹6,000 − ₹1,140 = ₹6,060.
- Groceries category for the month: ₹800 − ₹100 = ₹700.

**Expected for 5–31 Oct:**
- Opening net position ₹5,780; Income ₹1,000; Spending ₹720; Closing ₹6,060.

## Quick text / voice parsing

The parser only makes a **draft**. It never guesses silently. Anything it is unsure about stays empty and the form asks for it.

| Input | Draft |
| --- | --- |
| `120 cafe upi` | expense ₹120, recipient "cafe", account = default account, today |
| `spent 450 on groceries from hdfc yesterday` | expense ₹450, recipient "groceries", account matching "hdfc", yesterday |
| `got 50000 salary` / `received 50k salary` | income ₹50,000, recipient "salary" |
| `1.5k petrol card` | expense ₹1,500, account = the only card (if more than one card, ask) |
| `₹1,20,000 rent` | expense ₹1,20,000, recipient "rent" |
| `refund 500 amazon` | refund ₹500, recipient "amazon" |
| `transfer 2000 hdfc to cash` / `withdrew 2000` | transfer ₹2,000; missing from/to accounts are left for the user |
| `paid card bill 8000` | transfer ₹8,000 to the card account; from = default bank |
| `coffee` (no amount) | amount empty → the form asks for it. **Never invent an amount.** |

Rules:
- Amount: digits with optional `₹`, `rs`, `rupees`, Indian or Western commas, decimals, `k` = thousand, `lakh`/`l` = 1,00,000. Spoken numbers are understood too: "two hundred fifty", "one thousand five hundred and fifty", "one lakh twenty thousand", "a hundred". A lone small word ("one coffee") is only an amount when followed by "rupees".
- Date words: `today` (default), `yesterday`, `day before yesterday`, weekday names (most recent past one), `on 5th`.
- `upi`, `gpay`, `phonepe`, `paytm` are **payment methods, not accounts**. Use the default account set in Settings. If there is none, leave the account empty.
- Account words: match account names and nicknames, case-insensitive.
- Category: from recipient memory, if the remembered category fits the type (an expense memory is never applied to income). Otherwise, if one of the words is a category name (e.g. "groceries", "rent", "fee" → *Fees & interest*, "food" → *Food & dining*), that category. Otherwise empty, and the user picks one.
- Recipient: the words left over after removing the amount, date, type words, filler words, payment methods and account words. A new recipient keeps the user's own capitalisation ("DMart"). Transfers have no recipient; their leftover words become the note.
- When there is more than one number, an amount marked with ₹/rs/k/lakh wins. Otherwise the first number is used and a "check the amount" warning is shown.
- Dates: `5/10` and `05-10-2026` are day/month (Indian style). A day/month without a year that would be in the future means last year.
