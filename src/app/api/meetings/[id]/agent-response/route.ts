import { NextRequest, NextResponse } from "next/server";
import { inMemoryStore } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { userText, history = [] } = body;

    const meeting = inMemoryStore.getMeeting(id);
    const agent = meeting?.agent || inMemoryStore.getAgents()[0];
    const systemPrompt = agent.systemPrompt;
    const agentName = agent.name;
    const agentRole = agent.role;

    // Check for OpenAI API Key
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && openaiKey.startsWith("sk-")) {
      try {
        const messages = [
          {
            role: "system",
            content: `${systemPrompt}\nYou are currently on a live voice call with the user. Keep your responses concise (1-3 sentences maximum), natural, spoken, and directly engaging. Do not use markdown bullet points. Speak as if talking in real time.`,
          },
          ...history.slice(-6).map((h: any) => ({
            role: h.speaker === "user" ? "user" : "assistant",
            content: h.text,
          })),
          { role: "user", content: userText },
        ];

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages,
            max_tokens: 150,
            temperature: 0.7,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const aiReply = data.choices?.[0]?.message?.content;
          if (aiReply) {
            return NextResponse.json({ reply: aiReply.trim() });
          }
        }
      } catch (err) {
        console.warn("OpenAI API call error:", err);
      }
    }

    // Check for Gemini API Key (format starts with AIza)
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey.startsWith("AIza")) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: {
                parts: [
                  {
                    text: `${systemPrompt}\nYou are on a live voice call with the user. Keep your responses concise (1-3 sentences), natural, spoken, and engaging. Speak as if talking in real time.`,
                  },
                ],
              },
              contents: [
                ...history.slice(-4).map((h: any) => ({
                  role: h.speaker === "user" ? "user" : "model",
                  parts: [{ text: h.text }],
                })),
                {
                  role: "user",
                  parts: [{ text: userText }],
                },
              ],
            }),
          }
        );

        if (geminiRes.ok) {
          const gData = await geminiRes.json();
          const gText = gData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (gText) {
            return NextResponse.json({ reply: gText.trim() });
          }
        }
      } catch (err) {
        console.warn("Gemini API call error:", err);
      }
    }

    // Contextual in-character intelligent conversational fallback when no valid external API key is set
    const lower = userText.toLowerCase().trim();
    let reply = "";

    // Greetings
    if (lower.startsWith("hi") || lower.startsWith("hello") || lower.startsWith("hey") || lower === "what's up" || lower === "good morning" || lower === "good afternoon") {
      if (agent.id === "agent-david") {
        reply = `Hello! Thanks for taking the time to meet today. I'm ${agentName}, Senior Engineering Hiring Manager. I'm excited to dive into your background and walk through some system design and technical challenges. Ready to get started?`;
      } else if (agent.id === "agent-sarah") {
        reply = `Hello! I'm Dr. Sarah Chen. Glad to connect. What system architecture or scalability challenge are we dissecting today?`;
      } else if (agent.id === "agent-marcus") {
        reply = `Hey there! Marcus Vance here. Ready to look at your product roadmap, pricing funnels, or go-to-market strategy. Where should we focus first?`;
      } else if (agent.id === "agent-elena") {
        reply = `Welcome! I'm Elena Rostova. Whether you're preparing a Series A pitch or refining an executive keynote, let's make your story sharp and memorable. What are we practicing?`;
      } else {
        reply = `Hello! I'm ${agentName}, ${agentRole}. How can I help you today?`;
      }
    }
    // Persona / Identity Questions
    else if (lower.includes("who are you") || lower.includes("your name") || lower.includes("what do you do") || lower.includes("introduce yourself")) {
      reply = `I am ${agentName}, ${agentRole}. ${agent.bio}`;
    }
    // Technical Interviewer Persona (David Kross)
    else if (agent.id === "agent-david") {
      if (lower.includes("ready") || lower.includes("start") || lower.includes("begin")) {
        reply = `Great! Let's start with a classic system design question: How would you design a distributed URL shortening service like Bitly that handles 500 million writes per month with sub-10ms read latency?`;
      } else if (lower.includes("hash") || lower.includes("database") || lower.includes("cache") || lower.includes("redis") || lower.includes("postgres")) {
        reply = `Good choice. How do you handle hash collisions if two distinct long URLs yield the same 7-character Base62 key, and what caching eviction policy would you configure in Redis?`;
      } else if (lower.includes("experience") || lower.includes("project") || lower.includes("worked on")) {
        reply = `Tell me about a complex technical disagreement you had with another senior engineer on an architectural decision. How did you resolve it, and what was the outcome?`;
      } else {
        reply = `That's an interesting angle. How does that approach scale when traffic spikes by 10x during an unpredicted failover scenario?`;
      }
    }
    // Systems Architect Persona (Sarah Chen)
    else if (agent.id === "agent-sarah") {
      if (lower.includes("webrtc") || lower.includes("video") || lower.includes("stream")) {
        reply = `With WebRTC, peer-to-peer mesh breaks down past 4 participants. That's why Stream Video's Selective Forwarding Unit is essential—it handles selective bandwidth adaptation and simulcast layers cleanly.`;
      } else if (lower.includes("inngest") || lower.includes("queue") || lower.includes("background")) {
        reply = `The power of Inngest is durable execution with step functions. If an AI transcription API rate-limits you mid-call, Inngest sleeps and retries only that failed step without re-running the entire pipeline.`;
      } else {
        reply = `From a distributed systems perspective, we need to balance data consistency against availability. Have you considered where the single point of failure lives in that design?`;
      }
    }
    // Product Strategy Persona (Marcus Vance)
    else if (agent.id === "agent-marcus") {
      if (lower.includes("pricing") || lower.includes("polar") || lower.includes("cost") || lower.includes("tier")) {
        reply = `For AI SaaS, your margins get crushed by real-time audio tokens if you offer unlimited voice on a low flat rate. You need usage metering with Polar so power users pay for compute overage.`;
      } else {
        reply = `Every feature you build has an opportunity cost. What metric does this move—is it Day-30 retention, activation rate, or average revenue per user?`;
      }
    }
    // Elena Rostova (Pitch Coach)
    else if (agent.id === "agent-elena") {
      reply = `Focus on the 'problem hook' in your first 20 seconds. Investors don't care about your technology stack until they believe the customer pain is acute and lucrative. Give me your one-sentence problem statement.`;
    }
    // General contextual response
    else {
      reply = `Regarding "${userText}": as ${agentRole}, I recommend we evaluate this carefully against our core technical constraints and user objectives. Could you elaborate on what outcome you want to achieve?`;
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Agent response route error:", error);
    return NextResponse.json(
      { reply: "I'm processing that. Could you clarify your question?" },
      { status: 500 }
    );
  }
}
