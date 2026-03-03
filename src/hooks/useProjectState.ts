import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Project, ChatSession } from '@/components/layout/ProjectSidebar';
import { useOrganization } from '@/contexts/OrganizationContext';

export function useProjectState(userId: string | undefined) {
  const { currentOrg } = useOrganization();
  const [projects, setProjects] = useState<Project[]>([]);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  
  // Modals specific to projects
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteChatModalOpen, setDeleteChatModalOpen] = useState(false);
  const [chatToDeleteId, setChatToDeleteId] = useState<string | null>(null);
  // Keep track of deleted IDs to prevent "ghost" reappearance from snapshot latency
  const [locallyDeletedIds, setLocallyDeletedIds] = useState<Set<string>>(new Set());

  // Persistence for Projects (Aware of Organization)
  useEffect(() => {
    if (!userId) {
        setProjects([]);
        setChats([]);
        return;
    }

    let qProjects;
    
    if (currentOrg) {
        // Fetch Org Projects
        qProjects = query(collection(db, 'projects'), where('orgId', '==', currentOrg.id));
    } else {
        // Fetch Personal Projects (where orgId is missing or null, AND userId matches)
        qProjects = query(collection(db, 'projects'), where('userId', '==', userId));
    }

    const unsubProjects = onSnapshot(qProjects, (snapshot) => {
      const fetchedProjects: Project[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (!currentOrg && data.orgId) return; 
        fetchedProjects.push({ ...data, id: doc.id } as Project);
      });
      setProjects(fetchedProjects);
    });

    // Query chats by ownerId to match index and how ChatContext saves chats
    const qChats = query(collection(db, 'chats'), where('ownerId', '==', userId));
    const unsubChats = onSnapshot(qChats, (snapshot) => {
      const fetchedChats: ChatSession[] = [];
      snapshot.forEach((doc) => {
        // Skip if we deleted it locally
        if (locallyDeletedIds.has(doc.id)) return;
        fetchedChats.push({ ...doc.data(), id: doc.id } as ChatSession);
      });
      setChats(fetchedChats);
    });

    return () => {
      unsubProjects();
      unsubChats();
    };
  }, [userId, currentOrg, locallyDeletedIds]); // Re-run if deleted IDs change to re-filter (though snapshot triggers usually suffice, this ensures consistency)

  // --- ACTIONS ---

  const createProject = async (projectData: Omit<Project, 'id' | 'createdAt' | 'userId' | 'orgId'>) => {
      if (!userId) return;
      try {
          const newProject = {
              ...projectData,
              userId,
              orgId: currentOrg?.id || null, // Associate with Org if active
              createdAt: Date.now(),
              updatedAt: Date.now()
          };
          await addDoc(collection(db, 'projects'), newProject);
          setShowProjectModal(false);
      } catch (e) {
          console.error("Error creating project:", e);
      }
  };

  const updateProject = async (projectId: string, data: Partial<Project>) => {
      try {
          const ref = doc(db, 'projects', projectId);
          await updateDoc(ref, { ...data, updatedAt: Date.now() });
          setShowProjectModal(false);
          setEditingProject(null);
      } catch (e) {
          console.error("Error updating project:", e);
      }
  };

  const deleteProject = async (projectId: string) => {
      try {
          await deleteDoc(doc(db, 'projects', projectId));
          if (activeProjectId === projectId) setActiveProjectId(null);
      } catch (e) {
          console.error("Error deleting project:", e);
      }
  };

  const saveChatToFirestore = async (chatId: string, messages: any[]) => {
    if (!userId || !chatId) return;
    try {
      const chatRef = doc(db, 'chats', chatId);
      await setDoc(chatRef, { 
        messages, 
        updatedAt: Date.now() 
      }, { merge: true });
    } catch (e) {
      console.error("Error saving chat to Firestore:", e);
    }
  };

  const deleteChat = async (chatId: string) => {
      // Optimistic update: Remove immediately from UI via Set
      setLocallyDeletedIds(prev => new Set(prev).add(chatId));
      
      // Also manually update current list state for instant feedback
      setChats((prev) => prev.filter((chat) => chat.id !== chatId));

      if (activeChatId === chatId) setActiveChatId(null);
      setDeleteChatModalOpen(false); // Close immediately

      try {
          await deleteDoc(doc(db, 'chats', chatId));
          // Success: No need to remove from deletedIds, the snapshot will eventually just NOT return it.
      } catch (e) {
          console.error("Error deleting chat:", e);
          // Revert optimistic update
          setLocallyDeletedIds(prev => {
              const next = new Set(prev);
              next.delete(chatId);
              return next;
          });
          // Note: We can't easily undo the setChats filter without a refetch, 
          // but the next snapshot update will restore it since we removed it from the ignore list.
          throw e; 
      }
  };

  return {
    projects,
    chats,
    activeProjectId,
    setActiveProjectId,
    activeChatId,
    setActiveChatId,
    saveChatToFirestore,
    // Actions
    createProject,
    updateProject,
    deleteProject,
    deleteChat, // Exposed new action
    // Modal State
    showProjectModal,
    setShowProjectModal,
    editingProject,
    setEditingProject,
    deleteChatModalOpen,
    setDeleteChatModalOpen,
    chatToDeleteId,
    setChatToDeleteId
  };
}
