'use client';

// Google Drive API Integration Service
// Requires: Google OAuth 2.0 credentials with Drive API scopes

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  parents?: string[];
  shared?: boolean;
  starred?: boolean;
  trashed?: boolean;
}

export interface DriveFolder extends DriveFile {
  mimeType: 'application/vnd.google-apps.folder';
}

export interface DriveUser {
  email: string;
  displayName: string;
  photoLink?: string;
}

// MIME type mappings for file icons and preview types
export const MIME_TYPES = {
  // Folders
  folder: 'application/vnd.google-apps.folder',
  
  // Google Workspace
  googleDoc: 'application/vnd.google-apps.document',
  googleSheet: 'application/vnd.google-apps.spreadsheet',
  googleSlide: 'application/vnd.google-apps.presentation',
  googleForm: 'application/vnd.google-apps.form',
  googleDrawing: 'application/vnd.google-apps.drawing',
  
  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  
  // Spreadsheets
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  
  // Presentations
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  
  // Images
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  
  // Videos
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  
  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  
  // Code/Text
  text: 'text/plain',
  html: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  json: 'application/json',
  xml: 'application/xml',
  md: 'text/markdown',
  
  // Archives
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
};

// Check if a file type is previewable
export function isPreviewable(mimeType: string): boolean {
  const previewableTypes = [
    // Documents
    MIME_TYPES.pdf,
    MIME_TYPES.googleDoc,
    MIME_TYPES.googleSheet,
    MIME_TYPES.googleSlide,
    MIME_TYPES.doc,
    MIME_TYPES.docx,
    MIME_TYPES.xls,
    MIME_TYPES.xlsx,
    MIME_TYPES.ppt,
    MIME_TYPES.pptx,
    // Images
    MIME_TYPES.jpeg,
    MIME_TYPES.png,
    MIME_TYPES.gif,
    MIME_TYPES.webp,
    MIME_TYPES.svg,
    // Videos
    MIME_TYPES.mp4,
    MIME_TYPES.webm,
    MIME_TYPES.mov,
    // Text
    MIME_TYPES.text,
    MIME_TYPES.html,
    MIME_TYPES.css,
    MIME_TYPES.js,
    MIME_TYPES.json,
    MIME_TYPES.md,
    MIME_TYPES.csv,
  ];
  
  return previewableTypes.includes(mimeType) || 
         mimeType.startsWith('image/') || 
         mimeType.startsWith('video/') ||
         mimeType.startsWith('text/');
}

// Get file category for icon display
export function getFileCategory(mimeType: string): string {
  if (mimeType === MIME_TYPES.folder) return 'folder';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === MIME_TYPES.csv) return 'spreadsheet';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation';
  if (mimeType.includes('document') || mimeType.includes('word') || mimeType === MIME_TYPES.pdf) return 'document';
  if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('javascript')) return 'code';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return 'archive';
  return 'file';
}

// Format file size
export function formatFileSize(bytes: string | number | undefined): string {
  if (!bytes) return '';
  const size = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Format date
export function formatDate(dateString: string | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Google Drive API Client Class
export class GoogleDriveClient {
  private accessToken: string;
  private baseUrl = 'https://www.googleapis.com/drive/v3';
  
  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }
  
  private async fetch(endpoint: string, options: RequestInit = {}): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Google Drive API error');
    }
    
    return response.json();
  }
  
  // List files in a folder
  async listFiles(folderId: string = 'root', pageToken?: string): Promise<{ files: DriveFile[], nextPageToken?: string }> {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, createdTime, webViewLink, webContentLink, thumbnailLink, iconLink, parents, shared, starred)',
      orderBy: 'folder,name',
      pageSize: '100',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    
    if (pageToken) {
      params.append('pageToken', pageToken);
    }
    
    return this.fetch(`/files?${params.toString()}`);
  }
  
  // Search files - searches recursively within a folder if specified
  async searchFiles(query: string, rootFolderId?: string): Promise<{ files: DriveFile[] }> {
    // Search for files by name, and if rootFolderId is specified, 
    // we search all files but filter client-side or use full text search
    let q = `name contains '${query}' and trashed = false`;
    
    // If we have a root folder, search within it and all subfolders
    if (rootFolderId && rootFolderId !== 'root') {
      // Use fullText search which searches in all subfolders
      q = `fullText contains '${query}' and trashed = false and '${rootFolderId}' in parents or fullText contains '${query}' and trashed = false`;
    }
    
    const params = new URLSearchParams({
      q,
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, thumbnailLink, iconLink, parents)',
      orderBy: 'modifiedTime desc',
      pageSize: '50',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      corpora: rootFolderId && rootFolderId !== 'root' ? 'allDrives' : 'user',
    });
    
    return this.fetch(`/files?${params.toString()}`);
  }
  
  // Get file metadata
  async getFile(fileId: string): Promise<DriveFile> {
    const params = new URLSearchParams({
      fields: 'id, name, mimeType, size, modifiedTime, createdTime, webViewLink, webContentLink, thumbnailLink, iconLink, parents, shared, starred',
      supportsAllDrives: 'true',
    });
    
    return this.fetch(`/files/${fileId}?${params.toString()}`);
  }
  
  // Get file content (for text files)
  async getFileContent(fileId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}?alt=media`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch file content');
    }
    
    return response.text();
  }
  
  // Export Google Workspace file (Docs, Sheets, Slides)
  async exportFile(fileId: string, mimeType: string): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/export?mimeType=${encodeURIComponent(mimeType)}`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to export file');
    }
    
    return response.blob();
  }
  
  // Get file download URL (for binary files)
  getDownloadUrl(fileId: string): string {
    return `${this.baseUrl}/files/${fileId}?alt=media`;
  }
  
  // Get embed URL for preview
  getEmbedUrl(file: DriveFile): string {
    // For Google Docs - use the edit URL with embedded parameter
    if (file.mimeType === MIME_TYPES.googleDoc) {
      return `https://docs.google.com/document/d/${file.id}/preview?rm=minimal`;
    }
    // For Google Sheets
    if (file.mimeType === MIME_TYPES.googleSheet) {
      return `https://docs.google.com/spreadsheets/d/${file.id}/preview?rm=minimal`;
    }
    // For Google Slides
    if (file.mimeType === MIME_TYPES.googleSlide) {
      return `https://docs.google.com/presentation/d/${file.id}/embed?start=false&loop=false&delayms=3000`;
    }
    // For PDFs - use Google Drive viewer
    if (file.mimeType === MIME_TYPES.pdf) {
      return `https://drive.google.com/file/d/${file.id}/preview`;
    }
    // For Office documents (.docx, .xlsx, .pptx) - use webViewLink if available
    if (file.mimeType.includes('officedocument') || file.mimeType.includes('msword') || file.mimeType.includes('ms-excel') || file.mimeType.includes('ms-powerpoint')) {
      // Use the webViewLink converted to preview mode
      if (file.webViewLink) {
        return file.webViewLink.replace('/view', '/preview');
      }
      return `https://drive.google.com/file/d/${file.id}/preview`;
    }
    // For images - return direct link
    if (file.mimeType.startsWith('image/')) {
      return file.webContentLink || file.thumbnailLink || `https://drive.google.com/uc?id=${file.id}`;
    }
    // Default fallback - use Google Drive preview
    return `https://drive.google.com/file/d/${file.id}/preview`;
  }
  
  // List shared drives
  async listSharedDrives(): Promise<{ drives: { id: string; name: string }[] }> {
    return this.fetch('/drives?pageSize=100');
  }
  
  // Get user info
  async getUserInfo(): Promise<DriveUser> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to get user info');
    }
    
    const data = await response.json();
    return {
      email: data.email,
      displayName: data.name,
      photoLink: data.picture,
    };
  }
}

// OAuth configuration
export const GOOGLE_OAUTH_CONFIG = {
  clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
  scopes: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
  redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/api/auth/google/callback` : '',
};

// Generate OAuth URL
export function getGoogleOAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_OAUTH_CONFIG.clientId,
    redirect_uri: GOOGLE_OAUTH_CONFIG.redirectUri,
    response_type: 'code',
    scope: GOOGLE_OAUTH_CONFIG.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: state || '',
  });
  
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
