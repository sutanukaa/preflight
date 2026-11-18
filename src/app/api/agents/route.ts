import { NextRequest, NextResponse } from "next/server";
import { inMemoryStore } from "@/lib/db";
import { AIAgent } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const agents = inMemoryStore.getAgents();
  return NextResponse.json({ agents });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const newAgent: AIAgent = {
      id: `agent-custom-${Date.now()}`,
      name: body.name || "Custom Specialist",
      role: body.role || "Domain Expert",
      avatar: body.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80",
      bio: body.bio || "Custom AI Agent tailored to your team's workflow.",
      systemPrompt: body.systemPrompt || "You are an intelligent domain consultant.",
      voice: body.voice || "alloy",
      tags: body.tags || ["Custom Agent", "Strategy"],
      totalSessions: 0,
      averageRating: 100,
    };

    inMemoryStore.addAgent(newAgent);
    return NextResponse.json({ agent: newAgent }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create agent" }, { status: 400 });
  }
}
