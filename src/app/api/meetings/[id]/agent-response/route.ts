import { NextRequest, NextResponse } from "next/server";
import { inMemoryStore } from "@/lib/db";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });

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

    // Prefer the active key from .env.local (which starts with AQ. or AIza)
    const geminiKey =
      (process.env.OPENAI_API_KEY?.startsWith("AQ.") ? process.env.OPENAI_API_KEY : null) ||
      (process.env.GEMINI_API_KEY?.startsWith("AQ.") && !process.env.GEMINI_API_KEY?.includes("HUAJkN7hA")
        ? process.env.GEMINI_API_KEY
        : null) ||
      process.env.OPENAI_API_KEY ||
      process.env.GEMINI_API_KEY;

    if (geminiKey) {
      const modelsToTry = ["gemini-3.5-flash-lite", "gemini-3-flash-preview", "gemini-flash-latest"];

      for (const modelName of modelsToTry) {
        try {
          const contents = [
            ...history.slice(-6).map((h: any) => ({
              role: h.speaker === "user" ? "user" : "model",
              parts: [{ text: h.text }],
            })),
            {
              role: "user",
              parts: [{ text: userText }],
            },
          ];

          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                system_instruction: {
                  parts: [
                    {
                      text: `${systemPrompt}\nYou are ${agentName}, ${agentRole}. You are currently in an interactive live voice call with the user.\nRules:\n1. Keep responses concise, spoken, and conversational (1 to 3 sentences maximum).\n2. Speak naturally and directly to the user.\n3. Do NOT use bullet points or formatting. Answer or react directly.`,
                    },
                  ],
                },
                contents,
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 150,
                },
              }),
            }
          );

          if (geminiRes.ok) {
            const gData = await geminiRes.json();
            const gText = gData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (gText) {
              return NextResponse.json({ reply: gText.trim() });
            }
          } else {
            const errData = await geminiRes.json();
            console.error(`Gemini model ${modelName} returned status ${geminiRes.status}:`, errData);
          }
        } catch (err) {
          console.warn(`Gemini ${modelName} error:`, err);
        }
      }
    }

    // Check for OpenAI API Key (sk-...)
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

    // Intelligent in-character fallback if API unavailable
    const lower = userText.toLowerCase().trim();
    let reply = `That is a thoughtful point. As ${agentName}, I suggest we break this down into clear technical milestones. What specific outcome are you targeting first?`;

    if (lower.startsWith("hi") || lower.startsWith("hello") || lower.startsWith("hey")) {
      reply = `Hello! I'm ${agentName}, ${agentRole}. Great to connect with you. What should we tackle today?`;
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
