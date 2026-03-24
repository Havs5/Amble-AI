import { z } from 'zod';

// --- Chat API Schemas ---

export const ContentPartSchema = z.object({
  type: z.enum(['text', 'image_url']),
  text: z.string().optional(),
  image_url: z.object({
    url: z.string(),
    detail: z.enum(['auto', 'low', 'high']).optional(),
  }).optional(),
});

export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.union([z.string(), z.array(ContentPartSchema)]),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
});

export const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  systemPrompt: z.string().max(10000).optional(),
  policies: z.array(z.string().max(1000)).max(50).optional(),
  stream: z.boolean().optional(),
  useRAG: z.boolean().optional(),
  tools: z.array(z.any()).optional(),
  capabilities: z.object({
    navMode: z.boolean().optional(),
    webBrowse: z.boolean().optional(),
    enableBrowse: z.boolean().optional(),
  }).optional(),
  agentMode: z.enum(['planner', 'researcher', 'coder', 'auto']).optional(),
  context: z.record(z.string(), z.any()).optional(), 
  userId: z.string().optional(), // Added for memory
  projectId: z.string().optional().nullable(),
  // Knowledge Base integration - folder map from Google Drive
  knowledgeBase: z.object({
    folderMap: z.array(z.object({
      id: z.string(),
      name: z.string(),
      path: z.string(),
      type: z.enum(['folder', 'file']),
      mimeType: z.string().optional(),
      keywords: z.array(z.string()),
      department: z.string().optional(),
    })).optional(),
    accessToken: z.string().optional(),
  }).optional(),
});

// --- Knowledge Base Schemas ---

export const IngestRequestSchema = z.object({
  fileBase64: z.string(),
  filename: z.string(),
  contentType: z.string(),
  projectId: z.string().optional(),
});

// --- Auth / User Schemas ---

export const UserProfileSchema = z.object({
  displayName: z.string().min(2),
  email: z.string().email(),
  photoURL: z.string().url().optional(),
});

export const OrganizationSchema = z.object({
  name: z.string().min(3),
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
});
