/**
 * Export Utilities - Export chat conversations in various formats
 * 
 * Features:
 * - Export to Markdown
 * - Export to JSON
 * - Export to Plain Text
 * - Export to PDF (via browser print)
 * - Include metadata and timestamps
 */

import { Message, ChatSession } from '@/types/chat';

export type ExportFormat = 'markdown' | 'json' | 'text' | 'html';

// Extended session type for export (includes optional model field)
export interface ExportSession extends ChatSession {
  model?: string;
}

export interface ExportOptions {
  includeTimestamps?: boolean;
  includeMetadata?: boolean;
  includeSystemMessages?: boolean;
}

const DEFAULT_OPTIONS: ExportOptions = {
  includeTimestamps: true,
  includeMetadata: true,
  includeSystemMessages: false,
};

/**
 * Get text content from message
 */
function getMessageText(message: Message): string {
  // Content is always a string in Message type
  return message.content || '';
}

/**
 * Format timestamp
 */
function formatTimestamp(timestamp: number | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Export to Markdown format
 */
export function exportToMarkdown(
  session: ExportSession,
  messages: Message[],
  options: ExportOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];

  // Header
  lines.push(`# ${session.title || 'Untitled Chat'}`);
  lines.push('');
  
  if (opts.includeMetadata) {
    lines.push('---');
    lines.push(`**Session ID:** ${session.id}`);
    if (session.createdAt) {
      lines.push(`**Created:** ${formatTimestamp(session.createdAt)}`);
    }
    if (session.model) {
      lines.push(`**Model:** ${session.model}`);
    }
    lines.push('---');
    lines.push('');
  }

  // Messages
  for (const message of messages) {
    if (message.role === 'system' && !opts.includeSystemMessages) {
      continue;
    }

    const roleLabel = message.role === 'user' ? '**You**' : '**Assistant**';
    const timestamp = opts.includeTimestamps && message.timestamp 
      ? ` _(${formatTimestamp(message.timestamp)})_` 
      : '';
    
    lines.push(`### ${roleLabel}${timestamp}`);
    lines.push('');
    lines.push(getMessageText(message));
    lines.push('');
    
    // Add attachments info
    if (message.attachments && message.attachments.length > 0) {
      lines.push('_Attachments:_');
      for (const attachment of message.attachments) {
        lines.push(`- ${attachment.name} (${attachment.type})`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Export to JSON format
 */
export function exportToJSON(
  session: ExportSession,
  messages: Message[],
  options: ExportOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const filteredMessages = messages.filter(m => 
    m.role !== 'system' || opts.includeSystemMessages
  );

  const exportData = {
    exportedAt: new Date().toISOString(),
    format: 'amble-ai-export-v1',
    session: {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      model: session.model,
      ...(opts.includeMetadata && {
        messageCount: messages.length,
        ownerId: session.ownerId,
        visibility: session.visibility,
      }),
    },
    messages: filteredMessages.map(m => ({
      id: m.id,
      role: m.role,
      content: getMessageText(m),
      ...(opts.includeTimestamps && m.timestamp && {
        timestamp: m.timestamp,
      }),
      ...(m.attachments && m.attachments.length > 0 && {
        attachments: m.attachments.map(a => ({
          name: a.name,
          type: a.type,
        })),
      }),
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export to plain text format
 */
export function exportToText(
  session: ExportSession,
  messages: Message[],
  options: ExportOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];

  // Header
  lines.push(session.title || 'Untitled Chat');
  lines.push('='.repeat(50));
  
  if (opts.includeMetadata) {
    if (session.createdAt) {
      lines.push(`Created: ${formatTimestamp(session.createdAt)}`);
    }
    if (session.model) {
      lines.push(`Model: ${session.model}`);
    }
    lines.push('');
  }

  lines.push('-'.repeat(50));
  lines.push('');

  // Messages
  for (const message of messages) {
    if (message.role === 'system' && !opts.includeSystemMessages) {
      continue;
    }

    const roleLabel = message.role === 'user' ? 'You' : 'Assistant';
    const timestamp = opts.includeTimestamps && message.timestamp 
      ? ` (${formatTimestamp(message.timestamp)})` 
      : '';
    
    lines.push(`[${roleLabel}]${timestamp}`);
    lines.push(getMessageText(message));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Export to HTML format (for PDF printing)
 */
export function exportToHTML(
  session: ExportSession,
  messages: Message[],
  options: ExportOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const styles = `
    <style>
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        line-height: 1.6;
      }
      h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
      .metadata { color: #666; font-size: 0.9em; margin-bottom: 20px; }
      .message { margin-bottom: 20px; padding: 15px; border-radius: 8px; }
      .user { background-color: #e3f2fd; }
      .assistant { background-color: #f5f5f5; }
      .role { font-weight: bold; margin-bottom: 5px; }
      .timestamp { color: #666; font-size: 0.8em; }
      .content { white-space: pre-wrap; }
      @media print {
        .message { break-inside: avoid; }
      }
    </style>
  `;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${session.title || 'Chat Export'}</title>
  ${styles}
</head>
<body>
  <h1>${session.title || 'Untitled Chat'}</h1>
`;

  if (opts.includeMetadata) {
    html += `  <div class="metadata">
    ${session.createdAt ? `<p>Created: ${formatTimestamp(session.createdAt)}</p>` : ''}
    ${session.model ? `<p>Model: ${session.model}</p>` : ''}
  </div>\n`;
  }

  for (const message of messages) {
    if (message.role === 'system' && !opts.includeSystemMessages) {
      continue;
    }

    const roleLabel = message.role === 'user' ? 'You' : 'Assistant';
    const timestamp = opts.includeTimestamps && message.timestamp 
      ? `<span class="timestamp">${formatTimestamp(message.timestamp)}</span>` 
      : '';
    
    // Escape HTML in content
    const content = getMessageText(message)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    html += `  <div class="message ${message.role}">
    <div class="role">${roleLabel} ${timestamp}</div>
    <div class="content">${content}</div>
  </div>\n`;
  }

  html += `</body>
</html>`;

  return html;
}

/**
 * Download export as file
 */
export function downloadExport(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Export and download chat
 */
export function exportChat(
  session: ExportSession,
  messages: Message[],
  format: ExportFormat,
  options: ExportOptions = {}
): void {
  const timestamp = new Date().toISOString().slice(0, 10);
  const safeTitle = (session.title || 'chat').replace(/[^a-z0-9]/gi, '_').slice(0, 50);
  
  let content: string;
  let filename: string;
  let mimeType: string;

  switch (format) {
    case 'markdown':
      content = exportToMarkdown(session, messages, options);
      filename = `${safeTitle}_${timestamp}.md`;
      mimeType = 'text/markdown';
      break;
    
    case 'json':
      content = exportToJSON(session, messages, options);
      filename = `${safeTitle}_${timestamp}.json`;
      mimeType = 'application/json';
      break;
    
    case 'text':
      content = exportToText(session, messages, options);
      filename = `${safeTitle}_${timestamp}.txt`;
      mimeType = 'text/plain';
      break;
    
    case 'html':
      content = exportToHTML(session, messages, options);
      filename = `${safeTitle}_${timestamp}.html`;
      mimeType = 'text/html';
      break;
    
    default:
      throw new Error(`Unknown export format: ${format}`);
  }

  downloadExport(content, filename, mimeType);
}

/**
 * Open print dialog for PDF export
 */
export function printChat(
  session: ExportSession,
  messages: Message[],
  options: ExportOptions = {}
): void {
  const html = exportToHTML(session, messages, options);
  
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    
    // Wait for content to load then print
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}

export default {
  exportToMarkdown,
  exportToJSON,
  exportToText,
  exportToHTML,
  exportChat,
  printChat,
};
