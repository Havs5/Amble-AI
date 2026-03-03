import React, { useState } from 'react';
import { Plus, MessageSquare, Folder, Settings, ChevronRight, ChevronDown, MoreVertical, Trash2, FileText } from 'lucide-react';

export interface Project {
  id: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  policies?: string[];
  createdAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  projectId?: string | null;
  messages?: { role: 'user' | 'assistant'; content: string }[];
  createdAt?: number;
  updatedAt: number;
}

interface ProjectSidebarProps {
  projects: Project[];
  chats: ChatSession[];
  activeProjectId: string | null;
  activeChatId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onSelectChat: (chatId: string) => void;
  onCreateChat: (projectId: string | null) => void;
  onCreateProject: () => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (projectId: string) => void;
  onDeleteChat: (chatId: string) => void;
}

export function ProjectSidebar({
  projects,
  chats,
  activeProjectId,
  activeChatId,
  onSelectProject,
  onSelectChat,
  onCreateChat,
  onCreateProject,
  onEditProject,
  onDeleteProject,
  onDeleteChat
}: ProjectSidebarProps) {
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const generalChats = chats.filter(c => !c.projectId);

  return (
    <div className="w-64 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h2 className="font-semibold text-slate-700 dark:text-slate-200">Chats & Projects</h2>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            
            onCreateChat(activeProjectId);
          }}
          className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors z-50 cursor-pointer relative"
          title="New Chat"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        
        {/* General Chats Section */}
        <div>
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">General</span>
            <button 
              onClick={() => onCreateChat(null)}
              className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              title="New General Chat"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-0.5">
            {generalChats.map(chat => (
              <div 
                key={chat.id}
                className={`group flex items-center justify-between px-2 py-2 rounded-lg cursor-pointer text-sm transition-colors ${activeChatId === chat.id ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'}`}
                onClick={() => onSelectChat(chat.id)}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <MessageSquare size={14} className="shrink-0" />
                  <span className="truncate">{chat.title || 'New Chat'}</span>
                </div>
                <button 
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    onDeleteChat(chat.id); 
                  }}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all rounded-md z-50 relative pointer-events-auto"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {generalChats.length === 0 && (
              <div className="px-2 py-2 text-xs text-slate-400 italic">No chats yet</div>
            )}
          </div>
        </div>

        {/* Projects Section */}
        <div>
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Projects</span>
            <button 
              onClick={onCreateProject}
              className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              title="Create Project"
            >
              <Plus size={14} />
            </button>
          </div>
          
          <div className="space-y-2">
            {projects.map(project => {
              const projectChats = chats.filter(c => c.projectId === project.id);
              const isExpanded = expandedProjects[project.id];

              return (
                <div key={project.id} className="space-y-1">
                  {/* Project Header */}
                  <div 
                    className={`flex items-center justify-between px-2 py-2 rounded-lg cursor-pointer transition-colors ${activeProjectId === project.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-slate-100 dark:hover:bg-slate-900'}`}
                    onClick={() => {
                      onSelectProject(project.id);
                      toggleProject(project.id);
                    }}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      {isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                      <Folder size={14} className={activeProjectId === project.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'} />
                      <span className={`text-sm font-medium truncate ${activeProjectId === project.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>
                        {project.name}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <button 
                        onClick={(e) => { e.stopPropagation(); onEditProject(project); }}
                        className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                        title="Project Settings"
                      >
                        <Settings size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Project Chats */}
                  {isExpanded && (
                    <div className="pl-4 space-y-0.5 border-l border-slate-200 dark:border-slate-800 ml-3">
                      <button
                        onClick={() => onCreateChat(project.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left"
                      >
                        <Plus size={12} /> New Project Chat
                      </button>
                      {projectChats.map(chat => (
                        <div 
                          key={chat.id}
                          className={`group flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${activeChatId === chat.id ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'}`}
                          onClick={() => onSelectChat(chat.id)}
                        >
                          <span className="truncate text-xs">{chat.title || 'New Chat'}</span>
                          <button 
                            onClick={(e) => { 
                              e.preventDefault();
                              e.stopPropagation(); 
                              
                              onDeleteChat(chat.id); 
                            }}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all rounded-md z-50 relative pointer-events-auto"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      {projectChats.length === 0 && (
                        <div className="px-2 py-1 text-xs text-slate-400 italic">No chats</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
