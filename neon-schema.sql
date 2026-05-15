-- ═══════════════════════════════════════════════════════════
-- DelegateConnect — Neon PostgreSQL Schema
-- Paste this entire file into: Neon Console → SQL Editor → Run
-- Columns mirror the Google Form exactly.
-- ═══════════════════════════════════════════════════════════

-- ─── 1. Users (staff accounts) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  role          TEXT DEFAULT 'staff',
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ─── 2. Registrations (delegate Google Form data) ─────────────────────────────
-- Google Form columns (in order):
--   Timestamp | Sr No | Title
--   First Name (As Written on Passport) | Last Name (As written on Passport)
--   Country Name | Passport Country | Region
--   Participant Mobile/Whatsapp number (With ISD Code) | Participant Email
--   Company Name | Company Website | Designation of the Representative
--   Passport Number | Place of Issue | Date of Expiry
--   Passport Front Copy | Passport Back Copy
--   Nature of Business
--   Your Main Import Product - 1 | Your Main Import Product - 2
--   Upload one proof of your Import (Bill of Lading etc.)
--   Which of the below describes your products/services
--   Please upload your Business Card
--   POC | Proof of Import | Type of POI
--   B/L Supplier Country | B/L Buyer Country
--   Status | Flight & Hotel | Remarks | B/L Status | BB Invitation letter status
CREATE TABLE IF NOT EXISTS registrations (
  id                       SERIAL PRIMARY KEY,
  sr_no                    INTEGER,
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
  passport_number          TEXT,
  place_of_issue           TEXT,
  date_of_expiry           TEXT,
  passport_front_copy      TEXT,   -- Google Form file URL
  passport_back_copy       TEXT,   -- Google Form file URL
  nature_of_business       TEXT,
  main_import_product_1    TEXT,
  main_import_product_2    TEXT,
  proof_upload             TEXT,   -- B/L or import proof file URL
  products_services        TEXT,
  business_card_upload     TEXT,   -- Business card file URL
  poc                      TEXT,
  proof_import             TEXT,
  type_of_poi              TEXT,
  bl_supplier_country      TEXT,
  bl_buyer_country         TEXT,
  status                   TEXT,
  flight_hotel_code        TEXT,
  remarks                  TEXT,
  bl_status                TEXT,
  bb_invitation_status     TEXT,
  -- Google Drive mirrored URLs (populated by GAS after file processing)
  drive_passport_front_url TEXT,
  drive_passport_back_url  TEXT,
  drive_proof_url          TEXT,
  drive_business_card_url  TEXT,
  created_at               TIMESTAMP DEFAULT NOW(),
  updated_at               TIMESTAMP DEFAULT NOW()
);

-- ─── 3. Travel Records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS travel_records (
  id                     SERIAL PRIMARY KEY,
  registration_id        INTEGER REFERENCES registrations(id) ON DELETE SET NULL,
  responses_sr_no        TEXT,
  room_no                TEXT,
  hotel_name             TEXT,
  initial                TEXT,
  first_name             TEXT,
  last_name              TEXT,
  country_name           TEXT,
  country_code           TEXT,
  participant_mobile     TEXT,
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
  sector                 TEXT,
  company_name           TEXT,
  poc                    TEXT,
  status                 TEXT DEFAULT 'Pending',
  reimbursement          TEXT DEFAULT 'No',
  notes                  TEXT,
  invoice_amount         TEXT,
  invoice_amount_usd     TEXT,
  ticket_received        TEXT DEFAULT 'No',
  invoice_received       TEXT DEFAULT 'No',
  visa_received          TEXT DEFAULT 'No',
  passport_copy_received TEXT DEFAULT 'No',
  voucher_received       TEXT DEFAULT 'No',
  ticket_url             TEXT,
  invoice_url            TEXT,
  visa_url               TEXT,
  passport_url           TEXT,
  voucher_url            TEXT,
  ticket_drive_id        TEXT,
  invoice_drive_id       TEXT,
  visa_drive_id          TEXT,
  passport_drive_id      TEXT,
  voucher_drive_id       TEXT,
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);

-- ─── 4. App Settings (GAS URL, Sheet ID, Drive Folder) ───────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  id                      INTEGER PRIMARY KEY DEFAULT 1,
  registration_sheet_id   TEXT,
  registration_sheet_name TEXT DEFAULT 'Form Responses 1',
  travel_sheet_name       TEXT DEFAULT 'Travel Desk Records',
  drive_folder_id         TEXT,
  gas_web_app_url         TEXT,
  updated_at              TIMESTAMP DEFAULT NOW()
);

-- ─── 5. Audit Log ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   INTEGER,
  metadata    JSONB,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ─── 6. Default rows ─────────────────────────────────────────────────────────
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─── 7. Admin user: login = admin / manthan18 ────────────────────────────────
INSERT INTO users (email, password_hash, name, role)
VALUES (
  'admin',
  '$2a$12$K7thZh9FoqF.G4vE3c6i0eOKCEBFpD8C1oJbFb2VLPfXrk3vHDVFi',
  'Admin',
  'admin'
)
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      role          = 'admin',
      name          = 'Admin';

-- ═══════════════════════════════════════════════════════════
-- Done! Tables created. Login with: admin / manthan18
-- ═══════════════════════════════════════════════════════════

-- ─── MIGRATION: Run this block on an EXISTING Neon database ──────────────────
-- Only needed if the registrations table already exists and you are
-- getting "column does not exist" errors on INSERT.
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS place_of_issue           TEXT,
  ADD COLUMN IF NOT EXISTS date_of_expiry           TEXT,
  ADD COLUMN IF NOT EXISTS passport_front_copy      TEXT,
  ADD COLUMN IF NOT EXISTS passport_back_copy       TEXT,
  ADD COLUMN IF NOT EXISTS nature_of_business       TEXT,
  ADD COLUMN IF NOT EXISTS proof_upload             TEXT,
  ADD COLUMN IF NOT EXISTS products_services        TEXT,
  ADD COLUMN IF NOT EXISTS business_card_upload     TEXT,
  ADD COLUMN IF NOT EXISTS bl_supplier_country      TEXT,
  ADD COLUMN IF NOT EXISTS bl_buyer_country         TEXT,
  ADD COLUMN IF NOT EXISTS drive_passport_front_url TEXT,
  ADD COLUMN IF NOT EXISTS drive_passport_back_url  TEXT,
  ADD COLUMN IF NOT EXISTS drive_proof_url          TEXT,
  ADD COLUMN IF NOT EXISTS drive_business_card_url  TEXT;

-- Remove legacy columns that are no longer in the schema (if they exist)
-- ALTER TABLE registrations DROP COLUMN IF EXISTS dollar_business;
-- ALTER TABLE registrations DROP COLUMN IF EXISTS vujis;

-- ─── FULL IDEMPOTENT MIGRATION (safe to run on any existing DB) ───────────────
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
  ADD COLUMN IF NOT EXISTS passport_number          TEXT,
  ADD COLUMN IF NOT EXISTS place_of_issue           TEXT,
  ADD COLUMN IF NOT EXISTS date_of_expiry           TEXT,
  ADD COLUMN IF NOT EXISTS passport_front_copy      TEXT,
  ADD COLUMN IF NOT EXISTS passport_back_copy       TEXT,
  ADD COLUMN IF NOT EXISTS nature_of_business       TEXT,
  ADD COLUMN IF NOT EXISTS main_import_product_1    TEXT,
  ADD COLUMN IF NOT EXISTS main_import_product_2    TEXT,
  ADD COLUMN IF NOT EXISTS proof_upload             TEXT,
  ADD COLUMN IF NOT EXISTS products_services        TEXT,
  ADD COLUMN IF NOT EXISTS business_card_upload     TEXT,
  ADD COLUMN IF NOT EXISTS poc                      TEXT,
  ADD COLUMN IF NOT EXISTS proof_import             TEXT,
  ADD COLUMN IF NOT EXISTS type_of_poi              TEXT,
  ADD COLUMN IF NOT EXISTS bl_supplier_country      TEXT,
  ADD COLUMN IF NOT EXISTS bl_buyer_country         TEXT,
  ADD COLUMN IF NOT EXISTS status                   TEXT,
  ADD COLUMN IF NOT EXISTS flight_hotel_code        TEXT,
  ADD COLUMN IF NOT EXISTS remarks                  TEXT,
  ADD COLUMN IF NOT EXISTS bl_status                TEXT,
  ADD COLUMN IF NOT EXISTS bb_invitation_status     TEXT,
  ADD COLUMN IF NOT EXISTS drive_passport_front_url TEXT,
  ADD COLUMN IF NOT EXISTS drive_passport_back_url  TEXT,
  ADD COLUMN IF NOT EXISTS drive_proof_url          TEXT,
  ADD COLUMN IF NOT EXISTS drive_business_card_url  TEXT;
-- ─────────────────────────────────────────────────────────────────────────────
