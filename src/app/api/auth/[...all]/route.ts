import { auth, saveAuthCache } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const handler = toNextJsHandler(auth);

export async function GET(req: NextRequest) {
  try {
    const res = await handler.GET(req);
    saveAuthCache();
    return res;
  } catch (err: any) {
    console.error("Auth GET handler error:", err);
    return NextResponse.json(
      {
        error: err?.message || "Internal authentication error",
        hint: "Please verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel Environment Variables.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const res = await handler.POST(req);
    saveAuthCache();
    return res;
  } catch (err: any) {
    console.error("Auth POST handler error:", err);
    return NextResponse.json(
      {
        error: err?.message || "Internal authentication error",
        missingVars: {
          GOOGLE_CLIENT_ID: !process.env.GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET: !process.env.GOOGLE_CLIENT_SECRET,
          BETTER_AUTH_SECRET: !process.env.BETTER_AUTH_SECRET,
        },
        hint: "Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel Project Settings -> Environment Variables, then redeploy.",
      },
      { status: 500 }
    );
  }
}
