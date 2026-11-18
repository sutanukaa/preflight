"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import {
  CreditCard,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Zap,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { BillingPlan } from "@/lib/polar";

export default function BillingPage() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [currentPlan, setCurrentPlan] = useState("Pro");
  const [renewalDate, setRenewalDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBilling() {
      try {
        const res = await fetch("/api/billing");
        const data = await res.json();
        setPlans(data.plans || []);
        setCurrentPlan(data.currentPlan || "Pro");
        setRenewalDate(data.renewalDate || "Dec 18, 2026");
      } catch (err) {
        console.error("Billing fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchBilling();
  }, []);

  async function handleCheckout(plan: BillingPlan) {
    if (plan.name === currentPlan) return;
    setCheckoutLoading(plan.id);

    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      }
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setCheckoutLoading(null);
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="border-b border-line pb-6">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-brand font-bold bg-brand-light px-2 py-0.5 rounded">
            Polar SaaS Subscription Management
          </span>
        </div>
        <h1 className="text-2xl font-extrabold text-ink tracking-tight">
          Plans, Quotas &amp; Billing
        </h1>
        <p className="text-xs text-muted mt-1 max-w-2xl leading-relaxed">
          Manage your AI video call minutes, custom agent slots, and transcription storage. Powered by
          the official Polar SDK with automated webhook provisioning.
        </p>
      </div>

      {/* Current Active Plan Overview Card */}
      <div className="bg-surface border border-line rounded-lg p-6 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-ink">Active Plan: {currentPlan} Tier</h2>
              <span className="text-[10px] font-mono bg-success-bg text-success px-2 py-0.5 rounded font-bold">
                Active &amp; In Good Standing
              </span>
            </div>
            <p className="text-xs text-muted mt-1">
              Your next billing cycle renews on <strong className="text-ink">{renewalDate}</strong>.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://sandbox.polar.sh/portal"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3.5 py-1.5 rounded border border-line bg-canvas hover:bg-line/40 text-xs font-semibold text-ink transition-colors shadow-subtle"
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted" />
              <span>Polar Customer Portal</span>
            </a>
          </div>
        </div>

        {/* Usage meters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-5">
          <div>
            <div className="flex justify-between text-xs font-mono mb-1.5">
              <span className="text-muted">AI Video Call Time</span>
              <span className="text-ink font-semibold">142 / 300 mins</span>
            </div>
            <div className="w-full bg-canvas h-2 rounded-full overflow-hidden border border-line">
              <div className="bg-brand h-full rounded-full" style={{ width: "47%" }} />
            </div>
            <span className="text-[10px] text-muted font-mono mt-1 block">47% utilized this cycle</span>
          </div>

          <div>
            <div className="flex justify-between text-xs font-mono mb-1.5">
              <span className="text-muted">Custom AI Specialists</span>
              <span className="text-ink font-semibold">2 / 5 active</span>
            </div>
            <div className="w-full bg-canvas h-2 rounded-full overflow-hidden border border-line">
              <div className="bg-brand h-full rounded-full" style={{ width: "40%" }} />
            </div>
            <span className="text-[10px] text-muted font-mono mt-1 block">3 slots remaining</span>
          </div>

          <div>
            <div className="flex justify-between text-xs font-mono mb-1.5">
              <span className="text-muted">Transcript Full-Text Search</span>
              <span className="text-success font-semibold">Unlimited</span>
            </div>
            <div className="w-full bg-canvas h-2 rounded-full overflow-hidden border border-line">
              <div className="bg-success h-full rounded-full" style={{ width: "100%" }} />
            </div>
            <span className="text-[10px] text-muted font-mono mt-1 block">Inngest indexed</span>
          </div>
        </div>
      </div>

      {/* Tier Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrent = plan.name === currentPlan;
          return (
            <div
              key={plan.id}
              className={`bg-surface border rounded-lg p-6 flex flex-col justify-between transition-all relative ${
                plan.popular
                  ? "border-brand shadow-card ring-1 ring-brand/20"
                  : "border-line shadow-subtle hover:border-line-subtle"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 right-6 bg-brand text-white text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold shadow-sm">
                  {plan.badge}
                </div>
              )}

              <div>
                <h3 className="text-base font-bold text-ink">{plan.name}</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed min-h-[36px]">
                  {plan.description}
                </p>

                <div className="my-5 pb-5 border-b border-line">
                  <span className="text-3xl font-extrabold text-ink tracking-tight font-mono">
                    {plan.price}
                  </span>
                  <span className="text-xs text-muted font-mono ml-2">/ {plan.cadence}</span>
                </div>

                <div className="space-y-2.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted font-semibold block">
                    What&apos;s Included:
                  </span>
                  {plan.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-ink-soft">
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-line">
                <button
                  onClick={() => handleCheckout(plan)}
                  disabled={isCurrent || checkoutLoading === plan.id}
                  className={`w-full py-2.5 rounded-md text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-subtle ${
                    isCurrent
                      ? "bg-canvas border border-line text-muted cursor-default"
                      : "bg-brand text-white hover:bg-brand-deep disabled:opacity-50"
                  }`}
                >
                  {checkoutLoading === plan.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isCurrent ? (
                    <span>Current Active Plan</span>
                  ) : (
                    <span>{plan.cta}</span>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
