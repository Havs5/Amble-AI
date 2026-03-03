/**
 * Chat Service Types
 * Centralized type definitions for the chat system
 */

import { Attachment, Artifact, Message, ChatSession, ToolCall } from '@/types/chat';
import { ReasoningMode } from '@/utils/modelConstants';

// ============================================
// SESSION TYPES
// ============================================

export interface SessionCreateOptions {
  title?: string;
  projectId?: string | null;
  visibility?: 'private' | 'org';
}

export interface SessionLoadResult {
  session: ChatSession;
  messages: Message[];
}

export interface SessionUpdateOptions {
  title?: string;
  visibility?: 'private' | 'org';
  projectId?: string | null;
}

// ============================================
// STREAMING TYPES
// ============================================

export interface StreamChunk {
  type: 'content' | 'usage' | 'meta' | 'error' | 'done';
  content?: string;
  usage?: UsageData;
  meta?: StreamMeta;
  error?: string;
}

export interface UsageData {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
}

// ============================================
// TRACE EVENT TYPES (Agent Activity Telemetry)
// ============================================

export interface TraceEvent {
  id: string;
  type: 'search' | 'fetch' | 'analyze' | 'generate' | 'tool' | 'fallback' | 'info';
  label: string;
  status: 'running' | 'done' | 'error' | 'skipped';
  detail?: string;
  sources?: string[];
  durationMs?: number;
}

export interface StreamMeta {
  model?: string;
  tier?: string;
  isReasoning?: boolean;
  usedWebSearch?: boolean;
  status?: string;
  trace?: TraceEvent;
}

export interface StreamOptions {
  batchMs?: number;
  timeout?: number;
  onChunk?: (chunk: StreamChunk) => void;
  onMeta?: (meta: StreamMeta) => void;
}

export interface StreamResult {
  content: string;
  usage: UsageData | null;
  meta: StreamMeta | null;
  aborted: boolean;
}

// ============================================
// SEARCH TYPES
// ============================================

export interface SearchDecision {
  shouldSearchKB: boolean;
  shouldSearchWeb: boolean;
  intent: SearchIntent;
  confidence: number;
  hasProtectedUrl: boolean;
  extractUrls: string[];
}

export type SearchIntent = 'kb_only' | 'web_only' | 'hybrid' | 'none';

export interface SearchSource {
  type: 'knowledge_base' | 'web_google' | 'web_tavily' | 'database';
  name: string;
  content: string;
  url?: string;
  relevanceScore: number;
  fileId?: string;
  department?: string;
}

export interface SearchResultData {
  query: string;
  sources: SearchSource[];
  kbHit: boolean;
  webHit: boolean;
  contextPrompt: string;
  searchDuration: number;
  summary?: string;
}

export interface KBFolderMapEntry {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  mimeType?: string;
  department?: string;
  keywords: string[];  // Required to match FolderMapEntry
  content?: string;
  contentExtracted?: boolean;
}

// ============================================
// MESSAGE TYPES
// ============================================

// Message mode type that matches the Message interface
export type MessageMode = 'standard' | 'thinking';

export interface SendMessageOptions {
  content: string;
  attachments?: Attachment[];
  mode?: MessageMode;
  reasoningMode?: ReasoningMode; // For API - maps to actual model selection
  context?: Record<string, any>;
}

export interface MessageResult {
  userMessage: Message;
  assistantMessage: Message;
  toolCalls: ToolCall[];
  artifacts: Artifact[];
  usage: UsageData | null;
}

// ============================================
// API REQUEST TYPES
// ============================================

export interface ChatAPIRequest {
  messages: Array<{ role: string; content: string | any[] }>;
  model: string;
  stream: boolean;
  userId?: string;
  projectId?: string | null;
  capabilities?: Record<string, boolean>;
  useRAG?: boolean;
  agentMode?: string;
  context?: Record<string, any>;
  temperature?: number;
  maxTokens?: number;
  knowledgeBase?: Record<string, unknown>; // Legacy — no longer sent
}

// ============================================
// SERVICE INTERFACES
// ============================================

export interface ISessionService {
  create(options?: SessionCreateOptions): Promise<ChatSession>;
  load(sessionId: string): Promise<SessionLoadResult>;
  saveMessages(sessionId: string, messages: Message[]): Promise<void>;
  delete(sessionId: string): Promise<void>;
  listForUser(): Promise<ChatSession[]>;
  updateTitle(sessionId: string, title: string): Promise<void>;
  updateVisibility(sessionId: string, visibility: 'private' | 'org'): Promise<void>;
}

export interface IStreamingService {
  stream(url: string, body: ChatAPIRequest, options?: StreamOptions): Promise<StreamResult>;
  abort(): void;
  isStreaming(): boolean;
}

export interface ISearchService {
  analyzeQuery(query: string, capabilities: Record<string, boolean>): SearchDecision;
  search(query: string, decision: SearchDecision, conversationHistory?: Message[]): Promise<SearchResultData | null>;
  extractUrls(urls: string[]): Promise<any>;
  loadKBCache?(): void; // Legacy — no-op, kept for backward compat
  hasKBData(): boolean;
}

// ============================================
// HOOK RETURN TYPES
// ============================================

export interface UseSessionsReturn {
  sessions: ChatSession[];
  currentSessionId: string | null;
  isLoading: boolean;
  error: Error | null;
  createSession: (options?: SessionCreateOptions) => Promise<ChatSession | null>;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  shareSession: (sessionId: string, visibility: 'private' | 'org') => Promise<void>;
}

export interface UseMessagesReturn {
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  thinkingStatus: string;
  error: Error | null;
  sendMessage: (options: SendMessageOptions) => Promise<void>;
  cancelStream: () => void;
  clearMessages: () => void;
}

export interface UseStreamingReturn {
  isStreaming: boolean;
  progress: number;
  currentContent: string;
  stream: (url: string, body: ChatAPIRequest, options?: StreamOptions) => Promise<StreamResult>;
  abort: () => void;
}

// Re-export types from chat types for convenience
export type { Message, ChatSession, Attachment, Artifact, ToolCall };
