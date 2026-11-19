import { NextRequest, NextResponse } from "next/server";
import { inMemoryStore, dbPool } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { TranscriptUtterance, MeetingSummary } from "@/types";
import { generateMeetingSummaryWithGemini, buildDeterministicSummary } from "@/lib/ai-analysis";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let meeting = inMemoryStore.peekMeeting(id);

  // If not yet in worker memory, check Neon PostgreSQL first before generating a fallback
  if (!meeting && dbPool) {
    try {
      const res = await dbPool.query("SELECT * FROM meetings WHERE id = $1;", [id]);
      if (res.rows[0]) {
        const row = res.rows[0];
        meeting = {
          id: row.id,
          title: row.title,
          agentId: row.agent_id,
          userId: row.user_id,
          status: row.status,
          startedAt: row.started_at
            ? new Date(row.started_at).toISOString()
            : new Date().toISOString(),
          durationSeconds: row.duration_seconds || 0,
          recordingUrl: row.recording_url || "",
          transcripts: [],
        };
        inMemoryStore.setMeeting(id, meeting);
      }
    } catch (e) {
      console.warn("Neon lookup meeting note:", e);
    }
  }

  if (!meeting) {
    meeting = inMemoryStore.getMeeting(id);
  }

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Ensure agent is fully populated
  if ((!meeting.agent || meeting.agent.id !== meeting.agentId) && meeting.agentId) {
    let resolvedAgent = inMemoryStore.getAgent(meeting.agentId);
    if (!resolvedAgent && dbPool) {
      try {
        const aRes = await dbPool.query("SELECT * FROM agents WHERE id = $1;", [meeting.agentId]);
        if (aRes.rows[0]) {
          const row = aRes.rows[0];
          resolvedAgent = {
            id: row.id,
            name: row.name,
            role: row.role,
            avatar: row.avatar,
            bio: row.bio,
            systemPrompt: row.system_prompt,
            voice: row.voice,
            tags: Array.isArray(row.tags) ? row.tags : typeof row.tags === "string" ? JSON.parse(row.tags) : [],
          };
          inMemoryStore.addAgent(resolvedAgent);
        }
      } catch (err) {
        console.warn("Neon meeting agent fetch error:", err);
      }
    }
    if (resolvedAgent) {
      meeting.agent = resolvedAgent;
      inMemoryStore.updateMeeting(meeting.id, { agent: resolvedAgent });
    }
  }

  return NextResponse.json({ meeting });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { durationSeconds = 180, utterances = [], action, userName = "Participant" } = body;

    const meeting = inMemoryStore.getMeeting(id);
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    if (action === "end_call" || !action) {
      // 1. Dispatch event to Inngest for background orchestration
      try {
        await inngest.send({
          name: "call.ended",
          data: {
            meetingId: id,
            durationSeconds,
            recordingUrl: meeting.recordingUrl,
            utterances,
          },
        });
      } catch (e) {
        console.warn("Inngest dispatch note:", (e as Error).message);
      }

      // 2. Transcripts derived directly from the live meeting session
      const agentName = meeting.agent?.name || "AI Specialist";
      const finalTranscripts: TranscriptUtterance[] = utterances;

      // 3. Populate immediate post-meeting record derived from the actual spoken dialogue (zero slop)
      const initialSummary: MeetingSummary = buildDeterministicSummary(
        id,
        finalTranscripts,
        userName,
        agentName
      );

      const updatedMeeting = inMemoryStore.updateMeeting(id, {
        status: "completed",
        durationSeconds: durationSeconds || 165,
        endedAt: new Date().toISOString(),
        transcripts: finalTranscripts,
        summary: initialSummary,
      });

      // Run Gemini summary enhancement asynchronously in background without blocking response
      generateMeetingSummaryWithGemini(id, finalTranscripts, userName, agentName)
        .then((geminiSummary) => {
          if (geminiSummary) {
            inMemoryStore.updateMeeting(id, { summary: geminiSummary });
          }
        })
        .catch((e) => console.warn("Background Gemini summary note:", e));

      return NextResponse.json({ meeting: updatedMeeting });
    }

    return NextResponse.json({ meeting });
  } catch (error) {
    console.error("Meeting update error:", error);
    return NextResponse.json({ error: "Failed to update meeting" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const meeting = inMemoryStore.getMeeting(id);

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Toggle or update action item status
    if (body.actionItemId && meeting.summary) {
      const items = meeting.summary.actionItems.map((item) => {
        if (item.id === body.actionItemId) {
          return {
            ...item,
            status: body.status || (item.status === "completed" ? "pending" : "completed"),
          };
        }
        return item;
      });

      const updated = inMemoryStore.updateMeeting(id, {
        summary: {
          ...meeting.summary,
          actionItems: items,
        },
      });

      return NextResponse.json({ meeting: updated });
    }

    // General updates (e.g. title)
    const updated = inMemoryStore.updateMeeting(id, body);
    return NextResponse.json({ meeting: updated });
  } catch (error) {
    console.error("Patch meeting error:", error);
    return NextResponse.json({ error: "Failed to update meeting" }, { status: 500 });
  }
}
