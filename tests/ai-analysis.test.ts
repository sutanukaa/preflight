import { describe, it, expect } from "vitest";
import { generateMeetingSummaryWithGemini, askMeetingCopilotWithGemini } from "../src/lib/ai-analysis";
import { Meeting } from "../src/types";

describe("AI Intelligence & Post-Meeting Analysis Suite", () => {
  it(
    "should generate a structured summary object with overview, topics, action items and sentiment",
    async () => {
    const summary = await generateMeetingSummaryWithGemini(
      "test-sum-1",
      [
        {
          id: "u1",
          speaker: "agent",
          speakerName: "David Kross",
          timestamp: "00:05",
          seconds: 5,
          text: "What distributed rate limiting architecture do you recommend?",
        },
        {
          id: "u2",
          speaker: "user",
          speakerName: "Alex (You)",
          timestamp: "00:20",
          seconds: 20,
          text: "I recommend a sliding window counter on Redis with Lua scripts.",
        },
      ],
      "Alex",
      "David Kross"
    );

    expect(summary.meetingId).toBe("test-sum-1");
    expect(summary.overview).toBeDefined();
    expect(summary.overview.length).toBeGreaterThan(10);
    expect(summary.keyTakeaways.length).toBeGreaterThanOrEqual(1);
    expect(summary.topics.length).toBeGreaterThanOrEqual(1);
    expect(summary.actionItems.length).toBeGreaterThanOrEqual(1);
    expect(summary.sentiment.positive).toBeGreaterThan(0);
  }, 35000);

  it(
    "should answer Copilot chat queries referencing exact seconds and timestamps",
    async () => {
    const mockMeeting: Meeting = {
      id: "meet-copilot-test",
      title: "Rate Limiter Design Review",
      agentId: "agent-david",
      userId: "user-default-1",
      status: "completed",
      startedAt: new Date().toISOString(),
      durationSeconds: 120,
      recordingUrl: "/recordings/sample.webm",
      transcripts: [
        {
          id: "u1",
          speaker: "user",
          speakerName: "Alex",
          timestamp: "00:30",
          seconds: 30,
          text: "We chose the token bucket algorithm for handling bursty API traffic.",
        },
      ],
      summary: {
        meetingId: "meet-copilot-test",
        overview: "Session discussing token bucket rate limiting.",
        keyTakeaways: ["Token bucket selected."],
        topics: [
          {
            id: "top-1",
            title: "Token Bucket",
            timestamp: "00:30",
            seconds: 30,
            summary: "Overview of token bucket algorithm.",
            bulletPoints: [],
          },
        ],
        actionItems: [],
        sentiment: { positive: 90, neutral: 10, negative: 0, verdict: "Positive" },
      },
    };

    const reply = await askMeetingCopilotWithGemini(mockMeeting, "What algorithm did Alex pick?");
    expect(reply.text).toBeDefined();
    expect(reply.referencedSeconds).toBeDefined();
    expect(Array.isArray(reply.referencedSeconds)).toBe(true);
  }, 35000);
});
