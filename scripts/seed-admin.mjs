/*
 * Run: node --env-file=.env.local scripts/seed-admin.mjs
 * Seed script – creates the default admin user.
 * Run ONCE after setting DATABASE_URL in .env.local:
 *   node --env-file=.env.local scripts/seed-admin.mjs
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { hashSync } from "bcryptjs";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}

const client = postgres(DATABASE_URL, { prepare: false });
const db = drizzle(client);

// Inline minimal schema to avoid TS imports
const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  role: text("role").default("staff"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

const SEED_USERS = [
  { email: "admin", password: "manthan18", name: "Admin",  role: "admin"  },
];

for (const u of SEED_USERS) {
  const passwordHash = hashSync(u.password, 12);
  await db
    .insert(users)
    .values({ email: u.email, passwordHash, name: u.name, role: u.role })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash, name: u.name, role: u.role },
    });
  console.log(`✓  ${u.role.toUpperCase()} user '${u.email}' seeded`);
}

console.log("\n✅  Seeding complete! Login with:");
console.log("   Username : admin");
console.log("   Password : manthan18");
process.exit(0);
