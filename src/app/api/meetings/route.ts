import { NextRequest, NextResponse } from "next/server";
import { inMemoryStore } from "@/lib/db";
import { Meeting } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const meetings = inMemoryStore.getMeetings();
  return NextResponse.json({ meetings });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const agent = inMemoryStore.getAgent(body.agentId || "agent-sarah");

    const newMeeting: Meeting = {
      id: `meet-${Date.now()}`,
      title: body.title || `Live Strategy Session with ${agent?.name || "AI Specialist"}`,
      agentId: agent?.id || "agent-sarah",
      agent: agent,
      userId: body.userId || "user-default-1",
      status: "live",
      startedAt: new Date().toISOString(),
      durationSeconds: 0,
      recordingUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      transcripts: [],
    };

    inMemoryStore.createMeeting(newMeeting);
    return NextResponse.json({ meeting: newMeeting }, { status: 201 });
  } catch (error) {
    console.error("Create meeting error:", error);
    return NextResponse.json({ error: "Failed to create meeting" }, { status: 500 });
  }
}
