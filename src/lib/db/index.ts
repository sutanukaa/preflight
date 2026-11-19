import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { AIAgent, Meeting, MeetingChatMessage } from "@/types";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });

const { Pool } = pg;

export const dbPool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production" || process.env.DATABASE_URL.includes("neon.tech")
          ? { rejectUnauthorized: false }
          : undefined,
    })
  : null;

export const db = dbPool ? drizzle(dbPool, { schema }) : null;

// Standard specialist agents with generated custom vector avatars
export const SEED_AGENTS: AIAgent[] = [
  {
    id: "agent-david",
    name: "David Kross",
    role: "Senior Engineering Hiring Manager",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=DavidKross&backgroundColor=b6e3f4,ffdfbf,c0aede",
    bio: "Engineering hiring manager conducting realistic system design and behavioral interview rounds with granular rubric scoring.",
    systemPrompt: "You are David Kross, a senior engineering hiring manager conducting a live interview. You evaluate the candidate against senior-level criteria with deep technical follow-ups.",
    voice: "fable",
    tags: ["Technical Interview", "System Design", "Algorithms", "Behavioral"],
  },
  {
    id: "agent-sarah",
    name: "Dr. Sarah Chen",
    role: "Principal Distributed Systems Architect",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=DrSarahChen&backgroundColor=b6e3f4,c0aede,d1d4f9",
    bio: "Systems architect specializing in high-throughput distributed systems, WebRTC streaming, and event-driven architectures.",
    systemPrompt: "You are Dr. Sarah Chen, an authoritative systems architect. You ask incisive questions about concurrency, bottlenecks, failover strategies, and caching tiers.",
    voice: "alloy",
    tags: ["Distributed Systems", "WebRTC", "Architecture", "PostgreSQL"],
  },
  {
    id: "agent-marcus",
    name: "Marcus Vance",
    role: "VP of Product Strategy",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=MarcusVance&backgroundColor=ffdfbf,ffd5dc,d1d4f9",
    bio: "SaaS operator specializing in monetization, pricing models, feature prioritization, and product-market fit.",
    systemPrompt: "You are Marcus Vance, a VP of Product. You challenge assumptions around user retention, pricing friction, and roadmap focus.",
    voice: "echo",
    tags: ["Pricing & Packaging", "GTM Strategy", "B2B SaaS", "Unit Economics"],
  },
  {
    id: "agent-elena",
    name: "Elena Rostova",
    role: "Executive Communication & Pitch Coach",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ElenaRostova&backgroundColor=c0aede,d1d4f9,ffd5dc",
    bio: "Communication coach focusing on narrative hooks, brevity, pacing, handling objections, and crisp executive delivery.",
    systemPrompt: "You are Elena Rostova, an executive pitch coach. You evaluate tone, clarity, brevity, and narrative structure, giving constructive real-time feedback.",
    voice: "shimmer",
    tags: ["Pitch Practice", "Executive Presence", "Storytelling", "Clarity"],
  },
];

const CACHE_FILE = path.join(process.cwd(), ".meetings-cache.json");

// Persistent store with automatic fallback creation
class PersistentStore {
  private meetings: Map<string, Meeting> = new Map();
  private agents: Map<string, AIAgent> = new Map();
  private chatMessages: Map<string, MeetingChatMessage[]> = new Map();

  constructor() {
    SEED_AGENTS.forEach((a) => this.agents.set(a.id, a));
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, "utf-8");
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          data.forEach((m: Meeting) => this.meetings.set(m.id, m));
        }
      }
    } catch (e) {
      console.warn("Failed to read meetings cache:", e);
    }
  }

  private persist() {
    try {
      const data = Array.from(this.meetings.values());
      fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.warn("Failed to write meetings cache:", e);
    }
  }

  getAgents(): AIAgent[] {
    return Array.from(this.agents.values());
  }

  getAgent(id: string): AIAgent | undefined {
    return this.agents.get(id);
  }

  addAgent(agent: AIAgent): AIAgent {
    this.agents.set(agent.id, agent);
    if (dbPool) {
      dbPool
        .query(
          `INSERT INTO agents (id, name, role, avatar, bio, system_prompt, voice, tags, total_sessions, average_rating)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 98)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             role = EXCLUDED.role,
             avatar = EXCLUDED.avatar,
             bio = EXCLUDED.bio,
             system_prompt = EXCLUDED.system_prompt,
             voice = EXCLUDED.voice,
             tags = EXCLUDED.tags;`,
          [
            agent.id,
            agent.name,
            agent.role,
            agent.avatar,
            agent.bio,
            agent.systemPrompt,
            agent.voice,
            JSON.stringify(agent.tags || []),
          ]
        )
        .catch((e) => console.warn("Neon sync agent note:", e.message));
    }
    return agent;
  }

  getMeetings(): Meeting[] {
    return Array.from(this.meetings.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  getMeeting(id: string): Meeting {
    let meeting = this.meetings.get(id);
    if (!meeting) {
      // Auto-create a guaranteed meeting record so the room NEVER 404s
      const defaultAgent = this.agents.get("agent-david") || Array.from(this.agents.values())[0];
      meeting = {
        id,
        title: `Interactive Video Session with ${defaultAgent.name}`,
        agentId: defaultAgent.id,
        agent: defaultAgent,
        userId: "user-default-1",
        status: "live",
        startedAt: new Date().toISOString(),
        durationSeconds: 0,
        recordingUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        transcripts: [],
      };
      this.meetings.set(id, meeting);
      this.persist();
    }
    if (!meeting.agent && meeting.agentId) {
      meeting.agent = this.agents.get(meeting.agentId);
    }
    return meeting;
  }

  createMeeting(meeting: Meeting): Meeting {
    this.meetings.set(meeting.id, meeting);
    this.persist();

    if (dbPool) {
      dbPool
        .query(
          `INSERT INTO meetings (id, title, agent_id, user_id, status, duration_seconds, recording_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             status = EXCLUDED.status,
             duration_seconds = EXCLUDED.duration_seconds,
             recording_url = EXCLUDED.recording_url;`,
          [
            meeting.id,
            meeting.title,
            meeting.agentId || "agent-david",
            meeting.userId || "user-default-1",
            meeting.status || "live",
            meeting.durationSeconds || 0,
            meeting.recordingUrl || "",
          ]
        )
        .catch((e) => console.warn("Neon sync createMeeting note:", e.message));
    }

    return meeting;
  }

  updateMeeting(id: string, updates: Partial<Meeting>): Meeting {
    const existing = this.getMeeting(id);
    const updated = { ...existing, ...updates };
    this.meetings.set(id, updated);
    this.persist();

    if (dbPool) {
      dbPool
        .query(
          `INSERT INTO meetings (id, title, agent_id, user_id, status, duration_seconds, recording_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             status = EXCLUDED.status,
             duration_seconds = EXCLUDED.duration_seconds,
             recording_url = EXCLUDED.recording_url;`,
          [
            updated.id,
            updated.title,
            updated.agentId || "agent-david",
            updated.userId || "user-default-1",
            updated.status || "completed",
            updated.durationSeconds || 0,
            updated.recordingUrl || "",
          ]
        )
        .catch((e) => console.warn("Neon sync updateMeeting note:", e.message));

      if (updated.summary) {
        dbPool
          .query(
            `INSERT INTO summaries (id, meeting_id, overview, topics, action_items, key_takeaways, sentiment)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (meeting_id) DO UPDATE SET
               overview = EXCLUDED.overview,
               topics = EXCLUDED.topics,
               action_items = EXCLUDED.action_items,
               key_takeaways = EXCLUDED.key_takeaways,
               sentiment = EXCLUDED.sentiment;`,
            [
              `sum-${updated.id}`,
              updated.id,
              updated.summary.overview,
              JSON.stringify(updated.summary.topics || []),
              JSON.stringify(updated.summary.actionItems || []),
              JSON.stringify(updated.summary.keyTakeaways || []),
              JSON.stringify(updated.summary.sentiment || {}),
            ]
          )
          .catch((e) => console.warn("Neon sync summary note:", e.message));
      }
    }

    return updated;
  }

  getChatMessages(meetingId: string): MeetingChatMessage[] {
    return this.chatMessages.get(meetingId) || [
      {
        id: "msg-init",
        sender: "ai",
        text: "I am your AI Meeting Copilot. I have analyzed the entire conversation and can answer questions about decisions, action items, or technical details discussed.",
        timestamp: "Just now",
      },
    ];
  }

  addChatMessage(meetingId: string, message: MeetingChatMessage): MeetingChatMessage {
    const msgs = this.getChatMessages(meetingId);
    msgs.push(message);
    this.chatMessages.set(meetingId, msgs);
    return message;
  }
}

export const inMemoryStore = new PersistentStore();
