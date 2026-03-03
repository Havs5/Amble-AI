'use client';

import React, { useState } from 'react';
import { Plus, MessageSquare, Trash2, Search, X, AlertTriangle } from 'lucide-react';
import { useChat } from '@/contexts';
import { ChatSession } from '@/types/chat';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const { sessions, currentSessionId, createSession, switchSession, deleteSession } = useChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);

  // Filter sessions by search
  const filteredSessions = React.useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const query = searchQuery.toLowerCase();
    return sessions.filter(s => 
      s.title.toLowerCase().includes(query) || 
      s.preview?.toLowerCase().includes(query)
    );
  }, [sessions, searchQuery]);

  // Group sessions by date
  const groupedSessions = React.useMemo(() => {
    const groups: { [key: string]: ChatSession[] } = {
      'Today': [],
      'Yesterday': [],
      'Previous 7 Days': [],
      'Older': []
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const lastWeek = today - 86400000 * 7;

    filteredSessions.forEach(session => {
        const date = new Date(session.updatedAt).getTime();
        
        if (date >= today) {
            groups['Today'].push(session);
        } else if (date >= yesterday) {
            groups['Yesterday'].push(session);
        } else if (date >= lastWeek) {
            groups['Previous 7 Days'].push(session);
        } else {
            groups['Older'].push(session);
        }
    });

    return groups;
  }, [filteredSessions]);

  return (
    <>
      {/* Persistent Sidebar Panel (ChatGPT-style) */}
      <div className={`
        ${isOpen ? 'w-64' : 'w-0'}
        bg-slate-50 dark:bg-[#0c1120] border-r border-slate-200 dark:border-slate-800/60
        transition-[width] duration-200 ease-out
        flex flex-col overflow-hidden shrink-0
      `}>
        {/* Header — compact */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800/60 shrink-0">          
          {/* New Chat Button */}
          <button 
            onClick={createSession} 
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 shrink-0">
          <div className="relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search chats..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-slate-800/60 pl-8 pr-7 py-1.5 rounded-md text-xs border border-slate-200 dark:border-slate-700/50 focus:border-indigo-400 dark:focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
              >
                <X className="w-3 h-3 text-slate-400" />
              </button>
            )}
          </div>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-3 scrollbar-thin">
          {Object.entries(groupedSessions).map(([label, group]) => (
            group.length > 0 && (
                <div key={label}>
                    <h3 className="px-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-widest">{label}</h3>
                    <div className="space-y-0.5">
                        {group.map((session) => (
                            <div 
                              key={session.id}
                              className={`
                                group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150
                                ${currentSessionId === session.id 
                                  ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200/60 dark:border-indigo-500/20' 
                                  : 'hover:bg-white dark:hover:bg-slate-800/60 border border-transparent'}
                              `}
                              onClick={() => switchSession(session.id)}
                              onMouseEnter={() => setHoveredSession(session.id)}
                              onMouseLeave={() => setHoveredSession(null)}
                              role="button"
                              tabIndex={0}
                            >
                              <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${currentSessionId === session.id ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
                              <div className="flex-1 min-w-0">
                                <span className={`text-xs font-medium truncate block transition-colors ${currentSessionId === session.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200'}`}>
                                  {session.title}
                                </span>
                              </div>
                              <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingSession(session.id);
                                  }}
                                  className="p-1 hover:bg-red-50 dark:hover:bg-red-500/20 hover:text-red-500 dark:hover:text-red-400 rounded transition-all text-slate-400 opacity-0 group-hover:opacity-100 shrink-0"
                                  title="Delete chat"
                              >
                                  <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                        ))}
                    </div>
                </div>
            )
          ))}
          
          {filteredSessions.length === 0 && (
            <div className="text-center py-8 px-3">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 text-slate-400 dark:text-slate-500" />
              <p className="text-slate-500 dark:text-slate-400 text-xs">
                {searchQuery ? 'No matching chats' : 'No conversations yet'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800/60 shrink-0">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
            {sessions.length} chat{sessions.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deletingSession && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80]" onClick={() => setDeletingSession(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Delete Conversation</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingSession(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteSession(deletingSession);
                  setDeletingSession(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
