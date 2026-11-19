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
  Square,
  Radio,
  Hand,
  RotateCcw,
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
  const liveUtterancesRef = useRef<TranscriptUtterance[]>([]);
  const [userSpeechInput, setUserSpeechInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("cloud-tts");
  const [voiceMode, setVoiceMode] = useState<"ptt" | "auto">("ptt");
  const [isPTTTalking, setIsPTTTalking] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const micActiveRef = useRef(micActive);
  const isListeningRef = useRef(isListening);
  const agentSpeakingRef = useRef(agentSpeaking);
  const isEndingCallRef = useRef(isEndingCall);
  const isSendingRef = useRef(isSending);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedSpeechRef = useRef<string>("");
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const voiceModeRef = useRef(voiceMode);
  const isPTTTalkingRef = useRef(isPTTTalking);
  const videoActiveRef = useRef(videoActive);
  const isScreenSharingRef = useRef(isScreenSharing);
  const meetingRef = useRef(meeting);
  const userNameRef = useRef(userName);
  const timeFormattedRef = useRef<string>("00:00");

  // Web Audio pipeline for studio-grade mixed dual-channel recording
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const activeBufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const agentAvatarImgRef = useRef<HTMLImageElement | null>(null);
  const recordingVideoElRef = useRef<HTMLVideoElement | null>(null);
  const hasGreetedRef = useRef(false);
  const speechSeqRef = useRef(0);
  const speechAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => { micActiveRef.current = micActive; }, [micActive]);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { agentSpeakingRef.current = agentSpeaking; }, [agentSpeaking]);
  useEffect(() => { isEndingCallRef.current = isEndingCall; }, [isEndingCall]);
  useEffect(() => { isSendingRef.current = isSending; }, [isSending]);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { isPTTTalkingRef.current = isPTTTalking; }, [isPTTTalking]);
  useEffect(() => { videoActiveRef.current = videoActive; }, [videoActive]);
  useEffect(() => { isScreenSharingRef.current = isScreenSharing; }, [isScreenSharing]);
  useEffect(() => { meetingRef.current = meeting; }, [meeting]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);

  // Preload agent avatar with explicit SVG dimensions for canvas compositor
  useEffect(() => {
    const avatarUrl = meeting?.agent?.avatar;
    if (!avatarUrl || typeof window === "undefined") return;

    if (avatarUrl.includes("dicebear.com") || avatarUrl.endsWith(".svg")) {
      fetch(avatarUrl)
        .then((r) => r.text())
        .then((svgText) => {
          let fixed = svgText;
          if (!fixed.includes("width=")) {
            fixed = fixed.replace("<svg ", '<svg width="200" height="200" ');
          }
          const blob = new Blob([fixed], { type: "image/svg+xml" });
          const blobUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            agentAvatarImgRef.current = img;
          };
          img.src = blobUrl;
        })
        .catch(() => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            agentAvatarImgRef.current = img;
          };
          img.src = avatarUrl;
        });
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        agentAvatarImgRef.current = img;
      };
      img.src = avatarUrl;
    }
  }, [meeting?.agent?.avatar]);

  // Load and cache available browser SpeechSynthesis voices
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    function populateVoices() {
      const all = window.speechSynthesis.getVoices();
      const en = all.filter((v) => v.lang.startsWith("en"));
      setBrowserVoices(en.length > 0 ? en : all);
    }

    populateVoices();
    window.speechSynthesis.onvoiceschanged = populateVoices;

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

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

  // Resolve the best natural human voice available
  function resolveVoice(): SpeechSynthesisVoice | null {
    if (browserVoices.length === 0) return null;

    if (selectedVoiceURI !== "auto" && selectedVoiceURI !== "cloud-tts") {
      const custom = browserVoices.find(
        (v) => v.voiceURI === selectedVoiceURI || v.name === selectedVoiceURI
      );
      if (custom) return custom;
    }

    const agentName = (meeting?.agent?.name || "").toLowerCase();
    const isFemale =
      agentName.includes("susan") ||
      agentName.includes("sarah") ||
      agentName.includes("maya") ||
      agentName.includes("elena") ||
      agentName.includes("clarke") ||
      meeting?.agent?.voice === "shimmer";

    if (isFemale) {
      const femaleNatural = browserVoices.find(
        (v) =>
          (v.name.includes("Jenny") && v.name.includes("Natural")) ||
          (v.name.includes("Aria") && v.name.includes("Natural")) ||
          v.name === "Google US English" ||
          (v.name.includes("Google") && v.name.toLowerCase().includes("female")) ||
          (v.name.includes("Natural") && !v.name.includes("Guy") && !v.name.includes("Christopher")) ||
          v.name.includes("Zira")
      );
      if (femaleNatural) return femaleNatural;
    } else {
      const maleNatural = browserVoices.find(
        (v) =>
          (v.name.includes("Guy") && v.name.includes("Natural")) ||
          (v.name.includes("Christopher") && v.name.includes("Natural")) ||
          (v.name.includes("Google") && v.name.toLowerCase().includes("male")) ||
          (v.name.includes("Natural") && !v.name.includes("Jenny") && !v.name.includes("Aria")) ||
          v.name.includes("David")
      );
      if (maleNatural) return maleNatural;
    }

    // Fallback: any voice containing Natural, Neural, or Google
    const anyNatural = browserVoices.find(
      (v) =>
        v.name.includes("Natural") ||
        v.name.includes("Neural") ||
        v.name.includes("Google")
    );
    return anyNatural || browserVoices[0] || null;
  }

  function getOrCreateAudioContext(): {
    audioCtx: AudioContext;
    audioDest: MediaStreamAudioDestinationNode;
  } | null {
    if (typeof window === "undefined") return null;
    try {
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return null;
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        const dest = ctx.createMediaStreamDestination();
        audioDestinationRef.current = dest;
      }
      return {
        audioCtx: audioContextRef.current,
        audioDest: audioDestinationRef.current!,
      };
    } catch {
      return null;
    }
  }

  // Play spoken response via Neural Cloud Voice (with echo-cancellation & deduplication)
  async function speakWithSyntheticVoice(text: string) {
    if (!voiceAudioEnabled || typeof window === "undefined" || !text.trim()) {
      setAgentSpeaking(false);
      agentSpeakingRef.current = false;
      return;
    }

    // 1. Advance speech sequence token to invalidate any previous in-flight speech
    const speechId = ++speechSeqRef.current;

    // 2. Abort any previous in-flight TTS fetch immediately
    if (speechAbortControllerRef.current) {
      try { speechAbortControllerRef.current.abort(); } catch {}
      speechAbortControllerRef.current = null;
    }
    const abortController = new AbortController();
    speechAbortControllerRef.current = abortController;

    // 3. Immediately halt any currently playing audio so voices never overlap or echo
    if (activeBufferSourceRef.current) {
      try {
        activeBufferSourceRef.current.stop();
        activeBufferSourceRef.current = null;
      } catch {}
    }
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = "";
        activeAudioRef.current = null;
      } catch {}
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    // 4. Mute speech recognition while agent speaks to prevent laptop mic acoustic echo loop
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    setIsListening(false);
    isListeningRef.current = false;

    // If a custom desktop browser voice is explicitly chosen from the dropdown:
    if (selectedVoiceURI !== "auto" && selectedVoiceURI !== "cloud-tts") {
      const voice = resolveVoice();
      speakWithBrowserVoice(text, voice);
      return;
    }

    const agentVoice = meetingRef.current?.agent?.voice || "alloy";

    try {
      setAgentSpeaking(true);
      agentSpeakingRef.current = true;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      const res = await fetch(
        `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(agentVoice)}`,
        { signal: abortController.signal }
      );
      if (!res.ok) throw new Error(`TTS status ${res.status}`);

      // Check if another speech superseded this one while downloading
      if (speechSeqRef.current !== speechId) return;

      const arrayBuffer = await res.arrayBuffer();
      if (speechSeqRef.current !== speechId) return;

      const audioNodes = getOrCreateAudioContext();
      if (audioNodes && audioNodes.audioCtx.state !== "closed") {
        const { audioCtx, audioDest } = audioNodes;
        if (audioCtx.state === "suspended") {
          try {
            await audioCtx.resume();
          } catch {}
        }

        if (audioCtx.state === "running") {
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          if (speechSeqRef.current !== speechId) return;

          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;

          // Output to user physical speakers
          source.connect(audioCtx.destination);
          // Output to MediaRecorder destination for meeting recording
          source.connect(audioDest);

          activeBufferSourceRef.current = source;

          source.onended = () => {
            if (speechSeqRef.current !== speechId) return;
            setAgentSpeaking(false);
            agentSpeakingRef.current = false;
            accumulatedSpeechRef.current = "";
            setUserSpeechInput("");

            // 300ms acoustic decay delay before reopening microphone
            setTimeout(() => {
              if (
                speechSeqRef.current === speechId &&
                micActiveRef.current &&
                !isEndingCallRef.current &&
                !isListeningRef.current &&
                !agentSpeakingRef.current
              ) {
                try {
                  recognitionRef.current?.start();
                } catch {}
              }
            }, 300);
          };

          source.start(0);
          return;
        }
      }

      // Fallback: HTML5 Audio if AudioContext is not yet running
      const blob = new Blob([arrayBuffer], { type: "audio/mp3" });
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      activeAudioRef.current = audio;

      audio.onended = () => {
        if (speechSeqRef.current !== speechId) return;
        setAgentSpeaking(false);
        agentSpeakingRef.current = false;
        accumulatedSpeechRef.current = "";
        setUserSpeechInput("");
        URL.revokeObjectURL(audioUrl);

        setTimeout(() => {
          if (
            speechSeqRef.current === speechId &&
            micActiveRef.current &&
            !isEndingCallRef.current &&
            !isListeningRef.current &&
            !agentSpeakingRef.current
          ) {
            try {
              recognitionRef.current?.start();
            } catch {}
          }
        }, 300);
      };

      audio.onerror = () => {
        if (speechSeqRef.current !== speechId) return;
        setAgentSpeaking(false);
        agentSpeakingRef.current = false;
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      console.warn("Speech synthesis notice:", e);
      if (speechSeqRef.current === speechId) {
        setAgentSpeaking(false);
        agentSpeakingRef.current = false;
      }
    }
  }

  function speakWithBrowserVoice(
    text: string,
    voice: SpeechSynthesisVoice | null
  ) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setAgentSpeaking(false);
      agentSpeakingRef.current = false;
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) {
        utterance.voice = voice;
      }
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        setAgentSpeaking(true);
        agentSpeakingRef.current = true;
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      };

      utterance.onend = () => {
        setAgentSpeaking(false);
        agentSpeakingRef.current = false;
        accumulatedSpeechRef.current = "";
        setUserSpeechInput("");
        if (
          micActiveRef.current &&
          !isEndingCallRef.current &&
          !isListeningRef.current
        ) {
          try {
            recognitionRef.current?.start();
          } catch {}
        }
      };

      utterance.onerror = () => {
        setAgentSpeaking(false);
        agentSpeakingRef.current = false;
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis error:", e);
      setAgentSpeaking(false);
      agentSpeakingRef.current = false;
    }
  }

  function previewVoice() {
    const agentName = meeting?.agent?.name || "AI Specialist";
    speakWithSyntheticVoice(
      `Hello! I am ${agentName}. This is how my voice sounds in our live session.`
    );
  }

  // Load meeting & Stream credentials
  useEffect(() => {
    async function loadMeeting() {
      try {
        const res = await fetch(`/api/meetings/${id}`);
        const data = await res.json();
        if (data.meeting) {
          setMeeting(data.meeting);

          // Only speak greeting once per room session to eliminate double-greeting echo
          if (!hasGreetedRef.current) {
            hasGreetedRef.current = true;
            const agentName = data.meeting.agent?.name || "AI Specialist";
            const initGreeting = `Hello! I am ${agentName}. What would you like to review or discuss today?`;

            const initUtterance: TranscriptUtterance = {
              id: `u-init-${Date.now()}`,
              speaker: "agent",
              speakerName: agentName,
              timestamp: "00:02",
              seconds: 2,
              text: initGreeting,
            };
            liveUtterancesRef.current = [initUtterance];
            setLiveUtterances([initUtterance]);
            speakWithSyntheticVoice(initGreeting);
          }
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
      speechSeqRef.current++;
      if (speechAbortControllerRef.current) {
        try { speechAbortControllerRef.current.abort(); } catch {}
        speechAbortControllerRef.current = null;
      }
      if (activeBufferSourceRef.current) {
        try {
          activeBufferSourceRef.current.stop();
          activeBufferSourceRef.current = null;
        } catch {}
      }
      if (activeAudioRef.current) {
        try {
          activeAudioRef.current.pause();
          activeAudioRef.current.src = "";
          activeAudioRef.current = null;
        } catch {}
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [id]);

  // Instant Interrupt: Stops agent speech, clears pending requests, and frees mic
  function interruptAgent() {
    speechSeqRef.current++;
    if (speechAbortControllerRef.current) {
      try { speechAbortControllerRef.current.abort(); } catch {}
      speechAbortControllerRef.current = null;
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (abortControllerRef.current) {
      try { abortControllerRef.current.abort(); } catch {}
      abortControllerRef.current = null;
    }
    if (activeBufferSourceRef.current) {
      try {
        activeBufferSourceRef.current.stop();
        activeBufferSourceRef.current = null;
      } catch {}
    }
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = "";
        activeAudioRef.current = null;
      } catch {}
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setAgentSpeaking(false);
    agentSpeakingRef.current = false;
    setIsSending(false);
    isSendingRef.current = false;
    accumulatedSpeechRef.current = "";
    setUserSpeechInput("");
  }

  // Push-to-Talk handlers
  function handlePTTStart() {
    if (isPTTTalkingRef.current) return;
    if (agentSpeakingRef.current || isSendingRef.current) {
      interruptAgent();
    }
    setIsPTTTalking(true);
    isPTTTalkingRef.current = true;
    accumulatedSpeechRef.current = "";
    setUserSpeechInput("");

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      setTimeout(() => {
        try { recognitionRef.current?.start(); } catch {}
      }, 50);
    }
  }

  function handlePTTEnd() {
    if (!isPTTTalkingRef.current) return;
    setIsPTTTalking(false);
    isPTTTalkingRef.current = false;

    // Capture the completed speech - buffer 400ms so final speech tokens are never clipped
    setTimeout(() => {
      const textToSend = accumulatedSpeechRef.current.trim() || userSpeechInput.trim();
      if (textToSend.length > 0) {
        accumulatedSpeechRef.current = "";
        setUserSpeechInput("");
        processSpokenInput(textToSend);
      }
    }, 400);
  }

  // Hotkeys: Spacebar for Push-to-Talk, Escape for Interrupt
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        interruptAgent();
        return;
      }
      if (
        e.code === "Space" &&
        voiceModeRef.current === "ptt" &&
        !isPTTTalkingRef.current &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        handlePTTStart();
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (
        e.code === "Space" &&
        voiceModeRef.current === "ptt" &&
        isPTTTalkingRef.current &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        handlePTTEnd();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Canvas drawing helpers for 1280x720 split-screen composite recording
  function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === "function") {
      (ctx as any).roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawCover(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    dx: number,
    dy: number,
    dWidth: number,
    dHeight: number,
    mirror: boolean
  ) {
    const vW = video.videoWidth;
    const vH = video.videoHeight;
    if (!vW || !vH) return;

    const vRatio = vW / vH;
    const dRatio = dWidth / dHeight;
    let sW = vW;
    let sH = vH;
    let sx = 0;
    let sy = 0;

    if (vRatio > dRatio) {
      sW = vH * dRatio;
      sx = (vW - sW) / 2;
    } else {
      sH = vW / dRatio;
      sy = (vH - sH) / 2;
    }

    ctx.save();
    if (mirror) {
      ctx.translate(dx + dWidth, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(video, sx, sy, sW, sH, 0, 0, dWidth, dHeight);
    } else {
      ctx.drawImage(video, sx, sy, sW, sH, dx, dy, dWidth, dHeight);
    }
    ctx.restore();
  }

  function drawCompositeFrame(ctx: CanvasRenderingContext2D, timestamp: number) {
    // 1. Full Zoom Stage Backdrop
    ctx.fillStyle = "#0F1216";
    ctx.fillRect(0, 0, 1280, 720);

    const specialistName = meetingRef.current?.agent?.name || "Susan";
    const agentRole = meetingRef.current?.agent?.role || "Specialist Advisor";
    const userDisplayName = userNameRef.current || "You";

    // 2. Left Box: AI Specialist (Zoom Gallery View)
    const isSpeaking = agentSpeakingRef.current;
    ctx.save();
    drawRoundedRect(ctx, 20, 20, 610, 680, 12);
    ctx.fillStyle = "#1A1E24";
    ctx.fill();

    // Active speaker highlight border
    if (isSpeaking) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#10B981"; // Zoom green speaker border
    } else {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#2A313C";
    }
    ctx.stroke();
    ctx.clip(); // Clip contents to left box

    // Ambient glow when speaking
    if (isSpeaking) {
      const glow = ctx.createRadialGradient(325, 330, 40, 325, 330, 280);
      glow.addColorStop(0, "rgba(16, 185, 129, 0.22)");
      glow.addColorStop(1, "rgba(26, 30, 36, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(20, 20, 610, 680);
    }

    // Specialist Avatar
    const sCx = 325;
    const sCy = 320;
    const sRadius = 90;

    // Glowing halo behind avatar when speaking
    if (isSpeaking) {
      const haloR = sRadius + 8 + 6 * Math.sin(timestamp * 0.008);
      ctx.beginPath();
      ctx.arc(sCx, sCy, haloR, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(16, 185, 129, 0.6)";
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // Circular Avatar Image or High-Res Specialist Fallback
    ctx.save();
    ctx.beginPath();
    ctx.arc(sCx, sCy, sRadius, 0, Math.PI * 2);
    ctx.clip();

    const domImg =
      typeof document !== "undefined"
        ? (document.getElementById("agent-avatar-img") as HTMLImageElement | null)
        : null;
    const preloadedImg = agentAvatarImgRef.current;
    const avatarImg =
      domImg && domImg.complete && domImg.naturalWidth > 0
        ? domImg
        : preloadedImg && preloadedImg.complete && preloadedImg.naturalWidth > 0
        ? preloadedImg
        : null;

    if (avatarImg) {
      try {
        ctx.drawImage(avatarImg, sCx - sRadius, sCy - sRadius, sRadius * 2, sRadius * 2);
      } catch {
        // Fallback avatar background with initial
        const avatarGrad = ctx.createLinearGradient(sCx - sRadius, sCy - sRadius, sCx + sRadius, sCy + sRadius);
        avatarGrad.addColorStop(0, "#2563EB");
        avatarGrad.addColorStop(1, "#1E40AF");
        ctx.fillStyle = avatarGrad;
        ctx.fillRect(sCx - sRadius, sCy - sRadius, sRadius * 2, sRadius * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 52px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(specialistName.charAt(0).toUpperCase() || "S", sCx, sCy);
      }
    } else {
      // Zoom-style stylish initials badge
      const avatarGrad = ctx.createLinearGradient(sCx - sRadius, sCy - sRadius, sCx + sRadius, sCy + sRadius);
      avatarGrad.addColorStop(0, "#2563EB");
      avatarGrad.addColorStop(1, "#1E40AF");
      ctx.fillStyle = avatarGrad;
      ctx.fillRect(sCx - sRadius, sCy - sRadius, sRadius * 2, sRadius * 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 52px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(specialistName.charAt(0).toUpperCase() || "S", sCx, sCy);
    }
    ctx.restore();

    // Avatar border ring
    ctx.beginPath();
    ctx.arc(sCx, sCy, sRadius, 0, Math.PI * 2);
    ctx.strokeStyle = isSpeaking ? "#10B981" : "#3B4553";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Specialist Name under avatar
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
    ctx.fillText(specialistName, sCx, 445);

    ctx.fillStyle = "#94A3B8";
    ctx.font = "14px ui-monospace, monospace";
    ctx.fillText(agentRole, sCx, 470);

    // Dynamic 22-bar Soundwave
    const barCount = 22;
    const barW = 5;
    const barG = 5;
    const totalWaveW = barCount * barW + (barCount - 1) * barG;
    const waveX = sCx - totalWaveW / 2;
    const waveY = 525;

    for (let i = 0; i < barCount; i++) {
      let bH = 4;
      if (isSpeaking) {
        const wave = Math.abs(Math.sin(timestamp * 0.007 + i * 0.42));
        bH = 8 + wave * 32;
      }
      const bx = waveX + i * (barW + barG);
      const by = waveY - bH / 2;
      ctx.fillStyle = isSpeaking ? "#10B981" : "#374151";
      drawRoundedRect(ctx, bx, by, barW, bH, 2.5);
      ctx.fill();
    }

    // Zoom Bottom-Left Name Overlay
    const sNameTag = `${specialistName} (${agentRole})`;
    ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
    const sTagWidth = ctx.measureText(sNameTag).width + 36;

    ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
    drawRoundedRect(ctx, 34, 650, sTagWidth, 32, 6);
    ctx.fill();

    // Small status dot
    ctx.beginPath();
    ctx.arc(48, 666, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = isSpeaking ? "#10B981" : "#94A3B8";
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText(sNameTag, 60, 671);

    // Zoom Top-Right Speaking Pill
    if (isSpeaking) {
      ctx.fillStyle = "#10B981";
      drawRoundedRect(ctx, 514, 34, 102, 26, 6);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
      ctx.fillText("🔊 Speaking", 526, 51);
    }

    ctx.restore(); // End Left Box

    // 3. Right Box: User Live Webcam Feed (Zoom Gallery View)
    const isUserTalking = isPTTTalkingRef.current;
    ctx.save();
    drawRoundedRect(ctx, 650, 20, 610, 680, 12);
    ctx.fillStyle = "#1A1E24";
    ctx.fill();

    if (isUserTalking) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#10B981"; // User speaking highlight
    } else {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#2A313C";
    }
    ctx.stroke();
    ctx.clip(); // Clip to right box

    const recVideo =
      recordingVideoElRef.current &&
      recordingVideoElRef.current.readyState >= 2 &&
      recordingVideoElRef.current.videoWidth > 0
        ? recordingVideoElRef.current
        : localVideoRef.current &&
          localVideoRef.current.readyState >= 2 &&
          localVideoRef.current.videoWidth > 0
        ? localVideoRef.current
        : null;

    const hasVideo = videoActiveRef.current && !!recVideo;

    if (hasVideo && recVideo) {
      // Real live camera feed, crisp cover crop, mirrored horizontally (just like Zoom!)
      try {
        drawCover(
          ctx,
          recVideo,
          650,
          20,
          610,
          680,
          !isScreenSharingRef.current
        );
      } catch {
        ctx.fillStyle = "#161A20";
        ctx.fillRect(650, 20, 610, 680);
      }
    } else {
      // Zoom-style user camera off state
      ctx.fillStyle = "#161A20";
      ctx.fillRect(650, 20, 610, 680);

      const uCx = 955;
      const uCy = 330;
      const uRadius = 80;

      const userGrad = ctx.createLinearGradient(uCx - uRadius, uCy - uRadius, uCx + uRadius, uCy + uRadius);
      userGrad.addColorStop(0, "#475569");
      userGrad.addColorStop(1, "#1E293B");
      ctx.fillStyle = userGrad;
      ctx.beginPath();
      ctx.arc(uCx, uCy, uRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#64748B";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 46px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const uInitial = userDisplayName.charAt(0).toUpperCase() || "U";
      ctx.fillText(uInitial, uCx, uCy);

      ctx.textBaseline = "alphabetic";
      ctx.font = "14px ui-monospace, monospace";
      ctx.fillStyle = "#94A3B8";
      ctx.fillText(videoActiveRef.current ? "Connecting Camera..." : "Camera Off", uCx, 445);
    }

    // Zoom Bottom-Left Name Tag for User
    const uNameTag = `${userDisplayName} (You)`;
    ctx.font = "bold 13px system-ui, -apple-system, sans-serif";
    const uTagWidth = ctx.measureText(uNameTag).width + 36;

    ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
    drawRoundedRect(ctx, 664, 650, uTagWidth, 32, 6);
    ctx.fill();

    // Mic indicator dot
    ctx.beginPath();
    ctx.arc(678, 666, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = micActiveRef.current ? "#10B981" : "#EF4444";
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText(uNameTag, 690, 671);

    // Zoom Top-Right User Speaking Pill (when PTT is active)
    if (isUserTalking) {
      ctx.fillStyle = "#10B981";
      drawRoundedRect(ctx, 1144, 34, 102, 26, 6);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
      ctx.fillText("🎙️ Talking", 1158, 51);
    }

    ctx.restore(); // End Right Box
  }

  // Request user camera/mic for local preview and composite multi-track recording
  useEffect(() => {
    async function startCamera() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          let stream: MediaStream;
          try {
            // Request crisp 1080p/720p HD webcam with echo cancellation & noise suppression
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1920, min: 1280 },
                height: { ideal: 1080, min: 720 },
                frameRate: { ideal: 30, min: 24 },
                facingMode: "user",
              },
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });
          }
          mediaStreamRef.current = stream;
          if (localVideoRef.current && !isScreenSharing) {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.play().catch(() => {});
          }

          // Dedicated video element to reliably feed frames to recording canvas compositor
          const recVideo = document.createElement("video");
          recVideo.muted = true;
          recVideo.playsInline = true;
          recVideo.autoplay = true;
          recVideo.srcObject = stream;
          recVideo.play().catch(() => {});
          recordingVideoElRef.current = recVideo;

          // 1. Initialize Web Audio Context for Dual-Channel Mixed Recording
          const audioNodes = getOrCreateAudioContext();
          const audioCtx = audioNodes?.audioCtx;
          const audioDest = audioNodes?.audioDest;

          // Connect user mic stream into the recorder destination (NOT into speakers to prevent feedback)
          if (audioCtx && audioDest && stream.getAudioTracks().length > 0) {
            try {
              const micSource = audioCtx.createMediaStreamSource(stream);
              micSource.connect(audioDest);
            } catch (micErr) {
              console.warn("Could not connect mic to audio destination:", micErr);
            }
          }

          // Resume audio context on interaction if suspended by browser autoplay policy
          const unlockAudio = () => {
            if (audioCtx && audioCtx.state === "suspended") {
              audioCtx.resume();
            }
            window.removeEventListener("click", unlockAudio);
            window.removeEventListener("keydown", unlockAudio);
          };
          window.addEventListener("click", unlockAudio);
          window.addEventListener("keydown", unlockAudio);

          // 2. Initialize 1280x720 Canvas for Composite Zoom Split-Screen Meeting Video
          let canvas = recordingCanvasRef.current;
          if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.width = 1280;
            canvas.height = 720;
            recordingCanvasRef.current = canvas;
          }
          const ctx = canvas.getContext("2d", { alpha: false });

          function renderLoop(now: number) {
            if (ctx) {
              drawCompositeFrame(ctx, now);
            }
            animFrameIdRef.current = requestAnimationFrame(renderLoop);
          }
          animFrameIdRef.current = requestAnimationFrame(renderLoop);

          // 3. Capture 30 FPS Video Stream from Canvas
          const canvasStream = canvas.captureStream(30);

          // 4. Combine Composite Video Track + Mixed Audio Track (User Mic + Agent Voice)
          const mixedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...(audioDest ? audioDest.stream.getAudioTracks() : stream.getAudioTracks()),
          ]);

          // 5. Initialize MediaRecorder on Mixed Stream for Dual Video + Audio Recording
          if (typeof window !== "undefined" && typeof MediaRecorder !== "undefined") {
            try {
              // Prioritize VP8+Opus for maximum reliability and zero alpha/header corruption
              let mimeType = "video/webm;codecs=vp8,opus";
              if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = "video/webm;codecs=h264,opus";
              }
              if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = "video/webm";
              }

              const recorder = new MediaRecorder(mixedStream, {
                mimeType,
                videoBitsPerSecond: 2500000,
              });
              recordedChunksRef.current = [];

              recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                  recordedChunksRef.current.push(event.data);
                }
              };

              recorder.start(1000);
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
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {}
      }
    };
  }, []);

  // Ensure local video element stays attached and playing when room mounts or stream changes
  useEffect(() => {
    if (localVideoRef.current) {
      const activeStream = isScreenSharing ? screenStreamRef.current : mediaStreamRef.current;
      if (activeStream && localVideoRef.current.srcObject !== activeStream) {
        localVideoRef.current.srcObject = activeStream;
        localVideoRef.current.play().catch(() => {});
      }
    }
  }, [meeting, isScreenSharing, videoActive]);

  // Continuous Hands-Free Voice Recognition Engine
  function startContinuousListening() {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("SpeechRecognition API not available in this browser environment.");
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
        isListeningRef.current = true;
      };

      recognition.onresult = (event: any) => {
        // Echo suppression: ignore microphone while the AI agent is speaking or responding
        if (agentSpeakingRef.current || isSendingRef.current || !micActiveRef.current) {
          return;
        }

        // In PTT mode, only capture speech when user is actively holding to speak
        if (voiceModeRef.current === "ptt" && !isPTTTalkingRef.current) {
          return;
        }

        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        const recognizedText = (final || interim).trim();
        if (recognizedText) {
          setUserSpeechInput(recognizedText);
          accumulatedSpeechRef.current = recognizedText;

          // Only in Auto mode do we auto-dispatch with 1.8s silence window
          if (voiceModeRef.current === "auto") {
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
            }

            // Natural 1.8s conversational pause so user can formulate complete thoughts without getting cut off
            silenceTimerRef.current = setTimeout(() => {
              const textToSend = accumulatedSpeechRef.current.trim();
              const words = textToSend.split(/\s+/).filter(Boolean);
              if (
                words.length >= 2 &&
                textToSend.length >= 5 &&
                !isSendingRef.current &&
                !agentSpeakingRef.current &&
                micActiveRef.current
              ) {
                accumulatedSpeechRef.current = "";
                setUserSpeechInput("");
                processSpokenInput(textToSend);
              }
            }, 1800);
          }
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error !== "no-speech") {
          console.warn("Speech recognition notice:", e.error);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        isListeningRef.current = false;
        // Keep listening alive continuously as long as mic is unmuted and call is ongoing
        if (micActiveRef.current && !isEndingCallRef.current) {
          setTimeout(() => {
            if (
              micActiveRef.current &&
              !isEndingCallRef.current &&
              !isListeningRef.current &&
              !agentSpeakingRef.current
            ) {
              try {
                recognition.start();
              } catch {}
            }
          }, 300);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn("Failed starting continuous speech recognition:", e);
      setIsListening(false);
      isListeningRef.current = false;
    }
  }

  // Start continuous listening automatically on call entrance
  useEffect(() => {
    startContinuousListening();

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  // Hardware Mic toggle (mutes/unmutes physical microphone track & pauses/resumes listening)
  function toggleMic() {
    const next = !micActive;
    setMicActive(next);
    micActiveRef.current = next;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
    }

    if (!next) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      setIsListening(false);
      isListeningRef.current = false;
    } else {
      startContinuousListening();
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
          localVideoRef.current.play().catch(() => {});
        }
        if (recordingVideoElRef.current) {
          recordingVideoElRef.current.srcObject = screenStream;
          recordingVideoElRef.current.play().catch(() => {});
        }
        setIsScreenSharing(true);
        isScreenSharingRef.current = true;

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
      localVideoRef.current.play().catch(() => {});
    }
    if (recordingVideoElRef.current && mediaStreamRef.current) {
      recordingVideoElRef.current.srcObject = mediaStreamRef.current;
      recordingVideoElRef.current.play().catch(() => {});
    }
    setIsScreenSharing(false);
    isScreenSharingRef.current = false;
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
  timeFormattedRef.current = timeFormatted;

  // Process User Speech & Generate In-Character Agent Response
  async function processSpokenInput(spokenText: string) {
    if (!spokenText.trim() || isSendingRef.current || isEndingCallRef.current) return;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setIsSending(true);
    isSendingRef.current = true;
    const agentName = meeting?.agent?.name || "AI Specialist";

    const userUtterance: TranscriptUtterance = {
      id: `u-user-${Date.now()}`,
      speaker: "user",
      speakerName: `${userName} (You)`,
      timestamp: timeFormatted,
      seconds: callDuration,
      text: spokenText.trim(),
    };

    liveUtterancesRef.current = [...liveUtterancesRef.current, userUtterance];
    setLiveUtterances([...liveUtterancesRef.current]);
    const updatedHistory = [...liveUtterancesRef.current];

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const timeoutId = setTimeout(() => {
      try { abortController.abort(); } catch {}
    }, 6000);

    try {
      const res = await fetch(`/api/meetings/${id}/agent-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          userText: spokenText.trim(),
          history: updatedHistory,
        }),
      });

      clearTimeout(timeoutId);
      if (isEndingCallRef.current) return;

      const data = await res.json().catch(() => ({}));
      const reply =
        data.reply ||
        `I hear your question clearly! Let's explore that together. What would you like to review first?`;

      const agentUtterance: TranscriptUtterance = {
        id: `u-agent-${Date.now()}`,
        speaker: "agent",
        speakerName: agentName,
        timestamp: `${Math.floor((callDuration + 2) / 60).toString().padStart(2, "0")}:${((callDuration + 2) % 60).toString().padStart(2, "0")}`,
        seconds: callDuration + 2,
        text: reply,
      };

      if (!isEndingCallRef.current) {
        liveUtterancesRef.current = [...liveUtterancesRef.current, agentUtterance];
        setLiveUtterances([...liveUtterancesRef.current]);
        speakWithSyntheticVoice(reply);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (isEndingCallRef.current) return;
      console.warn("Agent reply notice:", err?.message || err);

      const lower = spokenText.toLowerCase();
      let fallbackReply = `That is an insightful question about ${spokenText.slice(0, 35)}! Focusing on the foundational principles and real-world application gives you the clearest solution. Let us explore that together!`;

      if (lower.includes("emotion") || lower.includes("feel") || lower.includes("express") || lower.includes("conversat")) {
        fallbackReply = `To express emotion effectively in everyday conversations, anchor your message in the personal impact behind the facts rather than just the information itself. Naming your authentic emotions with sincerity creates genuine presence and deep human connection!`;
      } else if (lower.includes("pythagor") || lower.includes("triangle")) {
        fallbackReply = `The Pythagorean theorem tells us that a squared plus b squared equals c squared for right-angled triangles. For example, in a triangle with sides three and four, three squared is nine and four squared is sixteen, which adds to twenty-five, making the hypotenuse five!`;
      }

      const fallbackAgentUtterance: TranscriptUtterance = {
        id: `u-agent-${Date.now()}`,
        speaker: "agent",
        speakerName: agentName,
        timestamp: timeFormatted,
        seconds: callDuration + 2,
        text: fallbackReply,
      };

      liveUtterancesRef.current = [...liveUtterancesRef.current, fallbackAgentUtterance];
      setLiveUtterances([...liveUtterancesRef.current]);
      speakWithSyntheticVoice(fallbackReply);
    } finally {
      setIsSending(false);
      isSendingRef.current = false;
      abortControllerRef.current = null;
    }
  }

  // Handle manual input form
  function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!userSpeechInput.trim() || isSending) return;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    accumulatedSpeechRef.current = "";
    const txt = userSpeechInput;
    setUserSpeechInput("");
    processSpokenInput(txt);
  }

  // End Call & trigger Inngest
  async function handleEndCall() {
    setIsEndingCall(true);
    isEndingCallRef.current = true;
    speechSeqRef.current++;

    if (speechAbortControllerRef.current) {
      try { speechAbortControllerRef.current.abort(); } catch {}
      speechAbortControllerRef.current = null;
    }
    if (abortControllerRef.current) {
      try { abortControllerRef.current.abort(); } catch {}
      abortControllerRef.current = null;
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (activeBufferSourceRef.current) {
      try {
        activeBufferSourceRef.current.stop();
        activeBufferSourceRef.current = null;
      } catch {}
    }
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = "";
        activeAudioRef.current = null;
      } catch {}
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    setAgentSpeaking(false);
    agentSpeakingRef.current = false;
    setIsSending(false);
    isSendingRef.current = false;

    // Stop canvas animation loop
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    // Flush and cleanly stop MediaRecorder before tearing down media tracks
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        await new Promise<void>((resolve) => {
          if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
            resolve();
            return;
          }
          mediaRecorderRef.current.onstop = () => resolve();
          try {
            mediaRecorderRef.current.requestData();
            mediaRecorderRef.current.stop();
          } catch {
            resolve();
          }
          setTimeout(resolve, 600);
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
    if (recordingVideoElRef.current) {
      try {
        recordingVideoElRef.current.srcObject = null;
      } catch {}
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
          utterances: liveUtterancesRef.current.length > 0 ? liveUtterancesRef.current : liveUtterances,
          userName: userName,
        }),
      });

      window.location.href = `/meeting/${id}/summary`;
    } catch (err) {
      console.error(err);
      window.location.href = `/meeting/${id}/summary`;
    }
  }

  if (!meeting) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center p-8 text-center bg-surface border border-line rounded-lg shadow-subtle space-y-4">
        <div className="w-16 h-16 rounded-full bg-brand-light text-brand flex items-center justify-center animate-pulse">
          <Sparkles className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-ink">Connecting to AI Specialist Room...</h2>
          <p className="text-xs text-muted font-mono flex items-center justify-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
            <span>Establishing WebRTC &amp; Neural Audio Channels</span>
          </p>
        </div>
      </div>
    );
  }

  const agent = meeting.agent;

  return (
    <div className="space-y-4 relative">
      {/* Full-Screen Ending Transition Loader */}
      {isEndingCall && (
        <div className="fixed inset-0 z-50 bg-canvas/92 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
          <div className="bg-surface border border-line rounded-xl shadow-card p-8 max-w-md w-full flex flex-col items-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-brand-light text-brand flex items-center justify-center animate-pulse">
              <Sparkles className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-ink tracking-tight">
                Your meeting details are on the way...
              </h2>
              <p className="text-xs text-muted font-mono flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                <span>Finalizing HD recording &amp; AI intelligence suite</span>
              </p>
            </div>
            <div className="w-full bg-canvas rounded-full h-1.5 overflow-hidden border border-line mt-2">
              <div className="bg-brand h-full rounded-full animate-pulse w-3/4 transition-all duration-1000" />
            </div>
          </div>
        </div>
      )}

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
            Specialist: <strong className="text-ink">{agent?.name || "AI Specialist"}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Natural Voice Selector */}
          <div className="flex items-center gap-1.5 bg-canvas border border-line rounded px-2 py-1 text-[11px] font-mono">
            <Sparkles className="w-3.5 h-3.5 text-brand" />
            <select
              value={selectedVoiceURI}
              onChange={(e) => setSelectedVoiceURI(e.target.value)}
              className="bg-transparent text-ink text-xs font-semibold focus:outline-none cursor-pointer max-w-[150px] truncate"
              title="Select Voice Synthesis Engine"
            >
              <option value="auto">✨ Auto Natural Neural</option>
              <option value="cloud-tts">🌐 Google Neural (Free API)</option>
              {browserVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name.includes("Natural") || v.name.includes("Google") ? "🌟 " : "🗣️ "}
                  {v.name.replace("Microsoft ", "").replace(" - English (United States)", "")}
                </option>
              ))}
            </select>
            <button
              onClick={previewVoice}
              type="button"
              className="ml-1 text-[10px] text-brand hover:underline font-bold px-1.5 py-0.5 rounded bg-brand-light hover:bg-brand/20 transition-colors"
              title="Test agent speaking voice"
            >
              Test
            </button>
          </div>

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
              <span>{agent?.name || "AI Specialist"}</span>
              <span className="text-white/60">
                •{" "}
                {agent?.voice
                  ? `${agent.voice.charAt(0).toUpperCase() + agent.voice.slice(1)} Voice`
                  : "Neural Voice"}
              </span>
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
                id="agent-avatar-img"
                crossOrigin="anonymous"
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

            <h3 className="text-white font-bold text-sm mt-4">{agent?.name || "AI Specialist"}</h3>
            <p className="text-xs text-white/70 font-mono mt-0.5">{agent?.role || "Specialist Advisor"}</p>

            {/* Audio Waveform */}
            <div className="mt-4 w-48">
              <Waveform active={agentSpeaking} barCount={20} />
            </div>
          </div>

          <div className="text-[11px] font-mono text-white/50 z-10 flex items-center justify-between">
            <span>Google Gemini 3.1 Flash Powered</span>
            <span>Ultra Low-Latency • Neural Voice</span>
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
                ref={(el) => {
                  localVideoRef.current = el;
                  if (el) {
                    const activeStream = isScreenSharingRef.current
                      ? screenStreamRef.current
                      : mediaStreamRef.current;
                    if (activeStream && el.srcObject !== activeStream) {
                      el.srcObject = activeStream;
                      el.play().catch(() => {});
                    }
                  }
                }}
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
      <div className="bg-surface border border-line rounded-lg p-3.5 shadow-card space-y-3">
        {/* Top Control Bar: Mode Toggle + Push-to-Talk Button + Interrupt Button */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {/* Mode Switcher */}
            <div className="bg-canvas border border-line rounded-md p-0.5 flex items-center text-xs font-mono">
              <button
                type="button"
                onClick={() => setVoiceMode("ptt")}
                className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
                  voiceMode === "ptt"
                    ? "bg-brand text-white font-semibold shadow-subtle"
                    : "text-muted hover:text-ink"
                }`}
                title="Hold Spacebar or the button to speak without interruptions"
              >
                <Hand className="w-3.5 h-3.5" />
                <span>Push-to-Talk</span>
              </button>
              <button
                type="button"
                onClick={() => setVoiceMode("auto")}
                className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
                  voiceMode === "auto"
                    ? "bg-brand text-white font-semibold shadow-subtle"
                    : "text-muted hover:text-ink"
                }`}
                title="Automatically responds after you finish speaking"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Hands-Free Auto</span>
              </button>
            </div>

            {/* In PTT mode: Prominent Hold-to-Talk Button */}
            {voiceMode === "ptt" && (
              <button
                type="button"
                onMouseDown={handlePTTStart}
                onMouseUp={handlePTTEnd}
                onTouchStart={handlePTTStart}
                onTouchEnd={handlePTTEnd}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 select-none transition-all shadow-subtle cursor-pointer ${
                  isPTTTalking
                    ? "bg-danger text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)] scale-105"
                    : "bg-brand text-white hover:bg-brand-deep active:scale-95"
                }`}
                title="Click & hold (or hold Spacebar) while speaking"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>{isPTTTalking ? "🎙️ Listening... (Release when done)" : "Hold to Speak (or Spacebar)"}</span>
              </button>
            )}
          </div>

          {/* Emergency Interrupt Button (Always visible when Agent is talking or thinking) */}
          {(agentSpeaking || isSending) && (
            <button
              type="button"
              onClick={interruptAgent}
              className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-danger hover:bg-red-700 text-white flex items-center gap-1.5 transition-all shadow-subtle animate-pulse shrink-0 cursor-pointer"
              title="Stop agent immediately (or press Escape)"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Interrupt Agent (Esc)</span>
            </button>
          )}
        </div>

        {/* Input Form with Live Status Pill */}
        <form onSubmit={handleSendMessage} className="flex items-center gap-2.5">
          {/* Status Pill with clickable reset rescue */}
          <div
            onClick={interruptAgent}
            className={`px-3 py-2 rounded-md text-xs font-mono flex items-center gap-2 shrink-0 border transition-all cursor-pointer select-none ${
              !micActive
                ? "bg-danger-bg text-danger border-danger/30"
                : isSending
                ? "bg-canvas border-line text-muted animate-pulse"
                : agentSpeaking
                ? "bg-brand-light border-brand/20 text-brand"
                : isPTTTalking
                ? "bg-danger text-white border-danger"
                : isListening
                ? "bg-success-bg text-success border-success/30"
                : "bg-canvas border-line text-muted"
            }`}
            title={isSending || agentSpeaking ? "Click to cancel and reset" : undefined}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                !micActive
                  ? "bg-danger"
                  : isSending
                  ? "bg-muted animate-pulse"
                  : agentSpeaking
                  ? "bg-brand animate-ping"
                  : isPTTTalking
                  ? "bg-white animate-ping"
                  : isListening
                  ? "bg-success animate-ping"
                  : "bg-muted"
              }`}
            />
            <span className="font-semibold text-xs">
              {!micActive
                ? "Mic Muted"
                : isSending
                ? "Agent Thinking... (click to cancel)"
                : agentSpeaking
                ? `${agent?.name || "Agent"} Speaking...`
                : isPTTTalking
                ? "Speaking (Recording)..."
                : voiceMode === "ptt"
                ? "Push-to-Talk Ready"
                : isListening
                ? "Hands-Free Mic Live"
                : "Live Mic Ready"}
            </span>
          </div>

          <input
            type="text"
            placeholder={
              voiceMode === "ptt"
                ? "Hold Spacebar / button to speak, or type your message here..."
                : isListening
                ? "Speak naturally with full sentences, or type here..."
                : "Type your message or speak naturally..."
            }
            value={userSpeechInput}
            onChange={(e) => setUserSpeechInput(e.target.value)}
            className="flex-1 px-3.5 py-2 border border-line rounded-md text-xs focus:outline-none focus:border-brand font-sans bg-canvas/30"
          />

          <button
            type="submit"
            disabled={!userSpeechInput.trim() || isSending}
            className="px-4 py-2 bg-brand text-white rounded-md text-xs font-semibold hover:bg-brand-deep disabled:opacity-40 flex items-center gap-1.5 shrink-0 transition-colors shadow-subtle cursor-pointer"
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

      {/* Offscreen recording canvas attached to DOM for hardware compositor rasterization */}
      <canvas
        ref={(el) => {
          if (el) recordingCanvasRef.current = el;
        }}
        width={1280}
        height={720}
        style={{
          position: "fixed",
          top: "-9999px",
          left: "-9999px",
          width: "1280px",
          height: "720px",
          pointerEvents: "none",
          opacity: 0,
          zIndex: -100,
        }}
      />
    </div>
  );
}
