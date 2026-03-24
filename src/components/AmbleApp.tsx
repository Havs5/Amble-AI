'use client';

import React, { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Toaster, toast as sonnerToast } from 'sonner';

// Core Components (load immediately)
import { Sidebar } from './layout/Sidebar';
import { PharmacySidebar, PharmacyType } from './layout/PharmacySidebar';
import { CapabilitiesDock } from './ai/CapabilitiesDock';
import Login from './auth/LoginRefactored';
import { SplashScreen } from './ui/SplashScreen';

// Lazy load heavy modals (only loaded when opened)
const HelpModal = dynamic(() => import('./modals/HelpModal').then(m => ({ default: m.HelpModal })), { ssr: false });
const ClearDataModal = dynamic(() => import('./modals/ClearDataModal').then(m => ({ default: m.ClearDataModal })), { ssr: false });
const ConfirmationModal = dynamic(() => import('./modals/ConfirmationModal').then(m => ({ default: m.ConfirmationModal })), { ssr: false });
const ProfileModal = dynamic(() => import('./modals/ProfileModal').then(m => ({ default: m.ProfileModal })), { ssr: false });
const UserManagementModal = dynamic(() => import('./modals/UserManagementModal').then(m => ({ default: m.UserManagementModal })), { ssr: false });
const ProjectSettingsModal = dynamic(() => import('./modals/ProjectSettingsModal').then(m => ({ default: m.ProjectSettingsModal })), { ssr: false });

// Contexts & Hooks
import { AuthProvider, useAuth } from './auth/AuthContextRefactored';
import { OrganizationProvider } from '@/contexts/OrganizationContext';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { useModelSelection } from '@/hooks/useModelSelection';
import { useProjectState } from '@/hooks/useProjectState';
import { useAmbleConfig } from '@/hooks/useAmbleConfig';
import { useAiDictation } from '@/hooks/useAiDictation';
import { useHotkeys } from '@/hooks/useHotkeys';

// Utils
import { CapabilityKey, findBestModelForCapabilities, MODEL_CAPABILITIES } from '../lib/capabilities';
import { KB_DRIVE_FOLDER_ID } from '../lib/constants';
import { CommandRouter } from '@/services/ui/CommandRouter'; // Added

import { GlobalCommandCenter } from './layout/GlobalCommandCenter';
import { FeatureRouter } from './layout/FeatureRouter';

export default function AmbleApp() {
  return (
    <AuthProvider>
      <OrganizationProvider>
        <AmbleAppWrapper />
      </OrganizationProvider>
    </AuthProvider>
  );
}

// Wrapper component to get user and pass key to force remount
function AmbleAppWrapper() {
  const { user } = useAuth();
  
  // Use user.id as key - when user changes, entire AmbleAppContent remounts with fresh state
  // This ensures complete isolation between different user sessions
  return <AmbleAppContent key={user?.id || 'logged-out'} />;
}

function AmbleAppContent() {
  const { user, logout, getIdToken } = useAuth();
  
  // Custom Toast Wrapper
  const setToast = (toastData: { type: 'success' | 'error' | 'info'; message: string } | null) => {
    if (!toastData) return;
    if (toastData.type === 'success') sonnerToast.success(toastData.message);
    else if (toastData.type === 'error') sonnerToast.error(toastData.message);
    else sonnerToast.info(toastData.message);
  };

  // --- HOOKS ---
  const nav = useAppNavigation();
  const modelSel = useModelSelection();
  const projState = useProjectState(user?.id);
  const config = useAmbleConfig();

  // --- LOCAL UI STATE ---
  const [isDarkMode, setIsDarkMode] = useState(false);
  // userName is always derived from user - no localStorage caching
  const userName = user?.name || 'User';
  const [chatSessionToken, setChatSessionToken] = useState(0);
  const [qaEnabled, setQaEnabled] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  // --- PHARMACY STATE ---
  const [activePharmacy, setActivePharmacy] = useState<PharmacyType | null>(null);
  // Track mounted pharmacies to keep their iframes alive for session persistence
  const [mountedPharmacies, setMountedPharmacies] = useState<Set<PharmacyType>>(new Set());
  // Track collapsed state for pharmacy sidebar
  const [isPharmacySidebarCollapsed, setIsPharmacySidebarCollapsed] = useState(false);

  // When a pharmacy is selected, add it to mounted set so iframe persists
  const handleSelectPharmacy = (pharmacy: PharmacyType) => {
    setActivePharmacy(pharmacy);
    setMountedPharmacies(prev => new Set(prev).add(pharmacy));
  };

  // --- VOICE CONTROL ---
  const { isRecording, isProcessing, toggleRecording } = useAiDictation({
      onResult: (text) => {
          // Voice command recognized
          const command = CommandRouter.match(text);
          
          if (command) {
              setToast({ type: 'success', message: `Command: ${text}` });
              
              if (command.type === 'NAVIGATE') {
                  nav.setActiveView(command.view as any); // Type cast if needed
              }
              else if (command.type === 'THEME') {
                  if (command.mode === 'toggle') setIsDarkMode(p => !p);
                  else if (command.mode === 'dark') setIsDarkMode(true);
                  else setIsDarkMode(false);
              }
              else if (command.type === 'CHAT') {
                  if (command.action === 'new') {
                      projState.setActiveChatId(null);
                      setChatSessionToken(p => p + 1);
                      if (nav.activeView !== 'amble') nav.setActiveView('amble');
                  }
              }
              else if (command.type === 'STUDIO') {
                  nav.setActiveView('veo'); // Assuming 'veo' is the studio view ID
                  // Note: Passing tab state to MediaStudio requires url params or context for better deep linking V2
              }
          } else {
              // Not a command? Treat as dictation (But where to put it?)
              // For now, just show toast. In V3 we inject into chat input
              setToast({ type: 'info', message: `Heard: "${text}"` });
          }
      }
  });

  // --- HOTKEYS ---
  useHotkeys({
    toggleSidebar: nav.toggleSidebar,
    openSettings: () => nav.openProfile('profile'),
    toggleTheme: () => setIsDarkMode(p => !p),
    openHelp: () => nav.setShowHelpModal(true)
  });

  // --- HANDLERS ---


  // 1. Theme Persistence (only on mount)
  useEffect(() => {
    const storedTheme = localStorage.getItem('amble_theme');
    if (storedTheme === 'dark') setIsDarkMode(true);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
      localStorage.setItem('amble_theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
      localStorage.setItem('amble_theme', 'light');
    }
  }, [isDarkMode]);

  // 2. Google OAuth Message Handler (for KB Drive sync)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_OAUTH_SUCCESS') {
        const { accessToken, refreshToken, expiresIn } = event.data;
        // Store access token for KB sync
        if (accessToken) {
          localStorage.setItem('googleAccessToken', accessToken);
          localStorage.setItem('googleTokenExpiry', String(Date.now() + (expiresIn * 1000)));
          if (refreshToken) {
            localStorage.setItem('googleRefreshToken', refreshToken);
          }
          setToast({ type: 'success', message: 'Google Drive connected, syncing KB...' });
          
          // Trigger KB sync immediately
          try {
            // Get Firebase auth token
            const firebaseToken = await getIdToken();
            if (!firebaseToken) {
              console.warn('[KB Sync] No Firebase token available');
              return;
            }
            
            const response = await fetch('/api/knowledge/drive-sync', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${firebaseToken}`,
              },
              body: JSON.stringify({ 
                accessToken,
                folderId: KB_DRIVE_FOLDER_ID
              }),
            });
            
            if (response.ok) {
              const data = await response.json();
              if (data.syncedCount > 0) {
                setToast({ type: 'success', message: `KB synced ${data.syncedCount} documents` });
              } else {
                setToast({ type: 'info', message: 'KB sync complete, no new documents' });
              }
            }
          } catch (err) {
            console.warn('[KB Sync] Post-OAuth sync error:', err);
          }
        }
      } else if (event.data?.type === 'GOOGLE_OAUTH_ERROR') {
        setToast({ type: 'error', message: `Google auth failed: ${event.data.error}` });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [getIdToken]);

  // 2b. Auto KB Sync on Login
  useEffect(() => {
    if (!user?.id) return;
    
    // Check if we already synced this session
    const syncKey = `kb_synced_${user.id}`;
    if (sessionStorage.getItem(syncKey)) return;
    
    // Check for Google Drive token (from Google sign-in)
    const driveToken = localStorage.getItem(`gdrive_access_token_${user.id}`) 
                    || localStorage.getItem('googleAccessToken');
    
    if (!driveToken) return;
    
    // Mark as synced for this session
    sessionStorage.setItem(syncKey, 'true');
    
    // Trigger KB sync in background
    const triggerKBSync = async () => {
      try {
        // Get Firebase auth token
        const firebaseToken = await getIdToken();
        if (!firebaseToken) {
          console.warn('[KB Sync] No Firebase token for auto-sync');
          return;
        }
        
        const response = await fetch('/api/knowledge/drive-sync', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${firebaseToken}`,
          },
          body: JSON.stringify({ 
            accessToken: driveToken,
            folderId: KB_DRIVE_FOLDER_ID
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          // KB auto-sync completed
          if (data.syncedCount > 0) {
            setToast({ type: 'success', message: `KB synced ${data.syncedCount} documents` });
          }
        } else {
          console.warn('[KB Sync] Auto-sync failed:', response.status, await response.text());
        }
      } catch (err) {
        console.warn('[KB Sync] Auto-sync error:', err);
      }
    };
    
    // Run in background after a short delay to not block login
    setTimeout(triggerKBSync, 2000);
  }, [user?.id, getIdToken]);

  // 3. Capabilities Auto-Routing
  const handleToggleCapability = (cap: CapabilityKey) => {
    const newState = { ...config.activeCapabilities, [cap]: !config.activeCapabilities[cap] };
    config.setActiveCapabilities(newState);

    if (newState[cap]) {
      const requiredCaps = (Object.keys(newState) as string[])
        .filter(k => k !== 'enableStudio' && newState[k as keyof typeof newState]) as CapabilityKey[];
      
      let bestModelId = findBestModelForCapabilities(requiredCaps, modelSel.selectedModel);
      
      if (!bestModelId) {
        bestModelId = findBestModelForCapabilities([cap], modelSel.selectedModel);
      }

      if (bestModelId && bestModelId !== modelSel.selectedModel) {
        const bestModelDef = MODEL_CAPABILITIES[bestModelId];
        modelSel.setSelectedModel(bestModelId);
        setToast({ message: `Switched to ${bestModelDef?.name || bestModelId} to enable ${cap}`, type: 'success' });
      } else if (!bestModelId) {
        setToast({ message: `No model supports ${cap}.`, type: 'error' });
      }
    }
  };

  // 3. Project Handlers
  const handleSaveProject = async (projectData: any) => {
    if (projState.editingProject) {
        await projState.updateProject(projState.editingProject.id, projectData);
        setToast({ type: 'success', message: 'Project updated' });
    } else {
        await projState.createProject(projectData);
        setToast({ type: 'success', message: 'Project created' });
    }
  };

  // 4. Chat Management
  const handleChatDeleted = () => {
    projState.setActiveChatId(null);
    setChatSessionToken(prev => prev + 1);
  };

  const handleNewPatient = () => {
    if (user?.id) localStorage.removeItem(`amble_notes_${user.id}`);
    setResetKey(prev => prev + 1);
  };

  // 5. Dictation (PTT)
  // Actually PTT logic was targeting the ChatInput. 
  // We need to pass down the PTT events or ref to the ChatInterface?
  // For V2 Refactor, we will rely on ChatInterface's own PTT or global event bus. 
  // Ideally, useAiDictation should be inside ChatInterface. 
  // For now, removing the global PTT listener that was tightly coupled to specific refs.

  // Mobile sidebar state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Splash screen state
  const [showSplash, setShowSplash] = useState(true);

  if (!user) {
    if (showSplash) return <SplashScreen onFinish={() => setShowSplash(false)} minDuration={1400} />;
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex font-sans text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Toaster richColors position="top-right" theme={isDarkMode ? 'dark' : 'light'} toastOptions={{ className: 'shadow-lg' }} />
      
      {/* Mobile sidebar overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* LEFT SIDEBAR - key forces remount when user changes */}
      <div className={`fixed lg:static inset-y-0 left-0 z-50 lg:z-auto transition-transform duration-300 ease-out lg:translate-x-0 overflow-visible ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <Sidebar 
        key={`sidebar-${user.id}`}
        isExpanded={nav.isSidebarExpanded || isMobileSidebarOpen}
        setIsExpanded={(v) => { nav.setIsSidebarExpanded(v); if (!v) setIsMobileSidebarOpen(false); }}
        userName={user.name || 'User'}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        onClearData={() => handleNewPatient()}
        onOpenHelp={() => nav.setShowHelpModal(true)}
        onOpenProfile={(tab) => {
            if (tab === 'users') {
                nav.setShowUserManagementModal(true);
            } else {
                nav.openProfile(tab);
            }
        }}
        activeView={nav.activeView}
        onViewChange={nav.setActiveView}
        onLogout={logout}
        enableStudio={config.activeCapabilities.enableStudio}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />
      </div>

      <CapabilitiesDock 
        isOpen={config.showCapabilitiesDock}
        onClose={() => config.setShowCapabilitiesDock(false)}
        activeCapabilities={config.activeCapabilities}
        onToggleCapability={handleToggleCapability}
        currentModelId={modelSel.selectedModel}
        onModelChange={modelSel.setSelectedModel}
      />

      {/* PROJECT SIDEBAR removed from amble view for cleaner UX - ChatInterface has its own sidebar */}

      {/* PHARMACY SIDEBAR (Only in Pharmacies view) */}
      {nav.activeView === 'pharmacies' && (
        <PharmacySidebar 
          activePharmacy={activePharmacy}
          onSelectPharmacy={handleSelectPharmacy}
          isCollapsed={isPharmacySidebarCollapsed}
          onCollapsedChange={setIsPharmacySidebarCollapsed}
        />
      )}

      {/* MAIN CONTENT */}
      <div 
        className="flex-1 flex flex-col h-screen overflow-hidden"
        onMouseEnter={() => {
          if (nav.activeView === 'pharmacies') {
            setIsPharmacySidebarCollapsed(true);
          }
        }}
      >
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
          <button
            onClick={() => setIsMobileSidebarOpen(true)}
            className="p-2 -ml-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Open navigation menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-bold text-base tracking-tight">Amble AI</span>
          </div>
          <div className="w-10" />{/* spacer for centering */}
        </div>
        
        {(nav.activeView === 'amble' || nav.activeView === 'billing') && (
          <div className="hidden lg:block">
            <GlobalCommandCenter 
              activeView={nav.activeView}
              modelSel={modelSel}
              billingActions={{
                onNewPatient: handleNewPatient,
                qaEnabled,
                setQaEnabled
              }}
              onOpenHelp={() => nav.setShowHelpModal(true)}
            />
          </div>
        )}

        <FeatureRouter 
           activeView={nav.activeView}
           chatProps={{
             sessionToken: chatSessionToken,
             activeChatId: projState.activeChatId,
             activeProjectId: projState.activeProjectId,
             model: modelSel.selectedModel,
             mode: modelSel.selectedReasoningMode,
             onModeChange: modelSel.setSelectedReasoningMode,
             config: { ...config.ambleConfig, systemPrompt: config.ambleSystemPrompt, policies: config.amblePolicies },
             onChatDeleted: handleChatDeleted,
             onSessionChange: (id) => {
                 if (id && id !== projState.activeChatId) projState.setActiveChatId(id);
             },
             dictationEnabled: config.activeCapabilities.dictation ?? true
           }}
           billingProps={{
             resetKey,
             user,
             systemPrompt: config.billingSystemPrompt,
             policies: config.billingPolicies,
             setToast,
             onHelp: () => nav.setShowHelpModal(true)
           }}
           pharmacyProps={{
             activePharmacy,
             mountedPharmacies
           }}
           dashboardProps={{
             userName: user.name || 'User',
             onNavigate: (view) => nav.setActiveView(view as any),
             permissions: {
               accessAmble: true,
               accessBilling: true,
               accessPharmacy: true,
               accessStudio: config.activeCapabilities.enableStudio ?? false,
               accessKnowledge: true,
             },
             user: {
               id: user.id,
               name: user.name || 'User',
               role: (user.role as 'admin' | 'user' | 'superadmin') || 'user',
             },
           }}
        />
      </div>
      
      {/* MODALS */}
      <ProfileModal 
        key={`profile-${user.id}`}
        isOpen={nav.showProfileModal} 
        onClose={() => nav.setShowProfileModal(false)} 
        userName={user.name || 'User'} 
        onSave={() => {}} // userName is derived from user.name, no local state needed
        initialTab={nav.profileInitialTab}
        
        amblePrompt={config.ambleSystemPrompt}
        onSaveAmblePrompt={config.setAmbleSystemPrompt}
        amblePolicies={config.amblePolicies}
        onSaveAmblePolicies={config.setAmblePolicies}
        ambleConfig={config.ambleConfig}
        onSaveAmbleConfig={config.setAmbleConfig}
        onSaveAmbleSettings={config.updateAmbleConfig}

        activeCapabilities={config.activeCapabilities}
        onSaveCapabilities={config.setActiveCapabilities}

        cxPrompt={config.billingSystemPrompt}
        onSaveCxPrompt={config.setBillingSystemPrompt}
        cxPolicies={config.billingPolicies}
        onSaveCxPolicies={config.setBillingPolicies}
        cxConfig={config.billingConfig}
        onSaveCxConfig={config.setBillingConfig}
        onSaveCxSettings={config.updateCxConfig}

        onOpenUserManagement={() => {
          nav.setShowProfileModal(false);
          nav.setShowUserManagementModal(true);
        }}
      />

      <UserManagementModal
        isOpen={nav.showUserManagementModal}
        onClose={() => nav.setShowUserManagementModal(false)}
        onBack={() => {
          nav.setShowUserManagementModal(false);
          nav.openProfile('profile');
        }}
      />

      <ClearDataModal 
        isOpen={nav.showClearConfirm} 
        onClose={() => nav.setShowClearConfirm(false)} 
        onConfirm={() => {
          handleNewPatient();
          nav.setShowClearConfirm(false);
        }} 
      />

      <ProjectSettingsModal
        isOpen={projState.showProjectModal}
        onClose={() => projState.setShowProjectModal(false)}
        project={projState.editingProject}
        onSave={handleSaveProject} 
        onDelete={(id) => projState.deleteProject(id)}
      />

      <ConfirmationModal
        isOpen={projState.deleteChatModalOpen}
        onClose={() => projState.setDeleteChatModalOpen(false)}
        onConfirm={async () => {
             const idToDelete = projState.chatToDeleteId;
             if (!idToDelete) return;
             
             // Optimistically notify user
             setToast({ type: 'info', message: 'Chat deleted' });

             try {
                await projState.deleteChat(idToDelete);
                handleChatDeleted();
                // Dispatch event so ChatContext cleans up local storage
                window.dispatchEvent(new CustomEvent('amble-chat-delete', { 
                  detail: { chatId: idToDelete } 
                }));
             } catch (e) {
                // If it fails, the hook will handle state reversion, we just notify
                setToast({ type: 'error', message: 'Could not delete chat' });
             }
        }}
        title="Delete Chat"
        message="Are you sure you want to delete this chat permanently? This action cannot be undone."
        confirmLabel="Delete Forever"
        isDangerous={true}
      />

      <HelpModal 
        isOpen={nav.showHelpModal} 
        onClose={() => nav.setShowHelpModal(false)} 
      />
    </div>
  );
}
