import { createPolar } from "@polar-sh/sdk/2026-10";

export const polarClient = process.env.POLAR_ACCESS_TOKEN
  ? createPolar({
      accessToken: process.env.POLAR_ACCESS_TOKEN,
    })
  : null;

export interface BillingPlan {
  id: string;
  name: "Free" | "Pro" | "Enterprise";
  price: string;
  cadence: string;
  description: string;
  polarProductId?: string;
  features: string[];
  cta: string;
  badge?: string;
  popular?: boolean;
}

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "plan-free",
    name: "Free",
    price: "$0",
    cadence: "per month",
    description: "Ideal for testing interactive AI calls and getting a feel for real-time video intelligence.",
    features: [
      "45 live AI video minutes / mo",
      "Access to 4 standard specialist agents",
      "Interactive transcript viewer",
      "7-day recording retention",
    ],
    cta: "Current Plan",
  },
  {
    id: "plan-pro",
    name: "Pro",
    price: "$29",
    cadence: "per user / month",
    description: "Designed for engineering leaders, product managers, and founders doing regular strategy sessions.",
    polarProductId: "prod_pro_tier_polar",
    popular: true,
    badge: "Most Popular",
    features: [
      "Unlimited AI video calling minutes",
      "Create & customize your own AI agents",
      "Full-text transcript indexing & instant video jump",
      "Meeting AI Chat Copilot (transcript RAG)",
      "Inngest automated post-meeting workflows",
      "30-day recording retention & HD export",
    ],
    cta: "Upgrade to Pro",
  },
  {
    id: "plan-enterprise",
    name: "Enterprise",
    price: "$99",
    cadence: "per seat / month",
    description: "Dedicated infrastructure, custom agent voice clones, Neon Postgres synchronization, and SLA guarantees.",
    polarProductId: "prod_ent_tier_polar",
    features: [
      "Everything in Pro",
      "Custom OpenAI Realtime fine-tuned voice models",
      "Direct Neon & PostgreSQL webhook streaming",
      "Team workspace permissions & audit logs",
      "SSO & Custom SAML integration",
      "Unlimited storage retention",
    ],
    cta: "Contact Enterprise",
  },
];
