/**
 * MessageFeedback - Thumbs up/down and feedback for AI responses
 * 
 * Features:
 * - Quick thumbs up/down
 * - Detailed feedback modal
 * - Feedback persistence
 * - Analytics integration
 */

'use client';

import React, { useState, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, Flag, Copy, Check, RotateCcw } from 'lucide-react';

export type FeedbackType = 'positive' | 'negative' | null;

export interface FeedbackData {
  messageId: string;
  type: FeedbackType;
  category?: string;
  comment?: string;
  timestamp: number;
}

export interface MessageFeedbackProps {
  messageId: string;
  onFeedback?: (feedback: FeedbackData) => void;
  onCopy?: () => void;
  onRegenerate?: () => void;
  showRegenerate?: boolean;
  initialFeedback?: FeedbackType;
  className?: string;
}

const FEEDBACK_CATEGORIES = {
  negative: [
    { id: 'incorrect', label: 'Incorrect information' },
    { id: 'unhelpful', label: 'Not helpful' },
    { id: 'incomplete', label: 'Incomplete answer' },
    { id: 'confusing', label: 'Confusing or unclear' },
    { id: 'off_topic', label: 'Off topic' },
    { id: 'other', label: 'Other' },
  ],
  positive: [
    { id: 'accurate', label: 'Accurate' },
    { id: 'helpful', label: 'Very helpful' },
    { id: 'clear', label: 'Clear explanation' },
    { id: 'creative', label: 'Creative solution' },
    { id: 'other', label: 'Other' },
  ],
};

export function MessageFeedback({
  messageId,
  onFeedback,
  onCopy,
  onRegenerate,
  showRegenerate = true,
  initialFeedback = null,
  className = '',
}: MessageFeedbackProps): React.ReactElement {
  const [feedback, setFeedback] = useState<FeedbackType>(initialFeedback);
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pendingFeedback, setPendingFeedback] = useState<FeedbackType>(null);

  const handleQuickFeedback = useCallback((type: FeedbackType) => {
    if (feedback === type) {
      // Toggle off
      setFeedback(null);
      onFeedback?.({
        messageId,
        type: null,
        timestamp: Date.now(),
      });
    } else {
      // Show modal for detailed feedback
      setPendingFeedback(type);
      setShowModal(true);
    }
  }, [feedback, messageId, onFeedback]);

  const handleSubmitFeedback = useCallback((category?: string, comment?: string) => {
    const feedbackData: FeedbackData = {
      messageId,
      type: pendingFeedback,
      category,
      comment,
      timestamp: Date.now(),
    };
    
    setFeedback(pendingFeedback);
    setShowModal(false);
    setPendingFeedback(null);
    onFeedback?.(feedbackData);
  }, [messageId, pendingFeedback, onFeedback]);

  const handleCopy = useCallback(async () => {
    onCopy?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [onCopy]);

  return (
    <>
      <div className={`flex items-center gap-1 ${className}`}>
        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
          title="Copy message"
        >
          {copied ? (
            <Check size={14} className="text-emerald-500" />
          ) : (
            <Copy size={14} />
          )}
        </button>

        {/* Regenerate button */}
        {showRegenerate && onRegenerate && (
          <button
            onClick={onRegenerate}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
            title="Regenerate response"
          >
            <RotateCcw size={14} />
          </button>
        )}

        {/* Divider */}
        <div className="w-px h-4 bg-white/10 mx-1" />

        {/* Thumbs up */}
        <button
          onClick={() => handleQuickFeedback('positive')}
          className={`p-1.5 rounded-lg transition-colors ${
            feedback === 'positive'
              ? 'bg-emerald-500/20 text-emerald-500'
              : 'hover:bg-white/10 text-muted-foreground hover:text-foreground'
          }`}
          title="Good response"
        >
          <ThumbsUp size={14} />
        </button>

        {/* Thumbs down */}
        <button
          onClick={() => handleQuickFeedback('negative')}
          className={`p-1.5 rounded-lg transition-colors ${
            feedback === 'negative'
              ? 'bg-red-500/20 text-red-500'
              : 'hover:bg-white/10 text-muted-foreground hover:text-foreground'
          }`}
          title="Bad response"
        >
          <ThumbsDown size={14} />
        </button>
      </div>

      {/* Feedback Modal */}
      {showModal && (
        <FeedbackModal
          type={pendingFeedback}
          onSubmit={handleSubmitFeedback}
          onClose={() => {
            setShowModal(false);
            setPendingFeedback(null);
          }}
        />
      )}
    </>
  );
}

interface FeedbackModalProps {
  type: FeedbackType;
  onSubmit: (category?: string, comment?: string) => void;
  onClose: () => void;
}

function FeedbackModal({ type, onSubmit, onClose }: FeedbackModalProps): React.ReactElement {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const categories = type === 'positive' 
    ? FEEDBACK_CATEGORIES.positive 
    : FEEDBACK_CATEGORIES.negative;

  const handleSubmit = () => {
    onSubmit(selectedCategory ?? undefined, comment.trim() || undefined);
  };

  const handleSkip = () => {
    onSubmit();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 fade-in"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4 text-foreground">
          {type === 'positive' ? 'What did you like?' : 'What went wrong?'}
        </h3>

        {/* Categories */}
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(
                selectedCategory === cat.id ? null : cat.id
              )}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                selectedCategory === cat.id
                  ? type === 'positive'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500'
                    : 'bg-red-500/20 border-red-500/50 text-red-500'
                  : 'border-white/10 hover:border-white/30 text-muted-foreground'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Comment */}
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Additional feedback (optional)"
          className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground text-sm resize-none focus:outline-none focus:border-indigo-500/50"
          rows={3}
        />

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={handleSkip}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              type === 'positive'
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook for managing message feedback
 */
export function useMessageFeedback() {
  const [feedbacks, setFeedbacks] = useState<Map<string, FeedbackData>>(new Map());

  const submitFeedback = useCallback((feedback: FeedbackData) => {
    setFeedbacks(prev => {
      const next = new Map(prev);
      if (feedback.type === null) {
        next.delete(feedback.messageId);
      } else {
        next.set(feedback.messageId, feedback);
      }
      return next;
    });

    // TODO: Send to analytics/backend
    console.log('[Feedback] Submitted:', feedback);
  }, []);

  const getFeedback = useCallback((messageId: string): FeedbackType => {
    return feedbacks.get(messageId)?.type ?? null;
  }, [feedbacks]);

  return {
    submitFeedback,
    getFeedback,
    feedbacks: Array.from(feedbacks.values()),
  };
}

export default MessageFeedback;
