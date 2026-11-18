"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Video, Loader2 } from "lucide-react";

function NewMeetingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = searchParams.get("agentId") || "agent-sarah";
  const [status, setStatus] = useState("Initializing Stream Video Room & AI Agent...");

  useEffect(() => {
    async function createAndRedirect() {
      try {
        const res = await fetch("/api/meetings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            title: `Interactive Video Session with Specialist`,
          }),
        });
        const data = await res.json();
        if (data.meeting?.id) {
          router.replace(`/meeting/${data.meeting.id}`);
        } else {
          setStatus("Error preparing meeting room.");
        }
      } catch (err) {
        console.error(err);
        setStatus("Failed to connect to video server.");
      }
    }

    createAndRedirect();
  }, [agentId, router]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
      <div className="w-12 h-12 rounded-full bg-brand-light text-brand flex items-center justify-center mb-4 animate-pulse">
        <Video className="w-6 h-6" />
      </div>
      <h2 className="text-sm font-bold text-ink">Preparing Video Room</h2>
      <p className="text-xs text-muted font-mono mt-1 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
        <span>{status}</span>
      </p>
    </div>
  );
}

export default function NewMeetingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs font-mono text-muted">Loading room...</div>}>
      <NewMeetingContent />
    </Suspense>
  );
}
