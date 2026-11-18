import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

export const memoryDb = {
  user: [] as any[],
  session: [] as any[],
  account: [] as any[],
  verification: [] as any[],
};

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
