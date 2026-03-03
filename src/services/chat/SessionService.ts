/**
 * SessionService
 * 
 * Handles all session-related operations:
 * - Session CRUD (create, read, update, delete)
 * - Firestore persistence
 * - localStorage caching
 * - Message serialization/deserialization
 * 
 * Extracted from ChatContext to enable:
 * - Independent testing
 * - Reuse across components
 * - Cleaner separation of concerns
 */

import { db } from '@/lib/firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc, 
  updateDoc,
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs 
} from 'firebase/firestore';
import { 
  ChatSession, 
  Message, 
  SessionCreateOptions, 
  SessionLoadResult,
  ISessionService 
} from './types';

/**
 * Sanitize data for Firestore (remove undefined values and File objects)
 */
const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (obj instanceof Date) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  
  if (typeof obj === 'object') {
    const newObj: any = {};
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      // Skip File objects (can't be stored in Firestore)
      if (key === 'file' && (value instanceof File || (typeof window !== 'undefined' && value instanceof window.File))) {
        return;
      }
      if (value !== undefined) {
        newObj[key] = sanitizeForFirestore(value);
      }
    });
    return newObj;
  }
  
  return obj;
};

/**
 * Rehydrate a message from Firestore (convert timestamps)
 */
const rehydrateMessage = (m: any): Message => {
  return {
    ...m,
    timestamp: m.timestamp?.toDate?.() || new Date(m.timestamp) || new Date(),
  };
};

/**
 * Sanitize a message for Firestore storage
 */
const sanitizeMessage = (m: Message): any => {
  const { attachments, ...rest } = m;
  return {
    ...sanitizeForFirestore(rest),
    attachments: attachments?.map(a => ({
      ...a,
      file: undefined, // Remove File objects
    })),
  };
};

export class SessionService implements ISessionService {
  private userId: string;
  private collectionName = 'chats';
  
  constructor(userId: string) {
    this.userId = userId;
  }
  
  /**
   * Create a new chat session
   */
  async create(options: SessionCreateOptions = {}): Promise<ChatSession> {
    const id = Date.now().toString();
    const now = new Date();
    
    const session: ChatSession = {
      id,
      title: options.title || 'New Chat',
      createdAt: now,
      updatedAt: now,
      preview: '',
      tags: [],
      ownerId: this.userId,
      visibility: options.visibility || 'private',
      projectId: options.projectId || null,
    };
    
    // Persist to Firestore
    try {
      await setDoc(doc(db, this.collectionName, id), {
        ...sanitizeForFirestore(session),
        userId: this.userId,
      });
    } catch (error) {
      console.error('[SessionService] Failed to create session in Firestore:', error);
      // Continue anyway - localStorage will be fallback
    }
    
    // Cache in localStorage
    this.cacheSession(session);
    
    return session;
  }
  
  /**
   * Load a session and its messages
   */
  async load(sessionId: string): Promise<SessionLoadResult> {
    // Try Firestore first (source of truth)
    try {
      const docRef = doc(db, this.collectionName, sessionId);
      const snap = await getDoc(docRef);
      
      if (snap.exists()) {
        const data = snap.data();
        
        const session: ChatSession = {
          id: snap.id,
          title: data.title || 'Untitled Chat',
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt) || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt) || new Date(),
          preview: data.preview || '',
          tags: data.tags || [],
          ownerId: data.ownerId,
          visibility: data.visibility || 'private',
          projectId: data.projectId || null,
        };
        
        const messages = (data.messages || []).map(rehydrateMessage);
        
        // Update localStorage cache
        this.cacheMessages(sessionId, messages);
        
        return { session, messages };
      }
    } catch (error) {
      console.error('[SessionService] Failed to load from Firestore:', error);
    }
    
    // Fallback to localStorage
    const cachedMessages = this.getCachedMessages(sessionId);
    const cachedSessions = this.getCachedSessions();
    const cachedSession = cachedSessions.find(s => s.id === sessionId);
    
    if (cachedSession) {
      return {
        session: cachedSession,
        messages: cachedMessages,
      };
    }
    
    throw new Error(`Session ${sessionId} not found`);
  }
  
  /**
   * Save messages to a session
   */
  async saveMessages(sessionId: string, messages: Message[]): Promise<void> {
    // Cache locally first for immediate availability
    this.cacheMessages(sessionId, messages);
    
    // Update session preview
    const lastMessage = messages[messages.length - 1];
    const preview = lastMessage?.role === 'user' 
      ? lastMessage.content.slice(0, 100) 
      : 'AI Response...';
    
    // Persist to Firestore
    try {
      const docRef = doc(db, this.collectionName, sessionId);
      await setDoc(docRef, {
        messages: messages.map(sanitizeMessage),
        preview,
        updatedAt: new Date(),
      }, { merge: true });
    } catch (error) {
      console.error('[SessionService] Failed to save messages to Firestore:', error);
    }
  }
  
  /**
   * Delete a session
   */
  async delete(sessionId: string): Promise<void> {
    // Remove from localStorage
    this.removeCachedSession(sessionId);
    localStorage.removeItem(`amble_messages_${sessionId}`);
    
    // Remove from Firestore
    try {
      await deleteDoc(doc(db, this.collectionName, sessionId));
    } catch (error) {
      console.error('[SessionService] Failed to delete from Firestore:', error);
    }
    
    // Dispatch event for other components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('amble-chat-delete', { 
        detail: { chatId: sessionId } 
      }));
    }
  }
  
  /**
   * List all sessions for the current user
   */
  async listForUser(): Promise<ChatSession[]> {
    try {
      const chatsRef = collection(db, this.collectionName);
      const q = query(
        chatsRef,
        where('ownerId', '==', this.userId),
        orderBy('updatedAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      const sessions: ChatSession[] = [];
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        sessions.push({
          id: docSnap.id,
          title: data.title || 'Untitled Chat',
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt) || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt) || new Date(),
          preview: data.preview || '',
          tags: data.tags || [],
          ownerId: data.ownerId,
          visibility: data.visibility || 'private',
          projectId: data.projectId || null,
        });
      });
      
      // Update localStorage cache
      this.cacheSessions(sessions);
      
      return sessions;
    } catch (error) {
      console.error('[SessionService] Failed to list sessions from Firestore:', error);
      
      // Fallback to localStorage
      return this.getCachedSessions();
    }
  }
  
  /**
   * Update session title
   */
  async updateTitle(sessionId: string, title: string): Promise<void> {
    // Update localStorage cache
    const sessions = this.getCachedSessions();
    const updated = sessions.map(s => 
      s.id === sessionId ? { ...s, title, updatedAt: new Date() } : s
    );
    this.cacheSessions(updated);
    
    // Update Firestore
    try {
      const docRef = doc(db, this.collectionName, sessionId);
      await updateDoc(docRef, { title, updatedAt: new Date() });
    } catch (error) {
      console.error('[SessionService] Failed to update title in Firestore:', error);
    }
  }
  
  /**
   * Update session visibility (for sharing)
   */
  async updateVisibility(sessionId: string, visibility: 'private' | 'org'): Promise<void> {
    // Update localStorage cache
    const sessions = this.getCachedSessions();
    const updated = sessions.map(s => 
      s.id === sessionId ? { ...s, visibility, updatedAt: new Date() } : s
    );
    this.cacheSessions(updated);
    
    // Update Firestore
    try {
      const docRef = doc(db, this.collectionName, sessionId);
      await updateDoc(docRef, { visibility });
    } catch (error) {
      console.error('[SessionService] Failed to update visibility in Firestore:', error);
    }
  }
  
  /**
   * Generate a title for a session based on the first message
   */
  async generateTitle(sessionId: string, firstMessage: string): Promise<string | null> {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'Generate a short, concise chat title (max 6 words) based on the user\'s message. Do not use quotes.' },
            { role: 'user', content: firstMessage }
          ],
          model: 'gpt-4o-mini',
          stream: false
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        const title = data.reply?.trim().replace(/^["']|["']$/g, '');
        
        if (title) {
          await this.updateTitle(sessionId, title);
          return title;
        }
      }
    } catch (error) {
      console.error('[SessionService] Failed to generate title:', error);
    }
    
    return null;
  }
  
  // ============================================
  // PRIVATE: localStorage caching methods
  // ============================================
  
  private get sessionsCacheKey(): string {
    return `amble_sessions_${this.userId}`;
  }
  
  private get lastSessionKey(): string {
    return `amble_last_session_id_${this.userId}`;
  }
  
  private cacheSession(session: ChatSession): void {
    const sessions = this.getCachedSessions();
    const existing = sessions.findIndex(s => s.id === session.id);
    
    if (existing >= 0) {
      sessions[existing] = session;
    } else {
      sessions.unshift(session);
    }
    
    this.cacheSessions(sessions);
  }
  
  private cacheSessions(sessions: ChatSession[]): void {
    try {
      localStorage.setItem(this.sessionsCacheKey, JSON.stringify(sessions));
    } catch (error) {
      console.error('[SessionService] Failed to cache sessions:', error);
    }
  }
  
  private getCachedSessions(): ChatSession[] {
    try {
      const cached = localStorage.getItem(this.sessionsCacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Filter to only this user's sessions
        return parsed.filter((s: any) => !s.ownerId || s.ownerId === this.userId);
      }
    } catch (error) {
      console.error('[SessionService] Failed to read cached sessions:', error);
    }
    return [];
  }
  
  private removeCachedSession(sessionId: string): void {
    const sessions = this.getCachedSessions();
    const filtered = sessions.filter(s => s.id !== sessionId);
    this.cacheSessions(filtered);
    
    // Clear last session if it was this one
    if (localStorage.getItem(this.lastSessionKey) === sessionId) {
      localStorage.removeItem(this.lastSessionKey);
    }
  }
  
  private cacheMessages(sessionId: string, messages: Message[]): void {
    try {
      localStorage.setItem(`amble_messages_${sessionId}`, JSON.stringify(messages));
    } catch (error) {
      console.error('[SessionService] Failed to cache messages:', error);
    }
  }
  
  private getCachedMessages(sessionId: string): Message[] {
    try {
      const cached = localStorage.getItem(`amble_messages_${sessionId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('[SessionService] Failed to read cached messages:', error);
    }
    return [];
  }
  
  /**
   * Get the last active session ID for restoration
   */
  getLastActiveSessionId(): string | null {
    return localStorage.getItem(this.lastSessionKey);
  }
  
  /**
   * Set the last active session ID
   */
  setLastActiveSessionId(sessionId: string): void {
    localStorage.setItem(this.lastSessionKey, sessionId);
  }
}

// Factory function for creating service instances
export function createSessionService(userId: string): SessionService {
  return new SessionService(userId);
}
