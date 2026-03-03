/**
 * Knowledge Base Types
 * 
 * Type definitions for the Knowledge Base system including
 * documents, embeddings, search results, and configurations.
 */

import { Timestamp } from 'firebase-admin/firestore';

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface KBDocument {
  id: string;
  title: string;
  sourceType: 'google_drive' | 'upload' | 'manual';
  sourcePath: string;
  sourceId: string; // Google Drive file ID
  mimeType: SupportedMimeType;
  category: DocumentCategory;
  tags: string[];
  metadata: DocumentMetadata;
  syncStatus: 'pending' | 'synced' | 'error' | 'skipped';
  errorMessage?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface KBChunk {
  id: string;
  documentId: string;
  content: string;
  embedding?: number[];
  metadata: ChunkMetadata;
  tokenCount: number;
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  description?: string;
  tags?: string[];
  category?: DocumentCategory;
  department?: string;
  product?: string;
  pharmacy?: string;
  size?: number;
  pageCount?: number;
  wordCount?: number;
  language?: string;
  // Image-related metadata
  imageCount?: number;
  imageAnalysisEnabled?: boolean;
  imageDescriptions?: string[];
  hasVisualContent?: boolean;
}

export interface ChunkMetadata {
  startIndex: number;
  endIndex: number;
  pageNumber?: number;
  sectionTitle?: string;
  isHeader: boolean;
  isTable: boolean;
  isCode: boolean;
  isImageDescription?: boolean;
  imageId?: string;
}

export type DocumentCategory = 
  | 'department'
  | 'pharmacy'
  | 'product'
  | 'resource'
  | 'training'
  | 'policy'
  | 'procedure'
  | 'template'
  | 'general';

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SearchQuery {
  text: string;
  filters?: SearchFilters;
  limit?: number;
  minScore?: number;
  includeContent?: boolean;
}

export interface SearchFilters {
  categories?: DocumentCategory[];
  departments?: string[];
  products?: string[];
  pharmacies?: string[];
  mimeTypes?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface SearchResult {
  documentId: string;
  documentTitle?: string;
  sourcePath?: string;
  content: string;
  score: number;
  highlights?: string[];
  matchType: 'semantic' | 'keyword' | 'hybrid';
  metadata?: DocumentMetadata;
}

export interface KBSearchResponse {
  results: SearchResult[];
  totalCount: number;
  query: string;
  processingTime: number;
  hasMore: boolean;
  context: string; // Formatted context for AI
}

// ═══════════════════════════════════════════════════════════════════════════════
// RAG PIPELINE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface RAGRequest {
  query: string;
  conversationHistory?: ConversationMessage[];
  userId?: string;
  projectId?: string;
  useKnowledgeBase?: boolean;
  useWebSearch?: boolean;
  maxResults?: number;
  filters?: {
    category?: DocumentCategory;
    department?: string;
    pharmacy?: string;
    product?: string;
  };
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface RAGResponse {
  answer: string;
  sources: string[];
  confidence: number;
  processingTimeMs: number;
  usedKB: boolean;
  usedWebSearch: boolean;
  kbResults?: SearchResult[];
  webResults?: WebSearchResult[];
  error?: string;
}

export interface RAGSource {
  type: 'knowledge_base' | 'web_search' | 'conversation';
  title: string;
  url?: string;
  excerpt: string;
  relevanceScore: number;
  documentId?: string;
}

export interface RAGContext {
  relevantChunks: SearchResult[];
  context: string;
  sources: string[];
  totalTokens: number;
  searchQuery: string;
}

export interface RAGPipelineConfig {
  maxKBResults: number;
  maxWebResults: number;
  minKBConfidence: number;
  enableWebFallback: boolean;
  maxContextTokens: number;
  responseFormat: 'markdown' | 'plain' | 'html';
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE DRIVE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime: string;
  createdTime: string;
  parents?: string[];
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
}

export interface DriveFolderStructure {
  id: string;
  name: string;
  path: string;
  files: DriveFileInfo[];
  subfolders: DriveFolderStructure[];
}

export interface DriveSyncState {
  rootFolderId: string;
  status: 'idle' | 'syncing' | 'error' | 'completed';
  lastSyncTime?: Timestamp;
  syncStartedAt?: Timestamp;
  documentsProcessed?: number;
  totalChunks?: number;
  lastSyncDuration?: number;
  errors?: string[] | null;
  currentOperation?: string | null;
  updatedAt?: Timestamp;
}

export const GOOGLE_EXPORT_TYPES: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

export interface SyncStatus {
  isRunning: boolean;
  lastSyncTime?: Date;
  nextSyncTime?: Date;
  documentsTotal: number;
  documentsIndexed: number;
  documentsError: number;
  currentFile?: string;
  progress: number; // 0-100
  errors: SyncError[];
}

export interface SyncError {
  fileId: string;
  fileName: string;
  error: string;
  timestamp: Date;
}

export interface SyncResult {
  success: boolean;
  documentsProcessed: number;
  documentsIndexed: number;
  documentsSkipped: number;
  documentsError: number;
  errors: SyncError[];
  duration: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMBEDDING TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EmbeddingRequest {
  text: string;
  model?: 'text-embedding-3-small' | 'text-embedding-3-large';
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  tokenCount: number;
}

export interface VectorSearchRequest {
  queryEmbedding: number[];
  limit: number;
  minScore?: number;
  filters?: SearchFilters;
}

export interface VectorSearchResult {
  chunkId: string;
  documentId: string;
  score: number;
  content: string;
  metadata: ChunkMetadata;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface KBConfig {
  driveFolderId: string;
  driveUrl?: string;
  syncIntervalMinutes: number;
  maxDocuments: number;
  maxContentSizeKB: number;
  autoSyncEnabled: boolean;
  embeddingModel: 'text-embedding-3-small' | 'text-embedding-3-large';
  minRelevanceScore: number;
  contextChunks: number;
  webSearchFallback: boolean;
  webSearchProvider: 'tavily' | 'google';
}

export interface KBStats {
  totalDocuments: number;
  totalChunks: number;
  totalTokens: number;
  indexSize: number; // in bytes
  lastSyncTime?: Date;
  categoryCounts: Record<DocumentCategory, number>;
  topProducts: { name: string; count: number }[];
  topPharmacies: { name: string; count: number }[];
  healthStatus: 'healthy' | 'stale' | 'error';
}

// ═══════════════════════════════════════════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface KBApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface KBSearchApiRequest {
  query: string;
  filters?: SearchFilters;
  limit?: number;
}

export interface KBSyncApiRequest {
  fullSync?: boolean;
  folderId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type SupportedMimeType =
  | 'application/pdf'
  | 'application/vnd.google-apps.document'
  | 'application/vnd.google-apps.spreadsheet'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'text/plain'
  | 'text/markdown'
  | 'text/csv'
  | 'application/json'
  | 'text/xml'
  | 'application/xml'
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

export const SUPPORTED_MIME_TYPES: SupportedMimeType[] = [
  'application/pdf',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/xml',
  'application/xml',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

export function isSupportedMimeType(mimeType: string): mimeType is SupportedMimeType {
  return SUPPORTED_MIME_TYPES.includes(mimeType as SupportedMimeType);
}

// Product and pharmacy mappings for classification
export const PRODUCT_KEYWORDS: Record<string, string[]> = {
  tirzepatide: ['tirzepatide', 'mounjaro', 'zepbound', 'tirz'],
  semaglutide: ['semaglutide', 'ozempic', 'wegovy', 'rybelsus', 'sema'],
  sermorelin: ['sermorelin', 'sermorelin acetate'],
  tesamorelin: ['tesamorelin', 'egrifta'],
  'pt-141': ['pt-141', 'pt141', 'bremelanotide'],
  ondansetron: ['ondansetron', 'zofran'],
  nad: ['nad', 'nad+', 'nicotinamide'],
  lipotropic: ['lipotropic', 'mic', 'mic b12', 'mic+b12'],
  'lipo-c': ['lipo-c', 'lipoc', 'lipo c'],
  glutathione: ['glutathione', 'gsh'],
  acne: ['acne', 'acne treatment'],
};

export const PHARMACY_KEYWORDS: Record<string, string[]> = {
  absolute: ['absolute', 'absolute pharmacy'],
  align: ['align', 'align pharmacy', 'align rx'],
  boothwyn: ['boothwyn', 'boothwyn pharmacy'],
  'gogo meds': ['gogo', 'gogo meds', 'go go meds'],
  'greenwich rx': ['greenwich', 'greenwich rx'],
  hallandale: ['hallandale', 'hallandale pharmacy'],
  link: ['link', 'link pharmacy'],
  partell: ['partell', 'partell pharmacy'],
  'perfect rx': ['perfect', 'perfect rx', 'perfectrx'],
  'pharmacy hub': ['pharmacy hub', 'pharmacyhub'],
  revive: ['revive', 'revive pharmacy'],
};

export const DEPARTMENT_KEYWORDS: Record<string, string[]> = {
  billing: ['billing', 'disputes', 'invoice', 'payment', 'charge', 'refund'],
  'patient experience': ['patient', 'customer', 'support', 'service', 'care'],
  'pharmacy coordination': ['pharmacy coordination', 'rx coordination'],
  'send blue': ['send blue', 'sendblue', 'sms', 'text message'],
  'system provider': ['system', 'provider', 'integration'],
};
