import { NextRequest, NextResponse } from "next/server";
import { inMemoryStore } from "@/lib/db";
import { AIAgent } from "@/types";
import { auth, memoryDb } from "@/lib/auth";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    let sessionUser: { id: string } | null = null;
    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      });
      if (session?.user) {
        sessionUser = session.user;
      }
    } catch {}

    const queryUserId = req.nextUrl.searchParams.get("userId");

    // If queryUserId is explicitly provided, honor it (supports testing & multi-user scoping)
    // Otherwise resolve to authenticated session user ID, or null for public/anonymous visitors
    let activeUserId: string | null = null;
    if (queryUserId !== null) {
      activeUserId = queryUserId.trim() ? queryUserId.trim() : null;
    } else if (sessionUser?.id) {
      activeUserId = sessionUser.id;
    } else if (memoryDb.user.length > 0) {
      // In local dev browser, if cookies are omitted in fetch, use the active local user
      activeUserId = memoryDb.user[memoryDb.user.length - 1].id;
    }

    // Catalog agents are visible to everyone.
    // Custom-created agents are strictly private to their creator.
    const agents = inMemoryStore.getAgents(activeUserId);
    return NextResponse.json({ agents, currentUserId: activeUserId });
  } catch (error) {
    const agents = inMemoryStore.getAgents(null);
    return NextResponse.json({ agents });
  }
}

export async function POST(req: NextRequest) {
  try {
    let sessionUser: { id: string } | null = null;
    try {
      const session = await auth.api.getSession({
        headers: await headers(),
      });
      if (session?.user) {
        sessionUser = session.user;
      }
    } catch {}

    const body = await req.json();
    const effectiveCreatorId =
      body.creatorId ||
      sessionUser?.id ||
      (memoryDb.user.length > 0 ? memoryDb.user[memoryDb.user.length - 1].id : "user-custom-creator");

    const newAgent: AIAgent = {
      id: `agent-custom-${Date.now()}`,
      name: body.name || "Custom Specialist",
      role: body.role || "Domain Expert",
      avatar:
        body.avatar ||
        `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(body.name || "CustomAgent")}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
      bio: body.bio || "Custom AI Agent tailored to your team's workflow.",
      systemPrompt: body.systemPrompt || "You are an intelligent domain consultant.",
      voice: body.voice || "alloy",
      tags: body.tags || ["Custom Specialist", body.role ? body.role.split(" ")[0] : "Strategy"],
      totalSessions: 0,
      averageRating: 100,
      creatorId: effectiveCreatorId,
      isCustom: true,
    };

    inMemoryStore.addAgent(newAgent);
    return NextResponse.json({ agent: newAgent }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create agent" }, { status: 400 });
  }
}
