import { NextRequest, NextResponse } from "next/server";
import { inMemoryStore, dbPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Client-upload flow: the client uploads directly to Vercel Blob,
    // then sends us the resulting blob URL to persist.
    const { blobUrl } = body;

    if (!blobUrl || typeof blobUrl !== "string") {
      return NextResponse.json(
        { error: "Missing blobUrl in request body" },
        { status: 400 }
      );
    }

    // Update in-memory store
    inMemoryStore.updateMeeting(id, { recordingUrl: blobUrl });

    // Persist the recording URL to Neon PostgreSQL
    if (dbPool) {
      try {
        await dbPool.query(
          `UPDATE meetings SET recording_url = $1 WHERE id = $2;`,
          [blobUrl, id]
        );
      } catch (dbErr) {
        console.warn("Neon recording URL update error:", dbErr);
      }
    }

    return NextResponse.json({ success: true, recordingUrl: blobUrl });
  } catch (err) {
    console.error("Failed to save recording URL:", err);
    return NextResponse.json(
      { error: "Failed to save recording" },
      { status: 500 }
    );
  }
}
