"use client";

import { useState } from "react";
import { X, Sparkles, User, Mic } from "lucide-react";
import { AIAgent } from "@/types";

export function CreateAgentModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (agent: AIAgent) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [bio, setBio] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [voice, setVoice] = useState<AIAgent["voice"]>("alloy");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          bio,
          systemPrompt,
          voice,
          tags: ["Custom Specialist", role.split(" ")[0]],
        }),
      });
      const data = await res.json();
      if (data.agent) {
        onCreated(data.agent);
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4">
      <div className="bg-surface rounded-lg border border-line w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-brand-light flex items-center justify-center text-brand">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-ink">Create Custom AI Specialist</h2>
              <p className="text-xs text-muted">Configure persona instructions, role, and OpenAI voice.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1">Agent Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Maya Lin"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 border border-line rounded text-xs focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1">Domain Title / Role</label>
              <input
                type="text"
                required
                placeholder="e.g. Head of Growth & Retention"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-1.5 border border-line rounded text-xs focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Professional Bio</label>
            <input
              type="text"
              required
              placeholder="e.g. 10+ years optimizing SaaS activation funnels and lifecycle campaigns."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3 py-1.5 border border-line rounded text-xs focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">
              System Prompt &amp; Behavioral Guardrails
            </label>
            <textarea
              rows={3}
              required
              placeholder="You are Maya Lin, an aggressive yet analytical Head of Growth. Challenge conversion assumptions, ask for cohort metrics..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full px-3 py-1.5 border border-line rounded text-xs focus:outline-none focus:border-brand font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Realtime Voice Model</label>
            <div className="grid grid-cols-3 gap-2">
              {(["alloy", "echo", "shimmer", "fable", "onyx", "nova"] as const).map((v) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setVoice(v)}
                  className={`px-3 py-1.5 rounded text-xs font-mono capitalize border text-left transition-colors flex items-center justify-between ${
                    voice === v
                      ? "border-brand bg-brand-light text-brand font-bold"
                      : "border-line text-ink-soft hover:bg-canvas"
                  }`}
                >
                  <span>{v}</span>
                  {voice === v && <span className="w-1.5 h-1.5 rounded-full bg-brand" />}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-line flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded text-xs font-medium text-ink-soft hover:bg-canvas"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded bg-brand text-white text-xs font-semibold hover:bg-brand-deep disabled:opacity-50 shadow-subtle"
            >
              {loading ? "Creating..." : "Save Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
