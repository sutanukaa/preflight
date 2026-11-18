import { NextRequest, NextResponse } from "next/server";
import { auth, memoryDb } from "@/lib/auth";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (session?.user) {
      return NextResponse.json({ user: session.user });
    }

    // Check if any user was saved in memoryDb from the Google OAuth callback
    if (memoryDb.user.length > 0) {
      const latestUser = memoryDb.user[memoryDb.user.length - 1];
      return NextResponse.json({ user: latestUser });
    }

    return NextResponse.json({ user: null });
  } catch (error) {
    console.error("Auth me error:", error);
    return NextResponse.json({ user: null });
  }
}
