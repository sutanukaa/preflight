import { pgTable, text, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  avatar: text("avatar"),
  plan: text("plan").default("free").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  avatar: text("avatar").notNull(),
  bio: text("bio").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  voice: text("voice").default("alloy").notNull(),
  tags: jsonb("tags").$type<string[]>().default([]).notNull(),
  totalSessions: integer("total_sessions").default(0).notNull(),
  averageRating: integer("average_rating").default(98).notNull(),
});

export const meetings = pgTable("meetings", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  agentId: text("agent_id").references(() => agents.id).notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  status: text("status").$type<"live" | "processing" | "completed">().default("live").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  durationSeconds: integer("duration_seconds").default(0).notNull(),
  recordingUrl: text("recording_url").notNull(),
});

export const transcripts = pgTable("transcripts", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id").references(() => meetings.id).notNull(),
  speaker: text("speaker").notNull(),
  speakerName: text("speaker_name").notNull(),
  timestamp: text("timestamp").notNull(),
  seconds: integer("seconds").notNull(),
  text: text("text").notNull(),
});

export const summaries = pgTable("summaries", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id").references(() => meetings.id).notNull().unique(),
  overview: text("overview").notNull(),
  topics: jsonb("topics").$type<any[]>().default([]).notNull(),
  actionItems: jsonb("action_items").$type<any[]>().default([]).notNull(),
  keyTakeaways: jsonb("key_takeaways").$type<string[]>().default([]).notNull(),
  sentiment: jsonb("sentiment").$type<any>().default({}).notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull().unique(),
  polarCustomerId: text("polar_customer_id"),
  status: text("status").default("active").notNull(),
  plan: text("plan").default("Free").notNull(),
  currentPeriodEnd: timestamp("current_period_end"),
});
