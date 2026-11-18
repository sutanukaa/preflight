"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn, Video, LogOut } from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";

interface UserInfo {
  id: string;
  name: string;
  email: string;
  image?: string;
  plan?: string;
}

export function Topbar() {
  const { data: authSession, isPending } = useSession();
  const [user, setUser] = useState<UserInfo | null>(null);

  // Sync user state from Better Auth session or direct session endpoint
  useEffect(() => {
    if (authSession?.user) {
      setUser({
        id: authSession.user.id,
        name: authSession.user.name,
        email: authSession.user.email,
        image: authSession.user.image || undefined,
        plan: "Free",
      });
      return;
    }

    // Direct fetch fallback for session
    async function checkSession() {
      try {
        const res = await fetch("/api/auth/get-session");
        if (res.ok) {
          const data = await res.json();
          if (data?.user) {
            setUser({
              id: data.user.id,
              name: data.user.name,
              email: data.user.email,
              image: data.user.image || undefined,
              plan: "Free",
            });
          }
        }
      } catch (err) {
        console.warn("Session check note:", err);
      }
    }
    checkSession();
  }, [authSession]);

  async function handleGoogleSignIn() {
    try {
      const res = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: window.location.origin,
        }),
      });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      setUser(null);
      window.location.reload();
    } catch (e) {
      console.error(e);
      setUser(null);
    }
  }

  return (
    <header className="h-16 border-b border-line bg-surface px-8 flex items-center justify-between shrink-0 sticky top-0 z-30">
      {/* Left indicator */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-ink-soft">
          <span className="w-2 h-2 rounded-full bg-success"></span>
          <span className="font-mono text-xs">Node.js Next.js 15 Environment</span>
        </div>
        <span className="text-line">|</span>
        <div className="text-xs text-muted">
          AI Video Interaction &amp; Post-Meeting Suite
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-4">
        {/* Quick Start Call button */}
        <Link
          href="/meeting/new"
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition-colors shadow-subtle"
        >
          <Video className="w-3.5 h-3.5" />
          <span>Launch AI Call</span>
        </Link>

        {/* User Profile / Login state */}
        {user ? (
          <div className="flex items-center gap-3 pl-2 border-l border-line">
            <div className="flex items-center gap-2.5">
              {user.image ? (
                <img
                  src={user.image}
                  alt={user.name}
                  className="w-8 h-8 rounded-full object-cover border border-line shadow-sm"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-light text-brand font-bold text-xs flex items-center justify-center border border-line">
                  {user.name ? user.name.slice(0, 2).toUpperCase() : "U"}
                </div>
              )}
              <div className="text-left hidden sm:block">
                <div className="text-xs font-semibold text-ink leading-tight">
                  {user.name}
                </div>
                <div className="text-[10px] font-mono text-muted leading-none mt-0.5">
                  {user.email}
                </div>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="text-[11px] text-muted hover:text-danger ml-2 font-mono flex items-center gap-1 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3 h-3" />
              <span>Sign out</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleGoogleSignIn}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition-colors shadow-subtle"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign in with Google</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
