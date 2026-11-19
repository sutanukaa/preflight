import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Free, high-fidelity neural-style text-to-speech stream
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const text = searchParams.get("text")?.trim();
    const voice = searchParams.get("voice")?.toLowerCase();

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // Keep spoken chunk within reasonable length for optimal response speed
    const sanitized = text
      .replace(/[*#_`~[\]()]/g, "") // strip markdown
      .slice(0, 300);

    let lang = "en-us";
    if (voice === "echo") {
      lang = "en-gb";
    } else if (voice === "shimmer") {
      lang = "en-us";
    } else if (voice === "alloy") {
      lang = "en";
    }

    const encoded = encodeURIComponent(sanitized);
    const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encoded}`;

    const res = await fetch(googleTTSUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "TTS provider unavailable" }, { status: 502 });
    }

    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Free TTS route error:", error);
    return NextResponse.json({ error: "Internal TTS error" }, { status: 500 });
  }
}
