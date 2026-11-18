import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { AIAgent, Meeting, MeetingChatMessage } from "@/types";

const { Pool } = pg;

export const dbPool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    })
  : null;

export const db = dbPool ? drizzle(dbPool, { schema }) : null;

// Standard specialist agents with generated custom vector avatars (no stock photos, no fake testimonials)
export const SEED_AGENTS: AIAgent[] = [
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
  {
    id: "agent-david",
    name: "David Kross",
    role: "Senior Engineering Hiring Manager",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=DavidKross&backgroundColor=b6e3f4,ffdfbf,c0aede",
    bio: "Engineering hiring manager conducting realistic system design and behavioral interview rounds with granular rubric scoring.",
    systemPrompt: "You are David Kross, conducting an interview. You evaluate the candidate against senior-level criteria with deep technical follow-ups.",
    voice: "fable",
    tags: ["Technical Interview", "System Design", "Algorithms", "Behavioral"],
  },
];

// Fresh new account: starts with zero recorded meetings
export const SEED_MEETINGS: Meeting[] = [];

// Memory store for runtime creations
class InMemoryStore {
  private meetings: Map<string, Meeting> = new Map();
  private agents: Map<string, AIAgent> = new Map();
  private chatMessages: Map<string, MeetingChatMessage[]> = new Map();

  constructor() {
    SEED_AGENTS.forEach((a) => this.agents.set(a.id, a));
    SEED_MEETINGS.forEach((m) => this.meetings.set(m.id, m));
  }

  getAgents(): AIAgent[] {
    return Array.from(this.agents.values());
  }

  getAgent(id: string): AIAgent | undefined {
    return this.agents.get(id);
  }

  addAgent(agent: AIAgent): AIAgent {
    this.agents.set(agent.id, agent);
    return agent;
  }

  getMeetings(): Meeting[] {
    return Array.from(this.meetings.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  getMeeting(id: string): Meeting | undefined {
    const meeting = this.meetings.get(id);
    if (!meeting) return undefined;
    if (!meeting.agent && meeting.agentId) {
      meeting.agent = this.agents.get(meeting.agentId);
    }
    return meeting;
  }

  createMeeting(meeting: Meeting): Meeting {
    this.meetings.set(meeting.id, meeting);
    return meeting;
  }

  updateMeeting(id: string, updates: Partial<Meeting>): Meeting | undefined {
    const existing = this.meetings.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.meetings.set(id, updated);
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

export const inMemoryStore = new InMemoryStore();
