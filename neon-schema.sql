-- ═══════════════════════════════════════════════════════════
-- DelegateConnect — Neon PostgreSQL Schema
-- Paste this entire file into: Neon Console → SQL Editor → Run
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

-- ─── 2. Registrations (delegate form data) ───────────────────────────────────
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
  nature_of_business       TEXT,
  main_import_product_1    TEXT,
  main_import_product_2    TEXT,
  products_services        TEXT,
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
  dollar_business          TEXT,
  vujis                    TEXT,
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
-- Password hash for "manthan18" (bcrypt, cost 12)
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
