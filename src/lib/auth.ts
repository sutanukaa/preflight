import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import fs from "fs";
import path from "path";
import pg from "pg";

const AUTH_CACHE_FILE = path.join(process.cwd(), ".auth-cache.json");

function loadAuthCache() {
  try {
    const filePath = process.env.VERCEL
      ? path.join("/tmp", ".auth-cache.json")
      : AUTH_CACHE_FILE;
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return {
        user: Array.isArray(data.user) ? data.user : [],
        session: Array.isArray(data.session) ? data.session : [],
        account: Array.isArray(data.account) ? data.account : [],
        verification: Array.isArray(data.verification) ? data.verification : [],
      };
    }
  } catch (e) {
    console.warn("Failed reading auth cache:", e);
  }
  return {
    user: [] as any[],
    session: [] as any[],
    account: [] as any[],
    verification: [] as any[],
  };
}

export const memoryDb = loadAuthCache();

export function saveAuthCache() {
  try {
    const filePath = process.env.VERCEL
      ? path.join("/tmp", ".auth-cache.json")
      : AUTH_CACHE_FILE;
    fs.writeFileSync(filePath, JSON.stringify(memoryDb, null, 2), "utf-8");
  } catch (e) {
    console.warn("Failed saving auth cache:", e);
  }
}

const resolvedBaseURL =
  process.env.BETTER_AUTH_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

// Use persistent PostgreSQL pool when available for persistent sessions across serverless lambdas
let databaseConfig: any = memoryAdapter(memoryDb);
if (process.env.DATABASE_URL) {
  try {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
    });
    databaseConfig = pool;
  } catch (err) {
    console.warn("Better Auth PostgreSQL pool fallback to memory:", err);
  }
}

export const auth = betterAuth({
  database: databaseConfig,
  secret: process.env.BETTER_AUTH_SECRET || "dev_secret_key_needs_32_characters_for_better_auth_session",
  baseURL: resolvedBaseURL,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
});
