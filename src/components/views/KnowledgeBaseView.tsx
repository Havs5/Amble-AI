'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  Folder, 
  FolderOpen, 
  File, 
  FileText, 
  Image as ImageIcon, 
  Film, 
  FileSpreadsheet,
  FileType,
  ChevronRight, 
  ChevronDown, 
  RefreshCw,
  Search,
  AlertCircle,
  Loader2,
  Download,
  ExternalLink,
  Calendar,
  HardDrive,
  Eye,
  LogOut,
  Info,
  FileCode,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';
import { useAuth } from '../auth/AuthContextRefactored';
import { KB_DRIVE_FOLDER_ID } from '../../lib/constants';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
}

interface DriveFolder {
  id: string;
  name: string;
  children: (DriveFile | DriveFolder)[];
  isExpanded: boolean;
  isLoading: boolean;
}

type DriveItem = DriveFile | DriveFolder;

const isFolder = (item: DriveItem): item is DriveFolder => {
  return 'children' in item || (item as DriveFile).mimeType === 'application/vnd.google-apps.folder';
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const formatFileSize = (sizeStr?: string): string => {
  if (!sizeStr) return '—';
  const bytes = parseInt(sizeStr, 10);
  if (isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getFileTypeName = (mimeType: string): string => {
  if (mimeType.includes('folder')) return 'Folder';
  if (mimeType.includes('pdf')) return 'PDF Document';
  if (mimeType.includes('image')) return 'Image';
  if (mimeType.includes('video')) return 'Video';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('xlsx')) return 'Spreadsheet';
  if (mimeType.includes('document') || mimeType.includes('word')) return 'Document';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'Presentation';
  if (mimeType.includes('xml')) return 'XML File';
  if (mimeType.includes('json')) return 'JSON File';
  if (mimeType.includes('text')) return 'Text File';
  if (mimeType.includes('google-apps.document')) return 'Google Doc';
  if (mimeType.includes('google-apps.spreadsheet')) return 'Google Sheet';
  if (mimeType.includes('google-apps.presentation')) return 'Google Slides';
  return 'File';
};

const isTokenExpired = (): boolean => {
  const expiry = localStorage.getItem('googleTokenExpiry');
  if (!expiry) return false; // No expiry set — assume valid until proven otherwise
  return Date.now() > parseInt(expiry, 10);
};

// ═══════════════════════════════════════════════════════════════════════════════
// ICON HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const getFileIcon = (mimeType: string, size: number = 18) => {
  if (mimeType.includes('folder')) return <Folder size={size} className="text-amber-500 shrink-0" />;
  if (mimeType.includes('image')) return <ImageIcon size={size} className="text-green-500 shrink-0" />;
  if (mimeType.includes('video') || mimeType.includes('mp4') || mimeType.includes('mov')) return <Film size={size} className="text-purple-500 shrink-0" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('xlsx') || mimeType.includes('xlsb')) return <FileSpreadsheet size={size} className="text-emerald-500 shrink-0" />;
  if (mimeType.includes('document') || mimeType.includes('pdf') || mimeType.includes('word')) return <FileText size={size} className="text-blue-500 shrink-0" />;
  if (mimeType.includes('xml') || mimeType.includes('json')) return <FileCode size={size} className="text-orange-500 shrink-0" />;
  return <File size={size} className="text-slate-400 shrink-0" />;
};

// ═══════════════════════════════════════════════════════════════════════════════
// FILE PREVIEW COMPONENT — FIXED: proper previews, no ghost pages
// ═══════════════════════════════════════════════════════════════════════════════

interface FilePreviewProps {
  file: DriveFile | null;
  accessToken: string | null;
  onTokenExpired?: () => void;
}

function FilePreview({ file, accessToken, onTokenExpired }: FilePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const prevFileIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setError(null);
      setLoading(false);
      setIframeLoaded(false);
      setImageZoom(1);
      prevFileIdRef.current = null;
      return;
    }

    // Reset state when file changes
    if (prevFileIdRef.current !== file.id) {
      setPreviewUrl(null);
      setError(null);
      setIframeLoaded(false);
      setImageZoom(1);
      prevFileIdRef.current = file.id;
    }

    // Note: Most preview types (Google Docs, PDFs, videos) work without an access token.
    // Only image downloads and text file fetches require authentication.
    // Do NOT call onTokenExpired here — it would cause logout on every file click.

    setLoading(true);
    setError(null);

    const generatePreview = async () => {
      try {
        const mimeType = file.mimeType.toLowerCase();
        
        // Images — fetch via authenticated request and display as blob
        if (mimeType.includes('image')) {
          if (accessToken && !isTokenExpired()) {
            try {
              const imgUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
              const response = await fetch(imgUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
              });
              if (response.status === 401 || response.status === 403) {
                // Token invalid — fall through to thumbnail fallback, don't logout
                console.warn('[KB] Image auth failed, using thumbnail fallback');
              } else if (response.ok) {
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                setPreviewUrl(blobUrl);
                setLoading(false);
                return;
              }
            } catch {
              // Fall through to thumbnail
            }
          }
          // Fallback: use thumbnail or Google Drive preview
          if (file.thumbnailLink) {
            setPreviewUrl(file.thumbnailLink.replace('=s220', '=s1600'));
          } else {
            setPreviewUrl(`https://drive.google.com/file/d/${file.id}/preview`);
          }
          setLoading(false);
          return;
        }
        
        // Google Workspace files — use proper viewer URLs (FIXES wrong page display)
        if (mimeType.includes('google-apps.document')) {
          setPreviewUrl(`https://docs.google.com/document/d/${file.id}/preview`);
          setLoading(false);
          return;
        }
        if (mimeType.includes('google-apps.spreadsheet')) {
          setPreviewUrl(`https://docs.google.com/spreadsheets/d/${file.id}/preview`);
          setLoading(false);
          return;
        }
        if (mimeType.includes('google-apps.presentation')) {
          setPreviewUrl(`https://docs.google.com/presentation/d/${file.id}/preview`);
          setLoading(false);
          return;
        }

        // PDFs — Google Drive preview
        if (mimeType.includes('pdf')) {
          setPreviewUrl(`https://drive.google.com/file/d/${file.id}/preview`);
          setLoading(false);
          return;
        }
        
        // Videos — Google Drive player
        if (mimeType.includes('video') || mimeType.includes('mp4') || mimeType.includes('quicktime') || mimeType.includes('mov')) {
          setPreviewUrl(`https://drive.google.com/file/d/${file.id}/preview`);
          setLoading(false);
          return;
        }
        
        // Office documents — Google Docs viewer renders .docx, .xlsx, .pptx correctly
        if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || 
            mimeType.includes('document') || mimeType.includes('word') ||
            mimeType.includes('xlsb') || mimeType.includes('xlsx') ||
            mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
          setPreviewUrl(`https://docs.google.com/gview?url=https://drive.google.com/uc?id=${file.id}&embedded=true`);
          setLoading(false);
          return;
        }
        
        // Text-based files — fetch and display as code
        if (mimeType.includes('xml') || mimeType.includes('json') || 
            mimeType.startsWith('text/') || mimeType.includes('csv')) {
          setPreviewUrl(`text:${file.id}`);
          setLoading(false);
          return;
        }
        
        // Default fallback
        setPreviewUrl(`https://drive.google.com/file/d/${file.id}/preview`);
        setLoading(false);
      } catch (err: any) {
        setError(err.message || 'Failed to load preview');
        setLoading(false);
      }
    };

    generatePreview();

    return () => {
      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [file?.id, accessToken]);

  // Empty state
  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500">
        <div className="text-center px-8">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Eye size={32} className="opacity-30" />
          </div>
          <p className="text-lg font-medium text-slate-500 dark:text-slate-400">Select a file to preview</p>
          <p className="text-sm mt-2 text-slate-400 dark:text-slate-500">
            Supports images, PDFs, videos, documents, spreadsheets, and more
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-500">
        <div className="text-center px-8">
          <AlertCircle size={48} className="mx-auto mb-4" />
          <p className="font-medium">{error}</p>
          {error.includes('token') && (
            <button 
              onClick={onTokenExpired}
              className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm inline-flex items-center gap-2"
            >
              <LogOut size={14} /> Reconnect Google Drive
            </button>
          )}
        </div>
      </div>
    );
  }

  const mimeType = file.mimeType.toLowerCase();

  // Action buttons (download + external link)
  const ActionButtons = () => (
    <div className="absolute top-3 right-3 z-10 flex gap-1.5">
      {file.webContentLink && (
        <a href={file.webContentLink} target="_blank" rel="noopener noreferrer"
          className="p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors shadow-sm border border-slate-200/50 dark:border-slate-700/50"
          title="Download">
          <Download size={15} className="text-slate-600 dark:text-slate-300" />
        </a>
      )}
      {file.webViewLink && (
        <a href={file.webViewLink} target="_blank" rel="noopener noreferrer"
          className="p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors shadow-sm border border-slate-200/50 dark:border-slate-700/50"
          title="Open in Google Drive">
          <ExternalLink size={15} className="text-slate-600 dark:text-slate-300" />
        </a>
      )}
    </div>
  );

  // Image preview with zoom
  if (mimeType.includes('image') && previewUrl) {
    return (
      <div className="flex-1 flex flex-col relative">
        <ActionButtons />
        <div className="absolute bottom-3 right-3 z-10 flex gap-1.5 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-lg p-1 shadow-sm border border-slate-200/50 dark:border-slate-700/50">
          <button onClick={() => setImageZoom(z => Math.max(0.25, z - 0.25))} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="Zoom out">
            <ZoomOut size={14} className="text-slate-600 dark:text-slate-300" />
          </button>
          <span className="text-xs text-slate-500 self-center px-1 min-w-[3rem] text-center">{Math.round(imageZoom * 100)}%</span>
          <button onClick={() => setImageZoom(z => Math.min(4, z + 0.25))} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="Zoom in">
            <ZoomIn size={14} className="text-slate-600 dark:text-slate-300" />
          </button>
          <button onClick={() => setImageZoom(1)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="Reset zoom">
            <Maximize2 size={14} className="text-slate-600 dark:text-slate-300" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/50 overflow-auto">
          <img 
            src={previewUrl} 
            alt={file.name}
            className="max-w-full max-h-full object-contain rounded-lg shadow-lg transition-transform duration-200"
            style={{ transform: `scale(${imageZoom})` }}
            onError={() => setError('Failed to load image')}
          />
        </div>
      </div>
    );
  }

  // Text/XML/JSON preview
  if (previewUrl?.startsWith('text:')) {
    return <TextPreview file={file} accessToken={accessToken} onTokenExpired={onTokenExpired} />;
  }

  // Iframe preview (PDF, Video, Docs) — key={file.id} forces remount to prevent stale documents
  if (previewUrl) {
    return (
      <div className="flex-1 flex flex-col relative">
        <ActionButtons />
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-[5]">
            <div className="text-center">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Loading document...</p>
            </div>
          </div>
        )}
        <div className="flex-1">
          <iframe
            key={file.id}
            ref={iframeRef}
            src={previewUrl}
            className={`w-full h-full border-0 transition-opacity duration-300 ${iframeLoaded ? 'opacity-100' : 'opacity-0'}`}
            allow="autoplay; encrypted-media"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            onLoad={() => setIframeLoaded(true)}
            onError={() => setError('Failed to load document preview')}
          />
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="flex-1 flex items-center justify-center text-slate-400">
      <div className="text-center">
        {getFileIcon(file.mimeType, 48)}
        <p className="mt-4 font-medium">{file.name}</p>
        <p className="text-sm mt-2">Preview not available for this file type</p>
        {file.webViewLink && (
          <a href={file.webViewLink} target="_blank" rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">
            <ExternalLink size={16} /> Open in Google Drive
          </a>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEXT PREVIEW — for XML, JSON, plain text, CSV with in-file search
// ═══════════════════════════════════════════════════════════════════════════════

function TextPreview({ file, accessToken, onTokenExpired }: { file: DriveFile; accessToken: string | null; onTokenExpired?: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchContent = async () => {
      if (!accessToken) {
        setError('No access token');
        setLoading(false);
        return;
      }

      try {
        let url: string;
        const mimeType = file.mimeType.toLowerCase();
        
        if (mimeType.includes('google-apps.document')) {
          url = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
        } else if (mimeType.includes('google-apps.spreadsheet')) {
          url = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/csv`;
        } else {
          url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
        }

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (response.status === 401 || response.status === 403) {
          onTokenExpired?.();
          throw new Error('Access token expired. Please reconnect Google Drive.');
        }
        if (!response.ok) throw new Error(`Failed to fetch file (${response.status})`);
        
        const text = await response.text();
        setContent(text);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    setContent(null);
    setError(null);
    setSearchTerm('');
    fetchContent();
  }, [file.id, accessToken]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-500">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto mb-4" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const isXml = file.mimeType.includes('xml');
  const isJson = file.mimeType.includes('json');
  const textColorClass = isXml ? 'text-green-400' : isJson ? 'text-amber-400' : 'text-slate-300';

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-2 bg-slate-800 border-b border-slate-700 flex items-center gap-2">
        <Search size={14} className="text-slate-500" />
        <input
          type="text"
          placeholder="Search in file..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-transparent text-sm text-slate-300 placeholder-slate-500 focus:outline-none"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="text-slate-500 hover:text-slate-300">
            <X size={14} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4 bg-slate-900">
        <pre className={`text-sm ${textColorClass} font-mono whitespace-pre-wrap leading-relaxed`}>
          {searchTerm ? (
            (content || '').split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) => (
              part.toLowerCase() === searchTerm.toLowerCase() 
                ? <mark key={i} className="bg-yellow-500/30 text-yellow-300 rounded px-0.5">{part}</mark>
                : <React.Fragment key={i}>{part}</React.Fragment>
            ))
          ) : content}
        </pre>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE METADATA PANEL — Right-side details panel
// ═══════════════════════════════════════════════════════════════════════════════

function FileMetadataPanel({ file, onClose }: { file: DriveFile; onClose: () => void }) {
  return (
    <div className="w-72 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 p-4 overflow-auto shrink-0">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-200">File Details</h3>
        <button onClick={onClose} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded">
          <X size={14} className="text-slate-400" />
        </button>
      </div>

      <div className="flex items-start gap-3 mb-5 pb-4 border-b border-slate-200 dark:border-slate-700">
        <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center shrink-0 shadow-sm">
          {getFileIcon(file.mimeType, 22)}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm text-slate-800 dark:text-slate-200 break-words">{file.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">{getFileTypeName(file.mimeType)}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <Calendar size={14} className="text-slate-400 shrink-0" />
          <div>
            <p className="text-xs text-slate-400">Modified</p>
            <p className="text-sm text-slate-700 dark:text-slate-300">{formatDate(file.modifiedTime)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <HardDrive size={14} className="text-slate-400 shrink-0" />
          <div>
            <p className="text-xs text-slate-400">Size</p>
            <p className="text-sm text-slate-700 dark:text-slate-300">{formatFileSize(file.size)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <FileType size={14} className="text-slate-400 shrink-0" />
          <div>
            <p className="text-xs text-slate-400">MIME Type</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono break-all">{file.mimeType}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
        {file.webViewLink && (
          <a href={file.webViewLink} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700">
            <ExternalLink size={14} /> Open in Drive
          </a>
        )}
        {file.webContentLink && (
          <a href={file.webContentLink} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700">
            <Download size={14} /> Download
          </a>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE TREE ITEM COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface FileTreeItemProps {
  item: DriveItem;
  depth: number;
  selectedId: string | null;
  onSelect: (item: DriveFile) => void;
  onToggleFolder: (folderId: string) => void;
  expandedFolders: Set<string>;
  folderContents: Map<string, DriveItem[]>;
  loadingFolders: Set<string>;
}

function FileTreeItem({ 
  item, depth, selectedId, onSelect, onToggleFolder,
  expandedFolders, folderContents, loadingFolders
}: FileTreeItemProps) {
  const isItemFolder = isFolder(item) || (item as DriveFile).mimeType === 'application/vnd.google-apps.folder';
  const isExpanded = expandedFolders.has(item.id);
  const isLoading = loadingFolders.has(item.id);
  const children = folderContents.get(item.id) || [];

  const handleClick = () => {
    if (isItemFolder) {
      onToggleFolder(item.id);
    } else {
      onSelect(item as DriveFile);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors duration-150 ${
          selectedId === item.id 
            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' 
            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        title={item.name}
      >
        {isItemFolder ? (
          <>
            {isLoading ? (
              <Loader2 size={14} className="animate-spin text-slate-400 shrink-0" />
            ) : isExpanded ? (
              <ChevronDown size={14} className="text-slate-400 shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-slate-400 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen size={18} className="text-amber-500 shrink-0" />
            ) : (
              <Folder size={18} className="text-amber-500 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            {getFileIcon((item as DriveFile).mimeType)}
          </>
        )}
        <span className="truncate text-sm">{item.name}</span>
      </button>

      {isItemFolder && isExpanded && (
        <div>
          {isLoading && children.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
              <Loader2 size={12} className="animate-spin" /> Loading...
            </div>
          )}
          {children.map((child) => (
            <FileTreeItem
              key={child.id}
              item={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggleFolder={onToggleFolder}
              expandedFolders={expandedFolders}
              folderContents={folderContents}
              loadingFolders={loadingFolders}
            />
          ))}
          {children.length === 0 && !isLoading && (
            <div className="text-xs text-slate-400 py-1 italic"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT — Performance optimized with caching and token management
// ═══════════════════════════════════════════════════════════════════════════════

export function KnowledgeBaseView() {
  const { getIdToken } = useAuth();
  
  const [rootItems, setRootItems] = useState<DriveItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderContents, setFolderContents] = useState<Map<string, DriveItem[]>>(new Map());
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showMetadata, setShowMetadata] = useState(true);
  const [fileCount, setFileCount] = useState(0);
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'type'>('name');
  
  // Folder cache for performance
  const folderCacheRef = useRef<Map<string, { data: DriveItem[]; timestamp: number }>>(new Map());
  const FOLDER_CACHE_TTL = 5 * 60 * 1000;
  
  // Load and validate Google Drive token
  useEffect(() => {
    const loadToken = () => {
      const expiry = localStorage.getItem('googleTokenExpiry');
      if (expiry && Date.now() > parseInt(expiry, 10)) {
        console.log('[KB] Google Drive token expired, clearing...');
        localStorage.removeItem('googleAccessToken');
        localStorage.removeItem('googleTokenExpiry');
        return;
      }
      
      let token = localStorage.getItem('googleAccessToken');
      if (!token) {
        const keys = Object.keys(localStorage);
        const driveKey = keys.find(k => k.startsWith('gdrive_access_token_'));
        if (driveKey) token = localStorage.getItem(driveKey);
      }
      if (token) setAccessToken(token);
    };
    
    loadToken();
    const interval = setInterval(loadToken, 60000);
    return () => clearInterval(interval);
  }, []);

  // Token expiry handler — clears Drive tokens but does NOT logout the user
  const handleTokenExpired = useCallback(() => {
    console.log('[KB] Google Drive token expired, clearing Drive tokens...');
    localStorage.removeItem('googleAccessToken');
    localStorage.removeItem('googleTokenExpiry');
    localStorage.removeItem('googleRefreshToken');
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('gdrive_access_token_') || k.startsWith('gdrive_refresh_token_')) {
        localStorage.removeItem(k);
      }
    });
    setAccessToken(null);
    // Don't call logout() — user should stay logged in.
    // The drive-list API falls back to service account when no user token is available.
  }, []);

  // Fetch root folder
  const fetchRootFolder = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const firebaseToken = await getIdToken();
      if (!firebaseToken) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/knowledge/drive-list', {
        headers: { 'Authorization': `Bearer ${firebaseToken}` },
      });

      if (response.status === 401) {
        handleTokenExpired();
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch files');
      }

      const data = await response.json();
      const files = data.files || [];
      setRootItems(files);
      setFileCount(files.length);
      
      if (data.accessToken) {
        setAccessToken(data.accessToken);
        localStorage.setItem('googleAccessToken', data.accessToken);
        localStorage.setItem('googleTokenExpiry', String(Date.now() + 50 * 60 * 1000));
      }
    } catch (err: any) {
      console.error('[KB] Error fetching files:', err);
      if (err.message?.includes('token expired') || err.message?.includes('reconnect')) {
        handleTokenExpired();
      } else {
        setError(err.message || 'Failed to load files');
      }
    } finally {
      setLoading(false);
    }
  }, [getIdToken, handleTokenExpired]);

  useEffect(() => { fetchRootFolder(); }, [fetchRootFolder]);

  // ── AUTO-LOAD all subfolders RECURSIVELY so search finds files at any depth ──
  useEffect(() => {
    if (rootItems.length === 0 || loading) return;

    let cancelled = false;
    let totalLoaded = 0;

    const loadFoldersRecursive = async (folders: DriveItem[]) => {
      const firebaseToken = await getIdToken();
      if (!firebaseToken || cancelled) return;

      const subFoldersToLoad: DriveItem[] = [];

      for (const folder of folders) {
        if (!isFolder(folder) || cancelled) continue;
        if (folderContents.has(folder.id)) {
          // Already loaded — check children for nested folders
          const children = folderContents.get(folder.id) || [];
          subFoldersToLoad.push(...children.filter(isFolder));
          continue;
        }

        const cached = folderCacheRef.current.get(folder.id);
        if (cached && (Date.now() - cached.timestamp) < FOLDER_CACHE_TTL) {
          if (!cancelled) {
            setFolderContents(prev => new Map(prev).set(folder.id, cached.data));
            subFoldersToLoad.push(...cached.data.filter(isFolder));
            totalLoaded++;
          }
          continue;
        }

        try {
          const response = await fetch(`/api/knowledge/drive-list?folderId=${encodeURIComponent(folder.id)}`, {
            headers: { 'Authorization': `Bearer ${firebaseToken}` },
          });
          if (!response.ok) continue;
          const data = await response.json();
          const files = data.files || [];

          if (!cancelled) {
            folderCacheRef.current.set(folder.id, { data: files, timestamp: Date.now() });
            setFolderContents(prev => new Map(prev).set(folder.id, files));
            subFoldersToLoad.push(...files.filter(isFolder));
            totalLoaded++;
          }
        } catch {
          // Silently skip
        }
      }

      // Recurse into newly discovered subfolders (max depth naturally limited by folder structure)
      if (subFoldersToLoad.length > 0 && !cancelled) {
        await loadFoldersRecursive(subFoldersToLoad);
      }
    };

    loadFoldersRecursive(rootItems.filter(isFolder)).then(() => {
      if (!cancelled) console.log(`[KB] Recursive pre-load complete: ${totalLoaded} folders loaded`);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootItems, loading, getIdToken]);

  // Update total file count whenever folderContents changes
  useEffect(() => {
    let total = rootItems.filter(item => !isFolder(item)).length;
    folderContents.forEach(children => {
      total += children.filter(item => !isFolder(item)).length;
    });
    setFileCount(total);
  }, [rootItems, folderContents]);

  // Toggle folder with cache
  const handleToggleFolder = useCallback(async (folderId: string) => {
    const isCurrentlyExpanded = expandedFolders.has(folderId);

    if (isCurrentlyExpanded) {
      setExpandedFolders(prev => {
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      });
    } else {
      setExpandedFolders(prev => new Set(prev).add(folderId));

      // Check memory cache
      const cached = folderCacheRef.current.get(folderId);
      if (cached && (Date.now() - cached.timestamp) < FOLDER_CACHE_TTL) {
        setFolderContents(prev => new Map(prev).set(folderId, cached.data));
        return;
      }
      if (folderContents.has(folderId)) return;

      setLoadingFolders(prev => new Set(prev).add(folderId));

      try {
        const firebaseToken = await getIdToken();
        if (!firebaseToken) return;

        const response = await fetch(`/api/knowledge/drive-list?folderId=${encodeURIComponent(folderId)}`, {
          headers: { 'Authorization': `Bearer ${firebaseToken}` },
        });

        if (response.status === 401) {
          handleTokenExpired();
          return;
        }
        if (!response.ok) throw new Error('Failed to fetch folder contents');

        const data = await response.json();
        const files = data.files || [];
        
        folderCacheRef.current.set(folderId, { data: files, timestamp: Date.now() });
        setFolderContents(prev => new Map(prev).set(folderId, files));
      } catch (err) {
        console.error('[KB] Error fetching folder:', err);
      } finally {
        setLoadingFolders(prev => {
          const next = new Set(prev);
          next.delete(folderId);
          return next;
        });
      }
    }
  }, [expandedFolders, folderContents, getIdToken, handleTokenExpired]);

  const handleSelectFile = useCallback((file: DriveFile) => {
    setSelectedFile(file);
  }, []);

  // Sync KB
  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);

    try {
      const firebaseToken = await getIdToken();
      const driveToken = localStorage.getItem('googleAccessToken');

      if (!firebaseToken || !driveToken) {
        setError('Not authenticated. Please reconnect Google Drive.');
        setSyncing(false);
        return;
      }

      if (isTokenExpired()) {
        handleTokenExpired();
        return;
      }

      const response = await fetch('/api/knowledge/drive-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firebaseToken}`,
        },
        body: JSON.stringify({
          accessToken: driveToken,
          folderId: KB_DRIVE_FOLDER_ID,
        }),
      });

      if (response.status === 401) {
        handleTokenExpired();
        return;
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sync failed');

      folderCacheRef.current.clear();
      await fetchRootFolder();
    } catch (err: any) {
      console.error('[KB] Sync error:', err);
      if (err.message?.includes('token') || err.message?.includes('expired')) {
        handleTokenExpired();
      } else {
        setError(err.message);
      }
    } finally {
      setSyncing(false);
    }
  }, [getIdToken, fetchRootFolder, handleTokenExpired]);

  // Search across ALL loaded items — returns files with their folder path for context
  const searchAllItems = useCallback((items: DriveItem[], q: string): (DriveFile & { _folderPath?: string })[] => {
    const results: (DriveFile & { _folderPath?: string })[] = [];
    const seen = new Set<string>();
    const lower = q.toLowerCase();

    // Build a parentId → name map for path reconstruction
    const folderNames = new Map<string, string>();
    for (const item of items) {
      if (isFolder(item)) folderNames.set(item.id, item.name);
    }
    folderContents.forEach((children, parentId) => {
      for (const item of children) {
        if (isFolder(item)) folderNames.set(item.id, item.name);
      }
    });

    const search = (items: DriveItem[], path: string) => {
      for (const item of items) {
        if (item.name.toLowerCase().includes(lower) && !isFolder(item) && !seen.has(item.id)) {
          seen.add(item.id);
          results.push({ ...(item as DriveFile), _folderPath: path || undefined });
        }
        const children = folderContents.get(item.id);
        if (children) {
          const childPath = path ? `${path} › ${item.name}` : item.name;
          search(children, childPath);
        }
      }
    };

    search(items, '');

    // Also search ALL loaded folder contents
    folderContents.forEach((children, parentId) => {
      const parentName = folderNames.get(parentId) || '';
      search(children, parentName);
    });

    return results;
  }, [folderContents]);

  // Sort function for items
  const sortItems = useCallback((items: DriveItem[]) => {
    return [...items].sort((a, b) => {
      // Folders always come first
      const aIsFolder = isFolder(a);
      const bIsFolder = isFolder(b);
      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;

      switch (sortBy) {
        case 'date':
          return new Date((b as any).modifiedTime || 0).getTime() - new Date((a as any).modifiedTime || 0).getTime();
        case 'type':
          return ((a as any).mimeType || '').localeCompare((b as any).mimeType || '');
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [sortBy]);

  const filteredItems = useMemo(() => {
    if (!searchQuery) return sortItems(rootItems);
    const results = searchAllItems(rootItems, searchQuery);
    const matchingFolders = rootItems.filter(item => 
      isFolder(item) && item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return sortItems([...matchingFolders, ...results]);
  }, [searchQuery, rootItems, searchAllItems, sortItems, sortBy]);

  return (
    <div className="flex-1 flex h-full bg-white dark:bg-slate-900">
      {/* Left Panel - File Explorer */}
      <div className="w-80 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-slate-50 dark:bg-slate-900 shrink-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-slate-200">Knowledge Base</h2>
              <p className="text-xs text-slate-400 mt-0.5">{fileCount} items</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowMetadata(prev => !prev)}
                className={`p-2 rounded-lg transition-colors ${showMetadata ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500'}`}
                title="Toggle file details panel"
              >
                <Info size={16} />
              </button>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                title="Sync with Google Drive"
              >
                <RefreshCw size={16} className={`text-slate-500 ${syncing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search files and folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
          {/* Sort Controls */}
          <div className="flex items-center gap-1 mt-2">
            <span className="text-xs text-slate-400 mr-1">Sort:</span>
            {(['name', 'date', 'type'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  sortBy === s
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {loading ? (
            <div className="space-y-2 p-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 animate-pulse">
                  <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded" style={{ width: `${60 + Math.random() * 80}px` }} />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              <AlertCircle size={32} className="mx-auto mb-2" />
              <p className="text-sm">{error}</p>
              <button onClick={fetchRootFolder}
                className="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600">
                Retry
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Folder size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">{searchQuery ? 'No matching files found' : 'No files found'}</p>
              {!searchQuery && (
                <button onClick={handleSync}
                  className="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600">
                  Sync Knowledge Base
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredItems.map((item) => (
                <FileTreeItem
                  key={item.id}
                  item={item}
                  depth={0}
                  selectedId={selectedFile?.id ?? null}
                  onSelect={handleSelectFile}
                  onToggleFolder={handleToggleFolder}
                  expandedFolders={expandedFolders}
                  folderContents={folderContents}
                  loadingFolders={loadingFolders}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center Panel - File Preview */}
      <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 min-w-0">
        {selectedFile && (
          <div className="h-12 flex items-center gap-3 px-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 shrink-0">
            {getFileIcon(selectedFile.mimeType, 16)}
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{selectedFile.name}</span>
            <span className="text-xs text-slate-400 ml-auto shrink-0">{getFileTypeName(selectedFile.mimeType)}</span>
          </div>
        )}
        <FilePreview file={selectedFile} accessToken={accessToken} onTokenExpired={handleTokenExpired} />
      </div>

      {/* Right Panel - File Metadata */}
      {showMetadata && selectedFile && (
        <FileMetadataPanel file={selectedFile} onClose={() => setShowMetadata(false)} />
      )}
    </div>
  );
}

export default KnowledgeBaseView;
