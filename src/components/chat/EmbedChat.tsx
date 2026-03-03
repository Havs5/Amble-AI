'use client';

import React from 'react';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { useChat } from '@/contexts';

export function EmbedChat() {
  const { sendMessage, isStreaming } = useChat();

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-slate-900 flex items-center shadow-sm">
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center mr-3">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <div>
          <h1 className="font-semibold text-slate-900 dark:text-white text-sm">Customer Support</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-1"></span>
            Online
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden relative">
        <MessageList />
      </div>

      {/* Composer */}
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-gray-800">
        <Composer onSend={sendMessage} isStreaming={isStreaming} />
      </div>
    </div>
  );
}
