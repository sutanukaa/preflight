CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"avatar" text NOT NULL,
	"bio" text NOT NULL,
	"system_prompt" text NOT NULL,
	"voice" text DEFAULT 'alloy' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_sessions" integer DEFAULT 0 NOT NULL,
	"average_rating" integer DEFAULT 98 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"agent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'live' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"recording_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"polar_customer_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"plan" text DEFAULT 'Free' NOT NULL,
	"current_period_end" timestamp,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"overview" text NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"action_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"key_takeaways" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentiment" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "summaries_meeting_id_unique" UNIQUE("meeting_id")
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"speaker" text NOT NULL,
	"speaker_name" text NOT NULL,
	"timestamp" text NOT NULL,
	"seconds" integer NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"avatar" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;