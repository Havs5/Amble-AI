import { useState } from 'react';

export type AppView = 'dashboard' | 'amble' | 'billing' | 'projects' | 'media' | 'veo' | 'pharmacies' | 'knowledge';

export function useAppNavigation() {
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  
  // Modals
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUserManagementModal, setShowUserManagementModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [profileInitialTab, setProfileInitialTab] = useState<'profile' | 'security' | 'users' | 'amble-config' | 'cx-config'>('profile');

  // Navigation Actions
  const toggleSidebar = () => setIsSidebarExpanded(prev => !prev);
  
  const openProfile = (tab: 'profile' | 'security' | 'users' | 'amble-config' | 'cx-config' = 'profile') => {
    setProfileInitialTab(tab);
    setShowProfileModal(true);
  };

  return {
    activeView,
    setActiveView,
    isSidebarExpanded,
    setIsSidebarExpanded,
    toggleSidebar,
    // Modals
    showProfileModal,
    setShowProfileModal,
    showUserManagementModal,
    setShowUserManagementModal,
    showHelpModal,
    setShowHelpModal,
    showClearConfirm,
    setShowClearConfirm,
    profileInitialTab,
    openProfile
  };
}
