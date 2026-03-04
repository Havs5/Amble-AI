'use client';

import React from 'react';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import { Message as MessageType, ToolCall } from '@/types/chat';
import { Terminal, CheckCircle2, AlertCircle, FileText, Image as ImageIcon, Globe, ChevronDown, ChevronRight, BrainCircuit, Copy, Check, Sparkles } from 'lucide-react';
import { AIAvatar, TypingIndicator } from '../ui/TypingIndicator';
import { MessageFeedback, FeedbackData } from './MessageFeedback';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true
});

/** Sanitize HTML output from markdown rendering */
function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody',
      'tr', 'th', 'td', 'img', 'hr', 'span', 'div', 'sub', 'sup', 'del', 's'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'id'],
    ADD_ATTR: ['target'],
  });
}

function parseThinking(content: string) {
  // 1. Extract Thinking Block
  let thinking: string | null = null;
  let cleanContent = content;
  
  const thinkMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/);
  if (thinkMatch) {
    thinking = thinkMatch[1].trim();
    cleanContent = content.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim();
  }

  // 2. Extract Sources [Source: XYZ]
  const sources: string[] = [];
  const sourceRegex = /\[Source:\s*(.*?)\]/g;
  let match;
  while ((match = sourceRegex.exec(cleanContent)) !== null) {
      if (match[1]) sources.push(match[1].trim());
  }
  
  // Remove sources from display text if we found them (optional, or keep them inline? 
  // Requirement says "Render as chips", implying we should likely move them out or enhance them.
  // Let's remove them from the markdown so they don't duplicate.
  cleanContent = cleanContent.replace(sourceRegex, '').trim();

  return { thinking, cleanContent, sources };
}

interface MessageProps {
  message: MessageType;
  isStreaming?: boolean;
}

export function Message({ message, isStreaming = false }: MessageProps) {
  const isUser = message.role === 'user';
  const { thinking, cleanContent, sources } = parseThinking(message.content); // Use updated parser
  const [isThinkingOpen, setIsThinkingOpen] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  
  const renderContent = () => {
    return { __html: sanitizeHtml(md.render(cleanContent)) };
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(cleanContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`group flex w-full animate-slide-up ${isUser ? 'justify-end' : 'justify-start gap-3'}`}>
      
      {/* Avatar - Only for AI */}
      {!isUser && (
        <div className="shrink-0 mt-1">
          <AIAvatar isThinking={isStreaming && !cleanContent} size="md" />
        </div>
      )}
      
      {/* Message Content Container */}
      <div className={`
        flex flex-col max-w-[85%] md:max-w-[75%]
        ${isUser ? 'items-end' : 'items-start min-w-0 flex-1'}
      `}>
         {/* Author Name / Meta - Only for AI */}
         {!isUser && (
            <div className="flex items-center gap-2 mb-1.5 px-1">
                <span className="font-semibold text-sm bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-500">
                  Amble AI
                </span>
                <span className="text-[11px] text-muted-foreground/70">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {message.metadata?.mode === 'thinking' && (
                    <span className="flex items-center gap-1 text-[10px] bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-500 px-2 py-0.5 rounded-full border border-purple-500/20">
                      <BrainCircuit size={10} />
                      Deep Thinking
                    </span>
                )}
            </div>
         )}

         {/* Bubble Container */}
         <div className={`
            relative overflow-hidden transition-all duration-300
            ${isUser 
              ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl rounded-tr-md px-4 py-3 shadow-lg shadow-indigo-500/20' 
              : 'bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm text-foreground rounded-2xl rounded-tl-md px-4 py-3 border border-slate-200/50 dark:border-slate-700/50'
            }
         `}>
            {/* Shimmer effect for streaming */}
            {isStreaming && !cleanContent && (
              <div className="flex items-center gap-3 py-1">
                <TypingIndicator variant="wave" size="md" />
                <span className="text-sm text-muted-foreground">Thinking...</span>
              </div>
            )}
            
            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {message.attachments.map(att => (
                  <div key={att.id} className={`
                    flex items-center gap-2 p-2 rounded-xl text-xs
                    ${isUser 
                      ? 'bg-white/20 border border-white/30' 
                      : 'bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600'
                    }
                  `}>
                    {att.type === 'image' ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    <span className="max-w-[120px] truncate">{att.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Thinking / Reasoning Block */}
            {thinking && (
                <div className="mb-4 rounded-xl overflow-hidden bg-gradient-to-br from-purple-500/5 to-pink-500/5 border border-purple-500/20">
                   <div 
                     className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-500/10 to-pink-500/10 cursor-pointer hover:from-purple-500/15 hover:to-pink-500/15 transition-colors"
                     onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                   >
                      <div className="p-1 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
                        <BrainCircuit className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">Thought Process</span>
                      {isThinkingOpen 
                        ? <ChevronDown className="w-3 h-3 ml-auto text-purple-500" /> 
                        : <ChevronRight className="w-3 h-3 ml-auto text-purple-500" />
                      }
                   </div>
                   
                   {isThinkingOpen && (
                     <div className="p-3 text-sm leading-relaxed text-muted-foreground border-t border-purple-500/10">
                        <div 
                          className="prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-1"
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(md.render(thinking)) }} 
                        />
                     </div>
                   )}
                </div>
            )}

            {/* Text Content */}
            {cleanContent && (
              <div 
                  className={`prose dark:prose-invert max-w-none break-words
                    ${isUser 
                      ? 'prose-sm prose-p:m-0 prose-p:leading-relaxed prose-invert' 
                      : 'prose-base prose-p:leading-7 prose-li:my-1 prose-headings:text-foreground prose-a:text-indigo-500 hover:prose-a:text-indigo-600'
                    }
                  `}
                  dangerouslySetInnerHTML={renderContent()}
              />
            )}

            {/* Sources / Citations */}
            {!isUser && sources && sources.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
                    <span className="text-[10px] items-center flex font-semibold text-muted-foreground uppercase tracking-wider mr-1">
                        Verified Sources:
                    </span>
                    {sources.map((source, idx) => (
                        <div 
                            key={idx} 
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/20 transition-all hover:bg-indigo-100 dark:hover:bg-indigo-500/20 cursor-default"
                            title="Verified Context"
                        >
                            <CheckCircle2 className="w-3 h-3 text-indigo-500" />
                            <span className="truncate max-w-[150px]">{source}</span>
                        </div>
                    ))}
                </div>
            )}
            
            {/* Actions: Feedback toolbar */}
            {!isUser && cleanContent && (
              <div className="mt-3 pt-2 border-t border-slate-100/50 dark:border-slate-700/30 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <MessageFeedback
                  messageId={message.id}
                  onFeedback={(feedback: FeedbackData) => {
                    // TODO: persist feedback to backend
                    console.log('[Feedback]', feedback);
                  }}
                  onCopy={handleCopy}
                  showRegenerate={false}
                  className="text-muted-foreground"
                />
                <span className="text-[10px] text-muted-foreground/40">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
         </div>

         {/* Tool Calls - Render below bubble */}
         {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-3 w-full space-y-2">
            {message.toolCalls.map(tool => (
              <ToolCallDisplay key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallDisplay({ tool }: { tool: ToolCall }) {
  const isSearch = tool.toolName === 'search' || tool.toolName === 'web_search';
  const isExtract = tool.toolName === 'web_extract';
  const [isExpanded, setIsExpanded] = React.useState(false);

  // If it's a search or extract tool and we have results
  if ((isSearch || isExtract) && tool.result && (tool.result.results || tool.result.urls)) {
    const results = (tool.result.results || []) as Array<{ title: string; url: string; snippet?: string; content?: string }>;
    
    if (results.length > 0) {
      return (
        <div className="animate-fade-in mt-4">
            {/* Collapsed Header - Always visible */}
            <div 
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-300
                ${isExpanded 
                  ? 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-b-none' 
                  : 'bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-700/60 border border-slate-200/50 dark:border-slate-700/50 hover:border-blue-500/30 hover:from-blue-50 hover:to-cyan-50 dark:hover:from-blue-900/20 dark:hover:to-cyan-900/20'
                }
              `}
              onClick={() => setIsExpanded(!isExpanded)}
            >
               {/* Icon */}
               <div className={`
                 p-2 rounded-lg transition-all duration-300
                 ${isExpanded 
                   ? 'bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/25' 
                   : 'bg-gradient-to-br from-blue-500/80 to-cyan-500/80'
                 }
               `}>
                 <Globe className="w-4 h-4 text-white" />
               </div>
               
               {/* Text */}
               <div className="flex-1 min-w-0">
                 <div className="flex items-center gap-2">
                   <span className="font-semibold text-sm text-foreground">
                     {isSearch ? 'Web Sources' : 'Extracted Content'}
                   </span>
                   <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                     {results.length} {results.length === 1 ? 'source' : 'sources'}
                   </span>
                 </div>
                 {!isExpanded && (
                   <div className="text-xs text-muted-foreground mt-0.5 truncate">
                     {results.slice(0, 3).map(r => {
                       try { return new URL(r.url).hostname; } catch { return r.url; }
                     }).join(' • ')}
                     {results.length > 3 && ` +${results.length - 3} more`}
                   </div>
                 )}
               </div>
               
               {/* Expand Arrow */}
               <div className={`
                 p-1 rounded-lg transition-all duration-300
                 ${isExpanded ? 'bg-blue-500/10 rotate-180' : 'bg-slate-200/50 dark:bg-slate-700/50'}
               `}>
                 <ChevronDown className={`w-4 h-4 transition-colors ${isExpanded ? 'text-blue-500' : 'text-muted-foreground'}`} />
               </div>
            </div>
            
            {/* Expanded Content */}
            {isExpanded && (
                <div className="border border-t-0 border-blue-500/20 rounded-b-xl bg-gradient-to-b from-blue-500/5 to-transparent p-3 space-y-2">
                    {results.map((r, i) => (
                        <a 
                            key={i} 
                            href={r.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-start gap-3 p-3 rounded-lg bg-white/60 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50 hover:border-blue-500/30 transition-all duration-200 group"
                        >
                            {/* Source Number */}
                            <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-white">{i + 1}</span>
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                                {r.title || 'Untitled'}
                              </div>
                              <div className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-0.5 truncate">
                                {(() => { try { return new URL(r.url).hostname; } catch { return r.url; } })()}
                              </div>
                              {r.snippet && (
                                <div className="text-xs text-muted-foreground line-clamp-2 mt-1.5 leading-relaxed">{r.snippet}</div>
                              )}
                            </div>
                            
                            {/* External Link Icon */}
                            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </div>
      );
    }
  }

  // Default display for other tools
  return (
    <div className="animate-fade-in glass-card rounded-xl overflow-hidden text-sm">
      <div 
        className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-slate-100/80 to-slate-50/80 dark:from-slate-800/80 dark:to-slate-700/80 cursor-pointer hover:from-slate-100 hover:to-slate-100 dark:hover:from-slate-700 dark:hover:to-slate-700 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500">
          <Terminal className="w-3 h-3 text-white" />
        </div>
        <span className="font-mono text-xs font-semibold text-muted-foreground">
            {tool.toolName}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {tool.status === 'completed' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : tool.status === 'failed' ? (
            <AlertCircle className="w-4 h-4 text-red-500" />
          ) : (
             <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          )}
          {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-3 space-y-2 border-t border-border/50">
            <div className="font-mono text-xs text-muted-foreground bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg">
              <span className="select-none opacity-50">args: </span>
              {JSON.stringify(tool.args)}
            </div>
            
            {tool.result && (
            <div className="mt-2 pt-2 border-t border-border/50">
                {tool.toolName === 'generate_image' && tool.result.url ? (
                <img src={tool.result.url} alt="Generated" className="rounded-xl max-w-sm w-full shadow-lg" />
                ) : (
                <pre className="text-xs overflow-x-auto p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg max-h-40 overflow-y-auto scrollbar-thin">
                    {JSON.stringify(tool.result, null, 2)}
                </pre>
                )}
            </div>
            )}
        </div>
      )}
    </div>
  );
}
