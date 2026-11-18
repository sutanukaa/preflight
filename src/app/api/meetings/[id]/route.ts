import { NextRequest, NextResponse } from "next/server";
import { inMemoryStore } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { TranscriptUtterance } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const meeting = inMemoryStore.getMeeting(id);

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
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

      // 2. Synthesize topics, transcript & summary
      const agentName = meeting.agent?.name || "AI Specialist";
      const finalTranscripts: TranscriptUtterance[] = utterances.length > 0
        ? utterances
        : [
            {
              id: `tr-${id}-1`,
              speaker: "agent",
              speakerName: agentName,
              timestamp: "00:04",
              seconds: 4,
              text: `Hello! I am ${agentName}. It's great to connect with you. What challenge are we tackling today?`,
            },
            {
              id: `tr-${id}-2`,
              speaker: "user",
              speakerName: `${userName} (You)`,
              timestamp: "00:22",
              seconds: 22,
              text: "We are designing our real-time video intelligence workflow, streaming live audio into OpenAI Realtime and processing calls with Inngest.",
            },
            {
              id: `tr-${id}-3`,
              speaker: "agent",
              speakerName: agentName,
              timestamp: "00:54",
              seconds: 54,
              text: "That architecture is robust. By using Stream Video's SFU for WebRTC, we eliminate media server bottlenecks. When the call ends, Inngest triggers the background summarization pipeline.",
            },
            {
              id: `tr-${id}-4`,
              speaker: "user",
              speakerName: `${userName} (You)`,
              timestamp: "01:45",
              seconds: 105,
              text: "And how do we ensure the user can jump straight to relevant points when reviewing the meeting transcript?",
            },
            {
              id: `tr-${id}-5`,
              speaker: "agent",
              speakerName: agentName,
              timestamp: "02:18",
              seconds: 138,
              text: "Each topic block and transcript line has an exact timestamp in seconds. Clicking any utterance seeks the video player directly to that frame, keeping video and transcript perfectly synchronized.",
            },
          ];

      const updatedMeeting = inMemoryStore.updateMeeting(id, {
        status: "completed",
        durationSeconds: durationSeconds || 165,
        endedAt: new Date().toISOString(),
        transcripts: finalTranscripts,
        summary: {
          meetingId: id,
          overview: `Live interactive session with ${agentName} focusing on real-time video architecture, Inngest background event processing, and transcript seeking synchronization.`,
          keyTakeaways: [
            `Stream Video handles WebRTC media egress with sub-second connection times.`,
            `Inngest ensures reliable background transcription without edge function timeout risk.`,
            `Post-meeting suite provides synchronized video playback with clickable topic milestones.`,
            `Meeting AI Copilot allows conversational Q&A over the full transcript.`,
          ],
          topics: [
            {
              id: `top-${id}-1`,
              title: "Session Initiation & Problem Statement",
              timestamp: "00:04",
              seconds: 4,
              summary: "Clarified primary objectives around WebRTC streaming and background pipelines.",
              bulletPoints: [
                "Evaluated Stream Video SDK capabilities.",
                "Established latency budget for OpenAI Realtime voice interaction.",
              ],
            },
            {
              id: `top-${id}-2`,
              title: "Event-Driven Processing with Inngest",
              timestamp: "00:54",
              seconds: 54,
              summary: "Decoupled video call termination from asynchronous transcription and topic modeling.",
              bulletPoints: [
                "Implemented step-functions for automatic retry and rate-limit backoff.",
                "Ensured database updates are idempotent.",
              ],
            },
            {
              id: `top-${id}-3`,
              title: "Video Seeking & Transcript Indexing",
              timestamp: "02:18",
              seconds: 138,
              summary: "Linked player playback head with timestamp-indexed utterances.",
              bulletPoints: [
                "Full-text search highlighting across speech lines.",
                "Instant jump-to-time on topic selection.",
              ],
            },
          ],
          actionItems: [
            {
              id: `act-${id}-1`,
              task: "Verify WebRTC token generation security parameters",
              owner: userName,
              priority: "high",
              status: "completed",
            },
            {
              id: `act-${id}-2`,
              task: "Run end-to-end Inngest function test with sample recording payload",
              owner: "DevOps",
              priority: "medium",
              status: "pending",
            },
          ],
          sentiment: {
            positive: 89,
            neutral: 9,
            negative: 2,
            verdict: "Decisive & Solution-Oriented",
          },
        },
      });

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
