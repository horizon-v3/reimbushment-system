import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { sql } from "drizzle-orm";
import { db } from "../db";

async function main() {
  console.log("Applying db_vujis schema...");

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS db_vujis_records (
        id                       SERIAL PRIMARY KEY,
        sr_no                    INTEGER UNIQUE,
        company_name             TEXT,
        country_name             TEXT,
        region                   TEXT,
        proof_of_import_y        TEXT,
        proof_of_import_n        TEXT,
        vujis                    TEXT,
        import_value_vujis       TEXT,
        dollar_business          TEXT,
        import_value_dollar      TEXT,
        both_db_vujis            TEXT,
        importing_from_india     TEXT,
        importing_from_other_country TEXT,
        main_import_product_1    TEXT,
        main_import_product_2    TEXT,
        poc                      TEXT,
        reason                   TEXT,
        comment                  TEXT,
        created_at               TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at               TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    await db.execute(sql`
      ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS db_vujis_sheet_name TEXT DEFAULT 'DB & vujis';
    `);

    console.log("Migration successful!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    process.exit(0);
  }
}

main();
