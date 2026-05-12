import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

// Lazy singleton — only connects when first DB query is made (not at build time)
let _instance: DB | null = null;

function getInstance(): DB {
  if (!_instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL environment variable is not set");
    _instance = drizzle(neon(url), { schema });
  }
  return _instance;
}

// Proxy so all existing `import { db }` calls work unchanged
export const db = new Proxy({} as DB, {
  get(_, prop: string | symbol) {
    return getInstance()[prop as keyof DB];
  },
});
