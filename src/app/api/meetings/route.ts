import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { inMemoryStore, dbPool, SEED_AGENTS } from "@/lib/db";
import { auth, memoryDb } from "@/lib/auth";
import { AIAgent, Meeting } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const meetings = inMemoryStore.getMeetings();
  return NextResponse.json({ meetings });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Verify session
    let sessionUser: { id: string; name?: string } | null = null;
    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      });
      if (session?.user) {
        sessionUser = session.user;
      }
    } catch {}

    const resolvedUserId =
      sessionUser?.id ||
      body.userId ||
      (memoryDb.user.length > 0 ? memoryDb.user[memoryDb.user.length - 1].id : null);

    if (!resolvedUserId) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in to create or launch an AI consultation room." },
        { status: 401 }
      );
    }

    const targetAgentId = body.agentId;

    let agent: AIAgent | undefined = targetAgentId ? inMemoryStore.getAgent(targetAgentId) : undefined;

    // If agent is not in memory, query Neon database directly
    if (!agent && targetAgentId && dbPool) {
      try {
        const res = await dbPool.query("SELECT * FROM agents WHERE id = $1;", [targetAgentId]);
        if (res.rows[0]) {
          const row = res.rows[0];
          agent = {
            id: row.id,
            name: row.name,
            role: row.role,
            avatar: row.avatar,
            bio: row.bio,
            systemPrompt: row.system_prompt,
            voice: row.voice,
            tags: Array.isArray(row.tags) ? row.tags : typeof row.tags === "string" ? JSON.parse(row.tags) : [],
          };
          inMemoryStore.addAgent(agent);
        }
      } catch (e) {
        console.warn("Neon agent lookup error:", e);
      }
    }

    if (!agent) {
      agent = targetAgentId ? inMemoryStore.getAgent(targetAgentId) : undefined;
    }
    if (!agent) {
      agent = inMemoryStore.getAgents()[0] || SEED_AGENTS[0];
    }

    const newMeeting: Meeting = {
      id: `meet-${Date.now()}`,
      title: body.title || `Live Strategy Session with ${agent.name}`,
      agentId: agent.id,
      agent: agent,
      userId: resolvedUserId,
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
