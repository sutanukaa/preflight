"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Plus, Video, Sparkles, Filter, CheckCircle2 } from "lucide-react";
import { AIAgent } from "@/types";
import { CreateAgentModal } from "@/components/CreateAgentModal";
import { useSession } from "@/lib/auth-client";
import { promptSignIn, isUserLoggedIn } from "@/components/SignInModal";

export default function AgentsDirectoryPage() {
  const { data: authSession } = useSession();
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const isLoggedIn = !!authSession?.user || isUserLoggedIn();

  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch("/api/agents");
        const data = await res.json();
        setAgents(data.agents || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchAgents();
  }, []);

  // Collect all unique tags
  const allTags = ["All", ...Array.from(new Set(agents.flatMap((a) => a.tags)))];

  const filteredAgents =
    selectedTag === "All"
      ? agents
      : agents.filter((a) => a.tags.includes(selectedTag));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-line">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-brand font-bold bg-brand-light px-2 py-0.5 rounded">
              Agent Registry &amp; Prompt Engineering
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">
            AI Video Specialists Directory
          </h1>
          <p className="text-xs text-muted mt-1 max-w-2xl leading-relaxed">
            Configure system prompts, role constraints, and realtime voice profiles for interactive
            video calls. Agents can be customized with domain knowledge or interview rubrics.
          </p>
        </div>

        <button
          onClick={() => {
            if (!isLoggedIn) {
              promptSignIn("/specialists");
            } else {
              setIsModalOpen(true);
            }
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition-colors shadow-subtle self-start md:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Specialist Agent</span>
        </button>
      </div>

      {/* Filter Tags */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="w-3.5 h-3.5 text-muted shrink-0 mr-1" />
        {allTags.map((tag) => (
          <button
            key={tag}
            onClick={() => setSelectedTag(tag)}
            className={`px-3 py-1 rounded text-xs font-mono transition-colors whitespace-nowrap ${
              selectedTag === tag
                ? "bg-brand text-white font-bold"
                : "bg-surface border border-line text-ink-soft hover:bg-canvas"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Grid of Agents */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAgents.map((agent) => (
          <div
            key={agent.id}
            className="bg-surface border border-line rounded-lg p-6 flex flex-col justify-between hover:border-brand/60 transition-all shadow-card group"
          >
            <div>
              <div className="flex items-start gap-4 mb-4">
                <img
                  src={agent.avatar}
                  alt={agent.name}
                  className="w-14 h-14 rounded-full object-cover border border-line shrink-0"
                />
                <div>
                  <h3 className="font-bold text-sm text-ink group-hover:text-brand transition-colors">
                    {agent.name}
                  </h3>
                  <p className="text-xs text-ink-soft leading-tight mt-0.5">{agent.role}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] font-mono bg-canvas border border-line text-brand font-semibold px-1.5 py-0.5 rounded">
                      Voice: {agent.voice}
                    </span>
                    {agent.isCustom || agent.id.startsWith("agent-custom-") ? (
                      <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                        🔒 Only Visible to You
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-muted bg-canvas border border-line px-1.5 py-0.5 rounded">
                        Public Catalog
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-xs text-ink-soft leading-relaxed mb-4">{agent.bio}</p>

              {/* System Prompt snippet */}
              <div className="bg-canvas border border-line rounded p-3 mb-4">
                <span className="text-[10px] font-mono text-muted uppercase tracking-wider block mb-1">
                  System Directive:
                </span>
                <p className="text-[11px] font-mono text-ink-soft line-clamp-3 leading-relaxed">
                  &quot;{agent.systemPrompt}&quot;
                </p>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1 mb-4">
                {agent.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] font-mono bg-canvas border border-line px-1.5 py-0.5 rounded text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-line flex items-center justify-between">
              {agent.isCustom || agent.id.startsWith("agent-custom-") ? (
                <span className="text-[11px] font-mono text-emerald-700 font-medium">
                  Custom Specialist
                </span>
              ) : (
                <span className="text-[11px] font-mono text-muted">
                  Standard Specialist
                </span>
              )}
              <Link
                href={`/meeting/new?agentId=${agent.id}`}
                onClick={(e) => {
                  if (!isLoggedIn) {
                    e.preventDefault();
                    promptSignIn(`/meeting/new?agentId=${agent.id}`);
                  }
                }}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition-colors shadow-subtle"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Start Video Call</span>
              </Link>
            </div>
          </div>
        ))}
      </div>

      <CreateAgentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={(newAgent) => setAgents((prev) => [newAgent, ...prev])}
      />
    </div>
  );
}
