# Chiparama Vault — team password manager

React + Vite front end on the **Chiparama Project Hub** Supabase project (`kphlxmvlqyrzrmalthgj`).
It reuses that project's logins, `profiles` (roles + active flag), `teams` and `team_members`.

## Run
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static files in dist/ (deploy to Vercel/Netlify/any static host)
```
`.env` holds the project URL and publishable key (safe for the browser).

## Who can do what
| Role | Sees | Can |
|---|---|---|
| founder / cofounder / cmo / admin | every credential | create, edit, delete, share, approve members, view activity |
| member (approved) | only credentials shared with them or their team | reveal/copy; edit if granted **Can edit** |
| new signup (not approved) | nothing | waits for admin approval |

`dwiplahare24@gmail.com` is auto-made admin when it signs up. `dwip@chiparama.com` is already founder.

## Database (pm_* objects)
- `pm_items` — title, link, username, category, notes, **2FA method / holder / where the OTP goes**. The password is stored encrypted in **Supabase Vault** (`secret_id`), never in the table.
- `pm_access` — grants to a member *or* a team, `view`/`edit`, optional expiry.
- `pm_access_log` — created / edited / password changed / revealed / copied / shared / unshared / deleted.
- RPCs: `pm_my_items`, `pm_reveal_password`, `pm_save_item`, `pm_member_access` (all permission-checked, security definer).
- Edge function `pm-add-member` — admin creates an account with a temp password (uses service role server-side).
- RLS on all three tables; inserts/updates to items only via RPC.

## Finance: subscriptions & invoices
- **Who can edit:** only logins listed in `inv_finance_editors` (seeded with `finance@chiparama.com`). Add another with
  `insert into inv_finance_editors(email) values ('someone@chiparama.com');`
- **Who can view:** founder, co-founder, CMO, CFO, CTO (+ finance). Everyone else never sees the Finance menu, and the database refuses the rows (RLS).
- CFO / CTO are new roles — only a founder can assign them (Members → role dropdown).
- `inv_subscriptions` — platform, plan, category, billing cycle (monthly / quarterly / half-yearly / annual / one-time), amount + currency + FX → INR, seats, subscribed on, next billing date (auto-calculated if left blank), expiry, auto-renew, status, owner, team, linked vault login.
- `inv_invoices` — invoice #, linked subscription, dates, service period, due date, amount + tax (GST), status (draft / pending / paid / cancelled / refunded; pending past due shows as overdue), paid on, payment ref, PDF in the private `invoices` storage bucket.
- Marking an invoice **paid** rolls its subscription's next billing date forward automatically.
- `inv_activity` — log of every create / status change.
- Spend overview: monthly & annual run-rate, spent this month / FY (Apr–Mar or calendar year), monthly spend chart, spend by platform & category, monthly-vs-annual billing split, renewals in 30 days, expiring contracts, unpaid invoices. CSV export on both tables.
