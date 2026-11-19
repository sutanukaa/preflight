"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  Search,
  MessageSquare,
  Sparkles,
  Clock,
  CheckCircle2,
  Circle,
  ListTodo,
  Send,
  RotateCcw,
  Share2,
  ArrowLeft,
  Download,
  Copy,
  Check,
  FileDown,
} from "lucide-react";
import { ActionItem, Meeting, MeetingChatMessage, MeetingTopic, TranscriptUtterance } from "@/types";

export default function MeetingSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);

  // Video playback state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Transcript search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState<"all" | "agent" | "user">("all");
  const [activeUtteranceId, setActiveUtteranceId] = useState<string | null>(null);

  // Copilot Chat state
  const [chatMessages, setChatMessages] = useState<MeetingChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAskingCopilot, setIsAskingCopilot] = useState(false);

  // Active Tab: "summary" | "transcript" | "copilot"
  const [activeTab, setActiveTab] = useState<"summary" | "transcript" | "copilot">("summary");
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Load meeting details
  useEffect(() => {
    async function loadSummary() {
      try {
        const res = await fetch(`/api/meetings/${id}`);
        const data = await res.json();
        if (data.meeting) {
          setMeeting(data.meeting);
        }

        const chatRes = await fetch(`/api/meetings/${id}/chat`);
        const chatData = await chatRes.json();
        if (chatData.messages) {
          setChatMessages(chatData.messages);
        }
      } catch (err) {
        console.error("Failed to load meeting summary:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSummary();
  }, [id]);

  // Video time update listener
  function handleTimeUpdate() {
    if (videoRef.current) {
      const curr = videoRef.current.currentTime;
      setCurrentTime(curr);

      // Highlight active utterance
      if (meeting?.transcripts) {
        const active = meeting.transcripts
          .slice()
          .reverse()
          .find((u) => curr >= u.seconds);
        if (active) {
          setActiveUtteranceId(active.id);
        }
      }
    }
  }

  // Jump video player to specific seconds
  async function seekToSeconds(sec: number) {
    if (!videoRef.current) return;
    try {
      const maxD = safeDuration > 0 ? safeDuration : 60;
      const targetTime = Math.min(Math.max(0, isFinite(sec) ? sec : 0), maxD);
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
      await videoRef.current.play();
      setIsPlaying(true);
    } catch (e) {
      console.warn("Seek error:", e);
    }
  }

  async function togglePlayPause() {
    if (!videoRef.current) return;
    try {
      if (videoRef.current.paused) {
        if (
          videoRef.current.ended ||
          (safeDuration > 0 && videoRef.current.currentTime >= safeDuration - 0.5)
        ) {
          videoRef.current.currentTime = 0;
          setCurrentTime(0);
        }
        await videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    } catch (e) {
      console.warn("Toggle play/pause error:", e);
      if (videoRef.current) {
        setIsPlaying(!videoRef.current.paused);
      }
    }
  }

  // Toggle Action Item Status
  async function handleToggleActionItem(actionItemId: string) {
    if (!meeting?.summary) return;

    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionItemId }),
      });
      const data = await res.json();
      if (data.meeting) {
        setMeeting(data.meeting);
      }
    } catch (err) {
      console.error("Failed to toggle action item:", err);
    }
  }

  // Copy full summary to clipboard
  function handleCopySummary() {
    if (!meeting?.summary) return;

    const text = [
      `# ${meeting.title}`,
      `Date: ${new Date(meeting.startedAt).toLocaleDateString()}`,
      `Specialist: ${meeting.agent?.name || "AI Specialist"}`,
      "",
      `## Executive Overview`,
      meeting.summary.overview,
      "",
      `## Key Decisions & Takeaways`,
      ...meeting.summary.keyTakeaways.map((t) => `- ${t}`),
      "",
      `## Action Deliverables`,
      ...meeting.summary.actionItems.map(
        (a) => `- [${a.status === "completed" ? "x" : " "}] ${a.task} (Owner: ${a.owner}, Priority: ${a.priority.toUpperCase()})`
      ),
    ].join("\n");

    navigator.clipboard?.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  }

  // Export transcript in different formats
  function handleExport(format: "markdown" | "txt" | "vtt" | "json") {
    if (!meeting?.transcripts) return;
    setShowExportMenu(false);

    let content = "";
    let mimeType = "text/plain";
    let extension = "txt";

    if (format === "markdown") {
      content = `# Transcript: ${meeting.title}\n\n` +
        meeting.transcripts.map((u) => `**[${u.timestamp}] ${u.speakerName}**: ${u.text}`).join("\n\n");
      mimeType = "text/markdown";
      extension = "md";
    } else if (format === "vtt") {
      content = "WEBVTT\n\n" +
        meeting.transcripts
          .map((u, i) => `${i + 1}\n00:${u.timestamp}.000 --> 00:${formatSeconds(u.seconds + 4)}.000\n${u.speakerName}: ${u.text}`)
          .join("\n\n");
      mimeType = "text/vtt";
      extension = "vtt";
    } else if (format === "json") {
      content = JSON.stringify(meeting, null, 2);
      mimeType = "application/json";
      extension = "json";
    } else {
      content = meeting.transcripts.map((u) => `[${u.timestamp}] ${u.speakerName}: ${u.text}`).join("\n");
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meeting-${meeting.id}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Send query to AI Copilot
  async function handleSendChat(customQuery?: string) {
    const q = (customQuery || chatInput).trim();
    if (!q) return;

    setChatInput("");
    setIsAskingCopilot(true);

    try {
      const res = await fetch(`/api/meetings/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const data = await res.json();
      if (data.allMessages) {
        setChatMessages(data.allMessages);
      }
    } catch (err) {
      console.error("Copilot error:", err);
    } finally {
      setIsAskingCopilot(false);
    }
  }

  // Filtered utterances
  const filteredUtterances = (meeting?.transcripts || []).filter((u) => {
    const matchesSpeaker =
      speakerFilter === "all" ? true : u.speaker === speakerFilter;
    const matchesQuery =
      searchQuery.trim() === "" ||
      u.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.speakerName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSpeaker && matchesQuery;
  });

  const formatSeconds = (sec: number) => {
    if (!sec || !isFinite(sec) || isNaN(sec) || sec < 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const safeDuration =
    isFinite(duration) && duration > 0
      ? duration
      : meeting?.durationSeconds && meeting.durationSeconds > 0
      ? meeting.durationSeconds
      : 60;

  // Calculate talk-time metrics
  const totalUtterances = meeting?.transcripts?.length || 1;
  const agentUtterancesCount = (meeting?.transcripts || []).filter((u) => u.speaker === "agent").length;
  const userUtterancesCount = totalUtterances - agentUtterancesCount;
  const agentRatio = Math.round((agentUtterancesCount / totalUtterances) * 100);
  const userRatio = 100 - agentRatio;

  if (loading) {
    return (
      <div className="p-12 text-center text-xs font-mono text-muted">
        Loading Post-Meeting Intelligence Suite...
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-sm font-bold text-ink">Meeting Not Found</h2>
        <Link href="/" className="text-xs text-brand hover:underline mt-2 inline-block">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const summary = meeting.summary;

  return (
    <div className="space-y-6">
      {/* Header with Breadcrumb & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-line">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Link href="/" className="hover:text-ink flex items-center gap-1 font-mono">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </Link>
            <span>/</span>
            <span className="font-mono">{meeting.id}</span>
          </div>
          <h1 className="text-xl font-extrabold text-ink tracking-tight flex items-center gap-2.5">
            <span>{meeting.title}</span>
            <span className="text-[10px] font-mono text-success bg-success-bg px-2 py-0.5 rounded font-normal flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Inngest Indexed
            </span>
          </h1>
          <div className="flex items-center gap-3 text-xs text-muted font-mono">
            <span>Specialist: {meeting.agent?.name || "AI Specialist"}</span>
            <span>•</span>
            <span>
              {new Date(meeting.startedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span>•</span>
            <span>Duration: {formatSeconds(meeting.durationSeconds)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 relative">
          <button
            onClick={handleCopySummary}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-line bg-surface text-xs font-medium text-ink hover:bg-canvas transition-colors shadow-subtle"
          >
            {copiedSummary ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5 text-muted" />}
            <span>{copiedSummary ? "Copied!" : "Copy Summary"}</span>
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-line bg-surface text-xs font-medium text-ink hover:bg-canvas transition-colors shadow-subtle"
            >
              <Download className="w-3.5 h-3.5 text-muted" />
              <span>Export</span>
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-surface border border-line rounded-md shadow-lg z-20 py-1 text-xs">
                <button
                  onClick={() => handleExport("markdown")}
                  className="w-full text-left px-3 py-1.5 hover:bg-canvas text-ink flex items-center justify-between font-mono text-[11px]"
                >
                  <span>Markdown (.md)</span>
                </button>
                <button
                  onClick={() => handleExport("txt")}
                  className="w-full text-left px-3 py-1.5 hover:bg-canvas text-ink flex items-center justify-between font-mono text-[11px]"
                >
                  <span>Plain Text (.txt)</span>
                </button>
                <button
                  onClick={() => handleExport("vtt")}
                  className="w-full text-left px-3 py-1.5 hover:bg-canvas text-ink flex items-center justify-between font-mono text-[11px]"
                >
                  <span>Subtitles (.vtt)</span>
                </button>
                <button
                  onClick={() => handleExport("json")}
                  className="w-full text-left px-3 py-1.5 hover:bg-canvas text-ink flex items-center justify-between font-mono text-[11px]"
                >
                  <span>Full State (.json)</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
              alert("Meeting review link copied to clipboard!");
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-line bg-surface text-xs font-medium text-ink hover:bg-canvas transition-colors shadow-subtle"
          >
            <Share2 className="w-3.5 h-3.5 text-muted" />
            <span>Share</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Video Player (Left) + Intelligence Suite (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 Cols): Video Player & Deliverables */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-ink rounded-lg overflow-hidden border border-line shadow-card relative">
            <div className="relative group cursor-pointer" onClick={togglePlayPause}>
              <video
                ref={videoRef}
                src={meeting.recordingUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.includes("BigBuckBunny")) {
                    target.src = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
                  }
                }}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    const d = videoRef.current.duration;
                    if (isFinite(d) && d > 0) {
                      setDuration(d);
                    } else if (meeting?.durationSeconds && meeting.durationSeconds > 0) {
                      setDuration(meeting.durationSeconds);
                    } else {
                      // Chromium WebM duration resolution fallback
                      videoRef.current.currentTime = Number.MAX_SAFE_INTEGER;
                      videoRef.current.ontimeupdate = () => {
                        if (!videoRef.current) return;
                        videoRef.current.ontimeupdate = handleTimeUpdate;
                        const realD = videoRef.current.currentTime;
                        videoRef.current.currentTime = 0;
                        if (isFinite(realD) && realD > 0) {
                          setDuration(realD);
                        } else {
                          setDuration(meeting?.durationSeconds || 60);
                        }
                      };
                    }
                  }
                }}
                onCanPlay={() => {
                  if (videoRef.current && isPlaying && videoRef.current.paused) {
                    videoRef.current.play().catch(() => {});
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => {
                  setIsPlaying(false);
                  setCurrentTime(0);
                }}
                playsInline
                preload="auto"
                className="w-full aspect-video object-cover bg-black"
              />

              {/* Big Center Play Button Overlay when paused */}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/35 hover:bg-black/20 transition-all pointer-events-none">
                  <div className="w-14 h-14 rounded-full bg-brand text-white flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-110">
                    <Play className="w-6 h-6 fill-current ml-1" />
                  </div>
                </div>
              )}
            </div>

            {/* Video Overlay Controls */}
            <div className="p-3 bg-surface border-t border-line flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlayPause}
                  className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center hover:bg-brand-deep transition-colors shadow-subtle shrink-0"
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>
                <div className="font-mono text-xs text-ink font-semibold tabular-nums shrink-0">
                  {formatSeconds(currentTime)} / {formatSeconds(safeDuration)}
                </div>
              </div>

              {/* Scrubber */}
              <input
                type="range"
                min="0"
                max={safeDuration}
                step="0.1"
                value={currentTime}
                onChange={(e) => seekToSeconds(parseFloat(e.target.value))}
                className="flex-1 mx-4 accent-brand cursor-pointer"
              />

              <button
                onClick={() => seekToSeconds(0)}
                className="text-muted hover:text-ink text-xs font-mono flex items-center gap-1 shrink-0"
                title="Rewind to start"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Speaker Talk-Time Ratio Visualizer */}
          <div className="bg-surface border border-line rounded-lg p-4 shadow-card space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted">Speaker Participation</span>
              <span className="text-ink font-semibold">
                {agentRatio}% Specialist / {userRatio}% You
              </span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden flex bg-canvas border border-line">
              <div className="bg-brand h-full" style={{ width: `${agentRatio}%` }} title="Specialist talk ratio" />
              <div className="bg-ink h-full" style={{ width: `${userRatio}%` }} title="User talk ratio" />
            </div>
          </div>

          {/* Interactive Action Items Checklist */}
          <div className="bg-surface border border-line rounded-lg p-4 shadow-card space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <div className="flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-brand" />
                <span className="text-xs font-bold text-ink">Action Deliverables</span>
              </div>
              <span className="text-[10px] font-mono text-muted">
                {summary?.actionItems.filter((i) => i.status === "completed").length} of {summary?.actionItems.length || 0} completed
              </span>
            </div>

            <div className="space-y-2">
              {summary?.actionItems.map((item) => {
                const isCompleted = item.status === "completed";
                return (
                  <div
                    key={item.id}
                    onClick={() => handleToggleActionItem(item.id)}
                    className="flex items-start gap-2.5 p-2 rounded bg-canvas border border-line text-xs cursor-pointer hover:border-brand transition-colors group"
                  >
                    <button className="mt-0.5 text-muted group-hover:text-brand">
                      {isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted" />
                      )}
                    </button>
                    <div className="flex-1">
                      <p
                        className={`font-medium leading-tight ${
                          isCompleted ? "line-through text-muted" : "text-ink"
                        }`}
                      >
                        {item.task}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-muted">
                        <span>Owner: {item.owner}</span>
                        <span>•</span>
                        <span
                          className={`uppercase px-1 rounded text-[9px] font-bold ${
                            item.priority === "high"
                              ? "bg-danger-bg text-danger"
                              : "bg-warning-bg text-warning"
                          }`}
                        >
                          {item.priority}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sentiment Gauge */}
          {summary?.sentiment && (
            <div className="bg-surface border border-line rounded-lg p-4 shadow-card flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-muted uppercase tracking-wider block">
                  AI Sentiment Analysis
                </span>
                <span className="text-xs font-bold text-ink mt-0.5 block">
                  {summary.sentiment.verdict}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-success font-semibold">
                  {summary.sentiment.positive}% Positive
                </span>
                <span className="text-muted">/</span>
                <span className="text-muted font-medium">
                  {summary.sentiment.neutral}% Neutral
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (7 Cols): Tabs (AI Summary | Searchable Transcript | Meeting Copilot Chat) */}
        <div className="lg:col-span-7 bg-surface border border-line rounded-lg shadow-card flex flex-col h-[740px]">
          {/* Tab Navigation */}
          <div className="flex items-center border-b border-line px-5 pt-3 gap-6 shrink-0 bg-canvas/30">
            <button
              onClick={() => setActiveTab("summary")}
              className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === "summary"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Summary &amp; Topics</span>
            </button>

            <button
              onClick={() => setActiveTab("transcript")}
              className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === "transcript"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Searchable Transcript</span>
              <span className="text-[9px] font-mono bg-canvas border border-line px-1.5 rounded">
                {meeting.transcripts?.length || 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("copilot")}
              className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === "copilot"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Meeting AI Copilot</span>
              <span className="text-[9px] font-mono bg-brand-light text-brand px-1.5 rounded font-bold">
                RAG Q&amp;A
              </span>
            </button>
          </div>

          {/* TAB 1: AI Summary & Timestamped Topics */}
          {activeTab === "summary" && (
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Executive Overview */}
              <div>
                <h3 className="text-xs font-mono uppercase tracking-wider text-muted font-bold mb-2">
                  Executive Overview
                </h3>
                <p className="text-xs text-ink-soft leading-relaxed bg-canvas p-4 rounded border border-line">
                  {summary?.overview}
                </p>
              </div>

              {/* Key Takeaways */}
              {summary?.keyTakeaways && (
                <div>
                  <h3 className="text-xs font-mono uppercase tracking-wider text-muted font-bold mb-2">
                    Key Decisions &amp; Takeaways
                  </h3>
                  <div className="space-y-2">
                    {summary.keyTakeaways.map((takeaway, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5 text-xs text-ink leading-relaxed"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                        <span>{takeaway}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timestamped Topics Breakdown with Jump To Video buttons */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-muted font-bold">
                    Timestamped Topic Milestones
                  </h3>
                  <span className="text-[10px] font-mono text-brand">
                    Click timestamp to seek video
                  </span>
                </div>

                <div className="space-y-3">
                  {summary?.topics.map((topic) => (
                    <div
                      key={topic.id}
                      className="border border-line rounded-md p-4 bg-surface hover:border-brand transition-colors group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => seekToSeconds(topic.seconds)}
                            className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-brand-light text-brand text-[11px] font-mono font-bold hover:bg-brand hover:text-white transition-colors"
                            title="Jump video to this topic"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>[{topic.timestamp}]</span>
                          </button>
                          <h4 className="text-xs font-bold text-ink group-hover:text-brand transition-colors">
                            {topic.title}
                          </h4>
                        </div>
                      </div>

                      <p className="text-xs text-ink-soft leading-relaxed mb-2">
                        {topic.summary}
                      </p>

                      <div className="space-y-1 pl-2 border-l border-line">
                        {topic.bulletPoints.map((b, i) => (
                          <div key={i} className="text-[11px] text-muted flex items-start gap-2">
                            <span>•</span>
                            <span>{b}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Searchable Transcript with Keyword Highlighting & Jump */}
          {activeTab === "transcript" && (
            <div className="p-5 flex flex-col flex-1 min-h-0">
              {/* Search Bar & Speaker Filter */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pb-4 border-b border-line shrink-0">
                <div className="relative flex-1 w-full">
                  <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search words, phrases, or topics in transcript..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-1.5 text-xs border border-line rounded focus:outline-none focus:border-brand font-sans"
                  />
                </div>

                <div className="flex items-center gap-1 shrink-0 self-start sm:self-auto">
                  {(["all", "agent", "user"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setSpeakerFilter(mode)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono capitalize border transition-colors ${
                        speakerFilter === mode
                          ? "bg-brand text-white border-brand font-bold"
                          : "border-line text-ink-soft hover:bg-canvas"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Utterances List */}
              <div className="flex-1 overflow-y-auto space-y-3 pt-4 pr-1">
                {filteredUtterances.length === 0 ? (
                  <div className="py-12 text-center text-xs font-mono text-muted">
                    No speech lines matched &quot;{searchQuery}&quot;
                  </div>
                ) : (
                  filteredUtterances.map((u) => {
                    const isActive = activeUtteranceId === u.id;
                    return (
                      <div
                        key={u.id}
                        className={`p-3 rounded-md border transition-all ${
                          isActive
                            ? "bg-brand-light/40 border-brand shadow-subtle"
                            : "bg-surface border-line hover:border-line-subtle"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-bold ${
                                u.speaker === "agent" ? "text-brand" : "text-ink"
                              }`}
                            >
                              {u.speakerName}
                            </span>
                            <span className="text-[10px] font-mono text-muted">
                              {u.speaker === "agent" ? "(Specialist)" : "(Participant)"}
                            </span>
                          </div>

                          {/* Jump to video button */}
                          <button
                            onClick={() => seekToSeconds(u.seconds)}
                            className="flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded bg-canvas border border-line text-brand hover:bg-brand hover:text-white transition-colors"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>[{u.timestamp}]</span>
                          </button>
                        </div>

                        <p className="text-xs text-ink-soft leading-relaxed">
                          {searchQuery.trim() ? (
                            // Highlight searched keyword
                            u.text.split(new RegExp(`(${searchQuery})`, "gi")).map((chunk, i) =>
                              chunk.toLowerCase() === searchQuery.toLowerCase() ? (
                                <mark key={i} className="bg-warning-bg text-ink font-bold px-0.5 rounded">
                                  {chunk}
                                </mark>
                              ) : (
                                chunk
                              )
                            )
                          ) : (
                            u.text
                          )}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Meeting AI Copilot (Contextual RAG Chat) */}
          {activeTab === "copilot" && (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Quick Sample Queries */}
              <div className="p-3 bg-canvas border-b border-line flex items-center gap-2 overflow-x-auto shrink-0">
                <span className="text-[10px] font-mono text-muted uppercase tracking-wider shrink-0">
                  Quick Prompts:
                </span>
                {[
                  "What are the action items?",
                  "What did we discuss about Inngest?",
                  "What were the WebRTC conclusions?",
                  "Give me an executive summary",
                ].map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendChat(prompt)}
                    className="px-2.5 py-1 bg-surface border border-line rounded text-[11px] text-ink-soft hover:border-brand hover:text-brand transition-colors whitespace-nowrap shadow-subtle shrink-0"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Chat Messages Log */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.sender === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono text-muted">
                        {msg.sender === "user" ? "You" : "AI Copilot"}
                      </span>
                      <span className="text-[10px] font-mono text-muted">• {msg.timestamp}</span>
                    </div>

                    <div
                      className={`max-w-[85%] rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.sender === "user"
                          ? "bg-brand text-white shadow-subtle"
                          : "bg-canvas border border-line text-ink"
                      }`}
                    >
                      {msg.text}

                      {/* Clickable Cited Timestamps */}
                      {msg.referencedSeconds && msg.referencedSeconds.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-line/60 flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono text-muted uppercase">
                            Cited in call:
                          </span>
                          {msg.referencedSeconds.map((sec) => (
                            <button
                              key={sec}
                              onClick={() => seekToSeconds(sec)}
                              className="px-2 py-0.5 rounded bg-surface border border-line text-[10px] font-mono text-brand font-bold hover:bg-brand hover:text-white transition-colors"
                            >
                              Jump to [{formatSeconds(sec)}]
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isAskingCopilot && (
                  <div className="flex items-center gap-2 text-xs font-mono text-muted">
                    <Sparkles className="w-3.5 h-3.5 animate-spin text-brand" />
                    <span>Analyzing transcript context &amp; drafting response...</span>
                  </div>
                )}
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendChat();
                }}
                className="p-4 border-t border-line bg-surface flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  placeholder="Ask a question about this meeting (e.g. 'What did Sarah say about database indexing?')..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 px-3.5 py-2 text-xs border border-line rounded focus:outline-none focus:border-brand font-sans"
                />
                <button
                  type="submit"
                  disabled={isAskingCopilot || !chatInput.trim()}
                  className="px-4 py-2 bg-brand text-white text-xs font-semibold rounded hover:bg-brand-deep disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-subtle"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Ask Copilot</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
