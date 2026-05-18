-- ═══════════════════════════════════════════════════════════════════════════════
-- DelegateConnect CRM — Enterprise PostgreSQL Schema v4.1.0
-- Target: Neon Serverless Postgres
-- ───────────────────────────────────────────────────────────────────────────────
-- DEPLOY: Open Neon SQL Editor -> Ctrl+A -> Ctrl+V -> Run
-- SAFE:   All statements use IF NOT EXISTS / ON CONFLICT — run multiple times safely
-- ORDER:  Tables -> Triggers -> Migrations -> Indexes -> Seed Data
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── OPTIONAL MASTER RESET (COMMENTED OUT FOR SAFETY) ───────────────────────
-- DROP TABLE IF EXISTS audit_log         CASCADE;
-- DROP TABLE IF EXISTS travel_records    CASCADE;
-- DROP TABLE IF EXISTS app_settings      CASCADE;
-- DROP TABLE IF EXISTS registrations     CASCADE;
-- DROP TABLE IF EXISTS users             CASCADE;
-- DROP FUNCTION IF EXISTS trigger_set_timestamp CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. TIMESTAMP TRIGGER FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. USERS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  name          TEXT,
  role          TEXT        DEFAULT 'user',
  is_active     BOOLEAN     DEFAULT TRUE,
  last_login_at TIMESTAMP,
  created_at    TIMESTAMP   DEFAULT NOW(),
  updated_at    TIMESTAMP   DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_timestamp_users ON users;
CREATE TRIGGER set_timestamp_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. REGISTRATIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS registrations (
  id                       SERIAL PRIMARY KEY,
  sr_no                    INTEGER UNIQUE,
  timestamp_raw            TEXT,
  title                    TEXT,
  first_name               TEXT,
  last_name                TEXT,
  country_name             TEXT,
  passport_country         TEXT,
  region                   TEXT,
  participant_mobile       TEXT,
  participant_email        TEXT,
  company_name             TEXT,
  company_website          TEXT,
  designation              TEXT,
  nature_of_business       TEXT,
  products_services        TEXT,
  main_import_product_1    TEXT,
  main_import_product_2    TEXT,
  bl_supplier_country      TEXT,
  bl_buyer_country         TEXT,
  passport_number          TEXT,
  place_of_issue           TEXT,
  date_of_expiry           TEXT,
  passport_front_copy      TEXT,
  passport_back_copy       TEXT,
  proof_upload             TEXT,
  business_card_upload     TEXT,
  drive_passport_front_url TEXT,
  drive_passport_back_url  TEXT,
  drive_proof_url          TEXT,
  drive_business_card_url  TEXT,
  poc                      TEXT,
  proof_import             TEXT,
  type_of_poi              TEXT,
  status                   TEXT DEFAULT 'Pending',
  flight_hotel_code        TEXT,
  remarks                  TEXT,
  bl_status                TEXT,
  bb_invitation_status     TEXT,
  is_active                BOOLEAN DEFAULT TRUE,
  created_at               TIMESTAMP DEFAULT NOW(),
  updated_at               TIMESTAMP DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_timestamp_registrations ON registrations;
CREATE TRIGGER set_timestamp_registrations
  BEFORE UPDATE ON registrations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. TRAVEL RECORDS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS travel_records (
  id                     SERIAL PRIMARY KEY,
  registration_id        INTEGER REFERENCES registrations(id) ON DELETE SET NULL,
  responses_sr_no        TEXT,
  initial                TEXT,
  first_name             TEXT,
  last_name              TEXT,
  country_name           TEXT,
  country_code           TEXT,
  participant_mobile     TEXT,
  company_name           TEXT,
  sector                 TEXT,
  poc                    TEXT,
  hotel_name             TEXT,
  room_no                TEXT,
  check_in_date          DATE,
  check_out_date         DATE,
  room_units             TEXT,
  arrival_date           DATE,
  arrival_flight_no      TEXT,
  arrival_to             TEXT,
  arrival_time           TIME,
  departure_date         DATE,
  departure_flight_no    TEXT,
  departure_from         TEXT,
  departure_time         TIME,
  status                 TEXT DEFAULT 'Pending',
  reimbursement          TEXT DEFAULT 'No',
  reimbursement_amount   TEXT,
  invoice_amount         TEXT,
  invoice_amount_usd     TEXT,
  invoice_amount_local   TEXT,
  invoice_currency       TEXT,
  notes                  TEXT,
  ticket_received        TEXT DEFAULT 'No',
  invoice_received       TEXT DEFAULT 'No',
  visa_received          TEXT DEFAULT 'No',
  passport_copy_received TEXT DEFAULT 'No',
  voucher_received       TEXT DEFAULT 'No',
  bl                     TEXT,
  bl_url                 TEXT,
  bl_drive_id            TEXT,
  ticket_url             TEXT,
  invoice_url            TEXT,
  visa_url               TEXT,
  passport_url           TEXT,
  voucher_url            TEXT,
  business_card_url      TEXT,
  ticket_drive_id        TEXT,
  invoice_drive_id       TEXT,
  visa_drive_id          TEXT,
  passport_drive_id      TEXT,
  voucher_drive_id       TEXT,
  business_card_drive_id TEXT,
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_timestamp_travel_records ON travel_records;
CREATE TRIGGER set_timestamp_travel_records
  BEFORE UPDATE ON travel_records
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. APP SETTINGS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app_settings (
  id                      INTEGER PRIMARY KEY DEFAULT 1,
  registration_sheet_id   TEXT,
  registration_sheet_name TEXT DEFAULT 'Form Responses 1',
  travel_sheet_name       TEXT DEFAULT 'Travel Desk Records',
  drive_folder_id         TEXT,
  gas_web_app_url         TEXT,
  updated_at              TIMESTAMP DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_timestamp_app_settings ON app_settings;
CREATE TRIGGER set_timestamp_app_settings
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. AUDIT LOG TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   INTEGER,
  metadata    JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. IDEMPOTENT COLUMN MIGRATIONS
-- Run BEFORE indexes so all columns exist before being indexed.
-- Safe to run on both brand-new and existing databases.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active     BOOLEAN   DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- Registrations
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS sr_no                    INTEGER,
  ADD COLUMN IF NOT EXISTS timestamp_raw            TEXT,
  ADD COLUMN IF NOT EXISTS title                    TEXT,
  ADD COLUMN IF NOT EXISTS first_name               TEXT,
  ADD COLUMN IF NOT EXISTS last_name                TEXT,
  ADD COLUMN IF NOT EXISTS country_name             TEXT,
  ADD COLUMN IF NOT EXISTS passport_country         TEXT,
  ADD COLUMN IF NOT EXISTS region                   TEXT,
  ADD COLUMN IF NOT EXISTS participant_mobile       TEXT,
  ADD COLUMN IF NOT EXISTS participant_email        TEXT,
  ADD COLUMN IF NOT EXISTS company_name             TEXT,
  ADD COLUMN IF NOT EXISTS company_website          TEXT,
  ADD COLUMN IF NOT EXISTS designation              TEXT,
  ADD COLUMN IF NOT EXISTS nature_of_business       TEXT,
  ADD COLUMN IF NOT EXISTS products_services        TEXT,
  ADD COLUMN IF NOT EXISTS main_import_product_1    TEXT,
  ADD COLUMN IF NOT EXISTS main_import_product_2    TEXT,
  ADD COLUMN IF NOT EXISTS bl_supplier_country      TEXT,
  ADD COLUMN IF NOT EXISTS bl_buyer_country         TEXT,
  ADD COLUMN IF NOT EXISTS passport_number          TEXT,
  ADD COLUMN IF NOT EXISTS place_of_issue           TEXT,
  ADD COLUMN IF NOT EXISTS date_of_expiry           TEXT,
  ADD COLUMN IF NOT EXISTS passport_front_copy      TEXT,
  ADD COLUMN IF NOT EXISTS passport_back_copy       TEXT,
  ADD COLUMN IF NOT EXISTS proof_upload             TEXT,
  ADD COLUMN IF NOT EXISTS business_card_upload     TEXT,
  ADD COLUMN IF NOT EXISTS drive_passport_front_url TEXT,
  ADD COLUMN IF NOT EXISTS drive_passport_back_url  TEXT,
  ADD COLUMN IF NOT EXISTS drive_proof_url          TEXT,
  ADD COLUMN IF NOT EXISTS drive_business_card_url  TEXT,
  ADD COLUMN IF NOT EXISTS poc                      TEXT,
  ADD COLUMN IF NOT EXISTS proof_import             TEXT,
  ADD COLUMN IF NOT EXISTS type_of_poi              TEXT,
  ADD COLUMN IF NOT EXISTS status                   TEXT,
  ADD COLUMN IF NOT EXISTS flight_hotel_code        TEXT,
  ADD COLUMN IF NOT EXISTS remarks                  TEXT,
  ADD COLUMN IF NOT EXISTS bl_status                TEXT,
  ADD COLUMN IF NOT EXISTS bb_invitation_status     TEXT,
  ADD COLUMN IF NOT EXISTS is_active                BOOLEAN DEFAULT TRUE;

-- Travel Records
ALTER TABLE travel_records
  ADD COLUMN IF NOT EXISTS initial                TEXT,
  ADD COLUMN IF NOT EXISTS country_code           TEXT,
  ADD COLUMN IF NOT EXISTS room_units             TEXT,
  ADD COLUMN IF NOT EXISTS reimbursement_amount   TEXT,
  ADD COLUMN IF NOT EXISTS invoice_amount_local   TEXT,
  ADD COLUMN IF NOT EXISTS invoice_currency       TEXT,
  ADD COLUMN IF NOT EXISTS bl                     TEXT,
  ADD COLUMN IF NOT EXISTS bl_url                 TEXT,
  ADD COLUMN IF NOT EXISTS bl_drive_id            TEXT,
  ADD COLUMN IF NOT EXISTS business_card_url      TEXT,
  ADD COLUMN IF NOT EXISTS business_card_drive_id TEXT;

-- App Settings
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS registration_sheet_name TEXT DEFAULT 'Form Responses 1',
  ADD COLUMN IF NOT EXISTS travel_sheet_name       TEXT DEFAULT 'Travel Desk Records',
  ADD COLUMN IF NOT EXISTS drive_folder_id         TEXT,
  ADD COLUMN IF NOT EXISTS gas_web_app_url         TEXT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. HIGH-PERFORMANCE INDEXES
-- Created AFTER migrations so all indexed columns are guaranteed to exist.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email     ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role      ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);

-- Registrations
CREATE INDEX IF NOT EXISTS idx_reg_sr_no      ON registrations (sr_no);
CREATE INDEX IF NOT EXISTS idx_reg_status     ON registrations (status);
CREATE INDEX IF NOT EXISTS idx_reg_country    ON registrations (country_name);
CREATE INDEX IF NOT EXISTS idx_reg_company    ON registrations (company_name);
CREATE INDEX IF NOT EXISTS idx_reg_first_name ON registrations (first_name);
CREATE INDEX IF NOT EXISTS idx_reg_last_name  ON registrations (last_name);
CREATE INDEX IF NOT EXISTS idx_reg_email      ON registrations (participant_email);
CREATE INDEX IF NOT EXISTS idx_reg_poc        ON registrations (poc);
CREATE INDEX IF NOT EXISTS idx_reg_product_1  ON registrations (main_import_product_1);
CREATE INDEX IF NOT EXISTS idx_reg_product_2  ON registrations (main_import_product_2);
CREATE INDEX IF NOT EXISTS idx_reg_bl_status  ON registrations (bl_status);
CREATE INDEX IF NOT EXISTS idx_reg_created_at ON registrations (created_at DESC);

-- Travel Records
CREATE INDEX IF NOT EXISTS idx_trv_reg_id         ON travel_records (registration_id);
CREATE INDEX IF NOT EXISTS idx_trv_sr_no          ON travel_records (responses_sr_no);
CREATE INDEX IF NOT EXISTS idx_trv_status         ON travel_records (status);
CREATE INDEX IF NOT EXISTS idx_trv_hotel          ON travel_records (hotel_name);
CREATE INDEX IF NOT EXISTS idx_trv_poc            ON travel_records (poc);
CREATE INDEX IF NOT EXISTS idx_trv_country        ON travel_records (country_name);
CREATE INDEX IF NOT EXISTS idx_trv_sector         ON travel_records (sector);
CREATE INDEX IF NOT EXISTS idx_trv_arrival_date   ON travel_records (arrival_date);
CREATE INDEX IF NOT EXISTS idx_trv_departure_date ON travel_records (departure_date);
CREATE INDEX IF NOT EXISTS idx_trv_check_in       ON travel_records (check_in_date);
CREATE INDEX IF NOT EXISTS idx_trv_reimbursement  ON travel_records (reimbursement);
CREATE INDEX IF NOT EXISTS idx_trv_created_at     ON travel_records (created_at DESC);

-- Audit Log
CREATE INDEX IF NOT EXISTS idx_audit_user_id    ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action     ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_entity     ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log (created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. SEED DATA — APP SETTINGS (singleton row id=1)
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO app_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. SEED DATA — DEFAULT ADMIN ACCOUNT
-- Credentials: admin / manthan18
-- Re-running this script resets the password back to default (useful if locked out).
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO users (email, password_hash, name, role)
VALUES (
  'admin',
  '$2a$12$K7thZh9FoqF.G4vE3c6i0eOKCEBFpD8C1oJbFb2VLPfXrk3vHDVFi',
  'Admin',
  'admin'
)
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      name          = 'Admin',
      role          = 'admin';

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE — Login: admin / manthan18
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- ARCHITECTURE REFERENCE — DELEGATECONNECT CRM DATABASE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- TABLE OVERVIEW:
-- ┌─────────────────────┬──────────────────────────────────────────────────────┐
-- │ Table               │ Purpose                                              │
-- ├─────────────────────┼──────────────────────────────────────────────────────┤
-- │ users               │ Staff accounts with RBAC (admin/supervisor/user)     │
-- │ registrations       │ Delegate form submissions from Google Forms           │
-- │ travel_records      │ Flight, hotel, document, reimbursement logistics     │
-- │ app_settings        │ Singleton Google Workspace config (Sheet/Drive/GAS)  │
-- │ audit_log           │ Immutable record of all CRM operations               │
-- └─────────────────────┴──────────────────────────────────────────────────────┘
--
-- RBAC ROLES:
-- ┌─────────────┬──────────────────────────────────────────────────────────────┐
-- │ Role        │ Permissions                                                  │
-- ├─────────────┼──────────────────────────────────────────────────────────────┤
-- │ admin       │ Full access: delete, settings, user management, reports      │
-- │ supervisor  │ Read + write CRM records, no user management or settings     │
-- │ user        │ Data entry and chat only — no delete or settings access      │
-- └─────────────┴──────────────────────────────────────────────────────────────┘
--
-- SYNC ARCHITECTURE:
-- Google Form Submit
--   → Google Sheet (via Form Response)
--     → Google Apps Script (Code.gs)
--       → Next.js API (/api/travel, /api/registrations)
--         → Neon PostgreSQL (this database)
--           → GAS Backup → Google Sheet (Travel Desk Records + Sheet 2)
--
-- TRAVEL RECORD LIFECYCLE:
--   1. Created via dashboard (POST /api/travel)
--   2. Synced to Google Sheet tab "Travel Desk Records" (Sheet 1)
--   3. Synced to "Travel Desk Sheet 2" (formatted print view)
--   4. Documents uploaded to Google Drive delegate subfolder
--   5. Drive URLs written back to DB columns (ticket_url, visa_url, etc.)
--   6. On DELETE: DB row removed + Drive folder trashed + Sheet rows deleted
--
-- GOOGLE SHEET COLUMN MAPPING (Travel Desk Sheet 2):
--   Col A  → Sr. No.                        (auto row number)
--   Col B  → Responses Sr No                (responses_sr_no)
--   Col C  → Room No.                       (room_no)
--   Col D  → Hotel Name                     (hotel_name)
--   Col E  → Initial                        (initial)
--   Col F  → First Name                     (first_name)
--   Col G  → Last Name                      (last_name)
--   Col H  → Country Name                   (country_name)
--   Col I  → Country code                   (country_code)
--   Col J  → Participant Mobile/WhatsApp     (participant_mobile)
--   Col K  → Check In Date                  (check_in_date)
--   Col L  → Check Out Date                 (check_out_date)
--   Col M  → Occupancy                      (room_units)
--   Col N  → Date of Arrival at Delhi       (arrival_date)
--   Col O  → Flight Number (Arrival)        (arrival_flight_no)
--   Col P  → To                             (arrival_to)
--   Col Q  → Arrival time                   (arrival_time)
--   Col R  → Date of Travel (Departure)     (departure_date)
--   Col S  → Flight Number (Departure)      (departure_flight_no)
--   Col T  → From                           (departure_from)
--   Col U  → Dep Time                       (departure_time)
--   Col V  → Sector                         (sector)
--   Col W  → Companies                      (company_name)
--   Col X  → POC                            (poc)
--   Col Y  → Status                         (status)
--   Col Z  → Reimbursement                  (reimbursement)
--   Col AA → Additional Days Voucher        (voucher_received)
--   Col AB → Remarks                        (notes)
--   Col AC → Invoice Amount                 (invoice_amount)
--   Col AD → Invoice Amount In USD          (invoice_amount_usd)
--   Col AE → Ticket                         (ticket_received)
--   Col AF → Invoice                        (invoice_received)
--   Col AG → Visa                           (visa_received)
--   Col AH → PRINT STATUS                   (manual — filled by staff)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NEON-SPECIFIC DEPLOYMENT NOTES
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. Connection Pooling:
--    Neon manages connection pooling automatically via PgBouncer.
--    Do NOT set max_connections at the schema level.
--    Use the pooled connection string in Vercel environment variables.
--    Format: postgres://user:pass@ep-xxx.neon.tech/dbname?sslmode=require
--
-- 2. Compute Auto-Suspend:
--    Neon computes auto-suspend after inactivity. The first request after
--    suspension may have a cold-start delay of 1–2 seconds. This is normal.
--    For production, set auto-suspend to a higher value in Neon dashboard.
--
-- 3. Branches:
--    Use Neon database branches for staging environments.
--    Never run MASTER RESET on the main branch with live data.
--
-- 4. Read Replicas (Scale-Out):
--    For heavy analytics queries (reports, exports), configure a read replica
--    compute in Neon dashboard. Route read-heavy queries to the replica to
--    prevent blocking the primary writer during peak registration periods.
--
-- 5. Schema Migrations:
--    All ALTER TABLE statements in Section 7 use IF NOT EXISTS.
--    They are safe to re-run on existing databases without data loss.
--    New columns are added with safe DEFAULT values.
--
-- 6. Timestamps:
--    All timestamps are stored in UTC. The trigger_set_timestamp() function
--    automatically updates updated_at on every row update, even if the
--    application layer forgets to send the updated_at field.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY NOTES
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. Password Hashing:
--    All passwords MUST be hashed using bcrypt (minimum cost factor 10).
--    The default admin hash in this schema is bcrypt(cost=12) of "manthan18".
--    Never store plaintext passwords. The password_hash column is write-only
--    from the application's perspective.
--
-- 2. Row-Level Security (RLS):
--    RLS is not enabled in this schema to keep it simple for single-tenant use.
--    For multi-tenant deployments, enable RLS on registrations and travel_records
--    tables and add a tenant_id column.
--
-- 3. Audit Trail:
--    The audit_log table is append-only. Never UPDATE or DELETE rows from it.
--    It provides a complete paper trail for compliance and debugging.
--    For long-term storage, archive old audit rows to a cold-storage system
--    (e.g., export to Google Sheets monthly via the GAS export function).
--
-- 4. Google Drive URLs:
--    Drive file URLs stored in *_url columns are public view links.
--    Ensure that sensitive documents (passports, visas) are NOT shared
--    publicly. Use restricted sharing in Google Drive and generate
--    signed URLs for download where possible.
--
-- 5. API Authentication:
--    All /api/* routes are protected by NextAuth session authentication.
--    The DELETE endpoints require admin role.
--    The POST/PUT endpoints require admin or supervisor role.
--    GET endpoints are available to all authenticated users.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DATA INTEGRITY RULES
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. sr_no Integrity:
--    The sr_no column in registrations maps 1:1 to Google Form row numbers.
--    If sr_no drifts or duplicates appear, it causes double-sync issues.
--    Always validate sr_no uniqueness before bulk imports.
--
-- 2. Travel Record Orphans:
--    travel_records.registration_id uses ON DELETE SET NULL.
--    This means travel records are preserved even if the registration is deleted.
--    Orphaned travel records (registration_id IS NULL) should be reviewed
--    periodically and cleaned up manually if no longer needed.
--
-- 3. Soft Deletes:
--    Registrations and travel records do NOT use soft deletes — they are hard
--    deleted. The audit_log provides the paper trail for deleted records.
--    The is_active column on users and registrations provides soft-disable
--    functionality without physical deletion.
--
-- 4. Status Values:
--    registrations.status: Pending | Confirmed | Cancelled | Waitlisted | No Show
--    travel_records.status: Pending | Confirmed | Cancelled | Arrived | Departed
--    travel_records.reimbursement: Yes | No | Partial
--    Enforce these values at the application layer (enum validation in Drizzle ORM).
--
-- 5. Document URL Consistency:
--    When a document is uploaded, both the *_url (view link) and *_drive_id
--    (file ID) columns should be populated together. The drive_id is used for
--    direct Drive API operations (delete, move, rename). The URL is for display.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PERFORMANCE TUNING NOTES
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. Index Strategy:
--    All commonly filtered columns are indexed (status, country, hotel, dates).
--    Boolean columns (is_active) have indexes for fast active-record queries.
--    The created_at columns use DESC indexes for reverse-chronological sorts.
--
-- 2. JSONB Metadata:
--    audit_log.metadata uses JSONB for flexible key-value storage.
--    For high-volume audit queries, add GIN index:
--    CREATE INDEX IF NOT EXISTS idx_audit_metadata ON audit_log USING GIN (metadata);
--
-- 3. Large Text Columns:
--    Columns like products_services and notes may contain long text.
--    For full-text search, consider adding tsvector columns and GIN indexes.
--    Example: CREATE INDEX idx_reg_fts ON registrations USING GIN (to_tsvector('english', COALESCE(company_name,'') || ' ' || COALESCE(first_name,'')));
--
-- 4. Batch Imports:
--    For bulk CSV imports (50-500 rows), use INSERT ... ON CONFLICT DO UPDATE
--    with a single transaction. The upsert key for registrations is sr_no.
--    The upsert key for travel_records is responses_sr_no.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- GOOGLE APPS SCRIPT INTEGRATION REFERENCE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The gas/Code.gs file provides the following actions via HTTP POST to the
-- deployed Web App URL. All calls use Content-Type: text/plain (GAS quirk).
--
-- Actions:
--   ping              → Health check. Returns { ok: true, message: "pong" }
--   uploadFile        → Upload base64 file to Drive subfolder
--   deleteFolder      → Trash a delegate's Drive subfolder
--   getRows           → Read rows from a sheet tab
--   updateCell        → Write a single cell value
--   deleteRecord      → Delete a row from Sheet 1 by Sr No
--   backupTravelRecord→ Upsert a row in Sheet 1 (Travel Desk Records)
--   backupRegistration→ Upsert a row in the Registrations sheet
--   createTravelSheet → Create/reset Sheet 2 with print column layout
--   backupToTravelSheet2 → Upsert a row in Sheet 2
--   exportToExcel     → Export sheet to .xlsx in Drive
--
-- Configuration in gas/Code.gs (top of file):
--   CONFIG.DEFAULT_SHEET_NAME  = "Form Responses 1"
--   CONFIG.DEFAULT_TRAVEL_SHEET = "Travel Desk Records"
--   CONFIG.DEFAULT_FOLDER_NAME = "DelegateConnect Uploads"
--
-- Deployment Steps:
--   1. Open script.google.com
--   2. Create new project or open existing
--   3. Paste gas/Code.gs contents (Ctrl+A, then paste)
--   4. Click Deploy -> Manage Deployments -> Edit -> New Version -> Deploy
--   5. Set Execute as: Me, Who has access: Anyone
--   6. Copy Web App URL -> paste in CRM Settings -> Save
--
-- ─────────────────────────────────────────────────────────────────────────────
-- VERCEL ENVIRONMENT VARIABLES REQUIRED
-- ─────────────────────────────────────────────────────────────────────────────
--
--   DATABASE_URL               = postgres://...neon.tech/dbname?sslmode=require
--   NEXTAUTH_SECRET            = <random 32+ char secret>
--   NEXTAUTH_URL               = https://your-app.vercel.app
--   NEXT_PUBLIC_GAS_WEB_APP_URL= https://script.google.com/macros/s/.../exec
--
-- Optional (can also be set via Admin Settings UI):
--   NEXT_PUBLIC_SHEET_ID       = <Google Spreadsheet ID>
--   NEXT_PUBLIC_DRIVE_FOLDER_ID= <Google Drive Folder ID>
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DEVELOPER NOTES
-- ─────────────────────────────────────────────────────────────────────────────
--
--  1. All timestamps are recorded in UTC by default.
--  2. Phone numbers should be formatted with the ISD code explicitly included.
--  3. Any modifications to this schema should be reviewed before production.
--  4. If table locks occur during high load, evaluate query patterns.
--  5. Google Drive URLs are public view links — control access via Drive sharing.
--  6. The sr_no is strictly mapped to the chronological entry row of Google Form.
--  7. If sr_no drifts, it may cause duplicate entries. Validate before import.
--  8. Connection pooling is managed externally by Vercel/Neon.
--  9. For advanced analytics, query the read-replica to avoid blocking the writer.
-- 10. Audit logs are preserved indefinitely. Archive older logs if storage grows.
-- 11. When altering column types, use explicit USING clauses for casting.
-- 12. Ensure Vercel environment variables are synced with any Neon branch updates.
-- 13. Soft deletes are not implemented for registrations — they are hard deleted.
-- 14. Travel record statuses must adhere to the predefined allowed values.
-- 15. The reimbursement flag is distinct from reimbursement_amount.
--     Always check the flag before processing the monetary value.
-- 16. The is_active flag on users provides soft-disable without physical deletion.
-- 17. Hotel check-in/check-out dates are stored as DATE (not TIMESTAMP).
--     Flight arrival/departure times are stored as TIME (not TIMESTAMP).
--     Combine date + time columns in the application layer when needed.
-- 18. The app_settings table enforces a singleton via PRIMARY KEY DEFAULT 1.
--     Only one row should ever exist. The ON CONFLICT DO NOTHING in the seed
--     section ensures this is safe to re-run.
-- 19. The audit_log.metadata JSONB column stores flexible context per action.
--     Example values: { "count": 50 } for bulk imports, { "from": "Pending",
--     "to": "Confirmed" } for status changes.
-- 20. The CODE.GS script uses script-level locks (LockService) to prevent
--     concurrent writes from corrupting the Google Sheet during high traffic.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- END OF SCHEMA — DelegateConnect CRM v4.1.0
-- Tables: users, registrations, travel_records, app_settings, audit_log
-- Indexes: 27 covering all critical query paths
-- Triggers: 4 auto-updating updated_at on all mutable tables
-- Seed: 1 admin account (admin/manthan18) + 1 settings row
-- ═════════════════════════════════════════════════════════════════════════════
