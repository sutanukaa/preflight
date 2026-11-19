import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local", override: true });

const SEED_AGENTS = [
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

async function seed() {
  const { Pool } = pg;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log("Seeding standard agents into Neon Postgres...");
  for (const agent of SEED_AGENTS) {
    await pool.query(
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
        JSON.stringify(agent.tags),
      ]
    );
  }

  const res = await pool.query("SELECT id, name, role FROM agents;");
  console.log("Agents in Neon database:", res.rows);
  await pool.end();
}

seed();
