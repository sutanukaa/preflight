# Clarity AI — AI Video Interaction & Post-Meeting Intelligence SaaS

> 📖 **Full System Architecture & Technical Documentation**: See [PROJECT_DOCUMENTATION.md](file:///d:/preflight/PROJECT_DOCUMENTATION.md) for deep-dive architecture diagrams, sequence flows, database schemas, anti-hallucination pipelines, and API references.

Clarity AI is a full-stack Node.js (Next.js 15 App Router + React 19) SaaS platform providing interactive live video calls with personalized AI agents, followed by automated Inngest background processing and a comprehensive Post-Meeting Intelligence Suite.

Built with strict adherence to the clean, editorial design standards specified in `BRAND_IDENTITY.md`.

---

## 🌟 Key Features

### 1. Live AI Video Interaction
- **Stream Video SDK & OpenAI Realtime Integration**: Facilitates live video calls with personalized AI agents over WebRTC SFU topologies.
- **Agent Personas**: Pre-configured specialists (Dr. Sarah Chen for Distributed Systems, Marcus Vance for Product Strategy, Elena Rostova for Pitch Coaching, David Kross for Technical Interviews) + Custom Specialist Builder.
- **Audio Waveform & Reactive Audio**: Real-time visual feedback of agent speech, client-side camera/mic toggles, and live speech ticker.
- **One-Click End Call Pipeline**: Gracefully concludes sessions and immediately triggers asynchronous background intelligence jobs.

### 2. Inngest Background Processing Pipeline
- **Event-Driven Orchestration**: Listens for `call.ended` events via Inngest step functions (`src/lib/inngest/functions.ts`).
- **Automated Multi-Stage Workflow**:
  1. `transcribe-meeting-audio`: Ingests speech chunks and generates timestamped speaker utterances.
  2. `extract-topic-segmentation`: Groups conversation into timestamped topic blocks (e.g., `00:45`, `06:12`, `14:28`).
  3. `synthesize-action-items-and-summary`: Synthesizes executive overview, prioritized action deliverables, key takeaways, and sentiment analysis.
  4. `persist-meeting-state`: Atomically updates database records.

### 3. Post-Meeting Intelligence Suite Dashboard
- **Synchronized Video Player**: Replay recordings with play/pause, scrubbers, and instant time-jumping.
- **Timestamped Topic Breakdown**: Clicking any topic badge (e.g. `[00:45]`) seeks the video player directly to that second!
- **Searchable Transcripts**: Real-time indexed transcript search with speaker filters and keyword highlighting.
- **Meeting AI Chat Copilot**: Conversational RAG assistant answering user questions grounded in the meeting transcript, with clickable jump-to timestamps.
- **Deliverables & Sentiment**: Action items checklist with priority tags, assignee owners, and sentiment breakdown.

### 4. SaaS Infrastructure
- **Better Auth**: Multi-auth layer wired to Google OAuth credentials + demo sessions.
- **Polar Subscription Management**: Integrates `@polar-sh/sdk` with tier cards (Free, Pro, Enterprise), checkout links, usage meters, and customer portal links.
- **Drizzle ORM & Neon Postgres**: Database schemas for users, agents, meetings, transcripts, and summaries with seamless in-memory fallback for local dev.

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install --legacy-peer-deps
```

### 2. Environment Configuration
Populate `.env.local` or `.env`:
```env
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Stream Video SDK
STREAM_API_KEY=your_stream_api_key
STREAM_API_SECRET=your_stream_api_secret

# Polar SaaS
POLAR_ACCESS_TOKEN=your_polar_token

# Inngest
INNGEST_EVENT_KEY=local_dev_event_key

# Better Auth
BETTER_AUTH_SECRET=dev_secret_key_needs_32_characters_for_better_auth_session
BETTER_AUTH_URL=http://localhost:3000

# PostgreSQL (optional, defaults to rich in-memory store)
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

---

## 🎨 Design System
Strict adherence to `BRAND_IDENTITY.md`:
- Canvas: `#F6F7F8`
- Surface: `#FFFFFF`
- Ink: `#202A32`
- Line: `#E8ECEE`
- Brand Green: `#294F4D`
- Typography: `Manrope` (UI) and `DM Mono` (Technical timestamps & code)
