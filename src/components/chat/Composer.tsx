import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, X, FileText, Loader2, BrainCircuit, Sparkles, Code, Search, Mic, MicOff, Image as ImageIcon, Square } from 'lucide-react';
import { Attachment } from '@/types/chat';
import { ReasoningMode } from '@/utils/modelConstants';
import { useChat } from '@/contexts';
import { useAiDictation } from '@/hooks/useAiDictation';

interface ComposerProps {
  onSend: (text: string, attachments: Attachment[], mode: ReasoningMode) => void;
  isStreaming: boolean;
  onModeChange?: (mode: ReasoningMode) => void;
  dictationEnabled?: boolean;
}

export function Composer({ onSend, isStreaming, onModeChange, dictationEnabled = true }: ComposerProps) {
  const { activeMode, stopGeneration } = useChat();
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [interimText, setInterimText] = useState(''); // Real-time speech preview
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Memoized callback for dictation results
  const handleDictationResult = useCallback((text: string) => {
    setInput(prev => prev ? `${prev} ${text}` : text);
    setInterimText(''); // Clear interim when final result arrives
    // Focus textarea after dictation
    textareaRef.current?.focus();
  }, []);

  // Callback for interim (real-time) results
  const handleInterimResult = useCallback((text: string) => {
    setInterimText(text);
  }, []);

  // Dictation hook with memoized callback
  const { isRecording, isProcessing, toggleRecording, currentMode, error: dictationError } = useAiDictation({
    onResult: handleDictationResult,
    onInterimResult: handleInterimResult,
  });

  // Clear interim text when recording stops
  useEffect(() => {
    if (!isRecording) {
      setInterimText('');
    }
  }, [isRecording]);

  const handleModeSelect = (mode: ReasoningMode) => {
      if (onModeChange) onModeChange(mode);
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [input]);

  const handleSend = () => {
    if ((!input.trim() && attachments.length === 0) || isStreaming) return;
    onSend(input, attachments, activeMode);
    setInput('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle file selection from file picker
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFilesAsAttachments(Array.from(e.target.files));
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  // Helper to add files as attachments
  const addFilesAsAttachments = useCallback((files: File[]) => {
    const newAttachments: Attachment[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      type: file.type.startsWith('image/') ? 'image' : 'file',
      name: file.name,
      file: file,
      status: 'ready',
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
  }, []);

  // Handle paste event for images (screenshots)
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Check if it's an image
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          // Create a meaningful name for pasted images
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const extension = item.type.split('/')[1] || 'png';
          const namedFile = new File([file], `screenshot-${timestamp}.${extension}`, { type: file.type });
          imageFiles.push(namedFile);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault(); // Prevent default paste behavior for images
      addFilesAsAttachments(imageFiles);
    }
    // If no images, let the default paste behavior happen (for text)
  }, [addFilesAsAttachments]);

  // Handle drag and drop
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      addFilesAsAttachments(files);
    }
  }, [addFilesAsAttachments]);



  return (
    <div 
      ref={containerRef}
      className="w-full max-w-4xl mx-auto"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag and Drop Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-indigo-500/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-2xl border-2 border-dashed border-indigo-500 animate-pulse">
            <div className="flex flex-col items-center gap-3">
              <ImageIcon className="w-12 h-12 text-indigo-500" />
              <p className="text-lg font-semibold text-foreground">Drop files here</p>
              <p className="text-sm text-muted-foreground">Images and documents will be attached</p>
            </div>
          </div>
        </div>
      )}

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-2 no-scrollbar">
          {attachments.map(att => (
            <div key={att.id} className="relative group flex items-center gap-2 glass-card px-3 py-2 rounded-xl text-xs animate-scale-in">
              {att.type === 'image' && att.previewUrl ? (
                <img src={att.previewUrl} alt={att.name} className="w-10 h-10 object-cover rounded-lg" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-indigo-500" />
                </div>
              )}
              <span className="max-w-[100px] truncate font-medium">{att.name}</span>
              <button 
                onClick={() => setAttachments(attachments.filter(a => a.id !== att.id))}
                className="absolute -top-1.5 -right-1.5 bg-gradient-to-br from-red-500 to-pink-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all shadow-lg"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative glass-card overflow-hidden shadow-xl shadow-indigo-500/5 focus-within:shadow-indigo-500/10 transition-all duration-300">
        {/* Animated gradient border on focus */}
        <div className="absolute inset-0 rounded-2xl opacity-0 focus-within:opacity-100 transition-opacity duration-300 pointer-events-none" 
             style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.1) 50%, rgba(236,72,153,0.1) 100%)' }} />
        
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/50 dark:border-slate-700/50 bg-gradient-to-r from-slate-50/80 to-white/80 dark:from-slate-800/80 dark:to-slate-900/80 backdrop-blur-sm rounded-t-2xl">
           <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pr-4">
              {/* Standard Modes */}
              <button 
                  onClick={() => handleModeSelect('instant')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
                      activeMode === 'instant' 
                      ? 'bg-white dark:bg-slate-700 text-foreground shadow-md border border-slate-200/50 dark:border-slate-600/50' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-slate-700/50'
                  }`}
              >
                <Send size={13} />
                <span>Instant</span>
              </button>
              
              <button 
                  onClick={() => handleModeSelect('thinking')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
                      activeMode === 'thinking' 
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/25' 
                      : 'text-muted-foreground hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                  }`}
              >
                <BrainCircuit size={13} />
                <span>Thinking</span>
              </button>

              <div className="h-5 w-px bg-gradient-to-b from-transparent via-slate-300 dark:via-slate-600 to-transparent mx-2 shrink-0" />

              {/* Agents */}
              <button 
                  onClick={() => handleModeSelect('agent-planner')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
                      activeMode === 'agent-planner'
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25' 
                      : 'text-muted-foreground hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                  }`}
                  title="Planner Agent"
              >
                <Sparkles size={13} />
                <span className="hidden sm:inline">Planner</span>
              </button>

              <button 
                  onClick={() => handleModeSelect('agent-researcher')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
                      activeMode === 'agent-researcher'
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25' 
                      : 'text-muted-foreground hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                  }`}
                  title="Researcher Agent"
              >
                <Search size={13} />
                <span className="hidden sm:inline">Researcher</span>
              </button>

              <button 
                  onClick={() => handleModeSelect('agent-coder')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${
                      activeMode === 'agent-coder'
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/25' 
                      : 'text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }`}
                  title="Coder Agent"
              >
                <Code size={13} />
                <span className="hidden sm:inline">Coder</span>
              </button>
           </div>
        </div>

        <div className="flex items-end gap-3 p-4">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-gradient-to-br hover:from-indigo-500/10 hover:to-purple-500/10 rounded-xl transition-all duration-200 border border-transparent hover:border-indigo-500/20"
            title="Add attachment (images, documents)"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <button 
            onClick={() => imageInputRef.current?.click()}
            className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-gradient-to-br hover:from-pink-500/10 hover:to-rose-500/10 rounded-xl transition-all duration-200 border border-transparent hover:border-pink-500/20"
            title="Add image for analysis"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt,.md,.json,.csv"
            onChange={handleFileSelect}
          />
          <input 
            type="file" 
            ref={imageInputRef} 
            className="hidden" 
            multiple
            accept="image/*"
            onChange={handleFileSelect}
          />

          <div className="flex-1 flex flex-col justify-center min-w-0">
            {/* Real-time speech preview */}
            {isRecording && interimText && (
              <div className="px-1 py-1 mb-1 text-sm text-indigo-600 dark:text-indigo-400 italic animate-pulse flex items-center gap-2">
                <span className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                <span className="truncate">{interimText}</span>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={isRecording 
                ? (interimText ? "" : "🎙️ Listening... speak now") 
                : "Ask Amble anything... (paste images with Ctrl+V)"
              }
              className={`w-full bg-transparent border-none resize-none max-h-[200px] min-h-[28px] py-2 focus:outline-none text-base placeholder:text-muted-foreground/50 leading-relaxed ${
                isRecording ? 'placeholder:text-red-400 placeholder:animate-pulse' : ''
              }`}
              rows={1}
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Dictation Button */}
            {dictationEnabled && (
              <div className="relative group">
                <button 
                  onClick={toggleRecording}
                  disabled={isProcessing}
                  className={`p-2.5 rounded-xl transition-all duration-200 ${
                    dictationError
                      ? 'text-amber-500 bg-amber-500/10 border border-amber-500/30'
                      : isRecording 
                      ? 'text-white bg-gradient-to-br from-red-500 to-pink-600 shadow-lg shadow-red-500/25 animate-pulse'
                      : isProcessing
                      ? 'text-muted-foreground/50 bg-slate-100 dark:bg-slate-800/50 cursor-wait'
                      : 'text-muted-foreground hover:text-foreground hover:bg-gradient-to-br hover:from-indigo-500/10 hover:to-purple-500/10 border border-transparent hover:border-indigo-500/20'
                  }`}
                  title={dictationError ? `Error: ${dictationError}` : isRecording ? "Stop recording" : isProcessing ? "Processing audio..." : `Voice input (${currentMode === 'browser' ? 'Browser' : currentMode === 'whisper' ? 'Whisper' : currentMode})`}
                >
                  {isProcessing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>
                {/* Mode indicator badge */}
                {!isRecording && !isProcessing && !dictationError && (
                  <span className="absolute -top-1 -right-1 text-[8px] font-bold px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                    {currentMode === 'browser' ? 'FREE' : currentMode === 'whisper' ? 'AI' : currentMode?.toUpperCase()}
                  </span>
                )}
              </div>
            )}
            
            <button 
              onClick={isStreaming ? stopGeneration : handleSend}
              disabled={!isStreaming && ((!input.trim() && attachments.length === 0))}
              className={`p-2.5 rounded-xl transition-all duration-200 ${
                isStreaming
                  ? 'text-white bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-lg shadow-red-500/25 hover:shadow-red-500/40'
                  : (!input.trim() && attachments.length === 0)
                  ? 'text-muted-foreground/30 bg-slate-100 dark:bg-slate-800/50 cursor-not-allowed'
                  : 'text-white bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5'
              }`}
              title={isStreaming ? 'Stop generating' : 'Send message'}
              aria-label={isStreaming ? 'Stop generating' : 'Send message'}
            >
              {isStreaming ? <Square className="w-5 h-5" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
      
      <div className="text-center mt-3">
        <p className="text-[11px] text-muted-foreground/50 flex items-center justify-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-emerald-500" />
          Amble AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
