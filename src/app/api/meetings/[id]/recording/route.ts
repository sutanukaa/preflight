import { NextRequest, NextResponse } from "next/server";
import { inMemoryStore } from "@/lib/db";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await req.formData();
    const file = formData.get("video") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const publicDir = path.join(process.cwd(), "public", "recordings");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    const fileName = `${id}.webm`;
    const filePath = path.join(publicDir, fileName);
    fs.writeFileSync(filePath, buffer);

    // Automatically transcode to pristine, fast-start MP4 (H.264 + AAC)
    // This repairs duplicate/non-monotonic timestamps and eliminates black-screen decoder stalls in browsers
    const mp4FileName = `${id}.mp4`;
    const mp4Path = path.join(publicDir, mp4FileName);
    let finalUrl = `/recordings/${fileName}`;

    try {
      await execFileAsync(
        "ffmpeg",
        [
          "-loglevel",
          "error",
          "-err_detect",
          "ignore_err",
          "-i",
          filePath,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "23",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          mp4Path,
          "-y",
        ],
        { maxBuffer: 50 * 1024 * 1024 }
      );
      if (fs.existsSync(mp4Path) && fs.statSync(mp4Path).size > 1000) {
        finalUrl = `/recordings/${mp4FileName}`;
      }
    } catch (ffmpegErr) {
      console.warn("FFmpeg MP4 transcode note (using raw capture):", ffmpegErr);
    }

    const recordingUrl = finalUrl;
    inMemoryStore.updateMeeting(id, { recordingUrl });

    return NextResponse.json({ success: true, recordingUrl });
  } catch (err) {
    console.error("Failed to save recording:", err);
    return NextResponse.json({ error: "Failed to upload recording" }, { status: 500 });
  }
}
