import { auth, saveAuthCache } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const handler = toNextJsHandler(auth);

export async function GET(req: NextRequest) {
  const res = await handler.GET(req);
  saveAuthCache();
  return res;
}

export async function POST(req: NextRequest) {
  const res = await handler.POST(req);
  saveAuthCache();
  return res;
}
