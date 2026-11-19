import { NextRequest, NextResponse } from "next/server";
import { auth, memoryDb } from "@/lib/auth";
import { headers } from "next/headers";
import { dbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    const user = session?.user || (memoryDb.user.length > 0 ? memoryDb.user[memoryDb.user.length - 1] : null);

    if (user) {
      if (dbPool) {
        dbPool
          .query(
            `INSERT INTO users (id, name, email, avatar, plan)
             VALUES ($1, $2, $3, $4, 'pro')
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               email = EXCLUDED.email,
               avatar = EXCLUDED.avatar;`,
            [user.id, user.name || "User", user.email || "user@clarity.ai", user.image || ""]
          )
          .catch((e) => console.warn("Neon user sync note:", e.message));
      }
      return NextResponse.json({ user });
    }

    return NextResponse.json({ user: null });
  } catch (error) {
    console.error("Auth me error:", error);
    return NextResponse.json({ user: null });
  }
}
