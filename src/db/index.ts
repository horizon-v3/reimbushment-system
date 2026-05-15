import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  _db_instance: ReturnType<typeof drizzle<typeof schema>>;
  _db_schema_keys: string;
};

// Next.js hot module reloading can keep old schemas if we don't invalidate it.
const currentSchemaKeys = Object.keys(schema).join(",");

function getInstance() {
  const url = process.env.DATABASE_URL || "postgres://postgres.hbjrrfvuhjfexhvjpcun:5zanRUNJuQHUEJAX@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x";
  if (!url) throw new Error("DATABASE_URL environment variable is not set");

  // Re-create if schema changed (to fix HMR keeping old schema definitions)
  if (!globalForDb._db_instance || globalForDb._db_schema_keys !== currentSchemaKeys) {
    const client = postgres(url, { prepare: false });
    globalForDb._db_instance = drizzle(client, { schema });
    globalForDb._db_schema_keys = currentSchemaKeys;
  }
  return globalForDb._db_instance;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop: string | symbol) {
    return getInstance()[prop as keyof ReturnType<typeof drizzle<typeof schema>>];
  },
});
