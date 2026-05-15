/**
 * run-migration.mjs  —  Apply missing DB columns to Neon
 * Run: node run-migration.mjs
 */
import postgres from "postgres";
import { readFileSync } from "fs";

// Load .env.local manually
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const k = trimmed.slice(0, eqIdx).trim();
    const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
} catch {}

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not found in .env.local");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

async function exec(label, query) {
  try {
    await sql.unsafe(query);
    console.log(`✅ ${label}`);
  } catch (err) {
    console.error(`❌ ${label}\n   ${err.message}\n`);
  }
}

async function run() {
  console.log("🔄 Applying migrations to Neon DB…\n");

  await exec("registrations — ADD missing columns", `
    ALTER TABLE registrations
      ADD COLUMN IF NOT EXISTS sr_no                    INTEGER,
      ADD COLUMN IF NOT EXISTS timestamp_raw            TEXT,
      ADD COLUMN IF NOT EXISTS title                    VARCHAR(20),
      ADD COLUMN IF NOT EXISTS first_name               VARCHAR(120),
      ADD COLUMN IF NOT EXISTS last_name                VARCHAR(120),
      ADD COLUMN IF NOT EXISTS country_name             VARCHAR(100),
      ADD COLUMN IF NOT EXISTS passport_country         VARCHAR(100),
      ADD COLUMN IF NOT EXISTS region                   VARCHAR(100),
      ADD COLUMN IF NOT EXISTS participant_mobile       VARCHAR(50),
      ADD COLUMN IF NOT EXISTS participant_email        VARCHAR(320),
      ADD COLUMN IF NOT EXISTS company_name             VARCHAR(255),
      ADD COLUMN IF NOT EXISTS company_website          VARCHAR(500),
      ADD COLUMN IF NOT EXISTS designation              VARCHAR(200),
      ADD COLUMN IF NOT EXISTS passport_number          VARCHAR(50),
      ADD COLUMN IF NOT EXISTS place_of_issue           VARCHAR(100),
      ADD COLUMN IF NOT EXISTS date_of_expiry           VARCHAR(30),
      ADD COLUMN IF NOT EXISTS passport_front_copy      TEXT,
      ADD COLUMN IF NOT EXISTS passport_back_copy       TEXT,
      ADD COLUMN IF NOT EXISTS nature_of_business       TEXT,
      ADD COLUMN IF NOT EXISTS main_import_product_1    VARCHAR(200),
      ADD COLUMN IF NOT EXISTS main_import_product_2    VARCHAR(200),
      ADD COLUMN IF NOT EXISTS proof_upload             TEXT,
      ADD COLUMN IF NOT EXISTS products_services        TEXT,
      ADD COLUMN IF NOT EXISTS business_card_upload     TEXT,
      ADD COLUMN IF NOT EXISTS poc                      VARCHAR(100),
      ADD COLUMN IF NOT EXISTS proof_import             VARCHAR(50),
      ADD COLUMN IF NOT EXISTS type_of_poi              VARCHAR(100),
      ADD COLUMN IF NOT EXISTS bl_supplier_country      VARCHAR(100),
      ADD COLUMN IF NOT EXISTS bl_buyer_country         VARCHAR(100),
      ADD COLUMN IF NOT EXISTS status                   VARCHAR(100),
      ADD COLUMN IF NOT EXISTS flight_hotel_code        VARCHAR(20),
      ADD COLUMN IF NOT EXISTS remarks                  TEXT,
      ADD COLUMN IF NOT EXISTS bl_status                VARCHAR(100),
      ADD COLUMN IF NOT EXISTS bb_invitation_status     VARCHAR(100),
      ADD COLUMN IF NOT EXISTS drive_passport_front_url TEXT,
      ADD COLUMN IF NOT EXISTS drive_passport_back_url  TEXT,
      ADD COLUMN IF NOT EXISTS drive_proof_url          TEXT,
      ADD COLUMN IF NOT EXISTS drive_business_card_url  TEXT
  `);

  await exec("travel_records — ADD Drive URL columns", `
    ALTER TABLE travel_records
      ADD COLUMN IF NOT EXISTS ticket_url        TEXT,
      ADD COLUMN IF NOT EXISTS invoice_url       TEXT,
      ADD COLUMN IF NOT EXISTS visa_url          TEXT,
      ADD COLUMN IF NOT EXISTS passport_url      TEXT,
      ADD COLUMN IF NOT EXISTS voucher_url       TEXT,
      ADD COLUMN IF NOT EXISTS ticket_drive_id   TEXT,
      ADD COLUMN IF NOT EXISTS invoice_drive_id  TEXT,
      ADD COLUMN IF NOT EXISTS visa_drive_id     TEXT,
      ADD COLUMN IF NOT EXISTS passport_drive_id TEXT,
      ADD COLUMN IF NOT EXISTS voucher_drive_id  TEXT
  `);

  await exec("app_settings — CREATE TABLE IF NOT EXISTS", `
    CREATE TABLE IF NOT EXISTS app_settings (
      id                    INTEGER PRIMARY KEY DEFAULT 1,
      registration_sheet_id TEXT,
      registration_sheet_name TEXT DEFAULT 'Form Responses 1',
      travel_sheet_name     TEXT DEFAULT 'Travel Desk Records',
      drive_folder_id       TEXT,
      gas_web_app_url       TEXT,
      updated_at            TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await exec("audit_log — ADD metadata column", `
    ALTER TABLE audit_log
      ADD COLUMN IF NOT EXISTS metadata JSONB
  `);

  await exec("chat_messages — CREATE TABLE IF NOT EXISTS", `
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  console.log("\n🎉 Done! Restart your dev server and try importing again.");
}

run().catch((e) => { console.error(e); process.exit(1); });
