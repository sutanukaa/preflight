import { describe, it, expect } from "vitest";
import { inMemoryStore, SEED_AGENTS } from "../src/lib/db";

describe("PersistentStore and AI Specialist Agent Registry", () => {
  it("should have all standard seed agents with vector avatars", () => {
    const agents = inMemoryStore.getAgents();
    expect(agents.length).toBeGreaterThanOrEqual(4);

    const david = inMemoryStore.getAgent("agent-david");
    expect(david).toBeDefined();
    expect(david?.name).toBe("David Kross");
    expect(david?.avatar).toContain("api.dicebear.com");

    const sarah = inMemoryStore.getAgent("agent-sarah");
    expect(sarah).toBeDefined();
    expect(sarah?.name).toBe("Dr. Sarah Chen");
    expect(sarah?.avatar).toContain("api.dicebear.com");
  });

  it("should automatically create a guaranteed fallback meeting if ID is not yet created", () => {
    const nonExistentId = `test-meet-${Date.now()}`;
    const meeting = inMemoryStore.getMeeting(nonExistentId);
    expect(meeting).toBeDefined();
    expect(meeting.id).toBe(nonExistentId);
    expect(meeting.agent).toBeDefined();
    expect(meeting.status).toBe("live");
  });

  it("should update meeting summary and status correctly", () => {
    const meetId = `test-meet-update-${Date.now()}`;
    inMemoryStore.createMeeting({
      id: meetId,
      title: "Interactive Review",
      agentId: "agent-david",
      userId: "user-default-1",
      status: "live",
      startedAt: new Date().toISOString(),
      durationSeconds: 0,
      recordingUrl: "/recordings/test.webm",
    });

    const updated = inMemoryStore.updateMeeting(meetId, {
      status: "completed",
      durationSeconds: 150,
      summary: {
        meetingId: meetId,
        overview: "Successful test meeting.",
        keyTakeaways: ["Point 1", "Point 2"],
        topics: [
          {
            id: "top-1",
            title: "Test Topic",
            timestamp: "00:10",
            seconds: 10,
            summary: "Test summary",
            bulletPoints: ["Detail 1"],
          },
        ],
        actionItems: [
          {
            id: "act-1",
            task: "Verify test suite",
            owner: "Tester",
            priority: "high",
            status: "pending",
          },
        ],
        sentiment: {
          positive: 90,
          neutral: 8,
          negative: 2,
          verdict: "High Velocity",
        },
      },
    });

    expect(updated.status).toBe("completed");
    expect(updated.durationSeconds).toBe(150);
    expect(updated.summary?.overview).toBe("Successful test meeting.");
    expect(updated.summary?.topics.length).toBe(1);
    expect(updated.summary?.actionItems.length).toBe(1);
  });
});
