import { z } from 'zod';

// ==========================================
// Status & Base Enums
// ==========================================
export const CheckStatusSchema = z.enum(['pass', 'warning', 'fail', 'unknown']);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type Severity = z.infer<typeof SeveritySchema>;

export const EvidenceSourceSchema = z.enum(['header', 'dns', 'derived']);
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const VerificationStatusSchema = z.enum(['unverified', 'pending', 'verified', 'failed']);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const WorkspaceRoleSchema = z.enum(['owner', 'admin', 'member']);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

// ==========================================
// Evidence & Finding Checks
// ==========================================
export const EvidenceItemSchema = z.object({
  id: z.string(),
  checkId: z.string().optional(),
  source: EvidenceSourceSchema,
  name: z.string(),
  observedValue: z.union([z.string(), z.array(z.string()), z.record(z.unknown()), z.null()]),
  expectedValue: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
  resolver: z.string().optional(),
  observedAt: z.string(),
  rawReference: z.string().optional()
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const FindingCheckSchema = z.object({
  id: z.string(),
  reportId: z.string().optional().nullable(),
  domainId: z.string().optional(),
  key: z.string(),
  status: CheckStatusSchema,
  severity: SeveritySchema,
  summary: z.string(),
  explanation: z.string(),
  evidence: z.array(EvidenceItemSchema),
  recommendation: z.string().optional(),
  checkedAt: z.string(),
  confidence: z.number().min(0).max(1)
});
export type FindingCheck = z.infer<typeof FindingCheckSchema>;

// ==========================================
// Score & Report Model
// ==========================================
export const ScoreBreakdownCategorySchema = z.object({
  key: z.string(),
  name: z.string(),
  weight: z.number(),
  earned: z.number(),
  status: CheckStatusSchema,
  unknownDeduction: z.boolean().default(false)
});
export type ScoreBreakdownCategory = z.infer<typeof ScoreBreakdownCategorySchema>;

export const ReportScoreSchema = z.object({
  score: z.number().min(0).max(100),
  coveragePercent: z.number().min(0).max(100),
  passedCount: z.number(),
  warningsCount: z.number(),
  failedCount: z.number(),
  unknownCount: z.number(),
  methodologyVersion: z.string(),
  breakdown: z.array(ScoreBreakdownCategorySchema)
});
export type ReportScore = z.infer<typeof ReportScoreSchema>;

export const ReportSchema = z.object({
  id: z.string(),
  domainId: z.string(),
  domainName: z.string(),
  inboundMessageId: z.string().nullable().optional(),
  score: z.number().min(0).max(100),
  coveragePercent: z.number().min(0).max(100),
  methodologyVersion: z.string(),
  summary: z.string(),
  checks: z.array(FindingCheckSchema),
  createdAt: z.string(),
  metadata: z.record(z.unknown()).optional()
});
export type Report = z.infer<typeof ReportSchema>;

// ==========================================
// Authentication & User Contracts
// ==========================================
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  authProviderId: z.string().nullable().optional(),
  createdAt: z.string()
});
export type User = z.infer<typeof UserSchema>;

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string()
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const WorkspaceMemberSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  role: WorkspaceRoleSchema,
  createdAt: z.string()
});
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;

export const RegisterInputSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().trim().min(1).max(100).optional(),
  workspaceName: z.string().trim().min(1).max(100).optional()
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(1, 'Password is required')
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const GoogleAuthInputSchema = z.object({
  code: z.string().optional(),
  idToken: z.string().optional(),
  redirectUri: z.string().url().optional()
});
export type GoogleAuthInput = z.infer<typeof GoogleAuthInputSchema>;

export const SessionResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
  workspace: WorkspaceSchema
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

// ==========================================
// Domain & Verification
// ==========================================
export const DomainInputSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/, 'Invalid domain format'),
  selector: z
    .string()
    .trim()
    .min(1)
    .max(63)
    .regex(/^[a-zA-Z0-9-_.]+$/, 'Invalid selector format')
    .optional()
});
export type DomainInput = z.infer<typeof DomainInputSchema>;

export const DomainSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  fqdn: z.string(),
  verificationStatus: VerificationStatusSchema,
  verifiedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  deletedAt: z.string().nullable().optional(),
  lastCheckScore: z.number().nullable().optional(),
  lastCheckedAt: z.string().nullable().optional()
});
export type Domain = z.infer<typeof DomainSchema>;

export const DomainVerificationChallengeSchema = z.object({
  id: z.string(),
  domainId: z.string(),
  recordName: z.string(),
  recordValue: z.string(),
  expiresAt: z.string(),
  verifiedAt: z.string().nullable().optional()
});
export type DomainVerificationChallenge = z.infer<typeof DomainVerificationChallengeSchema>;

// ==========================================
// Test Session & Inbound Message
// ==========================================
export const TestSessionSchema = z.object({
  id: z.string(),
  domainId: z.string(),
  recipientAddress: z.string().email(),
  recipientTokenHash: z.string(),
  expiresAt: z.string(),
  state: z.enum(['waiting', 'received', 'expired']),
  createdAt: z.string()
});
export type TestSession = z.infer<typeof TestSessionSchema>;

export const InboundMessageSummarySchema = z.object({
  id: z.string(),
  testSessionId: z.string(),
  providerMessageId: z.string().optional(),
  receivedAt: z.string(),
  fromDomain: z.string(),
  subjectRedacted: z.string(),
  parseStatus: z.enum(['parsed', 'failed', 'partial']),
  dedupeKey: z.string()
});
export type InboundMessageSummary = z.infer<typeof InboundMessageSummarySchema>;

// ==========================================
// Fix Proposals & Verification
// ==========================================
export const FixProposalSchema = z.object({
  id: z.string(),
  findingCheckId: z.string(),
  recordType: z.enum(['TXT', 'CNAME', 'MX', 'A']),
  recordHost: z.string(),
  currentValue: z.string().nullable().optional(),
  proposedValue: z.string(),
  rationale: z.string(),
  warning: z.string().optional(),
  state: z.enum(['proposed', 'verifying', 'verified', 'failed', 'dismissed']),
  createdAt: z.string()
});
export type FixProposal = z.infer<typeof FixProposalSchema>;

export const VerificationRunSchema = z.object({
  id: z.string(),
  fixProposalId: z.string(),
  state: z.enum(['in_progress', 'verified', 'failed']),
  attempts: z.number(),
  lastObservedValue: z.string().nullable().optional(),
  nextAttemptAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional()
});
export type VerificationRun = z.infer<typeof VerificationRunSchema>;

// ==========================================
// Monitoring & Snapshots
// ==========================================
export const MonitoringConfigSchema = z.object({
  id: z.string(),
  domainId: z.string(),
  enabled: z.boolean(),
  cronExpression: z.string(),
  timezone: z.string().default('UTC'),
  alertEmail: z.string().email().optional(),
  alertWebhookUrl: z.string().url().optional()
});
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;

export const DomainSnapshotSchema = z.object({
  id: z.string(),
  domainId: z.string(),
  score: z.number(),
  snapshotJson: z.record(z.unknown()),
  createdAt: z.string()
});
export type DomainSnapshot = z.infer<typeof DomainSnapshotSchema>;

// ==========================================
// Webhook Endpoints & Deliveries
// ==========================================
export const WebhookEndpointSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  url: z.string().url(),
  enabled: z.boolean(),
  eventTypes: z.array(z.string()),
  createdAt: z.string()
});
export type WebhookEndpoint = z.infer<typeof WebhookEndpointSchema>;

// ==========================================
// API Error & Envelopes
// ==========================================
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional()
  })
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
