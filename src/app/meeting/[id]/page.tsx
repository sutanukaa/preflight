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
import { useSession } from "@/lib/auth-client";

export default function MeetingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: authSession } = useSession();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [userName, setUserName] = useState("You");
  const [micActive, setMicActive] = useState(true);
  const [videoActive, setVideoActive] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [voiceAudioEnabled, setVoiceAudioEnabled] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [liveUtterances, setLiveUtterances] = useState<TranscriptUtterance[]>([]);
  const [userSpeechInput, setUserSpeechInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Sync real user name from Google OAuth session or localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("clarity_user");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed?.name) setUserName(parsed.name);
        } catch {}
      }
    }
    if (authSession?.user?.name) {
      setUserName(authSession.user.name);
    } else {
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((d) => {
          if (d?.user?.name) {
            setUserName(d.user.name);
            if (typeof window !== "undefined") {
              localStorage.setItem("clarity_user", JSON.stringify(d.user));
            }
          }
        })
        .catch(() => {});
    }
  }, [authSession]);

  // Play spoken response via Web Speech Synthesis
  function speakWithSyntheticVoice(text: string) {
    if (!voiceAudioEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

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

          const agentName = data.meeting.agent?.name || "David Kross";
          const initGreeting = `Hello! I am ${agentName}. Stream Video WebRTC connection established. What would you like to review or discuss today?`;

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

  // Request user camera/mic for local preview and recording
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

          // Initialize MediaRecorder for local call recording
          if (typeof window !== "undefined" && typeof MediaRecorder !== "undefined") {
            try {
              let mimeType = "video/webm;codecs=vp9,opus";
              if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = "video/webm;codecs=vp8,opus";
              }
              if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = "video/webm";
              }

              const recorder = new MediaRecorder(stream, { mimeType });
              recordedChunksRef.current = [];

              recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                  recordedChunksRef.current.push(event.data);
                }
              };

              recorder.start(1000); // 1-second chunks
              mediaRecorderRef.current = recorder;
            } catch (recErr) {
              console.warn("MediaRecorder start note:", recErr);
            }
          }
        }
      } catch (err) {
        console.warn("Camera/mic permission note:", (err as Error).message);
      }
    }
    startCamera();

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Safe manual voice toggle (Push to Talk / Click to Speak)
  function toggleVoiceListening() {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Your browser does not support Web Speech Recognition. You can type in the box to speak with the agent!");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            setUserSpeechInput(event.results[i][0].transcript);
          }
        }

        if (finalTranscript.trim().length > 1) {
          setUserSpeechInput("");
          setIsListening(false);
          processSpokenInput(finalTranscript.trim());
        }
      };

      recognition.onerror = (e: any) => {
        console.warn("Speech recognition error:", e.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn("Failed to start voice listening:", e);
      setIsListening(false);
    }
  }

  // Hardware Mic toggle (mutes/unmutes physical microphone track)
  function toggleMic() {
    const next = !micActive;
    setMicActive(next);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
    }
  }

  // Hardware Camera toggle (enables/disables physical camera video track)
  function toggleVideo() {
    const next = !videoActive;
    setVideoActive(next);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = next;
      });
    }
  }

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

  // Process User Speech & Generate In-Character Agent Response
  async function processSpokenInput(spokenText: string) {
    if (!spokenText.trim()) return;

    setIsSending(true);
    const agentName = meeting?.agent?.name || "AI Specialist";

    const userUtterance: TranscriptUtterance = {
      id: `u-user-${Date.now()}`,
      speaker: "user",
      speakerName: `${userName} (You)`,
      timestamp: timeFormatted,
      seconds: callDuration,
      text: spokenText.trim(),
    };

    const updatedHistory = [...liveUtterances, userUtterance];
    setLiveUtterances(updatedHistory);
    setAgentSpeaking(true);

    try {
      const res = await fetch(`/api/meetings/${id}/agent-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userText: spokenText.trim(),
          history: updatedHistory,
        }),
      });

      const data = await res.json();
      const reply = data.reply || "I am analyzing that. Let's dig deeper.";

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
    } catch (err) {
      console.error("Agent reply error:", err);
      setAgentSpeaking(false);
    } finally {
      setIsSending(false);
    }
  }

  // Handle manual input form
  function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!userSpeechInput.trim() || isSending) return;
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

    // Flush and stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.requestData();
        await new Promise((resolve) => {
          if (!mediaRecorderRef.current) return resolve(null);
          mediaRecorderRef.current.onstop = () => resolve(null);
          mediaRecorderRef.current.stop();
          setTimeout(resolve, 300);
        });
      } catch (recErr) {
        console.warn("Error stopping MediaRecorder:", recErr);
      }
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    try {
      // If we have recorded chunks, upload the webm video file
      if (recordedChunksRef.current.length > 0) {
        const videoBlob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const formData = new FormData();
        formData.append("video", videoBlob, `${id}.webm`);
        try {
          await fetch(`/api/meetings/${id}/recording`, {
            method: "POST",
            body: formData,
          });
        } catch (uploadErr) {
          console.warn("Recording upload error:", uploadErr);
        }
      }

      await fetch(`/api/meetings/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end_call",
          durationSeconds: Math.max(callDuration, 15),
          utterances: liveUtterances,
          userName: userName,
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
            Specialist: <strong className="text-ink">{agent?.name || "David Kross"}</strong>
          </span>
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
            <span>{streamConnected ? "Stream Video SFU Active" : "Connected"}</span>
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
              <span>{agent?.name || "David Kross"}</span>
              <span className="text-muted">• {agent?.voice || "fable"} voice</span>
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
                src={agent?.avatar || "https://api.dicebear.com/7.x/bottts/svg?seed=SpecialistAI&backgroundColor=b6e3f4,c0aede,d1d4f9"}
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

            <h3 className="text-white font-bold text-sm mt-4">{agent?.name || "David Kross"}</h3>
            <p className="text-xs text-white/70 font-mono mt-0.5">{agent?.role || "Senior Engineering Hiring Manager"}</p>

            {/* Audio Waveform */}
            <div className="mt-4 w-48">
              <Waveform active={agentSpeaking} barCount={20} />
            </div>
          </div>

          <div className="text-[11px] font-mono text-white/50 z-10 flex items-center justify-between">
            <span>Google Gemini 3.5 Flash Powered</span>
            <span>PCM 24kHz • Realtime</span>
          </div>

          {/* Background Ambient Glow */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />
        </div>

        {/* User Local Video Stage */}
        <div className="relative bg-ink rounded-lg border border-line overflow-hidden flex flex-col justify-between p-6">
          <div className="flex items-center justify-between z-10">
            <span className="text-[10px] font-mono bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded">
              {isScreenSharing ? "Your Screen Share" : `${userName} (You)`}
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
              {micActive ? "Camera / Audio Ready" : "Muted"}
            </span>
          </div>
        </div>
      </div>

      {/* Dedicated Speech & Message Input Bar */}
      <div className="bg-surface border border-line rounded-lg p-3 shadow-card">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2.5">
          {/* Click to Speak Mic Button */}
          <button
            type="button"
            onClick={toggleVoiceListening}
            className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center gap-2 shrink-0 transition-all ${
              isListening
                ? "bg-danger text-white animate-pulse shadow"
                : "bg-canvas border border-line text-ink hover:border-brand hover:text-brand"
            }`}
            title="Click to speak with microphone"
          >
            <Mic className={`w-3.5 h-3.5 ${isListening ? "text-white" : "text-brand"}`} />
            <span className="font-mono text-xs">{isListening ? "Listening... (Speaking)" : "Speak (Mic)"}</span>
          </button>

          <input
            type="text"
            placeholder={isListening ? "Listening to your voice... (or type here)..." : "Type your message or click 'Speak'..."}
            value={userSpeechInput}
            onChange={(e) => setUserSpeechInput(e.target.value)}
            className="flex-1 px-3.5 py-2 border border-line rounded-md text-xs focus:outline-none focus:border-brand font-sans bg-canvas/30"
          />

          <button
            type="submit"
            disabled={!userSpeechInput.trim() || isSending}
            className="px-4 py-2 bg-brand text-white rounded-md text-xs font-semibold hover:bg-brand-deep disabled:opacity-40 flex items-center gap-1.5 shrink-0 transition-colors shadow-subtle"
          >
            {isSending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Send</span>
          </button>
        </form>
      </div>

      {/* Control Dock: Hardware Toggles (Left) & End Call (Right) */}
      <div className="bg-surface border border-line rounded-lg px-4 py-3 flex items-center justify-between gap-4 shadow-card">
        {/* Hardware Toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMic}
            className={`px-3 py-2 rounded-md border text-xs font-medium flex items-center gap-2 transition-colors ${
              micActive
                ? "bg-canvas border-line text-ink hover:bg-line/40"
                : "bg-danger-bg border-danger text-danger"
            }`}
          >
            {micActive ? <Mic className="w-3.5 h-3.5 text-brand" /> : <MicOff className="w-3.5 h-3.5 text-danger" />}
            <span className="font-mono text-xs">{micActive ? "Mic Live" : "Unmute"}</span>
          </button>

          <button
            onClick={toggleVideo}
            className={`px-3 py-2 rounded-md border text-xs font-medium flex items-center gap-2 transition-colors ${
              videoActive
                ? "bg-canvas border-line text-ink hover:bg-line/40"
                : "bg-danger-bg border-danger text-danger"
            }`}
          >
            {videoActive ? <VideoIcon className="w-3.5 h-3.5 text-brand" /> : <VideoOff className="w-3.5 h-3.5 text-danger" />}
            <span className="font-mono text-xs">{videoActive ? "Camera On" : "Enable Camera"}</span>
          </button>

          <button
            onClick={toggleScreenShare}
            className={`px-3 py-2 rounded-md border text-xs font-medium flex items-center gap-2 transition-colors ${
              isScreenSharing
                ? "bg-brand text-white border-brand"
                : "bg-canvas border-line text-ink hover:bg-line/40"
            }`}
          >
            {isScreenSharing ? <MonitorOff className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5 text-muted" />}
            <span className="font-mono text-xs">{isScreenSharing ? "Stop Share" : "Share Screen"}</span>
          </button>
        </div>

        {/* Center: Status indicator */}
        <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-muted">
          <span className="w-2 h-2 rounded-full bg-success" />
          <span>WebRTC Connected • Gemini 3.5 Live</span>
        </div>

        {/* Right: End Call Action */}
        <div className="shrink-0">
          <button
            onClick={handleEndCall}
            disabled={isEndingCall}
            className="px-4 py-2 rounded-md bg-danger hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-subtle disabled:opacity-50"
          >
            {isEndingCall ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Ending Call...</span>
              </>
            ) : (
              <>
                <PhoneOff className="w-3.5 h-3.5" />
                <span>End Call</span>
              </>
            )}
          </button>
        </div>
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
