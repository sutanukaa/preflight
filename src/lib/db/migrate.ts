import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });

async function runMigration() {
  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const { Pool } = pg;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const db = drizzle(pool);

  console.log("Running Drizzle migrations against Neon Postgres...");
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("MIGRATION COMPLETED SUCCESSFULLY! All tables created in Neon.");
    await pool.end();
  } catch (err) {
    console.error("Migration failed:", err);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
