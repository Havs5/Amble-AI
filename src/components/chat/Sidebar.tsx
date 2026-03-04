'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, MessageSquare, Trash2, Search, X, AlertTriangle, Folder, ChevronRight, ChevronDown, Settings, FolderPlus } from 'lucide-react';
import { useChat } from '@/contexts';
import { useAuth } from '@/components/auth/AuthContextRefactored';
import { ChatSession } from '@/types/chat';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { ProjectSettingsModal } from '@/components/modals/ProjectSettingsModal';
import { Project } from '@/components/layout/ProjectSidebar';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const { sessions, currentSessionId, createSession, switchSession, deleteSession } = useChat();
  const { user } = useAuth();
  const { currentOrg } = useOrganization();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  
  // Delete state
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);
  
  // Project state
  const [projects, setProjects] = useState<Project[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Load projects from Firestore
  useEffect(() => {
    if (!user?.id) {
      setProjects([]);
      return;
    }

    let qProjects;
    if (currentOrg) {
      qProjects = query(collection(db, 'projects'), where('orgId', '==', currentOrg.id));
    } else {
      qProjects = query(collection(db, 'projects'), where('userId', '==', user.id));
    }

    const unsub = onSnapshot(qProjects, (snapshot) => {
      const fetched: Project[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!currentOrg && data.orgId) return;
        fetched.push({ ...data, id: docSnap.id } as Project);
      });
      fetched.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setProjects(fetched);
    });

    return () => unsub();
  }, [user?.id, currentOrg]);

  // Filter sessions by search
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(s => 
      s.title.toLowerCase().includes(q) || 
      s.preview?.toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  // Split sessions: general (no project) vs project-assigned
  const generalSessions = useMemo(() => 
    filteredSessions.filter(s => !s.projectId),
    [filteredSessions]
  );

  const getProjectSessions = (projectId: string) => 
    filteredSessions.filter(s => s.projectId === projectId);

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  // Project CRUD
  const handleCreateProject = async (projectData: Omit<Project, 'id' | 'createdAt'>) => {
    if (!user?.id) return;
    try {
      await addDoc(collection(db, 'projects'), {
        ...projectData,
        userId: user.id,
        orgId: currentOrg?.id || null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      setShowProjectModal(false);
    } catch (e) {
      console.error("Error creating project:", e);
    }
  };

  const handleUpdateProject = async (projectData: Omit<Project, 'id' | 'createdAt'>) => {
    if (!editingProject) return;
    try {
      const ref = doc(db, 'projects', editingProject.id);
      await updateDoc(ref, { ...projectData, updatedAt: Date.now() });
      setEditingProject(null);
      setShowProjectModal(false);
    } catch (e) {
      console.error("Error updating project:", e);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      const projectChats = sessions.filter(s => s.projectId === projectId);
      for (const chat of projectChats) {
        deleteSession(chat.id);
      }
      await deleteDoc(doc(db, 'projects', projectId));
      setDeletingProject(null);
    } catch (e) {
      console.error("Error deleting project:", e);
    }
  };

  // Group general sessions by date
  const groupedGeneral = useMemo(() => {
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

    generalSessions.forEach(session => {
      const date = new Date(session.updatedAt).getTime();
      if (date >= today) groups['Today'].push(session);
      else if (date >= yesterday) groups['Yesterday'].push(session);
      else if (date >= lastWeek) groups['Previous 7 Days'].push(session);
      else groups['Older'].push(session);
    });
    return groups;
  }, [generalSessions]);

  // Render a single chat item
  const renderChatItem = (session: ChatSession, compact = false) => (
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
        <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-medium truncate block transition-colors ${currentSessionId === session.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200'}`}>
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
  );

  return (
    <>
      {/* Sidebar Panel */}
      <div className={`
        ${isOpen ? 'w-64' : 'w-0'}
        bg-slate-50 dark:bg-[#0c1120] border-r border-slate-200 dark:border-slate-800/60
        transition-[width] duration-200 ease-out
        flex flex-col overflow-hidden shrink-0
      `}>
        {/* Header */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800/60 shrink-0">          
          <button 
            onClick={() => createSession(null)} 
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-4 scrollbar-thin">
          
          {/* General Chats Section */}
          <div>
            <div className="flex items-center justify-between px-2 py-1 mb-1">
              <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">General</h3>
            </div>
            
            <div className="space-y-2">
              {Object.entries(groupedGeneral).map(([label, group]) => (
                group.length > 0 && (
                  <div key={label}>
                    <h4 className="px-2 text-[9px] font-semibold text-slate-400/70 dark:text-slate-500/70 mb-0.5 uppercase tracking-wider">{label}</h4>
                    <div className="space-y-0.5">
                      {group.map((session) => renderChatItem(session))}
                    </div>
                  </div>
                )
              ))}
              {generalSessions.length === 0 && !searchQuery && (
                <div className="px-2 py-2 text-[11px] text-slate-400 dark:text-slate-500 italic">No chats yet</div>
              )}
            </div>
          </div>

          {/* Projects Section */}
          <div>
            <div className="flex items-center justify-between px-2 py-1 mb-1">
              <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Projects</h3>
              <button 
                onClick={() => { setEditingProject(null); setShowProjectModal(true); }}
                className="p-1 text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 rounded transition-colors"
                title="Create Project"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <div className="space-y-1">
              {projects.map(project => {
                const projectChats = getProjectSessions(project.id);
                const isExpanded = expandedProjects[project.id];

                return (
                  <div key={project.id}>
                    {/* Project Header */}
                    <div 
                      className={`
                        group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-150
                        ${isExpanded 
                          ? 'bg-indigo-50/50 dark:bg-indigo-900/10' 
                          : 'hover:bg-white dark:hover:bg-slate-800/60'}
                      `}
                      onClick={() => toggleProject(project.id)}
                    >
                      {isExpanded 
                        ? <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" /> 
                        : <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                      }
                      <Folder className={`w-3.5 h-3.5 shrink-0 ${isExpanded ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`} />
                      <span className={`text-xs font-medium truncate flex-1 ${isExpanded ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'}`}>
                        {project.name}
                      </span>
                      <span className="text-[10px] text-slate-400/60 mr-0.5">{projectChats.length}</span>
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setEditingProject(project); setShowProjectModal(true); }}
                          className="p-0.5 text-slate-400 hover:text-indigo-500 rounded transition-colors"
                          title="Project Settings"
                        >
                          <Settings className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setDeletingProject(project.id); }}
                          className="p-0.5 text-slate-400 hover:text-red-500 rounded transition-colors"
                          title="Delete Project"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded: project chats */}
                    {isExpanded && (
                      <div className="ml-3 pl-3 border-l border-slate-200/60 dark:border-slate-700/40 mt-0.5 space-y-0.5">
                        <button
                          onClick={() => createSession(project.id)}
                          className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors text-left rounded hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10"
                        >
                          <Plus className="w-3 h-3" /> New Chat
                        </button>
                        {projectChats.map(session => renderChatItem(session, true))}
                        {projectChats.length === 0 && (
                          <div className="px-2 py-1 text-[10px] text-slate-400 dark:text-slate-500 italic">No chats</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {projects.length === 0 && (
                <button
                  onClick={() => { setEditingProject(null); setShowProjectModal(true); }}
                  className="w-full flex items-center gap-2 px-2 py-2 text-[11px] text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-white dark:hover:bg-slate-800/60 border border-dashed border-slate-200 dark:border-slate-700/50"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  Create your first project
                </button>
              )}
            </div>
          </div>

          {/* No results */}
          {searchQuery && filteredSessions.length === 0 && (
            <div className="text-center py-8 px-3">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 text-slate-400 dark:text-slate-500" />
              <p className="text-slate-500 dark:text-slate-400 text-xs">No matching chats</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800/60 shrink-0">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
            {sessions.length} chat{sessions.length !== 1 ? 's' : ''} &middot; {projects.length} project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Delete Chat Confirmation Dialog */}
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
              Are you sure? This conversation will be permanently deleted.
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

      {/* Delete Project Confirmation Dialog */}
      {deletingProject && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80]" onClick={() => setDeletingProject(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Delete Project</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Are you sure you want to delete this project?
            </p>
            <p className="text-xs text-red-500/80 mb-6">
              All chats inside this project will also be permanently deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingProject(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProject(deletingProject)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-sm"
              >
                Delete Project
              </button>
            </div>
          </div>
        </>
      )}

      {/* Project Settings Modal (Create / Edit) */}
      <ProjectSettingsModal
        isOpen={showProjectModal}
        onClose={() => { setShowProjectModal(false); setEditingProject(null); }}
        project={editingProject}
        onSave={editingProject ? handleUpdateProject : handleCreateProject}
        onDelete={editingProject ? (id) => { setShowProjectModal(false); setDeletingProject(id); } : undefined}
      />
    </>
  );
}
