
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Attachment {
  id: string;
  type: 'image' | 'pdf' | 'text' | 'doc' | 'file';
  name: string;
  url?: string;
  file?: File;
  previewUrl?: string;
  status: 'uploading' | 'ready' | 'error';
}

export interface ToolCall {
  id: string;
  toolName: string;
  args: any;
  status: 'running' | 'completed' | 'failed';
  result?: any;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number | Date;
  mode?: 'standard' | 'thinking';
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  citations?: string[];
  metadata?: any;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number | Date;
  createdAt?: number | Date;
  preview?: string;
  tags?: string[];
  messages?: Message[];
  ownerId?: string;
  visibility?: 'private' | 'org';
  projectId?: string | null; // Link chat to a project
}

export interface Artifact {
  id: string;
  type: 'image' | 'video' | 'file' | 'code';
  url?: string;
  content?: string;
  language?: string;
  thumbnail?: string;
  title: string;
  createdAt: number | Date;
  metadata?: any;
  versions?: {
    versionId: string;
    content: string;
    timestamp: number;
    label?: string;
  }[];
  currentVersionIndex?: number;
}
