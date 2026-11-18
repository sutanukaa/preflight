"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Video,
  LayoutDashboard,
  Users,
  CreditCard,
  Plus,
} from "lucide-react";
import { Meeting } from "@/types";

export function Sidebar() {
  const pathname = usePathname();
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  useEffect(() => {
    async function loadRecent() {
      try {
        const res = await fetch("/api/meetings");
        if (res.ok) {
          const data = await res.json();
          setMeetings(data.meetings || []);
        }
      } catch (e) {
        console.warn(e);
      }
    }
    loadRecent();
  }, [pathname]);

  const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "AI Specialists", href: "/specialists", icon: Users },
    { label: "Subscription & Polar", href: "/billing", icon: CreditCard },
  ];

  return (
    <aside className="w-64 border-r border-line bg-surface flex flex-col justify-between shrink-0 h-screen sticky top-0">
      <div>
        {/* Brand Header */}
        <div className="h-16 flex items-center px-6 border-b border-line gap-3">
          <div className="w-8 h-8 rounded-md bg-brand flex items-center justify-center text-white font-bold text-sm shadow-subtle">
            <Video className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-[15px] tracking-tight text-ink block leading-none">
              Clarity AI
            </span>
            <span className="text-[10px] font-mono text-muted tracking-wide uppercase mt-1 block">
              Video Intelligence
            </span>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="p-4 space-y-1">
          <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted font-medium">
            Core Platform
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-brand text-white shadow-subtle"
                    : "text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-muted"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Recent Meetings Section */}
        <div className="p-4 border-t border-line space-y-2">
          <div className="px-3 text-[10px] font-mono uppercase tracking-wider text-muted font-medium flex items-center justify-between">
            <span>Recent Sessions</span>
            {meetings.length > 0 && (
              <span className="bg-success-bg text-success text-[9px] px-1.5 py-0.5 rounded font-mono">
                {meetings.length}
              </span>
            )}
          </div>

          {meetings.length === 0 ? (
            <div className="px-3 py-3 rounded bg-canvas/60 border border-line text-[11px] text-muted leading-relaxed">
              <span>No recorded calls yet.</span>
              <Link
                href="/meeting/new"
                className="text-brand font-semibold hover:underline block mt-1"
              >
                + Launch your first call
              </Link>
            </div>
          ) : (
            meetings.slice(0, 3).map((m) => {
              const minutes = Math.floor((m.durationSeconds || 0) / 60);
              const seconds = (m.durationSeconds || 0) % 60;
              return (
                <Link
                  key={m.id}
                  href={`/meeting/${m.id}/summary`}
                  className="block px-3 py-2 rounded hover:bg-canvas text-xs transition-colors group"
                >
                  <div className="font-medium text-ink truncate group-hover:text-brand">
                    {m.title}
                  </div>
                  <div className="text-[10px] text-muted font-mono flex items-center gap-1 mt-0.5">
                    <span>{m.agent?.name?.split(" ")[0] || "Specialist"}</span>
                    <span>•</span>
                    <span>{minutes}m {seconds.toString().padStart(2, "0")}s</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* Footer Info & Architecture badge */}
      <div className="p-4 border-t border-line bg-canvas/40 space-y-3">
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success inline-block"></span>
            <span className="font-mono text-[10px]">Stream + Inngest Live</span>
          </span>
          <span className="font-mono text-[10px] text-brand-deep font-semibold">v1.2.0</span>
        </div>
        <div className="text-[10px] text-muted leading-relaxed font-sans">
          WebRTC video calls powered by Stream, background post-processing via Inngest step functions.
        </div>
      </div>
    </aside>
  );
}
