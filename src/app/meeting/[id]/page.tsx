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
  Monitor,
  MonitorOff,
  VolumeX,
} from "lucide-react";
import { AIAgent, Meeting, TranscriptUtterance } from "@/types";
import { Waveform } from "@/components/Waveform";

export default function MeetingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [micActive, setMicActive] = useState(true);
  const [videoActive, setVideoActive] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [voiceAudioEnabled, setVoiceAudioEnabled] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [liveUtterances, setLiveUtterances] = useState<TranscriptUtterance[]>([]);
  const [userSpeechInput, setUserSpeechInput] = useState("");
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);

  // Play spoken response via Web Speech Synthesis
  function speakWithSyntheticVoice(text: string) {
    if (!voiceAudioEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = meeting?.agent?.voice === "alloy" || meeting?.agent?.voice === "echo" ? 0.95 : 1.1;

      utterance.onstart = () => setAgentSpeaking(true);
      utterance.onend = () => setAgentSpeaking(false);
      utterance.onerror = () => setAgentSpeaking(false);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis error:", e);
      setAgentSpeaking(false);
    }
  }

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
          const initGreeting = `Hello! I am ${agentName}. Stream Video WebRTC connection established. What would you like to review or brainstorm today?`;

          const initUtterance: TranscriptUtterance = {
            id: `u-init-${Date.now()}`,
            speaker: "agent",
            speakerName: agentName,
            timestamp: "00:02",
            seconds: 2,
            text: initGreeting,
          };
          setLiveUtterances([initUtterance]);
          speakWithSyntheticVoice(initGreeting);
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

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
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
          if (localVideoRef.current && !isScreenSharing) {
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

  // Web Speech Recognition for continuous hands-free speech
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition && micActive) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => {
          setIsListening(false);
          // Restart if mic is still on and not ending
          if (micActive && !isEndingCall) {
            try {
              recognition.start();
            } catch {}
          }
        };

        recognition.onresult = (event: any) => {
          const transcript = event.results[event.results.length - 1][0].transcript.trim();
          if (transcript.length > 2) {
            processSpokenInput(transcript);
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        console.warn("Speech recognition initialization note:", e);
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, [micActive, isEndingCall, meeting]);

  // Handle Screen Share toggle
  async function toggleScreenShare() {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        setIsScreenSharing(true);

        screenStream.getVideoTracks()[0].onended = () => {
          stopScreenShare();
        };
      } catch (e) {
        console.warn("Screen share cancelled:", e);
      }
    } else {
      stopScreenShare();
    }
  }

  function stopScreenShare() {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (localVideoRef.current && mediaStreamRef.current) {
      localVideoRef.current.srcObject = mediaStreamRef.current;
    }
    setIsScreenSharing(false);
  }

  // Timer loop
  useEffect(() => {
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const mins = Math.floor(callDuration / 60);
  const secs = callDuration % 60;
  const timeFormatted = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

  // Process User Speech & Generate Agent Response
  function processSpokenInput(spokenText: string) {
    if (!spokenText.trim() || !meeting) return;

    const userUtterance: TranscriptUtterance = {
      id: `u-user-${Date.now()}`,
      speaker: "user",
      speakerName: "Alex (You)",
      timestamp: timeFormatted,
      seconds: callDuration,
      text: spokenText.trim(),
    };

    setLiveUtterances((prev) => [...prev, userUtterance]);
    setAgentSpeaking(true);

    setTimeout(() => {
      const agentName = meeting.agent?.name || "AI Specialist";
      const lower = spokenText.toLowerCase();
      let reply = `That is an excellent point regarding "${spokenText.slice(0, 36)}...". Let's trace how that impacts our pipeline latency and data contracts.`;

      if (lower.includes("inngest") || lower.includes("background")) {
        reply = "Inngest step-functions give us guaranteed execution and idempotency, preventing edge timeouts when processing audio chunks.";
      } else if (lower.includes("polar") || lower.includes("pricing") || lower.includes("tier")) {
        reply = "With Polar, usage metrics link directly to subscription checkouts, allowing seamless upgrades when users reach call duration limits.";
      } else if (lower.includes("webrtc") || lower.includes("stream") || lower.includes("sfu")) {
        reply = "Stream Video's Selective Forwarding Units (SFUs) distribute the video streams with minimal latency overhead across global edge clusters.";
      } else if (lower.includes("action") || lower.includes("next step") || lower.includes("todo")) {
        reply = "I have noted this item. Once we conclude the call, Inngest will index it into the action deliverables on your dashboard.";
      }

      const agentUtterance: TranscriptUtterance = {
        id: `u-agent-${Date.now()}`,
        speaker: "agent",
        speakerName: agentName,
        timestamp: `${Math.floor((callDuration + 2) / 60).toString().padStart(2, "0")}:${((callDuration + 2) % 60).toString().padStart(2, "0")}`,
        seconds: callDuration + 2,
        text: reply,
      };

      setLiveUtterances((prev) => [...prev, agentUtterance]);
      speakWithSyntheticVoice(reply);
    }, 1100);
  }

  // Handle manual input form
  function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!userSpeechInput.trim()) return;
    const txt = userSpeechInput;
    setUserSpeechInput("");
    processSpokenInput(txt);
  }

  // End Call & trigger Inngest
  async function handleEndCall() {
    setIsEndingCall(true);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    try {
      await fetch(`/api/meetings/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end_call",
          durationSeconds: Math.max(callDuration, 30),
          utterances: liveUtterances,
        }),
      });

      router.push(`/meeting/${id}/summary`);
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
          {isListening && (
            <span className="text-[10px] font-mono text-brand bg-brand-light px-2 py-0.5 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand animate-ping" />
              Listening...
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setVoiceAudioEnabled(!voiceAudioEnabled)}
            className="flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded border border-line hover:bg-canvas text-muted"
            title="Toggle Agent Voice Audio"
          >
            {voiceAudioEnabled ? <Volume2 className="w-3.5 h-3.5 text-brand" /> : <VolumeX className="w-3.5 h-3.5 text-danger" />}
            <span>{voiceAudioEnabled ? "Voice Audio On" : "Muted Voice"}</span>
          </button>
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
              {isScreenSharing ? "Your Screen Share" : "Your Video Feed"}
            </span>
            <span className="text-[10px] font-mono text-white/60">
              WebRTC Egress • 1080p
            </span>
          </div>

          {/* Video or Fallback Avatar */}
          <div className="absolute inset-0 flex items-center justify-center">
            {videoActive || isScreenSharing ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isScreenSharing ? "" : "transform scale-x-[-1]"}`}
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
              {micActive ? "Mic Live (Hands-free Speech)" : "Muted"}
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
            <span className="font-mono">{micActive ? "Mic Live" : "Unmute"}</span>
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
            <span className="font-mono">{videoActive ? "Camera" : "Enable"}</span>
          </button>

          <button
            onClick={toggleScreenShare}
            className={`p-2.5 rounded-md border text-xs font-semibold flex items-center gap-2 transition-colors ${
              isScreenSharing
                ? "bg-brand text-white border-brand"
                : "bg-canvas border-line text-ink hover:bg-line/40"
            }`}
          >
            {isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4 text-muted" />}
            <span className="font-mono">{isScreenSharing ? "Stop Share" : "Share Screen"}</span>
          </button>
        </div>

        {/* Live Speech Input Form */}
        <form onSubmit={handleSendMessage} className="flex-1 max-w-xl flex items-center gap-2 w-full">
          <input
            type="text"
            placeholder="Type or speak hands-free via your microphone..."
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
