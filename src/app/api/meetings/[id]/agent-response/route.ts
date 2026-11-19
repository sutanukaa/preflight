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

    // Intelligent in-character domain knowledge engine
    const lower = cleanUserText.toLowerCase();

    // 1. Direct arithmetic calculations: "what is 15 plus 25", "12 times 8", etc.
    const calcMatch = lower.match(/(\d+)\s*(\+|\-|plus|minus|times|multiplied by|\*|\/|divided by)\s*(\d+)/i);
    if (calcMatch) {
      const a = parseInt(calcMatch[1], 10);
      const op = calcMatch[2].toLowerCase();
      const b = parseInt(calcMatch[3], 10);
      let result = 0;
      let opWord = "";

      if (op === "+" || op === "plus") {
        result = a + b;
        opWord = "plus";
      } else if (op === "-" || op === "minus") {
        result = a - b;
        opWord = "minus";
      } else if (op === "*" || op === "times" || op === "multiplied by") {
        result = a * b;
        opWord = "multiplied by";
      } else if (op === "/" || op === "divided by") {
        result = b !== 0 ? Math.round((a / b) * 100) / 100 : 0;
        opWord = "divided by";
      }

      return NextResponse.json({
        reply: `${a} ${opWord} ${b} equals ${result}! In mathematics, breaking calculations into steps or using mental math strategies makes arithmetic fast and intuitive. Would you like to try another example together?`,
      });
    }

    // 2. Percentage calculations: "what is 20 percent of 150"
    const percentMatch = lower.match(/(\d+)\s*(?:%|percent)\s*(?:of)\s*(\d+)/i);
    if (percentMatch) {
      const pct = parseFloat(percentMatch[1]);
      const total = parseFloat(percentMatch[2]);
      const ans = Math.round((pct / 100) * total * 100) / 100;
      return NextResponse.json({
        reply: `${pct} percent of ${total} is ${ans}! A quick trick is to find ten percent first, which is ${total / 10}, and then scale it up or down to reach ${pct} percent.`,
      });
    }

    // 3. Simple linear equation: "2x + 4 = 10"
    const algebraMatch = lower.match(/(\d*)\s*x\s*([\+\-])\s*(\d+)\s*=\s*(\d+)/i);
    if (algebraMatch) {
      const coeff = algebraMatch[1] ? parseInt(algebraMatch[1], 10) : 1;
      const sign = algebraMatch[2];
      const constant = parseInt(algebraMatch[3], 10);
      const rhs = parseInt(algebraMatch[4], 10);
      const adjustedRhs = sign === "+" ? rhs - constant : rhs + constant;
      const xVal = coeff !== 0 ? Math.round((adjustedRhs / coeff) * 100) / 100 : 0;
      return NextResponse.json({
        reply: `To solve this equation step-by-step: first, ${sign === "+" ? "subtract" : "add"} ${constant} on both sides, which simplifies to ${coeff}x equals ${adjustedRhs}. Then, divide both sides by ${coeff}, which gives x equals ${xVal}!`,
      });
    }

    // 4. Pythagorean Theorem
    if (lower.includes("pythagor") || (lower.includes("triangle") && lower.includes("hypotenuse"))) {
      return NextResponse.json({
        reply: `The Pythagorean theorem is a foundational rule for right-angled triangles: a squared plus b squared equals c squared, where c is the hypotenuse. For example, in a triangle with sides of three and four inches, three squared is nine and four squared is sixteen. Adding them gives twenty-five, and the square root of twenty-five is exactly five inches!`,
      });
    }

    // 5. Fractions & Division
    if (lower.includes("fraction") || lower.includes("common denominator")) {
      return NextResponse.json({
        reply: `When adding or subtracting fractions, the secret is finding a common denominator! For example, to add one half and one third, the common denominator is six. One half becomes three sixths, and one third becomes two sixths. Adding the numerators three plus two gives five sixths!`,
      });
    }

    // 6. Area and Geometry
    if (lower.includes("area of a circle") || (lower.includes("circle") && lower.includes("area"))) {
      return NextResponse.json({
        reply: `The area of a circle is calculated using the formula pi times radius squared. For example, if a circle has a radius of five centimeters, five squared is twenty-five. Multiplying twenty-five by pi (approximately three point one four) gives roughly seventy-eight point five square centimeters!`,
      });
    }

    // 7. Quadratic formula
    if (lower.includes("quadratic")) {
      return NextResponse.json({
        reply: `The quadratic formula solves any second-degree polynomial in the form a x squared plus b x plus c equals zero. The formula is x equals negative b, plus or minus the square root of b squared minus four a c, all divided by two a!`,
      });
    }

    // 8. Calculus & Derivatives
    if (lower.includes("calculus") || lower.includes("derivative") || lower.includes("integral")) {
      return NextResponse.json({
        reply: `Calculus is the mathematical study of continuous change! Derivatives tell us the instantaneous rate of change or the slope of a curve at a single point, like reading the speedometer in your car, while integrals calculate the accumulated area under a curve.`,
      });
    }

    // 9. System Design / Distributed Systems (for Dr. Sarah Chen / David Kross)
    if (lower.includes("system design") || lower.includes("database") || lower.includes("scale") || lower.includes("webrtc") || lower.includes("cache")) {
      return NextResponse.json({
        reply: `In modern scalable architectures, decoupling components with event queues and caching read paths via Redis prevents database bottlenecks. For real-time video, leveraging WebRTC Selective Forwarding Units ensures low-latency media routing without server-side transcoding overhead.`,
      });
    }

    // 10. Product & Business Strategy (for Marcus Vance)
    if (lower.includes("pricing") || lower.includes("retention") || lower.includes("saas") || lower.includes("product-market")) {
      return NextResponse.json({
        reply: `When assessing SaaS growth and retention, aligning pricing tiers with customer value metrics is critical. Minimizing onboarding friction directly boosts activation rates and expands net revenue retention over time.`,
      });
    }

    // 11. Polite greeting check
    const isOnlyGreeting =
      /^(hi|hello|hey|good morning|good afternoon|greetings)[!., ]*$/i.test(lower) ||
      (lower.startsWith("hello") && lower.split(/\s+/).length <= 2);

    if (isOnlyGreeting) {
      return NextResponse.json({
        reply: `Hello! I'm ${agentName}, your ${agentRole}. I'm ready to dive into any question or problem—what should we explore together?`,
      });
    }

    // General in-character specialist response
    return NextResponse.json({
      reply: `That is an insightful question about ${cleanUserText.slice(0, 40)}! The best approach is to break it down into core principles: first defining what we are solving for, applying the fundamental rule, and working through a concrete example. Which part of this would you like to examine first?`,
    });
  } catch (error) {
    console.error("Agent response route error:", error);
    return NextResponse.json(
      { reply: "I'm listening closely. Could you please repeat that question?" },
      { status: 500 }
    );
  }
}
