import { Inngest } from "inngest";

// Initialize the Inngest client with an event key or local dev mode
export const inngest = new Inngest({
  id: "clarity-video-meetings",
  name: "Clarity AI Video Meetings Pipeline",
  eventKey: process.env.INNGEST_EVENT_KEY || "local_dev_event_key",
});
