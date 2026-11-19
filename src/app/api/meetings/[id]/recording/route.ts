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

    // Automatically remux WebM with ffmpeg to write proper EBML cues and duration headers for instant browser playback
    const tempFixedPath = path.join(publicDir, `${id}_fixed.webm`);
    try {
      await execFileAsync("ffmpeg", ["-i", filePath, "-c", "copy", tempFixedPath, "-y"]);
      if (fs.existsSync(tempFixedPath) && fs.statSync(tempFixedPath).size > 1000) {
        fs.unlinkSync(filePath);
        fs.renameSync(tempFixedPath, filePath);
      }
    } catch (ffmpegErr) {
      console.warn("FFmpeg remux note (using raw capture):", ffmpegErr);
      if (fs.existsSync(tempFixedPath)) {
        try {
          fs.unlinkSync(tempFixedPath);
        } catch {}
      }
    }

    const recordingUrl = `/recordings/${fileName}`;
    inMemoryStore.updateMeeting(id, { recordingUrl });

    return NextResponse.json({ success: true, recordingUrl });
  } catch (err) {
    console.error("Failed to save recording:", err);
    return NextResponse.json({ error: "Failed to upload recording" }, { status: 500 });
  }
}
