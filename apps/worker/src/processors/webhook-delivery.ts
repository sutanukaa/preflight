import crypto from 'node:crypto';

export interface WebhookPayload {
  eventId: string;
  eventType: 'report.completed' | 'domain.drift_detected' | 'domain.verified';
  timestamp: string;
  data: Record<string, unknown>;
}

export function signWebhookPayload(secret: string, payload: WebhookPayload): { header: string; timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000);
  const serialized = JSON.stringify(payload);
  const signaturePayload = `${timestamp}.${serialized}`;
  const hmac = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');
  return {
    header: `t=${timestamp},v1=${hmac}`,
    timestamp
  };
}

export async function deliverWebhookWithRetry(
  url: string,
  secret: string,
  payload: WebhookPayload,
  maxRetries = 3
): Promise<{ success: boolean; statusCode?: number; attempts: number; error?: string }> {
  const { header } = signWebhookPayload(secret, payload);
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Preflight-Webhook/1.0',
          'X-Preflight-Signature': header
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        return { success: true, statusCode: res.status, attempts: attempt };
      }

      // Retry only for 5xx or 429
      if (res.status !== 429 && res.status < 500) {
        return { success: false, statusCode: res.status, attempts: attempt, error: `Client error: ${res.status}` };
      }
    } catch (err: unknown) {
      if (attempt >= maxRetries) {
        const msg = err instanceof Error ? err.message : 'Network error';
        return { success: false, attempts: attempt, error: msg };
      }
    }

    // Exponential backoff
    const delay = Math.pow(2, attempt) * 100 + Math.random() * 50;
    await new Promise(r => setTimeout(r, delay));
  }

  return { success: false, attempts: attempt, error: 'Max retries exhausted' };
}
