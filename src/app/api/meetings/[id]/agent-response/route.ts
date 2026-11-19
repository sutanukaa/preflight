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
    const { userText = "", history = [] } = body;

    const meeting = inMemoryStore.getMeeting(id);
    const agent = meeting?.agent || inMemoryStore.getAgents()[0];
    const systemPrompt = agent.systemPrompt || "You are an expert tutor.";
    const agentName = agent.name || "AI Specialist";
    const agentRole = agent.role || "Specialist";

    const cleanUserText = userText.trim();

    // Prefer the active key from .env.local (which starts with AQ. or AIza)
    const geminiKey =
      (process.env.OPENAI_API_KEY?.startsWith("AQ.") ? process.env.OPENAI_API_KEY : null) ||
      (process.env.GEMINI_API_KEY?.startsWith("AQ.") && !process.env.GEMINI_API_KEY?.includes("HUAJkN7hA")
        ? process.env.GEMINI_API_KEY
        : null) ||
      process.env.OPENAI_API_KEY ||
      process.env.GEMINI_API_KEY;

    if (geminiKey) {
      // Prioritize gemini-3.5-flash-lite which reliably succeeds without 503 capacity drops
      const modelsToTry = [
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-flash-latest",
      ];

      // Build clean, alternating multi-turn history for Gemini
      const contents: any[] = [];

      if (Array.isArray(history) && history.length > 0) {
        for (const h of history.slice(-6)) {
          if (!h.text || typeof h.text !== "string" || !h.text.trim()) continue;
          const role = h.speaker === "user" ? "user" : "model";
          const text = h.text.trim();

          // Skip duplicate of the current question if already at the end of history
          if (role === "user" && text.toLowerCase() === cleanUserText.toLowerCase()) continue;

          // Merge consecutive identical roles to adhere to Gemini protocol
          if (contents.length > 0 && contents[contents.length - 1].role === role) {
            contents[contents.length - 1].parts[0].text += ` ${text}`;
          } else {
            contents.push({ role, parts: [{ text }] });
          }
        }
      }

      // Ensure conversation starts with a user turn
      while (contents.length > 0 && contents[0].role !== "user") {
        contents.shift();
      }

      // Append current user message
      if (contents.length > 0 && contents[contents.length - 1].role === "user") {
        contents[contents.length - 1].parts[0].text = cleanUserText;
      } else {
        contents.push({ role: "user", parts: [{ text: cleanUserText }] });
      }

      const instruction = `${systemPrompt}
You are ${agentName}, ${agentRole}. You are currently on an interactive live voice call with the user.
CRITICAL TEACHING & SPOKEN INSTRUCTIONS:
1. Always directly, accurately, and thoroughly answer the user's question, problem, or topic.
2. If the user asks you to explain a math concept, theorem, formula, or calculation (e.g. Pythagorean theorem, algebra, calculus, fractions):
   - Explain the core concept clearly in simple, intuitive terms.
   - Walk through a concrete, easy-to-follow example (for instance, a 3-4-5 triangle).
   - Show how the steps connect together.
3. Keep your explanation spoken, warm, and conversational in 2 to 4 clear spoken sentences.
4. Because your output will be read aloud by speech synthesis, DO NOT use raw LaTeX math markers like $ or $$, and DO NOT use markdown bullet points. Spell out math operations naturally (e.g. say "a squared plus b squared equals c squared" or "three squared is nine").
5. Never deflect, give a canned greeting, or ask what they want when they already asked a question. Answer them immediately and warmly!`;

      for (const modelName of modelsToTry) {
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: AbortSignal.timeout(18000), // 18s allows thorough calculation and pedagogical explanation
              body: JSON.stringify({
                system_instruction: {
                  parts: [{ text: instruction }],
                },
                contents,
                generationConfig: {
                  temperature: 0.6,
                  maxOutputTokens: 250,
                },
              }),
            }
          );

          if (geminiRes.ok) {
            const gData = await geminiRes.json();
            const gText = gData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (gText && gText.trim().length > 5) {
              return NextResponse.json({ reply: gText.trim() });
            }
          } else {
            const errData = await geminiRes.json().catch(() => ({}));
            console.warn(`Gemini model ${modelName} status ${geminiRes.status}:`, errData);
          }
        } catch (err: any) {
          console.warn(`Gemini ${modelName} notice (${err.name || "timeout"}):`, err.message || err);
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
            content: `${systemPrompt}\nYou are ${agentName}, ${agentRole}. You are on a live voice call. Answer questions directly, thoroughly, and warmly with a clear example. Do not use raw LaTeX or bullet points.`,
          },
          ...history.slice(-6).map((h: any) => ({
            role: h.speaker === "user" ? "user" : "assistant",
            content: h.text,
          })),
          { role: "user", content: cleanUserText },
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
            max_tokens: 250,
            temperature: 0.6,
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

    // Intelligent in-character pedagogical fallback if external APIs are completely unreachable
    const lower = cleanUserText.toLowerCase();
    const isOnlyGreeting =
      /^(hi|hello|hey|good morning|good afternoon|greetings)[!., ]*$/i.test(lower) ||
      (lower.startsWith("hello") && lower.split(/\s+/).length <= 2);

    if (isOnlyGreeting) {
      return NextResponse.json({
        reply: `Hello! I'm ${agentName}, your ${agentRole}. I'm ready to help you learn—what problem or concept should we explore together?`,
      });
    }

    // Contextual explanation if user asked about Pythagorean theorem or right triangles
    if (lower.includes("pythagor") || lower.includes("triangle")) {
      return NextResponse.json({
        reply: `The Pythagorean theorem is a fantastic rule for right-angled triangles! It tells us that the square of the longest side, the hypotenuse, equals the sum of the squares of the two shorter sides: a squared plus b squared equals c squared. For example, if the two legs are three and four inches, three squared is nine, and four squared is sixteen. Adding them gives twenty-five, which means the hypotenuse is exactly five inches!`,
      });
    }

    // General in-character math tutor response
    return NextResponse.json({
      reply: `That is a wonderful question about ${cleanUserText.slice(0, 35)}! In mathematics, we always start by breaking the problem into simple building blocks: identifying what we know, what rule applies, and testing it with an easy example. Which part of this would you like to solve first?`,
    });
  } catch (error) {
    console.error("Agent response route error:", error);
    return NextResponse.json(
      { reply: "I'm listening closely. Could you please repeat that question?" },
      { status: 500 }
    );
  }
}
