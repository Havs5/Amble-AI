'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Mic, Square, RefreshCw, ImageIcon, FileText, Play, Copy, 
  RotateCcw, X, Download, Shield, EyeOff, Zap 
} from 'lucide-react';
// @react-pdf/renderer is dynamically imported in downloadPDF() to reduce bundle size
import { useAiDictation } from '@/hooks/useAiDictation';
import { useStandardDictation } from '@/hooks/useStandardDictation';
import { UsageManager } from '../../lib/usageManager';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';

interface BillingViewProps {
  user: any;
  selectedModel: any; // Type Model
  systemPrompt: string;
  setToast: (toast: { message: string, type: 'success' | 'error' | 'info' } | null) => void;
  onHelp?: () => void;
}

// Simple PII redaction function
const redactPII = (text: string): string => {
  // Redact common PII patterns
  let redacted = text;
  
  // SSN patterns
  redacted = redacted.replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, '[SSN REDACTED]');
  
  // Phone numbers
  redacted = redacted.replace(/\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE REDACTED]');
  
  // Email addresses
  redacted = redacted.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL REDACTED]');
  
  // Dates (MM/DD/YYYY, MM-DD-YYYY, etc.)
  redacted = redacted.replace(/\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](\d{2}|\d{4})\b/g, '[DATE REDACTED]');
  
  // Credit card numbers
  redacted = redacted.replace(/\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g, '[CARD REDACTED]');
  
  return redacted;
};

export function BillingView({ user, selectedModel, systemPrompt, setToast }: BillingViewProps) {
  // --- State ---
  const [patientChat, setPatientChat] = useState('');
  const [verifiedNotes, setVerifiedNotes] = useState('');
  const [reply, setReply] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  
  const [chatDictationMode, setChatDictationMode] = useState<'Append' | 'Replace'>('Append');
  const [notesDictationMode, setNotesDictationMode] = useState<'Append' | 'Replace'>('Append');
  
  // Redact and PTT state
  const [redactEnabled, setRedactEnabled] = useState(false);
  const [pttEnabled, setPttEnabled] = useState(true);


  // --- Refs ---
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Persistence ---
  useEffect(() => {
    if (user?.id) {
      const savedNotes = localStorage.getItem(`amble_notes_${user.id}`);
      if (savedNotes) {
        setVerifiedNotes(savedNotes);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      localStorage.setItem(`amble_notes_${user.id}`, verifiedNotes);
    }
  }, [verifiedNotes, user?.id]);

  // --- Dictation Hooks ---
  const useAi = user?.capabilities?.aiDictation === true;
  
  const onNotesResult = useCallback((text: string) => {
    setVerifiedNotes(prev => {
      if (notesDictationMode === 'Replace') return text;
      return prev + (prev ? ' ' : '') + text;
    });
  }, [notesDictationMode]);

  const aiNotesDictation = useAiDictation({ onResult: onNotesResult });
  const standardNotesDictation = useStandardDictation({ onResult: onNotesResult });

  const {
    isRecording: isNotesRecording,
    isProcessing: isNotesProcessing,
    toggleRecording: toggleNotesRecording
  } = useAi ? aiNotesDictation : standardNotesDictation;

  const onChatDictationResult = useCallback((text: string) => {
    setPatientChat(prev => {
      if (chatDictationMode === 'Replace') return text;
      return prev + (prev ? ' ' : '') + text;
    });
  }, [chatDictationMode]);

  const aiChatDictation = useAiDictation({ onResult: onChatDictationResult });
  const standardChatDictation = useStandardDictation({ onResult: onChatDictationResult });

  const {
    isRecording: isChatRecording,
    isProcessing: isChatProcessing,
    toggleRecording: toggleChatRecording
  } = useAi ? aiChatDictation : standardChatDictation;

  // --- PTT (Push-to-Talk) Logic ---
  useEffect(() => {
    if (!pttEnabled) return;

    let pttTimeout: NodeJS.Timeout;
    let activeField: 'chat' | 'notes' | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;

      const activeElement = document.activeElement;
      if (activeElement === chatInputRef.current) {
        activeField = 'chat';
      } else if (activeElement === notesInputRef.current) {
        activeField = 'notes';
      } else {
        return; // Not focused on our inputs
      }

      // Start timer - only trigger after holding for 200ms to avoid accidental triggers
      pttTimeout = setTimeout(() => {
        if (activeField === 'chat' && !isChatRecording) {
          toggleChatRecording();
        } else if (activeField === 'notes' && !isNotesRecording) {
          toggleNotesRecording();
        }
      }, 200);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;

      clearTimeout(pttTimeout);
      
      // Stop recording when spacebar is released
      if (isChatRecording) {
        toggleChatRecording();
      }
      if (isNotesRecording) {
        toggleNotesRecording();
      }
      
      activeField = null;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearTimeout(pttTimeout);
    };
  }, [pttEnabled, isChatRecording, isNotesRecording, toggleChatRecording, toggleNotesRecording]);

  // --- Event Handlers ---

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setAttachedImages(prev => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    // Reset inputs value to allow re-uploading same file if needed in future
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === 'string') {
              setAttachedImages(prev => [...prev, reader.result as string]);
            }
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  };

  const handleNewPatient = () => {
    setPatientChat('');
    setVerifiedNotes('');
    setReply('');
    setAttachedImages([]);
    setToast({ message: 'Cleared', type: 'success' });
  };

  // --- Logic : Reply Generation ---

  const handleDraftReply = async () => {
    if (!patientChat && !verifiedNotes) return;
    
    setIsLoading(true);
    setReply(''); // Clear previous

    try {
      let messages: any[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `PATIENT CHAT:\n${patientChat}\n\nCASE NOTES:\n${verifiedNotes}\n\nDraft a reply.` }
      ];

      // Attach images to user message if any (for LLM analysis)
      if (attachedImages.length > 0) {
        messages[1].content = [
          { type: 'text', text: messages[1].content },
          ...attachedImages.map(img => ({ type: 'image_url', image_url: { url: img } }))
        ];
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          model: selectedModel.id || selectedModel, // Handle object or string
          temperature: 0.7,
          stream: true,
          // Phase 2: Context Injection
          context: {
             view: 'BillingView',
             feature: 'Dispute Resolution',
             hasNotes: !!verifiedNotes,
             isRedacted: redactEnabled
          }
        })
      });

      if (!response.ok) throw new Error(await response.text());
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedReply = '';
      let buffer = '';
      
      // Track actual usage from stream
      let streamUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;
      let actualModel = selectedModel.id || selectedModel;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ')) {
            const jsonStr = trimmedLine.slice(6);
            if (jsonStr === '[DONE]') continue;
            try {
              const data = JSON.parse(jsonStr);
              if (data.content) {
                accumulatedReply += data.content;
                // Apply redaction if enabled
                const displayReply = redactEnabled ? redactPII(accumulatedReply) : accumulatedReply;
                setReply(displayReply);
              }
              // Capture usage data from stream
              if (data.usage) {
                streamUsage = data.usage;
              }
              if (data.model) {
                actualModel = data.model;
              }
              if (data.error) {
                console.error('Stream error:', data.error);
                accumulatedReply += `\n\n**Error:** ${data.error}`;
                setReply(accumulatedReply);
              }
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          }
        }
      }

      // Apply final redaction if enabled
      if (redactEnabled) {
        setReply(redactPII(accumulatedReply));
      }

      // Track Usage with actual tokens from API
      if (user?.id) {
          if (streamUsage) {
              // Use actual token counts from API
              UsageManager.trackUsage(
                 actualModel,
                 streamUsage.prompt_tokens || 0,
                 streamUsage.completion_tokens || 0,
                 false,
                 false,
                 user.id
              );
          } else {
              // Fallback to estimation if no usage data received
              UsageManager.trackUsage(
                 actualModel,
                 Math.ceil((patientChat.length + verifiedNotes.length) / 4),
                 Math.ceil(accumulatedReply.length / 4),
                 false,
                 false,
                 user.id
              );
          }
      }
      setToast({ message: 'Reply generated', type: 'success' });

    } catch (error: any) {
      console.error(error);
      setToast({ message: error.message || "Failed to generate", type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRewrite = async (mode: 'Shorter' | 'Firmer') => {
    if (!reply) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyText: reply, rewriteMode: mode })
      });
      const data = await res.json();
      if (data.reply) {
        setReply(data.reply);
      }
    } catch (e) {
      console.error(e);
      setToast({ message: "Rewrite failed", type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const copyReply = async () => {
    if (!reply) return;
    await navigator.clipboard.writeText(reply);
    setToast({ message: 'Copied to clipboard', type: 'success' });
  };

  const downloadPDF = async () => {
    if (!verifiedNotes && !reply) {
        setToast({ message: 'Nothing to export', type: 'info' });
        return;
    }
    
    try {
        // Dynamic import to reduce initial bundle size (~100KB savings)
        const { pdf, Document, Page, Text, View, StyleSheet } = await import('@react-pdf/renderer');
        
        // PDF Styles (moved here since StyleSheet is now dynamically imported)
        const pdfStyles = StyleSheet.create({
          page: { padding: 30, fontFamily: 'Helvetica' },
          title: { fontSize: 24, marginBottom: 10, textAlign: 'center' },
          section: { margin: 10, padding: 10, flexGrow: 1 },
          header: { fontSize: 12, marginBottom: 5, color: '#666' },
          content: { fontSize: 10, lineHeight: 1.5, marginBottom: 20 },
          watermark: { position: 'absolute', bottom: 30, left: 0, right: 0, textAlign: 'center', color: '#ccc', fontSize: 10 }
        });
        
        // PDF Document Component (inline since imports are now local)
        const BillingPDF = () => (
          <Document>
            <Page size="A4" style={pdfStyles.page}>
              <Text style={pdfStyles.title}>Billing Case Report</Text>
              <View style={pdfStyles.section}>
                <Text style={pdfStyles.header}>Verified Clinical Notes</Text>
                <Text style={pdfStyles.content}>{verifiedNotes || 'No notes verified.'}</Text>
              </View>
              <View style={pdfStyles.section}>
                <Text style={pdfStyles.header}>Generated Appeal / Reply</Text>
                <Text style={pdfStyles.content}>{reply || 'No reply generated.'}</Text>
              </View>
              <Text style={pdfStyles.watermark}>Generated by Amble AI • {new Date().toLocaleDateString()}</Text>
            </Page>
          </Document>
        );
        
        const blob = await pdf(<BillingPDF />).toBlob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `billing_case_${Date.now()}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setToast({ message: 'PDF Downloaded', type: 'success' });
    } catch (e) {
        console.error(e);
        setToast({ message: 'Failed to generate PDF', type: 'error' });
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleShortcuts = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        handleDraftReply();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyC') {
        copyReply();
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyN') {
        e.preventDefault();
        handleNewPatient();
      }
    };
    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [reply, patientChat, verifiedNotes, copyReply, handleDraftReply, handleNewPatient]);


  const isBillingEmpty = !patientChat && !verifiedNotes && !isChatRecording && !isNotesRecording && attachedImages.length === 0;

  // --- Render ---

  if (isBillingEmpty) {
      // Empty State View
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in duration-500 relative overflow-hidden">
          {/* Subtle background pattern */}
          <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02]" style={{backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)', backgroundSize: '32px 32px'}} />
          
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-500/25 rotate-3 hover:rotate-0 transition-transform duration-300">
               <FileText className="text-white" size={36} />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Billing Case Assistant</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-10 text-center max-w-md">Draft appeal letters, analyze disputes, and manage billing cases with AI-powered assistance.</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl w-full">
               <button 
                  onClick={() => {
                    setVerifiedNotes(' ');
                    toggleNotesRecording(); 
                  }}
                  className="p-5 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/10 transition-all text-left group backdrop-blur-sm"
               >
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform w-fit mb-3">
                    <Mic size={22} />
                  </div>
                  <span className="text-base font-semibold text-slate-900 dark:text-white block mb-1">Start Dictation</span>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Voice-to-text case notes.</p>
               </button>

               <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-5 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/10 transition-all text-left group backdrop-blur-sm"
               >
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform w-fit mb-3">
                    <ImageIcon size={22} />
                  </div>
                  <span className="text-base font-semibold text-slate-900 dark:text-white block mb-1">Upload Images</span>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Analyze invoices & receipts.</p>
               </button>

               <button 
                  onClick={() => setPatientChat(' ')} 
                  className="p-5 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-500/10 transition-all text-left group backdrop-blur-sm"
               >
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform w-fit mb-3">
                    <FileText size={22} />
                  </div>
                  <span className="text-base font-semibold text-slate-900 dark:text-white block mb-1">Manual Entry</span>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Type or paste details.</p>
               </button>
            </div>

            {/* Keyboard shortcut hint */}
            <div className="mt-8 flex items-center gap-4 text-xs text-slate-400 dark:text-slate-500">
              <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px]">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px]">Enter</kbd> Draft Reply</span>
              <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px]">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px]">N</kbd> New Case</span>
            </div>
          </div>
          {/* Hidden Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
            accept="image/*"
            multiple
          />
        </div>
      );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <main className="flex-1 flex flex-col md:flex-row gap-6 p-6 overflow-hidden">
             
             {/* Left: Dispute Details */}
             <section className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <h2 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 text-sm uppercase tracking-wide">
                        Dispute Details
                        <span className="text-xs font-bold text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-full">Raw Text</span>
                    </h2>
                    <div className="flex items-center gap-2">
                        <select 
                            value={chatDictationMode}
                            onChange={(e) => setChatDictationMode(e.target.value as any)}
                            className="text-xs border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-600 py-1"
                        >
                            <option value="Append">Append</option>
                            <option value="Replace">Replace</option>
                        </select>
                        <button 
                            onClick={toggleChatRecording}
                            className={`p-3 rounded-full transition-all ${isChatRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'}`}
                        >
                            {isChatRecording ? <Square size={20} fill="currentColor" /> : <Mic size={20} />}
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
                        >
                            <ImageIcon size={20} />
                        </button>
                    </div>
                </div>
                
                <div className="relative flex-1 group flex flex-col">
                    {!useAi && isChatRecording && (
                       <div className="absolute top-2 left-5 right-5 z-10 text-xs text-indigo-600 dark:text-indigo-400 font-medium animate-pulse truncate pointer-events-none">
                          {standardChatDictation.interimResult || "Speak now..."}
                       </div>
                    )}
                    <textarea
                        ref={chatInputRef}
                        value={patientChat}
                        onChange={(e) => setPatientChat(e.target.value)}
                        onPaste={handlePaste}
                        placeholder={
                            isChatRecording 
                                ? (useAi ? "Listening..." : "Dictating...") 
                                : "Type dispute details here or use dictation..."
                        }
                        className="w-full flex-1 p-5 border-none focus:ring-0 outline-none resize-none font-medium text-base leading-relaxed bg-transparent text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                    />
                    
                    {attachedImages.length > 0 && (
                        <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex gap-3 overflow-x-auto">
                            {attachedImages.map((img, idx) => (
                                <div key={idx} className="relative group/img flex-shrink-0">
                                    <img src={img} alt={`Attached ${idx}`} className="h-16 w-16 object-cover rounded-md border border-slate-200" />
                                    <button onClick={() => removeImage(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {isChatProcessing && (
                         <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 text-white p-3 rounded-lg text-sm backdrop-blur-md animate-in slide-in-from-bottom-2 flex items-center gap-2">
                             <RefreshCw className="animate-spin text-blue-400 w-4 h-4" />
                             <span>Summarizing...</span>
                         </div>
                    )}
                </div>
             </section>

             {/* Right: Case Notes */}
             <section className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <h2 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 text-sm uppercase tracking-wide">
                        Case Notes
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900 px-2 py-0.5 rounded-full">Source of Truth</span>
                    </h2>
                    <div className="flex items-center gap-2">
                        <select 
                            value={notesDictationMode}
                            onChange={(e) => setNotesDictationMode(e.target.value as any)}
                            className="text-xs border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-600 py-1"
                        >
                            <option value="Append">Append</option>
                            <option value="Replace">Replace</option>
                        </select>
                        <button 
                            onClick={downloadPDF}
                            className={`p-2 rounded-full transition-all bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600`}
                            title="Export to PDF"
                        >
                            <Download size={18} />
                        </button>
                        <button 
                            onClick={toggleNotesRecording}
                            className={`p-2 rounded-full transition-all ${isNotesRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'}`}
                        >
                            {isNotesRecording ? <Square size={18} fill="currentColor" /> : <Mic size={18} />}
                        </button>
                    </div>
                </div>
                <div className="relative flex-1 group">
                    {!useAi && isNotesRecording && (
                       <div className="absolute top-2 left-5 right-5 z-10 text-xs text-indigo-600 dark:text-indigo-400 font-medium animate-pulse truncate pointer-events-none">
                          {standardNotesDictation.interimResult || "Speak now..."}
                       </div>
                    )}
                    <textarea
                        ref={notesInputRef}
                        value={verifiedNotes}
                        onChange={(e) => setVerifiedNotes(e.target.value)}
                        placeholder={
                            isNotesRecording 
                                ? (useAi ? "Listening..." : "Dictating...") 
                                : "Dictate or type case notes here..."
                        }
                        className="w-full h-full p-5 border-none focus:ring-0 outline-none resize-none font-sans text-base leading-relaxed bg-transparent text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                    />
                    {isNotesProcessing && (
                         <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 text-white p-3 rounded-lg text-sm backdrop-blur-md animate-in slide-in-from-bottom-2 flex items-center gap-2">
                             <RefreshCw className="animate-spin text-blue-400 w-4 h-4" />
                             <span>Processing dictation...</span>
                         </div>
                    )}
                </div>
             </section>
        </main>

        {/* Footer */}
        <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 md:p-6 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] z-20">
             <div className="max-w-[1600px] mx-auto flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button 
                          onClick={handleDraftReply}
                          disabled={isLoading}
                          className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-indigo-500/20 flex items-center gap-2 disabled:opacity-50 transition-all active:scale-95"
                      >
                          {isLoading ? <RefreshCw className="animate-spin" size={20} /> : <Play size={20} fill="currentColor" />}
                          Draft Reply <span className="opacity-70 font-normal text-sm ml-1">(Ctrl+Enter)</span>
                      </button>
                      
                      {/* Redact Toggle */}
                      <label className="flex items-center gap-2 text-sm cursor-pointer select-none group bg-slate-100/50 dark:bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
                        <input 
                          type="checkbox" 
                          checked={redactEnabled} 
                          onChange={(e) => setRedactEnabled(e.target.checked)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 w-4 h-4"
                        />
                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">
                          <EyeOff size={16} className={redactEnabled ? "text-purple-500" : "text-slate-400"} />
                          <span className="hidden sm:inline">Redact</span>
                        </span>
                      </label>

                      {/* PTT Toggle */}
                      <label className="flex items-center gap-2 text-sm cursor-pointer select-none group bg-slate-100/50 dark:bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
                        <input 
                          type="checkbox" 
                          checked={pttEnabled} 
                          onChange={(e) => setPttEnabled(e.target.checked)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 w-4 h-4"
                        />
                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">
                          <Mic size={16} className={pttEnabled ? "text-orange-500" : "text-slate-400"} />
                          <span className="hidden sm:inline">PTT (Space)</span>
                        </span>
                      </label>

                    </div>

                    {reply && (
                        <div className="flex items-center gap-3 animate-in fade-in">
                            <button onClick={() => handleRewrite('Shorter')} disabled={isLoading} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors">
                                Make Shorter
                            </button>
                            <button onClick={() => handleRewrite('Firmer')} disabled={isLoading} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors">
                                Make Firmer
                            </button>
                            <div className="h-6 w-px bg-slate-300 dark:bg-slate-700 mx-2"></div>
                            <button onClick={handleNewPatient} className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Clear All">
                                <RotateCcw size={20} />
                            </button>
                             <button onClick={copyReply} className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors" title="Copy to Clipboard">
                                <Copy size={20} />
                            </button>
                        </div>
                    )}
                </div>

                {reply && (
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700 animate-in slide-in-from-bottom-4 shadow-inner max-h-[400px] overflow-y-auto">
                        <MarkdownRenderer content={reply} />
                    </div>
                )}
             </div>
        </footer>

        {/* Global Hidden Input (Duplicate for safety if main one unmounts? No, logic moved to empty state and footer is separate. We need one global input if accessed via shortcuts, but buttons are in view.) */}
        <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
            accept="image/*"
            multiple
        />
    </div>
  );
}
