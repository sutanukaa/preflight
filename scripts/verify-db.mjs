import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", override: true });

async function verify() {
  const { Pool } = pg;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const res = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
  );
  console.log("Neon Postgres Tables:", res.rows.map((r) => r.table_name));
  await pool.end();
}

verify();
