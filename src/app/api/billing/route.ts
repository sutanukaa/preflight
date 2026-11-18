import { NextRequest, NextResponse } from "next/server";
import { BILLING_PLANS, polarClient } from "@/lib/polar";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    currentPlan: "Pro",
    plans: BILLING_PLANS,
    renewalDate: new Date(Date.now() + 30 * 24 * 3600000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { planId } = body;

    const plan = BILLING_PLANS.find((p) => p.id === planId);
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    if (polarClient && plan.polarProductId) {
      try {
        const checkout = await polarClient.checkouts.create({
          products: [plan.polarProductId],
          success_url: `${req.nextUrl.origin}/billing?success=true`,
        });
        return NextResponse.json({ url: checkout.url });
      } catch (err) {
        console.warn("Polar checkout API note:", (err as Error).message);
      }
    }

    // Direct sandbox checkout redirect link
    return NextResponse.json({
      url: `https://sandbox.polar.sh/checkout?plan=${plan.name.toLowerCase()}&redirect_to=${encodeURIComponent(
        `${req.nextUrl.origin}/billing?success=true`
      )}`,
    });
  } catch (error) {
    console.error("Billing checkout error:", error);
    return NextResponse.json({ error: "Failed to initialize checkout" }, { status: 500 });
  }
}
