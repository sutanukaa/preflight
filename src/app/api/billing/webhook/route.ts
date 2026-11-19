import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("polar-signature") ||
      req.headers.get("webhook-signature") ||
      req.headers.get("x-polar-signature");

    let event: any = {};
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const eventType = event.type || event.event || "unknown";
    console.log(`[Polar Webhook] Received event: ${eventType}`, {
      hasSignature: Boolean(signature),
      dataId: event?.data?.id,
    });

    switch (eventType) {
      case "subscription.created":
      case "subscription.updated": {
        const sub = event.data;
        console.log(`[Polar Webhook] Subscription state: ${sub?.status}, customer: ${sub?.customer_id}`);
        break;
      }
      case "checkout.created":
      case "checkout.updated": {
        console.log(`[Polar Webhook] Checkout event for customer: ${event.data?.customer_email}`);
        break;
      }
      case "order.created": {
        console.log(`[Polar Webhook] Order created: ${event.data?.id}`);
        break;
      }
      default:
        console.log(`[Polar Webhook] Unhandled event type: ${eventType}`);
        break;
    }

    return NextResponse.json({ received: true, event: eventType });
  } catch (err) {
    console.error("[Polar Webhook] Error processing event:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
