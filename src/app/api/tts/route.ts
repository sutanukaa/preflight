import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function splitTextIntoTTSChunks(text: string, maxLen: number = 85): string[] {
  const clean = text
    .replace(/[*#_`~[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const sentenceRegex = /[^.!?;\n]+[.!?;\n]+/g;
  const rawSentences = clean.match(sentenceRegex) || [clean];

  const chunks: string[] = [];
  let current = "";

  for (const raw of rawSentences) {
    const s = raw.trim();
    if (!s) continue;

    if (s.length <= maxLen) {
      if (current && current.length + 1 + s.length <= maxLen) {
        current += " " + s;
      } else {
        if (current) chunks.push(current);
        current = s;
      }
    } else {
      if (current) {
        chunks.push(current);
        current = "";
      }

      const words = s.split(" ");
      let wordBuf = "";
      for (const w of words) {
        if (!w) continue;
        if ((wordBuf + " " + w).trim().length <= maxLen) {
          wordBuf = (wordBuf + " " + w).trim();
        } else {
          if (wordBuf) chunks.push(wordBuf);
          wordBuf = w;
        }
      }
      if (wordBuf) chunks.push(wordBuf);
    }
  }

  if (current) chunks.push(current);
  return chunks.slice(0, 12); // safe upper bound for real-time speech responses
}

// Resilient, multi-chunk high-fidelity Neural TTS stream
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const text = searchParams.get("text")?.trim();
    const voice = searchParams.get("voice")?.toLowerCase();

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // Map voice models to consistent language codes
    let lang = "en-US";
    if (voice === "echo") {
      lang = "en-GB";
    } else if (voice === "shimmer" || voice === "alloy") {
      lang = "en-US";
    }

    const chunks = splitTextIntoTTSChunks(text, 85);
    if (chunks.length === 0) {
      return NextResponse.json({ error: "Empty sanitized text" }, { status: 400 });
    }

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    // Fetch all audio chunks concurrently for lowest latency
    const bufferPromises = chunks.map(async (chunk) => {
      const encoded = encodeURIComponent(chunk);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(
        lang
      )}&client=tw-ob&q=${encoded}`;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`TTS chunk fetch failed with status ${res.status}`);
      }
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    });

    const buffers = await Promise.all(bufferPromises);
    const combinedBuffer = Buffer.concat(buffers);

    return new NextResponse(combinedBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Content-Length": combinedBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Free TTS route error:", error);
    return NextResponse.json({ error: "Internal TTS error" }, { status: 500 });
  }
}
