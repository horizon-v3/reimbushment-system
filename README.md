# DelegateConnect — International CRM

Enterprise-grade delegate management platform for international trade shows. Built with Next.js 16, Drizzle ORM, and PostgreSQL (Neon/Supabase).

## 🚀 Deployment to Vercel

This repository is strictly configured and **100% ready** for production deployment on Vercel.

### 1. Prerequisites
Before deploying, make sure you have your production database ready (Neon or Supabase).

### 2. Required Environment Variables
When deploying on Vercel, you must set the following **Environment Variables** in the Vercel Dashboard (Settings > Environment Variables):

- `DATABASE_URL` — Your PostgreSQL connection string (e.g., `postgres://user:pass@host:5432/db`)
- `AUTH_SECRET` — A secure random string for NextAuth. You can generate one via terminal: `npx auth secret`

*(Note: `NEXTAUTH_URL` is completely optional on Vercel because we use `trustHost: true` in the Auth config)*

### 3. Deploy
1. Push this repository to GitHub.
2. Go to [Vercel](https://vercel.com/new) and import the repository.
3. Add the Environment Variables above.
4. Click **Deploy**.

The `vercel.json` and `package.json` are already configured to run `npm run build` safely.

### 4. Setup Database Schema
Because Drizzle Kit's standard `db:push` has known incompatibilities in serverless functions out of the box, we have provided a custom migration script that flawlessly syncs your database schema.

**After you have your production `DATABASE_URL`**, run this locally to prepare your production database:
```bash
node run-migration.mjs
```
*(This script will create all missing columns, the `app_settings` table, and the new `chat_messages` table)*

## Modules & Roles
1. **Admin (`admin`)**: Access to Settings (Database/GAS config, user creation), CRM Home, Travel Desk, and Team Chat.
2. **Supervisor (`supervisor`)**: Access to CRM Home (Read-Only/Export) and Travel Desk.
3. **User (`user`)**: Locked out of dashboards. Automatically routed to the real-time Team Chat.

---
Built by DelegateConnect Team.
