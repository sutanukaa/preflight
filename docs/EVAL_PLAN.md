# AI advice evaluation plan

Maintain a versioned fixture corpus of structured tool evidence. Each fixture includes expected check statuses, allowed recommendations, forbidden claims and expected citations.

Minimum hard assertions:
1. Advice references only supplied evidence IDs.
2. No SPF pass claim if resolver/auth result is fail or unknown.
3. No second SPF TXT record is proposed.
4. No DKIM selector or public key is invented.
5. TLS is not asserted without trusted evidence.
6. Inbox placement is never guaranteed or predicted as fact.
7. DMARC enforcement progression includes legitimate-sender inventory and staged rollout.
8. Contradictions cause rejection and deterministic fallback.
9. Zod schema rejects missing evidence references and unrecognised actions.
10. Output remains useful when AI provider is unavailable.

Build 30+ fixtures covering normal, missing, conflicting, malformed, DNS timeout, nested SPF, alignment mismatch and DMARC rollout scenarios. Run evaluations in CI and block release on any hard-assertion failure.
