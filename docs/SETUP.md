# One-time setup (owner)

There are two ways to set up. **Quick start** takes about 10 minutes and needs no Google or GitHub setup. The **full setup** (sections 1–5 below) adds Google sign-in and automatic deploys from GitHub; you can do it later without losing data.

## Quick start: email + password, Netlify drag-and-drop

1. **Database.** Create the Supabase project as in section 1.1 below. Then SQL Editor → New query → paste the whole of `supabase/finance-tracker-database-setup.sql` (all four migrations in one all-or-nothing transaction) → **Run**. Expected last line: **Setup complete | 9**. (Pasting the four files in `supabase/migrations/` one by one, in order, does the same.)
2. **Your login.** Supabase → **Authentication → Users → Add user → Create new user**. Enter your email and a strong password, tick **Auto Confirm User**, and create.
3. **Lock the door.** Supabase → **Authentication → Sign In / Providers**: keep **Email** on, and turn **off "Allow new users to sign up"**. Save. The app has no sign-up screen; this also blocks sign-ups through the API.
4. **Build with your two public values** (Project URL and publishable key, section 1.3):
   ```bash
   cp .env.example .env.local      # paste the two values
   npm install && npm run build    # creates dist/
   ```
5. **Deploy.** Go to https://app.netlify.com/drop and drag the `dist` folder (or a zip of its contents) onto the page. `_redirects` and `_headers` inside it set up page routing and security headers.
6. Open the Netlify URL → sign in with the email and password from step 2.

To change the Supabase values later, build again and drop the new `dist`. When you later connect Netlify to GitHub, `netlify.toml` sets the build; add the two variables under Site configuration → Environment variables.

---

## Full setup

About 30 minutes, done once. You never need to share passwords or secret keys with anyone, including an AI assistant. Dashboard menu names may differ slightly from what's written here; look for the closest match.

You will end up with three things connected:

```
Google (sign-in)  →  Supabase (database + auth)  →  Vercel (the website)
```

## 1. Supabase project

1. Go to https://supabase.com/dashboard → **New project**.
   - Name: `finance-tracker`. Region: **Mumbai (ap-south-1)**. Plan: **Free**.
   - Save the database password in your password manager. The app doesn't need it.
2. When the project is ready, open **SQL Editor → New query**.
   - Paste the entire contents of each file in `supabase/migrations/`, **one at a time, in filename order**, and press **Run** after each one:
     1. `20261021000001_initial_schema.sql`
     2. `20261022000002_recurring_payments.sql`
     3. `20261022000003_statement_import.sql`
     4. `20261022000004_restore_backup.sql`
   - Expected each time: "Success. No rows returned".
   - When a later update adds a new migration file, run just that new file the same way.
3. Copy two values somewhere temporary. Both are public by design:
   - **Project URL**, like `https://abcdefghijklmnopqrst.supabase.co`. It's under Project Settings → Data API, or the **Connect** button.
   - **Publishable key**, starting `sb_publishable_`. It's under Project Settings → **API Keys**.
   - ⚠️ Do **not** copy the *secret* key (`sb_secret_…`). The app refuses to start if it's given one.
4. **Old project:** delete the old Supabase project (`mpjjetxtpekrxeyivlkv`) if it still exists. Project Settings → General → Delete project.

## 2. Google sign-in

1. Go to https://console.cloud.google.com → create a project named `finance-tracker`.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**. App name: `Finance Tracker`. Support and developer email: your email.
   - No extra scopes are needed. The defaults (email, profile, openid) are enough.
   - Under **Test users**, add your own Gmail address.
   - Leave the app in **Testing** mode. Only listed test users can sign in, which is exactly what you want.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorised JavaScript origins:** your Vercel URL (e.g. `https://personal-finance-tracker-kohl-one.vercel.app`) and `http://localhost:5173`.
   - **Authorised redirect URIs:** copy the **Callback URL** shown in Supabase. To find it: Supabase → Authentication → Sign In / Providers → Google. It looks like `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Create. Copy the **Client ID** and **Client secret**.
4. Back in Supabase → **Authentication → Sign In / Providers → Google**:
   - Enable it, paste the Client ID and Client secret, and save.
   - The secret stays inside Supabase. It never goes into the app or Git.
5. Optional: if you only want Google sign-in, turn the **Email** provider **off** in Supabase → Authentication → Sign In / Providers. The sign-in screen then shows only the Google button.
6. Supabase → **Authentication → URL Configuration**:
   - **Site URL:** your Vercel URL.
   - **Redirect URLs:** add your Vercel URL and `http://localhost:5173`.

## 3. Vercel

1. Open your existing Vercel project, the one connected to the GitHub repo.
2. **Settings → Environment Variables**:
   - Delete old ones (`VITE_SUPABASE_ANON_KEY`, any `VITE_GEMINI_*`).
   - Add the following, for **Production** and **Preview**:
     - `VITE_SUPABASE_URL` = the Project URL
     - `VITE_SUPABASE_PUBLISHABLE_KEY` = the publishable key
3. **Settings → Build and Deployment:** the framework should be **Vite**. `vercel.json` in the repo sets the rest.
4. **Deployments → Redeploy** the latest one, so it picks up the variables.

## 4. First sign-in, then lock the door

1. Open your Vercel URL on your phone → **Continue with Google** → choose your account.
2. You should land on **Home** saying "You're signed in".
   - Open **More**: it shows your email and the version number.
3. Now stop anyone else from creating an account. Go to Supabase → **Authentication → Sign In / Providers** (or Auth settings) and turn **off "Allow new users to sign up"**.
4. Check it worked:
   - Open the site in a private/incognito window and try a **different** Google account.
   - It should be refused. Either Google itself blocks it ("Access blocked", because it isn't a test user) or the app says "This Google account is not allowed to use this app".
   - Even if someone did get in, row-level security means they would only see their own empty data, never yours.

## 5. Running it on your computer (optional)

```bash
git clone https://github.com/KetanSuthar10/personal-finance-tracker.git
cd personal-finance-tracker
cp .env.example .env.local      # paste the same two values
npm install
npm run dev                     # open http://localhost:5173
```

## What to report back after setup

Just tell me which of these worked; no screenshots of keys please:

- [ ] Phone: sign in → Home → More shows your email → Sign out → back to sign-in
- [ ] Laptop: the same
- [ ] The other Google account is refused
- [ ] No red "Couldn't reach your data" box on Home. If it appears, the SQL in step 1.2 probably didn't run.
