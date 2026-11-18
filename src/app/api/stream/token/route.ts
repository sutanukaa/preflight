import { NextRequest, NextResponse } from "next/server";
import { generateStreamUserToken, STREAM_API_KEY } from "@/lib/stream";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "user-default-1";

    const token = generateStreamUserToken(userId);

    return NextResponse.json({
      apiKey: STREAM_API_KEY,
      token,
      userId,
    });
  } catch (error) {
    console.error("Stream token error:", error);
    return NextResponse.json(
      { error: "Failed to generate Stream video token" },
      { status: 500 }
    );
  }
}
