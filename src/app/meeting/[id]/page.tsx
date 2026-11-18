"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  Sparkles,
  MessageSquare,
  ShieldCheck,
  Send,
  Loader2,
  Volume2,
} from "lucide-react";
import { AIAgent, Meeting, TranscriptUtterance } from "@/types";
import { Waveform } from "@/components/Waveform";

export default function MeetingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [micActive, setMicActive] = useState(true);
  const [videoActive, setVideoActive] = useState(true);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [liveUtterances, setLiveUtterances] = useState<TranscriptUtterance[]>([]);
  const [userSpeechInput, setUserSpeechInput] = useState("");
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Load meeting & Stream credentials
  useEffect(() => {
    async function loadMeeting() {
      try {
        const res = await fetch(`/api/meetings/${id}`);
        const data = await res.json();
        if (data.meeting) {
          setMeeting(data.meeting);

          // Initial greeting utterance
          const agentName = data.meeting.agent?.name || "AI Specialist";
          const initUtterance: TranscriptUtterance = {
            id: `u-init-${Date.now()}`,
            speaker: "agent",
            speakerName: agentName,
            timestamp: "00:02",
            seconds: 2,
            text: `Hello! I am ${agentName}. Stream Video WebRTC connection established. What would you like to review or brainstorm today?`,
          };
          setLiveUtterances([initUtterance]);
          setAgentSpeaking(true);
          setTimeout(() => setAgentSpeaking(false), 3500);
        }

        // Fetch Stream Video token
        const tokenRes = await fetch("/api/stream/token");
        const tokenData = await tokenRes.json();
        if (tokenData.token) {
          setStreamConnected(true);
        }
      } catch (err) {
        console.error("Meeting loading error:", err);
      }
    }
    loadMeeting();
  }, [id]);

  // Request user camera/mic for local preview
  useEffect(() => {
    async function startCamera() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          mediaStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        }
      } catch (err) {
        console.warn("Camera/mic permission note:", (err as Error).message);
      }
    }
    startCamera();

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Timer loop
  useEffect(() => {
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format call duration MM:SS
  const mins = Math.floor(callDuration / 60);
  const secs = callDuration % 60;
  const timeFormatted = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

  // Handle user speaking / sending message into the live interaction loop
  function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!userSpeechInput.trim() || !meeting) return;

    const userUtterance: TranscriptUtterance = {
      id: `u-user-${Date.now()}`,
      speaker: "user",
      speakerName: "Alex (You)",
      timestamp: timeFormatted,
      seconds: callDuration,
      text: userSpeechInput.trim(),
    };

    const newUtterances = [...liveUtterances, userUtterance];
    setLiveUtterances(newUtterances);
    const sentText = userSpeechInput;
    setUserSpeechInput("");

    // Simulate agent processing and speaking response
    setAgentSpeaking(true);
    setTimeout(() => {
      const agentName = meeting.agent?.name || "AI Specialist";
      let reply = `That is a great observation regarding ${sentText.slice(0, 30)}. Let's analyze the trade-offs and ensure our delivery timeline accounts for this.`;

      if (sentText.toLowerCase().includes("inngest") || sentText.toLowerCase().includes("background")) {
        reply = "Inngest step-functions give us guaranteed execution and retries without worrying about Next.js serverless execution limits.";
      } else if (sentText.toLowerCase().includes("polar") || sentText.toLowerCase().includes("pricing")) {
        reply = "Polar handles SaaS billing seamlessly with usage-based metering and webhooks for instant tier upgrades.";
      } else if (sentText.toLowerCase().includes("webrtc") || sentText.toLowerCase().includes("stream")) {
        reply = "Stream Video's SFU topology ensures low packet loss and crystal-clear real-time video across global edge locations.";
      }

      const agentUtterance: TranscriptUtterance = {
        id: `u-agent-${Date.now()}`,
        speaker: "agent",
        speakerName: agentName,
        timestamp: `${Math.floor((callDuration + 3) / 60).toString().padStart(2, "0")}:${((callDuration + 3) % 60).toString().padStart(2, "0")}`,
        seconds: callDuration + 3,
        text: reply,
      };

      setLiveUtterances((prev) => [...prev, agentUtterance]);
      setTimeout(() => setAgentSpeaking(false), 3000);
    }, 1200);
  }

  // End Call & trigger Inngest
  async function handleEndCall() {
    setIsEndingCall(true);
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const res = await fetch(`/api/meetings/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end_call",
          durationSeconds: Math.max(callDuration, 30),
          utterances: liveUtterances,
        }),
      });

      if (res.ok) {
        router.push(`/meeting/${id}/summary`);
      } else {
        router.push(`/meeting/${id}/summary`);
      }
    } catch (err) {
      console.error(err);
      router.push(`/meeting/${id}/summary`);
    }
  }

  const agent = meeting?.agent;

  return (
    <div className="space-y-4">
      {/* Top Session Bar */}
      <div className="bg-surface border border-line rounded-lg px-5 py-3 flex items-center justify-between shadow-subtle">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse" />
          <span className="text-xs font-mono font-bold text-ink uppercase tracking-wider">
            Live Interactive Session
          </span>
          <span className="text-line">|</span>
          <span className="text-xs font-mono text-muted tabular-nums">{timeFormatted}</span>
          <span className="text-line">|</span>
          <span className="text-xs text-ink-soft">
            Specialist: <strong className="text-ink">{agent?.name || "Loading..."}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-success bg-success-bg px-2.5 py-1 rounded">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{streamConnected ? "Stream Video SFU Active" : "Connecting..."}</span>
          </div>
        </div>
      </div>

      {/* Video Call Stage (Dual feeds: AI Specialist & User) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[440px]">
        {/* Agent Video Stage */}
        <div className="relative bg-ink rounded-lg border border-line overflow-hidden flex flex-col justify-between p-6">
          <div className="flex items-center justify-between z-10">
            <span className="text-[10px] font-mono bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-brand" />
              <span>{agent?.name || "AI Agent"}</span>
              <span className="text-muted">• {agent?.voice} voice</span>
            </span>
            {agentSpeaking && (
              <span className="text-[10px] font-mono bg-brand text-white px-2 py-0.5 rounded animate-pulse">
                Speaking...
              </span>
            )}
          </div>

          {/* Agent Avatar & Waveform */}
          <div className="flex flex-col items-center justify-center my-auto z-10">
            <div className="relative">
              <img
                src={agent?.avatar || "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80"}
                alt={agent?.name || "AI Specialist"}
                className={`w-32 h-32 rounded-full object-cover border-4 transition-all duration-300 ${
                  agentSpeaking ? "border-brand shadow-[0_0_25px_rgba(41,79,77,0.6)]" : "border-surface/20"
                }`}
              />
              {agentSpeaking && (
                <div className="absolute -bottom-2 -right-2 bg-brand text-white p-1 rounded-full shadow">
                  <Volume2 className="w-4 h-4" />
                </div>
              )}
            </div>

            <h3 className="text-white font-bold text-sm mt-4">{agent?.name}</h3>
            <p className="text-xs text-white/70 font-mono mt-0.5">{agent?.role}</p>

            {/* Audio Waveform */}
            <div className="mt-4 w-48">
              <Waveform active={agentSpeaking} barCount={20} />
            </div>
          </div>

          <div className="text-[11px] font-mono text-white/50 z-10 flex items-center justify-between">
            <span>OpenAI Realtime Protocol</span>
            <span>PCM 24kHz • 48ms</span>
          </div>

          {/* Background Ambient Glow */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />
        </div>

        {/* User Local Video Stage */}
        <div className="relative bg-ink rounded-lg border border-line overflow-hidden flex flex-col justify-between p-6">
          <div className="flex items-center justify-between z-10">
            <span className="text-[10px] font-mono bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded">
              Alex Rivera (You)
            </span>
            <span className="text-[10px] font-mono text-white/60">
              WebRTC Egress • 1080p
            </span>
          </div>

          {/* Video or Fallback Avatar */}
          <div className="absolute inset-0 flex items-center justify-center">
            {videoActive ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform scale-x-[-1]"
              />
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-surface/10 border border-white/20 flex items-center justify-center text-white/60">
                  <VideoOff className="w-10 h-10" />
                </div>
                <span className="text-xs text-white/60 font-mono mt-3">Camera Disabled</span>
              </div>
            )}
          </div>

          <div className="z-10 flex items-center justify-between mt-auto">
            <span className="text-[10px] font-mono bg-black/60 text-white/80 px-2 py-0.5 rounded">
              {micActive ? "Mic Live" : "Muted"}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Controls & Speech Input Bar */}
      <div className="bg-surface border border-line rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-card">
        {/* Hardware Toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMicActive(!micActive)}
            className={`p-2.5 rounded-md border text-xs font-semibold flex items-center gap-2 transition-colors ${
              micActive
                ? "bg-canvas border-line text-ink hover:bg-line/40"
                : "bg-danger-bg border-danger text-danger"
            }`}
          >
            {micActive ? <Mic className="w-4 h-4 text-brand" /> : <MicOff className="w-4 h-4 text-danger" />}
            <span className="font-mono">{micActive ? "Mute Mic" : "Unmute"}</span>
          </button>

          <button
            onClick={() => setVideoActive(!videoActive)}
            className={`p-2.5 rounded-md border text-xs font-semibold flex items-center gap-2 transition-colors ${
              videoActive
                ? "bg-canvas border-line text-ink hover:bg-line/40"
                : "bg-danger-bg border-danger text-danger"
            }`}
          >
            {videoActive ? <VideoIcon className="w-4 h-4 text-brand" /> : <VideoOff className="w-4 h-4 text-danger" />}
            <span className="font-mono">{videoActive ? "Stop Video" : "Start Video"}</span>
          </button>
        </div>

        {/* Live Speech Simulation Input */}
        <form onSubmit={handleSendMessage} className="flex-1 max-w-xl flex items-center gap-2 w-full">
          <input
            type="text"
            placeholder="Speak or type a question to the AI Specialist..."
            value={userSpeechInput}
            onChange={(e) => setUserSpeechInput(e.target.value)}
            className="flex-1 px-3.5 py-2 border border-line rounded-md text-xs focus:outline-none focus:border-brand font-sans"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-brand text-white rounded-md text-xs font-semibold hover:bg-brand-deep flex items-center gap-1.5 shrink-0 transition-colors shadow-subtle"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Speak</span>
          </button>
        </form>

        {/* End Call & Trigger Inngest Button */}
        <button
          onClick={handleEndCall}
          disabled={isEndingCall}
          className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-danger text-white text-xs font-bold hover:bg-red-700 transition-colors shadow-subtle disabled:opacity-50 shrink-0"
        >
          {isEndingCall ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Triggering Inngest...</span>
            </>
          ) : (
            <>
              <PhoneOff className="w-4 h-4" />
              <span>End Call &amp; Process Intelligence</span>
            </>
          )}
        </button>
      </div>

      {/* Live Transcript Ticker Stream */}
      <div className="bg-surface border border-line rounded-lg p-5 shadow-card">
        <div className="flex items-center justify-between pb-3 border-b border-line mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-brand" />
            <span className="text-xs font-bold text-ink">Realtime Speech Ticker</span>
            <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
              (Live Stream Captions)
            </span>
          </div>
          <span className="text-[10px] font-mono text-success flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            Active Feed
          </span>
        </div>

        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-2">
          {liveUtterances.map((utt) => (
            <div key={utt.id} className="flex items-start gap-3 text-xs leading-relaxed">
              <span className="font-mono text-[10px] text-muted shrink-0 mt-0.5">
                [{utt.timestamp}]
              </span>
              <span
                className={`font-semibold shrink-0 text-xs ${
                  utt.speaker === "agent" ? "text-brand" : "text-ink"
                }`}
              >
                {utt.speakerName}:
              </span>
              <span className="text-ink-soft">{utt.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
