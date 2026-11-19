import { NextRequest, NextResponse } from "next/server";
import { inMemoryStore } from "@/lib/db";
import { MeetingChatMessage } from "@/types";
import { askMeetingCopilotWithGemini } from "@/lib/ai-analysis";

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

    // Context-aware RAG answering logic with Gemini
    const { text: aiResponseText, referencedSeconds } = await askMeetingCopilotWithGemini(
      meeting,
      userQuery
    );

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
