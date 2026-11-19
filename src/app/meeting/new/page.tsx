"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Video, Loader2, Lock, LogIn, ArrowLeft } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { promptSignIn, isUserLoggedIn } from "@/components/SignInModal";

function NewMeetingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = searchParams.get("agentId") || "agent-sarah";
  const { data: authSession, isPending } = useSession();

  const [status, setStatus] = useState("Verifying authorization & preparing room...");
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (isPending) return;

    const loggedIn = !!authSession?.user || isUserLoggedIn();
    if (!loggedIn) {
      setNeedsAuth(true);
      promptSignIn(`/meeting/new?agentId=${agentId}`);
      return;
    }

    setNeedsAuth(false);
    async function createAndRedirect() {
      try {
        setStatus("Initializing Stream Video Room & AI Specialist...");
        const res = await fetch("/api/meetings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            userId: authSession?.user?.id,
          }),
        });
        const data = await res.json();
        if (data.meeting?.id) {
          router.replace(`/meeting/${data.meeting.id}`);
        } else if (res.status === 401) {
          setNeedsAuth(true);
          promptSignIn(`/meeting/new?agentId=${agentId}`);
        } else {
          setStatus("Error preparing meeting room.");
        }
      } catch (err) {
        console.error(err);
        setStatus("Failed to connect to video server.");
      }
    }

    createAndRedirect();
  }, [agentId, router, isPending, authSession]);

  async function handleDirectSignIn() {
    try {
      setIsSigningIn(true);
      const res = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: window.location.href,
        }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setIsSigningIn(false);
      }
    } catch (e) {
      console.error(e);
      setIsSigningIn(false);
    }
  }

  if (needsAuth) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-surface border border-line rounded-xl shadow-card p-8 text-center space-y-5 animate-in zoom-in-95 duration-200">
          <div className="w-14 h-14 rounded-full bg-brand-light text-brand mx-auto flex items-center justify-center border border-brand/20 shadow-subtle">
            <Lock className="w-6 h-6 text-brand" />
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-brand font-semibold">
              Authentication Required
            </span>
            <h2 className="text-lg font-bold text-ink">Sign in to Launch Consultation</h2>
            <p className="text-xs text-muted leading-relaxed max-w-sm mx-auto">
              Live AI video calls and post-meeting intelligence summaries require an authenticated account. Please sign in with Google to continue into your room.
            </p>
          </div>

          <div className="pt-2 space-y-2.5">
            <button
              onClick={handleDirectSignIn}
              disabled={isSigningIn}
              className="w-full py-2.5 px-4 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition-all shadow-subtle flex items-center justify-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed"
            >
              {isSigningIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting to Google...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Sign in with Google to Launch</span>
                </>
              )}
            </button>

            <Link
              href="/"
              className="w-full py-2 px-4 rounded-lg text-xs font-medium text-muted hover:text-ink hover:bg-canvas transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center text-center p-6 bg-surface border border-line rounded-lg shadow-subtle space-y-3">
      <div className="w-14 h-14 rounded-full bg-brand-light text-brand flex items-center justify-center animate-pulse">
        <Video className="w-6 h-6" />
      </div>
      <h2 className="text-sm font-bold text-ink">Preparing AI Specialist Room</h2>
      <p className="text-xs text-muted font-mono flex items-center gap-2">
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
