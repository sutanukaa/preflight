"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Video,
  Sparkles,
  Users,
  Play,
  ArrowRight,
  Clock,
  CheckCircle2,
  FileText,
  Activity,
  Plus,
  Zap,
} from "lucide-react";
import { AIAgent, Meeting } from "@/types";
import { CreateAgentModal } from "@/components/CreateAgentModal";
import { useSession } from "@/lib/auth-client";
import { promptSignIn, isUserLoggedIn } from "@/components/SignInModal";

export default function DashboardPage() {
  const { data: authSession } = useSession();
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isLoggedIn = !!authSession?.user || isUserLoggedIn();

  useEffect(() => {
    async function fetchData() {
      try {
        const [agentsRes, meetingsRes] = await Promise.all([
          fetch("/api/agents"),
          fetch("/api/meetings"),
        ]);
        const agentsData = await agentsRes.json();
        const meetingsData = await meetingsRes.json();

        setAgents(agentsData.agents || []);
        setMeetings(meetingsData.meetings || []);
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-line">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-brand font-bold bg-brand-light px-2 py-0.5 rounded">
              Stream Video + OpenAI Realtime + Inngest
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            Meeting Intelligence &amp; AI Video Agents
          </h1>
          <p className="text-xs text-muted mt-1 max-w-2xl leading-relaxed">
            Facilitate live WebRTC video calls with personalized AI specialists. Once calls end, Inngest
            background workflows transcribe speech, extract topic milestones, and power a searchable replay suite.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (!isLoggedIn) {
                promptSignIn("/");
              } else {
                setIsModalOpen(true);
              }
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-md border border-line bg-surface text-ink text-xs font-semibold hover:bg-canvas transition-colors shadow-subtle"
          >
            <Plus className="w-3.5 h-3.5 text-muted" />
            <span>New Custom Agent</span>
          </button>
          <Link
            href="/meeting/new"
            onClick={(e) => {
              if (!isLoggedIn) {
                e.preventDefault();
                promptSignIn("/meeting/new");
              }
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition-colors shadow-subtle"
          >
            <Video className="w-4 h-4" />
            <span>Start Live Call</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-md border border-line">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted font-medium flex items-center justify-between">
            <span>Completed Sessions</span>
            <Activity className="w-3.5 h-3.5 text-brand" />
          </div>
          <div className="text-2xl font-extrabold text-ink mt-2 font-mono tabular-nums">
            {meetings.length}
          </div>
          <div className="text-[10px] text-muted mt-1">Processed by Inngest</div>
        </div>

        <div className="bg-surface p-4 rounded-md border border-line">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted font-medium flex items-center justify-between">
            <span>Total Minutes Recorded</span>
            <Clock className="w-3.5 h-3.5 text-brand" />
          </div>
          <div className="text-2xl font-extrabold text-ink mt-2 font-mono tabular-nums">
            {Math.round(meetings.reduce((acc, m) => acc + (m.durationSeconds || 0), 0) / 60)}m
          </div>
          <div className="text-[10px] text-muted mt-1">Across your sessions</div>
        </div>

        <div className="bg-surface p-4 rounded-md border border-line">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted font-medium flex items-center justify-between">
            <span>Active Specialists</span>
            <Users className="w-3.5 h-3.5 text-brand" />
          </div>
          <div className="text-2xl font-extrabold text-ink mt-2 font-mono tabular-nums">
            {agents.length}
          </div>
          <div className="text-[10px] text-muted mt-1">Configured and ready</div>
        </div>

        <div className="bg-surface p-4 rounded-md border border-line">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted font-medium flex items-center justify-between">
            <span>Post-Call AI Copilot</span>
            <Sparkles className="w-3.5 h-3.5 text-brand" />
          </div>
          <div className="text-2xl font-extrabold text-brand font-mono tabular-nums">
            Ready
          </div>
          <div className="text-[10px] text-muted mt-1">Contextual RAG &amp; citations</div>
        </div>
      </div>

      {/* Specialist AI Agents Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-ink">Personalized AI Video Specialists</h2>
            <p className="text-xs text-muted">
              Select an agent to launch a real-time interactive video session with customized system prompts.
            </p>
          </div>
          <span className="text-xs font-mono text-muted">Stream Video WebRTC</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="bg-surface border border-line rounded-lg p-5 flex flex-col justify-between hover:border-brand/50 transition-all duration-150 group shadow-card"
            >
              <div>
                {/* Agent Header */}
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src={agent.avatar}
                    alt={agent.name}
                    className="w-12 h-12 rounded-full object-cover border border-line shrink-0"
                  />
                  <div>
                    <h3 className="font-bold text-xs text-ink group-hover:text-brand transition-colors">
                      {agent.name}
                    </h3>
                    <p className="text-[11px] text-ink-soft leading-tight mt-0.5 line-clamp-1">
                      {agent.role}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="inline-block text-[9px] font-mono bg-canvas text-muted px-1.5 py-0.5 rounded">
                        Voice: {agent.voice}
                      </span>
                      {agent.isCustom || agent.id.startsWith("agent-custom-") ? (
                        <span className="inline-block text-[9px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                          🔒 Private
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Bio */}
                <p className="text-xs text-ink-soft/90 leading-relaxed line-clamp-3 mb-3">
                  {agent.bio}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {agent.tags.slice(0, 3).map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-mono bg-canvas border border-line px-1.5 py-0.5 rounded text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Start Call CTA */}
              <Link
                href={`/meeting/new?agentId=${agent.id}`}
                onClick={(e) => {
                  if (!isLoggedIn) {
                    e.preventDefault();
                    promptSignIn(`/meeting/new?agentId=${agent.id}`);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-md bg-canvas border border-line text-xs font-semibold text-ink group-hover:bg-brand group-hover:text-white group-hover:border-brand transition-all shadow-subtle"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Call with {agent.name.split(" ")[0]}</span>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Post-Meeting Intelligence Suite Section */}
      <section className="space-y-4 pt-4 border-t border-line">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-ink">Recorded Meetings &amp; Intelligence Suites</h2>
            <p className="text-xs text-muted">
              Inspect video replays, click timestamped topics to jump the player, search indexed transcripts, and query the AI Copilot.
            </p>
          </div>
          <span className="text-xs font-mono text-muted">
            {meetings.length} recordings available
          </span>
        </div>

        {meetings.length === 0 ? (
          <div className="bg-surface border border-line rounded-lg p-10 text-center space-y-3 shadow-subtle">
            <div className="w-10 h-10 rounded-full bg-brand-light text-brand mx-auto flex items-center justify-center">
              <Video className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-ink">No Recorded Meetings Yet</h3>
            <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
              Your account is completely fresh. Start your first live video call with any specialist above. When the call ends, Inngest will automatically process the audio and your transcript, summary, and action items will appear here.
            </p>
            <div className="pt-2">
              <Link
                href="/meeting/new"
                onClick={(e) => {
                  if (!isLoggedIn) {
                    e.preventDefault();
                    promptSignIn("/meeting/new");
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition-colors shadow-subtle"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Start Your First Live Call</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {meetings.map((meeting) => {
              const minutes = Math.floor((meeting.durationSeconds || 0) / 60);
              const seconds = (meeting.durationSeconds || 0) % 60;
              const durationFormatted = `${minutes}m ${seconds.toString().padStart(2, "0")}s`;

              return (
                <div
                  key={meeting.id}
                  className="bg-surface border border-line rounded-lg p-5 hover:border-brand/60 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-card"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center gap-1 text-[10px] font-mono text-success bg-success-bg px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Inngest Processed</span>
                      </span>
                      <span className="text-[11px] font-mono text-muted">
                        {new Date(meeting.startedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="text-[11px] font-mono text-muted">• {durationFormatted}</span>
                    </div>

                    <h3 className="text-sm font-bold text-ink">{meeting.title}</h3>

                    <p className="text-xs text-ink-soft leading-relaxed line-clamp-2 max-w-3xl">
                      {meeting.summary?.overview || "Meeting recorded with live AI specialist."}
                    </p>

                    {/* Topic Jump Preview Chips */}
                    {meeting.summary?.topics && meeting.summary.topics.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[10px] font-mono text-muted uppercase">Topics:</span>
                        {meeting.summary.topics.slice(0, 3).map((topic) => (
                          <span
                            key={topic.id}
                            className="inline-flex items-center gap-1.5 text-[10px] font-mono bg-canvas border border-line px-2 py-0.5 rounded text-ink-soft"
                          >
                            <span className="text-brand font-bold">[{topic.timestamp}]</span>
                            <span className="truncate max-w-[200px]">{topic.title}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right Action */}
                  <div className="shrink-0 flex items-center gap-2">
                    <Link
                      href={`/meeting/${meeting.id}/summary`}
                      className="flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition-colors shadow-subtle"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Open Post-Meeting Suite</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal for creating custom agents */}
      <CreateAgentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={(agent) => setAgents((prev) => [agent, ...prev])}
      />
    </div>
  );
}
