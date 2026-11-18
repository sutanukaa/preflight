import { StreamClient } from "@stream-io/node-sdk";

const STREAM_API_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY || process.env.STREAM_API_KEY || "dev_stream_key_test";
const STREAM_API_SECRET = process.env.STREAM_API_SECRET || "dev_stream_secret_test_32_chars_long_for_hmac_sha256";

let streamServerClient: StreamClient | null = null;

try {
  streamServerClient = new StreamClient(STREAM_API_KEY, STREAM_API_SECRET);
} catch (e) {
  console.warn("StreamClient initialization note:", (e as Error).message);
}

export { streamServerClient, STREAM_API_KEY };

export function generateStreamUserToken(userId: string): string {
  if (streamServerClient) {
    try {
      return streamServerClient.generateUserToken({ user_id: userId, validity_in_seconds: 3600 * 24 });
    } catch {
      // Fallback dummy token for local dev test
      return `stream_dev_token_${userId}_${Date.now()}`;
    }
  }
  return `stream_dev_token_${userId}_${Date.now()}`;
}
