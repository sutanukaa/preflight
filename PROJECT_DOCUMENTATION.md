# Clarity AI — Complete System Architecture & Project Documentation

> **Interactive Live Video Meetings with AI Specialists & Post-Meeting Intelligence SaaS**  
> *Stack: Next.js 15 (App Router) • React 19 • TypeScript • Tailwind CSS • Stream Video WebRTC • Inngest • Drizzle ORM • Neon PostgreSQL • Google Gemini • Edge TTS • Polar SDK*

---

## 1. Executive Overview & Product Vision

**Clarity AI** is an enterprise-grade AI video interaction and post-meeting intelligence platform. It bridges the gap between **synchronous real-time multimodal AI consultations** and **asynchronous post-meeting intelligence**.

### The Core Problem Solved
Traditional video meeting tools record video and generate generic, hallucinated transcripts or summaries that fail to reflect what actually transpired. Clarity AI provides:
1. **Live, Face-to-Face Consultations**: Real-time video/audio conversations with domain-specialized AI agents (Pitch Coaches, Distributed Systems Architects, Product Strategists, Technical Interviewers) with ultra-low latency neural speech and reactive audio waveforms.
2. **Synchronized Dual-Stream Video Compositing**: Client-side hardware-accelerated canvas compositing captures both the participant and the AI specialist into a single 30 FPS video with synchronized audio.
3. **Pristine FFmpeg Video Processing**: Server-side H.264/AAC transcoding with `+faststart` and `fps=30` constant frame rate, eliminating black-screen decoder stalls and macroblock tearing.
4. **Deterministic, Anti-Hallucination Post-Meeting Intelligence**: Post-call summaries and topic breakdowns are strictly derived from actual spoken utterances—guaranteeing 100% truthfulness with zero AI slop.
5. **Interactive RAG Meeting Copilot**: A context-grounded conversational assistant that answers queries exclusively based on the meeting dialogue with clickable jump-to-timestamp links.
6. **Privacy-Isolated Custom Specialists**: Users can build custom specialists with tailored system prompts and voices that remain private strictly to their creator, while sharing a public catalog of built-in specialists.
7. **Production SaaS Monetization**: Full billing lifecycle powered by Polar with Free, Pro, and Enterprise tiers.

---

## 2. High-Level System Architecture

```mermaid
flowchart TD
    subgraph Client["Client Browser (React 19 / Next.js 15)"]
        CamMic["User Webcam & Microphone"]
        WebRTC["Stream Video SDK / WebRTC SFU"]
        CanvasComp["Canvas Video Compositor (1280x720 @ 30 FPS)"]
        MediaRec["MediaRecorder (VP9 / H.264)"]
        UI_Ticker["Realtime Speech Ticker & Audio Waveform"]
    end

    subgraph AppServer["Next.js App Server (Node.js API Routes)"]
        API_Rec["/api/meetings/[id]/recording"]
        API_Agent["/api/meetings/[id]/agent-response"]
        API_Chat["/api/meetings/[id]/chat (RAG)"]
        API_TTS["/api/tts (Edge Neural Voice)"]
        API_Agents["/api/agents (Catalog & Custom Scoping)"]
        FFmpeg["FFmpeg Transcoder (libx264 +faststart)"]
    end

    subgraph AI_Services["AI & Cloud Services"]
        Gemini["Google Gemini 2.5 Flash / Live API"]
        EdgeTTS["Microsoft Edge Neural TTS Engine"]
        Inngest["Inngest Event Pipeline (call.ended)"]
        Polar["Polar SaaS Billing & Subscriptions"]
    end

    subgraph Storage["Data & Storage Layer"]
        DB[("Neon PostgreSQL / Drizzle ORM")]
        MemDB[("In-Memory Store Fallback")]
        PublicFS[("Local Disk / CDN Recordings")]
    end

    CamMic --> WebRTC
    CamMic --> CanvasComp
    WebRTC --> UI_Ticker
    CanvasComp --> MediaRec
    MediaRec -->|Upload WebM Blob| API_Rec
    API_Rec --> FFmpeg
    FFmpeg -->|Pristine MP4| PublicFS
    
    CamMic -->|Spoken Audio / Text| API_Agent
    API_Agent --> Gemini
    Gemini --> API_TTS
    API_TTS --> EdgeTTS
    EdgeTTS -->|Audio Chunk Stream| UI_Ticker

    API_Rec -->|Trigger call.ended| Inngest
    Inngest -->|Extract Topics & Summary| Gemini
    Inngest -->|Persist Metadata| DB
    Inngest -->|Fallback Store| MemDB

    API_Chat -->|Grounded Q&A| Gemini
    API_Agents --> DB
```

---

## 3. End-to-End Feature Breakdown

### 3.1 Live AI Video Consultation Room (`/meeting/[id]`)
- **Dual-Pane Layout**:
  - **AI Specialist Tile (Left)**: Displays the agent's interactive avatar, live speech status (`Speaking...`, `Listening...`), reactive soundwave ripples, and domain specialty badge.
  - **User Participant Tile (Right)**: Shows the user's live webcam video feed with a status pill (`Camera / Audio Ready`) and mirror framing.
- **Audio & Input Controls**:
  - **Push-to-Talk (Spacebar)**: Users hold spacebar or click the button to speak; releasing it triggers immediate AI response generation.
  - **Hands-Free Auto Mode**: Automatic Voice Activity Detection (VAD) listening continuously.
  - **Text Input Bar**: Fallback text messaging directly to the specialist.
  - **Mute / Camera Toggle / Screen Share**: Full WebRTC device management.
  - **Interrupt Agent**: Instantly halts agent speech playback when the user speaks.
- **Realtime Speech Ticker**: Live captioning stream that transcribes user questions and specialist answers as they happen, stamped with exact millisecond-accurate timestamps (`[00:00]`, `[00:02]`).

### 3.2 Dual-Stream Canvas Video Compositor & Fast-Start Recording
- **The Challenge**: Standard web meetings either require expensive server-side SFU compositors or produce choppy recordings with out-of-sync audio.
- **The Solution**: An in-browser compositing pipeline:
  1. An off-screen 1280x720 HTML5 Canvas draws the specialist tile, real-time waveform animations, and user camera feed at a steady 30 FPS.
  2. Canvas uses `canvas.captureStream(0)` paired with atomic `requestFrame()` calls inside `requestAnimationFrame()` to eliminate macroblock tearing.
  3. Context is initialized with `{ willReadFrequently: true }` ensuring CPU-backed Skia rasterization without GPU context loss.
  4. Audio from the user's microphone and the specialist's voice are combined into a single unified `AudioContext` destination track.
  5. The stream is recorded via `MediaRecorder` at 4,000,000 bps.
  6. Upon ending the call, the recording is uploaded to `/api/meetings/[id]/recording`.
  7. **FFmpeg Server Transcoding**: The backend automatically executes:
     ```bash
     ffmpeg -fflags +genpts+discardcorrupt -i input.webm -vf fps=30 -c:v libx264 -preset ultrafast -crf 22 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart output.mp4
     ```
     This repairs timestamp discontinuities, fixes Chromium WebM container bugs, and moves the MP4 `moov` atom to the front (`+faststart`) for instant web playback without decoder stalls.

### 3.3 Post-Meeting Intelligence Suite (`/meeting/[id]/summary`)
- **Synchronized Video Player**: Custom video player with play/pause, volume, seek scrubber, playback speed selector, and fullscreen toggle.
- **Timestamped Topic Breakdown**: Clean list of topics discussed during the meeting. Clicking any topic timestamp (`[00:00]`, `[01:15]`) immediately seeks the video player to that exact second.
- **Speaker Participation Ratio**: Real-time calculated talk-time distribution (e.g. `57% Specialist / 43% You`).
- **100% Grounded, Anti-Hallucination Summary**:
  - Generated via `buildDeterministicSummary` in `src/lib/ai-analysis.ts`.
  - Built strictly from spoken transcript turns. If the user asked about emotion in daily conversations, the summary captures emotion in daily conversations—never generating boilerplate "SaaS architecture" or fake action items.
- **Searchable Transcript**:
  - Live search input filtering utterances by word or phrase.
  - Filter pills: `All`, `Agent`, `User`.
  - Clickable timestamps on every utterance to jump the video to that moment.
- **Meeting AI Copilot (Grounded RAG)**:
  - Users can ask questions like *"What advice did Elena give me?"* or *"Summarize the main takeaways"*.
  - Prompt strictly constrains the LLM to only answer based on the transcript, returning clickable `[MM:SS]` timestamps that seek the replay.
- **Export Capabilities**:
  - Copy Summary Markdown.
  - Export full transcript as JSON or Text.

### 3.4 Specialist Catalog & Custom Specialist Builder
- **Standard Public Catalog** (`src/app/specialists/page.tsx`):
  - **Dr. Sarah Chen**: Senior Distributed Systems Architect (Voice: `nova`).
  - **Marcus Vance**: VP of Product & Go-to-Market Strategy (Voice: `onyx`).
  - **Elena Rostova**: Executive Communication & Pitch Coach (Voice: `shimmer`).
  - **David Kross**: Staff SWE & Technical Interviewer (Voice: `echo`).
- **Custom Specialist Builder**:
  - Users can create their own custom AI persona by defining Name, Role, Bio, System Prompt, Voice, and Domain Tags.
  - **Privacy Isolation**: Custom agents are flagged with `is_custom = true` and `creator_id = <userId>`. In the API and UI, custom agents are **strictly visible to their creator** (`🔒 Only Visible to You`), while catalog specialists remain public to everyone.

### 3.5 SaaS Subscriptions & Billing (`/billing`)
- **Polar SDK Integration**: Managed subscription lifecycle using `@polar-sh/sdk`.
- **Subscription Tiers**:
  - **Free Tier**: 3 meetings / month, standard specialists, 720p recordings.
  - **Pro Tier ($29/mo)**: Unlimited meetings, custom specialists, 1080p recording, instant RAG Copilot, priority neural voice synthesis.
  - **Enterprise Tier ($99/mo)**: Unlimited everything, team workspaces, custom LLM fine-tuning, dedicated support.
- **Customer Portal**: Direct links to manage subscriptions and invoices.

---

## 4. Technical Stack Deep-Dive

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | Next.js 15.1 (App Router) | Server-rendered pages, API routes, fast streaming |
| **Language** | TypeScript 5.7 & React 19 | Strict type-safety, concurrent React features |
| **Styling** | Tailwind CSS 3.4 | Clean editorial design conforming to `BRAND_IDENTITY.md` |
| **WebRTC & Video** | Stream Video Node SDK (`@stream-io/node-sdk`) | Real-time signaling, SFU connectivity, audio/video streams |
| **Speech & Audio** | Edge TTS (`edge-tts`) & Web Audio API | Low-latency neural text-to-speech, AudioContext analyzer |
| **LLM & Analysis** | Google Gemini 2.5 Flash / Gemini Live | Real-time conversational agent, RAG copilot, meeting summarization |
| **Workflow Engine** | Inngest (`inngest` v4.26) | Background event-driven post-meeting processing |
| **Database & ORM** | Drizzle ORM + Neon PostgreSQL | Scalable relational schema with instant in-memory fallback |
| **Authentication** | Better Auth (`better-auth`) | Google OAuth 2.0 and session management |
| **Monetization** | Polar SDK (`@polar-sh/sdk`) | Tiered SaaS subscriptions, webhooks, customer portal |
| **Transcoding** | FFmpeg CLI | Server-side H.264/AAC repair and faststart MP4 generation |

---

## 5. Detailed Directory Structure

```
d:\preflight\
├── .env.local                    # Environment configuration (API keys, DB, Polar)
├── BRAND_IDENTITY.md             # Design tokens, color palette, typography guidelines
├── package.json                  # Dependencies and execution scripts
├── drizzle.config.ts             # Drizzle Kit migration configuration
├── public/
│   └── recordings/               # Output directory for WebM and transcode MP4 files
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Global HTML layout with fonts & Topbar
│   │   ├── page.tsx              # Main dashboard: metrics, recent calls, start call CTA
│   │   ├── billing/
│   │   │   └── page.tsx          # Subscription tiers, usage meters, checkout links
│   │   ├── specialists/
│   │   │   └── page.tsx          # Catalog & Custom Specialist listing + builder
│   │   ├── meeting/
│   │   │   ├── new/page.tsx      # Specialist selection and instant room launcher
│   │   │   └── [id]/
│   │   │       ├── page.tsx      # Live interactive video consultation room
│   │   │       └── summary/
│   │   │           └── page.tsx  # Post-meeting intelligence suite & video replay
│   │   └── api/
│   │       ├── agents/           # GET (filtered by userId) & POST (create agent)
│   │       ├── auth/             # Better-auth endpoints & session verification
│   │       ├── billing/          # Polar checkout session creator & webhook
│   │       ├── inngest/          # Inngest HTTP endpoint for step functions
│   │       ├── meetings/         # Meeting sessions CRUD
│   │       │   └── [id]/
│   │       │       ├── recording/        # Video upload + FFmpeg transcoding
│   │       │       ├── agent-response/  # Live Gemini + Edge TTS generation
│   │       │       └── chat/            # RAG AI Copilot grounded Q&A
│   │       ├── stream/token/     # Stream Video SDK client JWT token provider
│   │       └── tts/              # Standalone neural voice streaming
│   ├── components/
│   │   ├── Topbar.tsx            # Global header with environment status & user profile
│   │   ├── Sidebar.tsx           # Navigation items and recent meeting history
│   │   ├── Waveform.tsx          # Real-time animated audio visualizer
│   │   └── CreateAgentModal.tsx  # Custom specialist modal form
│   ├── lib/
│   │   ├── ai-analysis.ts        # Gemini summarization & deterministic fallback engine
│   │   ├── auth.ts & auth-client.ts # Better Auth configuration & client hooks
│   │   ├── stream.ts             # Stream Video server-side client
│   │   ├── polar.ts              # Polar SDK initialization and pricing helpers
│   │   ├── db/
│   │   │   ├── index.ts          # Hybrid DB client (Neon Postgres + inMemoryStore)
│   │   │   ├── schema.ts         # Drizzle relational table definitions
│   │   │   └── migrate.ts        # Database migration runner
│   │   └── inngest/
│   │       ├── client.ts         # Inngest client initialization
│   │       └── functions.ts      # call.ended multi-step workflow definition
│   ├── styles/
│   │   └── globals.css           # Tailwind custom utilities & DM Mono fonts
│   └── types/
│       └── index.ts              # TypeScript interfaces (Meeting, Agent, Summary, etc.)
```

---

## 6. Database Schema & Data Models

Managed via Drizzle ORM in `src/lib/db/schema.ts`:

### 6.1 Users (`users`)
- `id` (Text, Primary Key): Unique user ID.
- `name` (Text): Full display name.
- `email` (Text, Unique): User email address.
- `avatar` (Text): URL to user profile image.
- `plan` (Text): `"free"` | `"pro"` | `"enterprise"`.
- `created_at` (Timestamp): Registration timestamp.

### 6.2 Agents (`agents`)
- `id` (Text, Primary Key): Unique agent ID (e.g. `agent-pitch-coach`, `agent-custom-123`).
- `name` (Text): Agent name (e.g. `Elena Rostova`).
- `role` (Text): Professional title (e.g. `Executive Pitch Coach`).
- `avatar` (Text): Avatar image URL or SVG icon.
- `bio` (Text): Background description and methodology.
- `system_prompt` (Text): Personality and technical instructions for Gemini.
- `voice` (Text): Voice persona (e.g. `shimmer`, `alloy`, `en-US-JennyNeural`).
- `tags` (JSONB): String array of domain areas (e.g. `["Storytelling", "Fundraising"]`).
- `total_sessions` (Integer): Number of completed sessions.
- `average_rating` (Integer): User satisfaction score.
- **`creator_id`** (Text, Nullable): ID of user who created the agent.
- **`is_custom`** (Boolean): `false` for public catalog, `true` for private custom agents.

### 6.3 Meetings (`meetings`)
- `id` (Text, Primary Key): e.g. `meet-179511510308`.
- `title` (Text): Human-readable session title.
- `agent_id` (Text, Foreign Key -> `agents.id`): Associated specialist.
- `user_id` (Text, Foreign Key -> `users.id`): Participant user.
- `status` (Text): `"live"` | `"processing"` | `"completed"`.
- `started_at` & `ended_at` (Timestamp): Call boundary timestamps.
- `duration_seconds` (Integer): Total meeting length in seconds.
- `recording_url` (Text): Path to the generated MP4/WebM video (`/recordings/{id}.mp4`).

### 6.4 Transcripts (`transcripts`)
- `id` (Text, Primary Key): Utterance ID.
- `meeting_id` (Text, Foreign Key -> `meetings.id`).
- `speaker` (Text): `"user"` | `"agent"`.
- `speaker_name` (Text): Display name (e.g. `You (You)` or `Elena Rostova`).
- `timestamp` (Text): Formatted time string (e.g. `00:15`).
- `seconds` (Integer): Integer offset from call start.
- `text` (Text): Spoken dialogue content.

### 6.5 Summaries (`summaries`)
- `id` (Text, Primary Key).
- `meeting_id` (Text, Foreign Key -> `meetings.id`, Unique).
- `overview` (Text): Executive summary of the consultation.
- `topics` (JSONB): Array of topic objects `{ id, title, timestamp, seconds, bullets }`.
- `action_items` (JSONB): Array of `{ id, text, assignee, priority, completed }`.
- `key_takeaways` (JSONB): String array of critical insights.
- `sentiment` (JSONB): `{ positive, neutral, negative, verdict }`.

### 6.6 Subscriptions (`subscriptions`)
- `id` (Text, Primary Key).
- `user_id` (Text, Foreign Key -> `users.id`, Unique).
- `polar_customer_id` (Text): Polar customer ID.
- `status` (Text): `"active"` | `"canceled"` | `"past_due"`.
- `plan` (Text): `"Free"` | `"Pro"` | `"Enterprise"`.
- `current_period_end` (Timestamp).

---

## 7. Key Workflows & Data Flows

### 7.1 Live Speech-to-Speech Loop
```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Room as Meeting Room (Client)
    participant API as /api/meetings/[id]/agent-response
    participant Gemini as Google Gemini 2.5 Flash
    participant TTS as Edge TTS Engine

    User->>Room: Speaks (Push-to-Talk or Auto VAD)
    Room->>Room: Web Speech Recognition transcribes audio
    Room->>Room: Appends to local transcript & Speech Ticker
    Room->>API: POST { message, history, agentId }
    API->>Gemini: Stream prompt with persona context & conversation history
    Gemini-->>API: Yields specialist response text
    API->>TTS: Request neural audio synthesis
    TTS-->>API: Audio MP3/WAV chunks
    API-->>Room: JSON { responseText, audioUrl }
    Room->>Room: Plays audio through Web Audio API
    Room->>Room: Animates reactive waveform ripples
    Room->>Room: Displays agent response in caption ticker
```

### 7.2 Post-Meeting Processing & Inngest Ingestion
```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Room as Meeting Room (Client)
    participant RecAPI as /api/meetings/[id]/recording
    participant FFmpeg as FFmpeg Server
    participant Inngest as Inngest Workflow
    participant Gemini as Gemini AI Analysis
    participant DB as Neon DB / In-Memory Store

    User->>Room: Clicks "End Call"
    Room->>Room: Stops MediaRecorder & extracts final WebM blob
    Room->>RecAPI: Uploads video FormData
    RecAPI->>FFmpeg: Transcode to H.264/AAC with +faststart
    FFmpeg-->>RecAPI: /recordings/[id].mp4 created
    RecAPI->>Inngest: Send event "call.ended" { meetingId, duration, utterances }
    
    par Inngest Step Functions
        Inngest->>Inngest: Step 1: transcribe-meeting-audio (validates utterances)
        Inngest->>Gemini: Step 2: synthesize-action-items-and-summary
        Gemini-->>Inngest: Grounded topics, takeaways & overview
        Inngest->>DB: Step 3: persist-meeting-state (status="completed")
    end

    Room->>User: Redirects to /meeting/[id]/summary
    User->>Room: Instant playback of MP4 with synchronized topics
```

---

## 8. Anti-Hallucination & Quality Guardrails

1. **Deterministic Summary Generation**:
   - `buildDeterministicSummary` in `src/lib/ai-analysis.ts` cleans user dialogue phrases (`"I asked..."`, `"Can you explain..."`) to produce accurate topic titles.
   - Summaries and topics strictly correlate 1:1 with real spoken turns. If no dialogue took place, the system explicitly reports that no spoken dialogue occurred, rather than generating fictional topics.
2. **Grounded RAG AI Copilot**:
   - When the user asks a question in the Summary Copilot tab, the backend injects the full transcript verbatim into the system prompt with the rule:
     > *"You are the Clarity AI Meeting Copilot. Answer ONLY using facts from the meeting transcript above. If not mentioned, state clearly that it was not discussed. Include timestamps like [MM:SS] when citing statements."*
3. **Flawless 30 FPS Video Replay**:
   - Canvas rasterization uses CPU-backed Skia memory (`willReadFrequently: true`).
   - Frame pacing uses `requestFrame()` synchronizer to avoid Chromium capture stream stalls.
   - Backend FFmpeg uses `-fflags +genpts+discardcorrupt -err_detect ignore_err -vf fps=30 -movflags +faststart` to repair non-monotonic PTS/DTS timestamps.

---

## 9. Environment Variables Reference

| Variable | Description | Example / Default |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API Key for LLM responses and summarization | `AIzaSy...` |
| `OPENAI_API_KEY` | Secondary fallback key for OpenAI / Gemini-compatible endpoints | `AQ...` |
| `STREAM_API_KEY` | Stream Video SDK client API key | `7q...` |
| `STREAM_API_SECRET` | Stream Video SDK server secret | `Secret key...` |
| `DATABASE_URL` | Neon PostgreSQL connection string (falls back to memory DB) | `postgresql://user:pass@host/db?sslmode=require` |
| `POLAR_ACCESS_TOKEN` | Polar SaaS API Access Token | `polar_at_...` |
| `INNGEST_EVENT_KEY` | Inngest background job event key | `local_dev_event_key` |
| `BETTER_AUTH_SECRET` | 32-character encryption key for Better Auth sessions | `dev_secret_key_needs_32_characters...` |
| `BETTER_AUTH_URL` | Application canonical base URL | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID for user login | `your-id.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | `your-secret` |

---

## 10. Development & Verification Guide

### 10.1 Running the Project Locally
```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Check TypeScript types
npm run typecheck

# 3. Start local development server
npm run dev

# 4. Open in browser
# http://localhost:3000
```

### 10.2 Database Migrations (When updating schema)
```bash
# Push schema updates directly to Neon PostgreSQL
npm run db:push

# Open Drizzle Studio web GUI
npm run db:studio
```

### 10.3 Testing End-to-End Flows
- **Start Call**: Visit `http://localhost:3000/meeting/new`, pick a specialist (e.g. Elena Rostova), and click **Start Consultation**.
- **Speak & Interact**: Hold Spacebar to speak or type in the input bar. Observe the live speech ticker and specialist voice reply.
- **End Call**: Click **End Call**. Wait 1 second for recording upload and FFmpeg processing.
- **Review Summary**: Explore the interactive video player, click topic timestamps to jump through the video, search the transcript, and ask the AI Copilot questions.
- **Custom Agent**: Visit `/specialists`, click **+ Create Specialist**, fill in the details, and confirm that the created specialist appears with the `🔒 Only Visible to You` badge.
