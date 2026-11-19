import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import fs from "fs";
import path from "path";

const AUTH_CACHE_FILE = path.join(process.cwd(), ".auth-cache.json");

function loadAuthCache() {
  try {
    if (fs.existsSync(AUTH_CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTH_CACHE_FILE, "utf-8"));
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
    fs.writeFileSync(AUTH_CACHE_FILE, JSON.stringify(memoryDb, null, 2), "utf-8");
  } catch (e) {
    console.warn("Failed saving auth cache:", e);
  }
}

export const auth = betterAuth({
  database: memoryAdapter(memoryDb),
  secret: process.env.BETTER_AUTH_SECRET || "dev_secret_key_needs_32_characters_for_better_auth_session",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
});
