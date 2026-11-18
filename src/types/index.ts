export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: string;
}

export interface AIAgent {
  id: string;
  name: string;
  role: string;
  avatar: string;
  bio: string;
  systemPrompt: string;
  voice: 'alloy' | 'echo' | 'shimmer' | 'fable' | 'onyx' | 'nova';
  tags: string[];
  totalSessions?: number;
  averageRating?: number;
}

export interface TranscriptUtterance {
  id: string;
  speaker: 'user' | 'agent';
  speakerName: string;
  timestamp: string; // e.g. "02:15"
  seconds: number;
  text: string;
}

export interface MeetingTopic {
  id: string;
  title: string;
  timestamp: string; // e.g. "01:45"
  seconds: number;
  summary: string;
  bulletPoints: string[];
}

export interface ActionItem {
  id: string;
  task: string;
  owner: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed';
}

export interface MeetingSummary {
  meetingId: string;
  overview: string;
  topics: MeetingTopic[];
  actionItems: ActionItem[];
  keyTakeaways: string[];
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    verdict: string;
  };
}

export interface Meeting {
  id: string;
  title: string;
  agentId: string;
  agent?: AIAgent;
  userId: string;
  status: 'live' | 'processing' | 'completed';
  startedAt: string;
  endedAt?: string;
  durationSeconds: number;
  recordingUrl: string;
  summary?: MeetingSummary;
  transcripts?: TranscriptUtterance[];
}

export interface MeetingChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  referencedSeconds?: number[];
}

export interface PolarSubscription {
  id: string;
  status: 'active' | 'trialing' | 'canceled' | 'past_due';
  plan: 'Free' | 'Pro' | 'Enterprise';
  currentPeriodEnd: string;
  polarCustomerId?: string;
}
