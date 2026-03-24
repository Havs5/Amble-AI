/**
 * Company News — Data Types
 * 
 * Firestore collection: news_posts
 * Optional audit trail: news_audit
 */

export type NewsPriority = 'CRITICAL' | 'NORMAL' | 'FYI';
export type NewsStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type NewsVisibility = 'ALL' | 'DEPARTMENTS' | 'USERS';

export interface NewsPost {
  id: string;
  title: string;
  body: string;                    // Markdown or rich-text string
  summary: string;                 // Short preview (auto-generated from body if empty)
  departmentId: string;
  tags: string[];
  priority: NewsPriority;
  pinned: boolean;
  status: NewsStatus;
  visibility: NewsVisibility;
  allowedDepartmentIds: string[];  // Only used if visibility === 'DEPARTMENTS'
  allowedUserIds: string[];        // Only used if visibility === 'USERS'
  authorId: string;
  authorName: string;
  coverImage?: string;             // Cover image URL for visual cards
  link?: string;                   // Optional external link
  source?: string;                 // Reserved for future integration (Slack, Jira, etc.)
  createdAt: Date | null;
  updatedAt: Date | null;
  publishedAt: Date | null;        // Set when first published; used for sort
  publishAt: Date | null;          // Scheduled publish time (future = hidden)
  expiresAt: Date | null;          // Auto-expire (past = hidden)
}

export interface NewsAuditEntry {
  id: string;
  postId: string;
  action: 'CREATE' | 'UPDATE' | 'PUBLISH' | 'ARCHIVE' | 'PIN' | 'UNPIN' | 'DELETE';
  actorId: string;
  actorName: string;
  timestamp: Date;
  diff?: string;                   // Summary of what changed
}

// Departments configuration – extend as needed
export const NEWS_DEPARTMENTS: Record<string, string> = {
  billing: 'Billing/Disputes',
  patientExperience: 'Patient Experience',
  pharmacyCoordination: 'Pharmacy Coordination',
  trainingDevelopment: 'Training & Development',
  systemErrorsProviderCoordination: 'System Errors / Provider Coordination',
  sendblue: 'Sendblue',
  operations: 'Operations',
};

export const NEWS_TAGS = [
  'announcement',
  'update',
  'policy',
  'event',
  'training',
  'system',
  'urgent',
  'benefit',
  'recognition',
  'maintenance',
] as const;

// Helper: blank post for the editor
export function createBlankPost(authorId: string, authorName: string): Omit<NewsPost, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    title: '',
    body: '',
    summary: '',
    departmentId: 'general',
    tags: [],
    priority: 'NORMAL',
    pinned: false,
    status: 'DRAFT',
    visibility: 'ALL',
    allowedDepartmentIds: [],
    allowedUserIds: [],
    authorId,
    authorName,
    coverImage: undefined,
    publishedAt: null,
    publishAt: null,
    expiresAt: null,
  };
}
