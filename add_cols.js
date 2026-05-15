const postgres = require('postgres');

const sql = postgres('postgresql://neondb_owner:npg_MsYe2L7XJytd@ep-shiny-poetry-ankcgyrl-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require');

async function main() {
  console.log("Adding columns...");
  try { await sql`ALTER TABLE "travel_records" ADD COLUMN "reimbursement_amount" text;`; console.log("Added reimbursement_amount"); } catch(e) { console.log(e.message); }
  try { await sql`ALTER TABLE "travel_records" ADD COLUMN "bl" text;`; console.log("Added bl"); } catch(e) { console.log(e.message); }
  try { await sql`ALTER TABLE "travel_records" ADD COLUMN "business_card_url" text;`; console.log("Added business_card_url"); } catch(e) { console.log(e.message); }
  try { await sql`ALTER TABLE "travel_records" ADD COLUMN "business_card_drive_id" text;`; console.log("Added business_card_drive_id"); } catch(e) { console.log(e.message); }
  
  // also check if registrations table exists
  try { await sql`SELECT id FROM registrations LIMIT 1`; console.log("Registrations table exists"); } catch(e) { console.log("Registrations table error:", e.message); }
  
  process.exit(0);
}
main();
