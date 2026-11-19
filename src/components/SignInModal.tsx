"use client";

import { useEffect, useState } from "react";
import { LogIn, Video, Loader2, X, ShieldCheck, Sparkles, Lock } from "lucide-react";

interface SignInModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  title?: string;
  description?: string;
  redirectUrl?: string;
}

export function SignInModal({
  isOpen: propsIsOpen,
  onClose: propsOnClose,
  title = "Sign In to Launch AI Consultation",
  description = "To create or join live AI specialist video rooms, record consultations, and receive post-meeting intelligence summaries, please sign in with your Google account.",
  redirectUrl,
}: SignInModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [targetRedirect, setTargetRedirect] = useState<string | undefined>(redirectUrl);

  const isControlled = typeof propsIsOpen === "boolean";
  const isOpen = isControlled ? propsIsOpen : internalOpen;

  useEffect(() => {
    function handleOpenEvent(e: Event) {
      const customEvent = e as CustomEvent<{ redirectUrl?: string }>;
      if (customEvent.detail?.redirectUrl) {
        setTargetRedirect(customEvent.detail.redirectUrl);
      }
      setInternalOpen(true);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("open-signin-modal", handleOpenEvent);
      return () => window.removeEventListener("open-signin-modal", handleOpenEvent);
    }
  }, []);

  function handleClose() {
    if (propsOnClose) {
      propsOnClose();
    } else {
      setInternalOpen(false);
    }
  }

  async function handleGoogleSignIn() {
    try {
      setIsSigningIn(true);
      const callback = targetRedirect || (typeof window !== "undefined" ? window.location.href : "/");
      const res = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: callback,
        }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setIsSigningIn(false);
      }
    } catch (e) {
      console.error("Sign in failed:", e);
      setIsSigningIn(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-surface border border-line rounded-xl shadow-2xl p-6 relative space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-muted hover:text-ink transition-colors p-1 rounded-md hover:bg-canvas"
          title="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Icon & Title */}
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-brand-light text-brand flex items-center justify-center shrink-0 border border-brand/20 shadow-subtle">
            <Video className="w-5 h-5 text-brand" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-brand font-semibold flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Authentication Guardrail
              </span>
            </div>
            <h3 className="text-base font-bold text-ink tracking-tight mt-0.5">
              {title}
            </h3>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-ink-soft leading-relaxed">
          {description}
        </p>

        {/* Feature Checklist */}
        <div className="bg-canvas/60 border border-line rounded-lg p-3.5 space-y-2 text-xs">
          <div className="flex items-center gap-2.5 text-ink font-medium">
            <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
            <span>Encrypted WebRTC video calls &amp; neural audio</span>
          </div>
          <div className="flex items-center gap-2.5 text-ink font-medium">
            <Sparkles className="w-4 h-4 text-brand shrink-0" />
            <span>Deterministic AI summary &amp; timestamped topics</span>
          </div>
          <div className="flex items-center gap-2.5 text-ink font-medium">
            <Lock className="w-4 h-4 text-brand shrink-0" />
            <span>Custom specialists strictly private to your account</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2.5 pt-1">
          <button
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="w-full py-2.5 px-4 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition-all shadow-subtle flex items-center justify-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {isSigningIn ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Redirecting to Google Sign-In...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign in with Google to Continue</span>
              </>
            )}
          </button>

          <button
            onClick={handleClose}
            className="w-full py-2 px-4 rounded-lg text-xs font-medium text-muted hover:text-ink hover:bg-canvas transition-colors"
          >
            Cancel &amp; Return to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Global helper to trigger the sign-in modal from any client component
 */
export function promptSignIn(redirectUrl?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("open-signin-modal", { detail: { redirectUrl } })
    );
  }
}

/**
 * Check if a user is currently logged in (via localStorage or session)
 */
export function isUserLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem("clarity_user");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.name || parsed?.email) return true;
    }
  } catch {}
  return false;
}
