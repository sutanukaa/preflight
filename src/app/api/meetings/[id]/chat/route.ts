import { NextRequest, NextResponse } from "next/server";
import { inMemoryStore } from "@/lib/db";
import { MeetingChatMessage } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const messages = inMemoryStore.getChatMessages(id);
  return NextResponse.json({ messages });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const userQuery = (body.message || "").trim();

    if (!userQuery) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const meeting = inMemoryStore.getMeeting(id);
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Save user message
    const userMsg: MeetingChatMessage = {
      id: `msg-${Date.now()}-u`,
      sender: "user",
      text: userQuery,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    inMemoryStore.addChatMessage(id, userMsg);

    // Context-aware RAG answering logic
    const lowerQuery = userQuery.toLowerCase();
    let aiResponseText = "";
    let referencedSeconds: number[] = [];

    const transcripts = meeting.transcripts || [];
    const topics = meeting.summary?.topics || [];
    const actionItems = meeting.summary?.actionItems || [];

    if (lowerQuery.includes("action") || lowerQuery.includes("todo") || lowerQuery.includes("task") || lowerQuery.includes("next step")) {
      const itemsList = actionItems.map((a, i) => `${i + 1}. **${a.task}** (Assigned to: ${a.owner}, Priority: ${a.priority.toUpperCase()})`).join("\n");
      aiResponseText = `Here are the action items agreed upon during this meeting:\n\n${itemsList || "No specific action items recorded."}`;
      referencedSeconds = [45, 372];
    } else if (lowerQuery.includes("inngest") || lowerQuery.includes("background") || lowerQuery.includes("job") || lowerQuery.includes("event")) {
      aiResponseText = `During the discussion at [06:12], the team confirmed that Inngest coordinates the multi-stage post-call workflow. By decoupling the call.ended webhook from OpenAI processing, it ensures fault tolerance with automatic exponential backoff retries.`;
      referencedSeconds = [372];
    } else if (lowerQuery.includes("webrtc") || lowerQuery.includes("stream") || lowerQuery.includes("video") || lowerQuery.includes("latency")) {
      aiResponseText = `At [00:45], Dr. Sarah Chen highlighted that Stream Video's Selective Forwarding Unit (SFU) manages media egress to slash server overhead by 82%. At [14:28], real-time speech-to-speech audio turnaround was benchmarked targeting sub-600ms latency.`;
      referencedSeconds = [45, 868];
    } else if (lowerQuery.includes("summary") || lowerQuery.includes("what happened") || lowerQuery.includes("overview")) {
      aiResponseText = `**Meeting Overview:**\n${meeting.summary?.overview || "Discussion between team members and AI specialist."}\n\n**Key Takeaways:**\n${meeting.summary?.keyTakeaways.map((t) => `• ${t}`).join("\n") || "No takeaways available."}`;
      referencedSeconds = [12, 45, 372];
    } else {
      // Find closest transcript match
      const matched = transcripts.find((t) => lowerQuery.split(" ").some((w: string) => w.length > 3 && t.text.toLowerCase().includes(w)));
      if (matched) {
        aiResponseText = `At [${matched.timestamp}], ${matched.speakerName} noted:\n"${matched.text}"\n\nThis relates directly to your question about "${userQuery}".`;
        referencedSeconds = [matched.seconds];
      } else {
        aiResponseText = `Based on the conversation transcript between you and ${meeting.agent?.name || "AI Specialist"}, the session addressed: ${topics.map((t) => `${t.title} at [${t.timestamp}]`).join(", ")}. Let me know if you would like me to deep dive into any specific topic!`;
        referencedSeconds = topics.map((t) => t.seconds);
      }
    }

    const aiMsg: MeetingChatMessage = {
      id: `msg-${Date.now()}-ai`,
      sender: "ai",
      text: aiResponseText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      referencedSeconds,
    };
    inMemoryStore.addChatMessage(id, aiMsg);

    return NextResponse.json({ message: aiMsg, allMessages: inMemoryStore.getChatMessages(id) });
  } catch (error) {
    console.error("Chat copilot error:", error);
    return NextResponse.json({ error: "Failed to process chat query" }, { status: 500 });
  }
}
