
import React, { useState, useEffect, useMemo } from 'react';
import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';

// Configure markdown-it with highlight.js
const md = new MarkdownIt({
  html: true, // Enable HTML tags in source
  linkify: true, // Autoconvert URL-like text to links
  typographer: true
});

// Set highlight function separately to avoid circular reference in initializer
md.set({
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre class="hljs"><code>' +
               hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
               '</code></pre>';
      } catch (__) {}
    }

    return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
  }
});

interface ArtifactRendererProps {
  content: string;
  language: string;
}

export function ArtifactRenderer({ content, language }: ArtifactRendererProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');

  const isHtml = language === 'html' || language === 'svg';
  const isMarkdown = language === 'markdown' || language === 'md';
  // Basic react detection - if it starts with import/export, we can't run it easily so we default to code
  const isRunnable = isHtml || isMarkdown;

  // UseEffect to reset tab when content changes
  useEffect(() => {
    setActiveTab(isRunnable ? 'preview' : 'code');
  }, [content, language, isRunnable]);

  // Syntax highlighting for the "code" view (raw content)
  const highlightedCode = useMemo(() => {
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(content, { language }).value;
      }
    } catch (e) {
      console.warn('Highlighting failed', e);
    }
    return content; // Fallback
  }, [content, language]);

  // Rendered Markdown
  const renderedMarkdown = useMemo(() => {
    if (!isMarkdown) return '';
    return md.render(content);
  }, [content, isMarkdown]);

  return (
    <div className="flex flex-col h-full bg-background font-sans">
      {/* Tabs */}
      <div className="flex items-center gap-1 p-2 bg-muted/20 border-b border-border/50 shrink-0">
        {isRunnable && (
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'preview' 
                ? 'bg-background text-foreground shadow-sm' 
                : 'text-muted-foreground hover:bg-background/50'
            }`}
          >
            Preview
          </button>
        )}
        <button
          onClick={() => setActiveTab('code')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'code' 
              ? 'bg-background text-foreground shadow-sm' 
              : 'text-muted-foreground hover:bg-background/50'
          }`}
        >
          Code
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative min-h-0">
        {activeTab === 'preview' && isRunnable ? (
          isHtml ? (
            <PreviewFrame content={content} language={language} />
          ) : (
            /* Markdown Preview */
             <div 
                className="h-full overflow-auto p-6 prose dark:prose-invert max-w-none prose-sm prose-pre:bg-transparent prose-pre:p-0"
                dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
             />
          )
        ) : (
            /* Code View */
            <pre className="h-full overflow-auto p-4 text-xs font-mono bg-black/5 dark:bg-[#1e1e1e] m-0 leading-relaxed">
               <code 
                  dangerouslySetInnerHTML={{ 
                      __html: language && hljs.getLanguage(language) ? highlightedCode : content 
                  }} 
                  className={`language-${language} hljs bg-transparent p-0 block`}
               />
            </pre>
        )}
      </div>
    </div>
  );
}

function PreviewFrame({ content, language }: { content: string, language: string }) {
  if (language === 'html' || language === 'svg') {
    return (
      <iframe 
        srcDoc={content} 
        className="w-full h-full bg-white border-0"
        sandbox="allow-scripts"
        title="Preview"
      />
    );
  }

  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-4 text-center">
      Preview not available for {language}
    </div>
  );
}
