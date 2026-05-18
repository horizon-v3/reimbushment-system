-- ═══════════════════════════════════════════════════════════════════════════════
-- DelegateConnect CRM — Enterprise PostgreSQL Schema v4.0.0
-- Target: Neon Serverless Postgres
-- ───────────────────────────────────────────────────────────────────────────────
-- DEPLOY: Open Neon SQL Editor → Ctrl+A → Ctrl+V → Run
-- SAFE:   All statements use IF NOT EXISTS / ON CONFLICT — run multiple times safely
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── OPTIONAL MASTER RESET (COMMENTED OUT FOR SAFETY) ───────────────────────
-- Uncomment ONLY if you want to completely wipe and rebuild the database.
-- WARNING: IRREVERSIBLE — All data will be permanently deleted.
--
-- DROP TABLE IF EXISTS audit_log         CASCADE;
-- DROP TABLE IF EXISTS travel_records    CASCADE;
-- DROP TABLE IF EXISTS app_settings      CASCADE;
-- DROP TABLE IF EXISTS registrations     CASCADE;
-- DROP TABLE IF EXISTS users             CASCADE;
-- DROP FUNCTION IF EXISTS trigger_set_timestamp CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 1: TIMESTAMP TRIGGER FUNCTION
-- Automatically keeps updated_at in sync even if the application forgets to.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 2: USERS & AUTHENTICATION
-- Handles all role-based access control for the CRM dashboard.
-- Roles: admin (full access), supervisor (read/write), user (read + data entry)
-- Passwords MUST be bcrypt hashed before insertion (cost 10–12).
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,  -- Login identifier (username or email)
  password_hash TEXT        NOT NULL,          -- bcrypt hash, NEVER plaintext
  name          TEXT,                          -- Display name shown in UI
  role          TEXT        DEFAULT 'user',    -- 'admin' | 'supervisor' | 'user'
  is_active     BOOLEAN     DEFAULT TRUE,      -- Soft disable without deletion
  last_login_at TIMESTAMP,                     -- Track last successful login
  created_at    TIMESTAMP   DEFAULT NOW(),
  updated_at    TIMESTAMP   DEFAULT NOW(),
  -- Constraints
  CONSTRAINT users_role_check CHECK (role IN ('admin', 'supervisor', 'user')),
  CONSTRAINT users_email_length CHECK (char_length(email) <= 320)
);

DROP TRIGGER IF EXISTS set_timestamp_users ON users;
CREATE TRIGGER set_timestamp_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

COMMENT ON TABLE  users              IS 'CRM staff accounts with RBAC. Passwords must be bcrypt hashed.';
COMMENT ON COLUMN users.email        IS 'Primary login identifier — must be unique';
COMMENT ON COLUMN users.role         IS 'admin=full, supervisor=read/write, user=data entry';
COMMENT ON COLUMN users.is_active    IS 'Set to FALSE to disable login without deleting the account';

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 3: DELEGATE REGISTRATIONS
-- Primary table for all delegate form submissions ingested from Google Forms
-- via the Google Apps Script sync pipeline.
-- Upsert key: sr_no (Sequential row number from the Google Sheet)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS registrations (
  id                       SERIAL PRIMARY KEY,

  -- Core Identity (from Google Form)
  sr_no                    INTEGER UNIQUE,       -- Google Form row number (upsert key)
  timestamp_raw            TEXT,                 -- Original submission timestamp string
  title                    TEXT,                 -- Mr. / Ms. / Dr. / Prof.
  first_name               TEXT,                 -- Given name as per passport
  last_name                TEXT,                 -- Family name as per passport

  -- Geography & Contact
  country_name             TEXT,
  passport_country         TEXT,                 -- Country that issued the passport
  region                   TEXT,                 -- Geographic region (APAC, EMEA, etc.)
  participant_mobile       TEXT,                 -- Phone with ISD code e.g. +91 9876543210
  participant_email        TEXT,

  -- Professional Details
  company_name             TEXT,
  company_website          TEXT,
  designation              TEXT,
  nature_of_business       TEXT,
  products_services        TEXT,                 -- Full description of offerings

  -- Trade & Sourcing
  main_import_product_1    TEXT,                 -- Primary sector of interest
  main_import_product_2    TEXT,                 -- Secondary sector
  bl_supplier_country      TEXT,                 -- Country of previous supplier
  bl_buyer_country         TEXT,                 -- Country of previous buyer

  -- Passport & Travel Documents
  passport_number          TEXT,
  place_of_issue           TEXT,
  date_of_expiry           TEXT,

  -- Original Google Form Upload URLs (raw Google Drive links)
  passport_front_copy      TEXT,
  passport_back_copy       TEXT,
  proof_upload             TEXT,                 -- Bill of Lading or similar
  business_card_upload     TEXT,

  -- Processed Google Drive URLs (generated by Apps Script after processing)
  drive_passport_front_url TEXT,
  drive_passport_back_url  TEXT,
  drive_proof_url          TEXT,
  drive_business_card_url  TEXT,

  -- Administrative Fields
  poc                      TEXT,                 -- Assigned Point of Contact (internal staff)
  proof_import             TEXT,                 -- Import proof verification status
  type_of_poi              TEXT,                 -- Type: BL / Bank Statement / Invoice
  status                   TEXT DEFAULT 'Pending', -- Pending | Confirmed | Cancelled | Waitlisted
  flight_hotel_code        TEXT,                 -- Internal booking reference code
  remarks                  TEXT,                 -- General admin notes
  bl_status                TEXT,                 -- Bill of Lading verification: Verified | Pending | Rejected
  bb_invitation_status     TEXT,                 -- Buyer-Buyer invitation letter status

  -- Timestamps
  created_at               TIMESTAMP DEFAULT NOW(),
  updated_at               TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT registrations_status_check CHECK (
    status IS NULL OR status IN ('Pending','Confirmed','Cancelled','Waitlisted','No Show')
  )
);

DROP TRIGGER IF EXISTS set_timestamp_registrations ON registrations;
CREATE TRIGGER set_timestamp_registrations
  BEFORE UPDATE ON registrations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

COMMENT ON TABLE  registrations          IS 'Primary delegate registration records synced from Google Forms via Apps Script';
COMMENT ON COLUMN registrations.sr_no    IS 'Google Sheet row number — used as the upsert key to prevent duplicates';
COMMENT ON COLUMN registrations.status   IS 'Pending | Confirmed | Cancelled | Waitlisted | No Show';

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 4: TRAVEL DESK — LOGISTICS MANAGEMENT
-- Manages the physical logistics: flights, hotel, documents, and reimbursements.
-- Each record optionally links to a registration (ON DELETE SET NULL preserves
-- travel history even if the original registration is deleted).
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS travel_records (
  id                     SERIAL PRIMARY KEY,
  registration_id        INTEGER REFERENCES registrations(id) ON DELETE SET NULL,
  responses_sr_no        TEXT,                  -- Sr No as text (display reference)

  -- Delegate Core Info (denormalized for fast Travel Desk queries)
  initial                TEXT,                  -- Mr. / Ms. / Dr.
  first_name             TEXT,
  last_name              TEXT,
  country_name           TEXT,
  country_code           TEXT,                  -- ISO country code e.g. IN, US
  participant_mobile     TEXT,
  company_name           TEXT,
  sector                 TEXT,                  -- Business sector / industry
  poc                    TEXT,                  -- Assigned Point of Contact

  -- Hotel Logistics
  hotel_name             TEXT,
  room_no                TEXT,
  check_in_date          DATE,
  check_out_date         DATE,
  room_units             TEXT,                  -- '1' = Single, '0.5' = Double share

  -- Arrival Flight Details
  arrival_date           DATE,
  arrival_flight_no      TEXT,
  arrival_to             TEXT,                  -- Destination airport (DEL, BOM, etc.)
  arrival_time           TIME,

  -- Departure Flight Details
  departure_date         DATE,
  departure_flight_no    TEXT,
  departure_from         TEXT,                  -- Origin airport
  departure_time         TIME,

  -- Financial & Administrative
  status                 TEXT DEFAULT 'Pending',  -- Pending | Confirmed | Cancelled
  reimbursement          TEXT DEFAULT 'No',        -- Yes | No
  reimbursement_amount   TEXT,                    -- Reimbursement value (text for currency flexibility)
  invoice_amount         TEXT,                    -- Local currency invoice amount
  invoice_amount_usd     TEXT,                    -- USD equivalent
  invoice_amount_local   TEXT,                    -- Alternate local amount
  invoice_currency       TEXT,                    -- Currency code e.g. INR, USD, EUR
  notes                  TEXT,                    -- Internal logistics notes

  -- Document Collection Status Flags (Yes / No)
  ticket_received        TEXT DEFAULT 'No',
  invoice_received       TEXT DEFAULT 'No',
  visa_received          TEXT DEFAULT 'No',
  passport_copy_received TEXT DEFAULT 'No',
  voucher_received       TEXT DEFAULT 'No',

  -- Bill of Lading
  bl                     TEXT,                   -- BL reference text or link
  bl_url                 TEXT,                   -- BL file URL (Google Drive)
  bl_drive_id            TEXT,                   -- BL Drive file ID

  -- Document File URLs (direct Google Drive view links)
  ticket_url             TEXT,
  invoice_url            TEXT,
  visa_url               TEXT,
  passport_url           TEXT,
  voucher_url            TEXT,
  business_card_url      TEXT,

  -- Document Drive File IDs (for direct API manipulation)
  ticket_drive_id        TEXT,
  invoice_drive_id       TEXT,
  visa_drive_id          TEXT,
  passport_drive_id      TEXT,
  voucher_drive_id       TEXT,
  business_card_drive_id TEXT,

  -- Timestamps
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT travel_status_check CHECK (
    status IS NULL OR status IN ('Pending','Confirmed','Cancelled','Arrived','Departed')
  ),
  CONSTRAINT travel_reimbursement_check CHECK (
    reimbursement IS NULL OR reimbursement IN ('Yes','No','Partial')
  )
);

DROP TRIGGER IF EXISTS set_timestamp_travel_records ON travel_records;
CREATE TRIGGER set_timestamp_travel_records
  BEFORE UPDATE ON travel_records
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

COMMENT ON TABLE  travel_records                    IS 'Physical logistics: flights, hotels, documents and reimbursements per delegate';
COMMENT ON COLUMN travel_records.registration_id    IS 'FK to registrations. NULL if registration was deleted (data preserved).';
COMMENT ON COLUMN travel_records.room_units         IS '1 = Single occupancy, 0.5 = Double share occupancy';
COMMENT ON COLUMN travel_records.responses_sr_no    IS 'Text version of Sr No — used for Google Sheet row matching';

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 5: APPLICATION SETTINGS
-- Stores Google Workspace configuration (Sheet IDs, Drive IDs, GAS URL).
-- Only ONE row should ever exist (id = 1). Protected by primary key constraint.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app_settings (
  id                      INTEGER PRIMARY KEY DEFAULT 1,  -- Always 1 — singleton row
  registration_sheet_id   TEXT,               -- Google Spreadsheet ID (from URL)
  registration_sheet_name TEXT DEFAULT 'Form Responses 1', -- Tab name for registrations
  travel_sheet_name       TEXT DEFAULT 'Travel Desk Records', -- Tab name for travel desk
  drive_folder_id         TEXT,               -- Google Drive root folder ID for uploads
  gas_web_app_url         TEXT,               -- Deployed Google Apps Script Web App URL
  updated_at              TIMESTAMP DEFAULT NOW(),
  -- Enforce single-row constraint
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);

DROP TRIGGER IF EXISTS set_timestamp_app_settings ON app_settings;
CREATE TRIGGER set_timestamp_app_settings
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

COMMENT ON TABLE  app_settings                    IS 'Singleton config row — stores Google Workspace integration settings';
COMMENT ON COLUMN app_settings.gas_web_app_url    IS 'Full URL of deployed Apps Script Web App ending in /exec';
COMMENT ON COLUMN app_settings.drive_folder_id    IS 'Root Drive folder where all delegate documents are organized';

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 6: SECURITY AUDIT LOG
-- Immutable audit trail for all sensitive CRM operations.
-- Records are NEVER updated or deleted — append-only for compliance.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Who performed the action
  action      TEXT NOT NULL,         -- e.g. 'create_travel_record', 'delete_registration'
  entity_type TEXT,                  -- e.g. 'travel_record', 'registration', 'user'
  entity_id   INTEGER,               -- The ID of the affected row
  metadata    JSONB,                 -- Additional context as JSON (e.g. { count: 50 })
  ip_address  TEXT,                  -- Client IP (if captured by API)
  created_at  TIMESTAMP DEFAULT NOW() -- Immutable — never update audit records
);

COMMENT ON TABLE  audit_log          IS 'Immutable append-only audit trail. Never UPDATE or DELETE rows here.';
COMMENT ON COLUMN audit_log.action   IS 'Verb describing the operation: create_, update_, delete_, bulk_import_';
COMMENT ON COLUMN audit_log.metadata IS 'JSONB bag for extra context like batch counts or changed fields';

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 7: HIGH-PERFORMANCE INDEXES
-- All critical query paths are indexed. These prevent full-table scans under load.
-- IF NOT EXISTS ensures safe re-execution on existing databases.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email      ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role       ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_is_active  ON users (is_active);

-- Registrations (most-queried columns)
CREATE INDEX IF NOT EXISTS idx_reg_sr_no        ON registrations (sr_no);
CREATE INDEX IF NOT EXISTS idx_reg_status       ON registrations (status);
CREATE INDEX IF NOT EXISTS idx_reg_country      ON registrations (country_name);
CREATE INDEX IF NOT EXISTS idx_reg_company      ON registrations (company_name);
CREATE INDEX IF NOT EXISTS idx_reg_first_name   ON registrations (first_name);
CREATE INDEX IF NOT EXISTS idx_reg_last_name    ON registrations (last_name);
CREATE INDEX IF NOT EXISTS idx_reg_email        ON registrations (participant_email);
CREATE INDEX IF NOT EXISTS idx_reg_poc          ON registrations (poc);
CREATE INDEX IF NOT EXISTS idx_reg_product_1    ON registrations (main_import_product_1);
CREATE INDEX IF NOT EXISTS idx_reg_product_2    ON registrations (main_import_product_2);
CREATE INDEX IF NOT EXISTS idx_reg_bl_status    ON registrations (bl_status);
CREATE INDEX IF NOT EXISTS idx_reg_created_at   ON registrations (created_at DESC);

-- Travel Records (most-queried columns)
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
-- SECTION 8: SYSTEM INITIALIZATION
-- Creates the default settings row (id=1). ON CONFLICT ensures idempotent runs.
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO app_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 9: DEFAULT ADMIN ACCOUNT
-- Creates the default admin account for immediate login after deployment.
-- Credentials: username=admin / password=manthan18
-- Hash: bcrypt(cost=12) of "manthan18"
-- ON CONFLICT resets credentials — safe to re-run if locked out.
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
      role          = 'admin',
      is_active     = TRUE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 10: IDEMPOTENT COLUMN MIGRATIONS
-- Safely adds any columns that may be missing in older database instances.
-- These ALTER TABLE statements are 100% safe to run on both new and existing DBs.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 10A. Registrations — ensure all columns exist
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

-- 10B. Travel Records — ensure all columns exist
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

-- 10C. Users — ensure newer columns exist
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active     BOOLEAN   DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- 10D. App Settings — ensure all columns exist
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS registration_sheet_name TEXT DEFAULT 'Form Responses 1',
  ADD COLUMN IF NOT EXISTS travel_sheet_name       TEXT DEFAULT 'Travel Desk Records',
  ADD COLUMN IF NOT EXISTS drive_folder_id         TEXT,
  ADD COLUMN IF NOT EXISTS gas_web_app_url         TEXT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 11: UNIQUE CONSTRAINT FAILSAFES
-- Ensure critical unique constraints exist (idempotent via DO NOTHING pattern).
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- Ensure sr_no unique index on registrations
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'registrations' AND indexname = 'registrations_sr_no_key'
  ) THEN
    BEGIN
      ALTER TABLE registrations ADD CONSTRAINT registrations_sr_no_key UNIQUE (sr_no);
    EXCEPTION WHEN duplicate_table THEN
      NULL; -- constraint already exists
    END;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ✅ SCHEMA COMPLETE
-- Login: admin / manthan18
-- All tables, indexes, triggers, and default data are ready.
-- ═══════════════════════════════════════════════════════════════════════════════
