import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, User, Settings, Moon, Sun, RefreshCw, LogOut, Shield, LayoutGrid, FileText, Folder, Image as ImageIcon, Bot, Video, Mic, ScanEye, Pill, Database, X, Keyboard, Home, Bell, ChevronDown, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthContextRefactored';
import { OrgSwitcher } from '../organization/OrgSwitcher';
import { useOrganization } from '@/contexts/OrganizationContext';

type ViewType = 'dashboard' | 'amble' | 'billing' | 'projects' | 'media' | 'veo' | 'pharmacies' | 'knowledge';

interface SidebarProps {
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  userName: string;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  onClearData: () => void;
  onOpenHelp: () => void;
  onOpenProfile: (tab?: 'profile' | 'security' | 'users' | 'amble-config' | 'cx-config') => void;
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  onLogout: () => void;
  enableStudio?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ 
  isExpanded, 
  setIsExpanded, 
  userName, 
  isDarkMode, 
  setIsDarkMode, 
  onClearData, 
  onOpenHelp, 
  onOpenProfile,
  activeView,
  onViewChange,
  onLogout,
  enableStudio = false,
  onCloseMobile
}: SidebarProps) {
  const { user } = useAuth();
  const { currentOrg } = useOrganization();
  const [showSettings, setShowSettings] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [profileMenuPos, setProfileMenuPos] = useState<{ bottom: number; left: number } | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  
  // Always use fresh user name from auth context - prop is fallback
  const displayName = user?.name || userName || 'User';
  const displayRole = user?.role || 'user';
  const isAdmin = user?.role === 'admin';

  // Calculate profile menu position when toggled
  const toggleProfileMenu = useCallback(() => {
    if (!showProfileMenu && profileButtonRef.current) {
      const rect = profileButtonRef.current.getBoundingClientRect();
      setProfileMenuPos({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
      });
    }
    setShowProfileMenu(prev => !prev);
  }, [showProfileMenu]);
  
  // Safe permissions with defaults - ensures tabs show even if permissions not fully loaded
  // Admins get Knowledge Base access by default
  const permissions = {
    accessAmble: user?.permissions?.accessAmble ?? true,
    accessBilling: user?.permissions?.accessBilling ?? true,
    accessPharmacy: user?.permissions?.accessPharmacy ?? false,
    accessStudio: user?.permissions?.accessStudio ?? false,
    accessKnowledge: user?.permissions?.accessKnowledge ?? (user?.role === 'admin'),
  };

  // Click Outside to Close Settings
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSettings && settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
      // Profile menu uses fixed overlay for dismissal, so skip here
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  return (
    <aside 
      ref={sidebarRef}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => { setShowProfileMenu(false); setIsExpanded(false); }}
      className={`${isExpanded ? 'w-[272px]' : 'w-[68px]'} bg-white dark:bg-[#0a0f1a] border-r border-slate-100 dark:border-slate-800/60 flex flex-col transition-[width] duration-200 ease-out will-change-[width] z-40 relative h-screen overflow-visible`}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Sidebar Header (Logo + Branding) */}
      <div className="h-16 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0 relative">
             <span className="text-white font-bold text-xl">A</span>
             {/* Online indicator */}
             <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-[#0a0f1a]" />
          </div>
          <div className={`transition-all duration-200 overflow-hidden ${isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
            <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white whitespace-nowrap">Amble AI</span>
            <span className="block text-[10px] font-medium text-slate-400 dark:text-slate-500 -mt-0.5 tracking-wide">Healthcare Platform</span>
          </div>
        </div>
        {/* Mobile close button */}
        {onCloseMobile && (
          <button 
            onClick={onCloseMobile}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Org Switcher */}
      {isExpanded && (
        <div className="px-3 pt-3 pb-0 shrink-0">
             <OrgSwitcher />
        </div>
      )}

      {/* Sidebar Toggle */}
      <button 
        onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
        className="hidden lg:flex absolute top-1/2 -translate-y-1/2 -right-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full w-6 h-6 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 shadow-md hover:shadow-lg transition-all z-[60] items-center justify-center hover:scale-110"
        aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {isExpanded ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>

      {/* Section Label */}
      {isExpanded && (
        <div className="px-5 pt-5 pb-1.5">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">Workspace</span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto scrollbar-thin">
        {/* Dashboard - New! */}
        <NavItem
          icon={Home}
          label="Dashboard"
          isActive={activeView === 'dashboard'}
          isExpanded={isExpanded}
          onClick={() => { onViewChange('dashboard'); onCloseMobile?.(); }}
          badge={null}
        />

        {permissions.accessAmble && (
        <NavItem
          icon={Sparkles}
          label="Amble AI"
          isActive={activeView === 'amble'}
          isExpanded={isExpanded}
          onClick={() => { onViewChange('amble'); onCloseMobile?.(); }}
        />
        )}

        {permissions.accessKnowledge && (
        <NavItem
          icon={Database}
          label="Knowledge Base"
          isActive={activeView === 'knowledge'}
          isExpanded={isExpanded}
          onClick={() => { onViewChange('knowledge'); onCloseMobile?.(); }}
        />
        )}

        {permissions.accessBilling && (
        <NavItem
          icon={FileText}
          label="Billing CX"
          isActive={activeView === 'billing'}
          isExpanded={isExpanded}
          onClick={() => { onViewChange('billing'); onCloseMobile?.(); }}
        />
        )}

        {permissions.accessPharmacy && (
        <NavItem
          icon={Pill}
          label="Pharmacies"
          isActive={activeView === 'pharmacies'}
          isExpanded={isExpanded}
          onClick={() => { onViewChange('pharmacies'); onCloseMobile?.(); }}
        />
        )}

        {enableStudio && (
        <NavItem
          icon={Video}
          label="Media Studio"
          isActive={activeView === 'veo'}
          isExpanded={isExpanded}
          onClick={() => { onViewChange('veo'); onCloseMobile?.(); }}
          badge="Beta"
        />
        )}
      </nav>

      {/* Sidebar Footer (Profile) */}
      <div className="px-2 py-2 border-t border-slate-100 dark:border-slate-800/60 shrink-0">
          <button
            ref={profileButtonRef}
            onClick={toggleProfileMenu}
            className={`flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all ${isExpanded ? '' : 'justify-center'}`}
          >
            {/* Avatar with gradient ring */}
            <div className="relative shrink-0">
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 rounded-xl flex items-center justify-center border border-indigo-200/50 dark:border-indigo-500/20">
                <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
            {isExpanded && (
              <div className="flex-1 flex items-center justify-between min-w-0">
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="text-sm font-semibold truncate text-slate-800 dark:text-slate-200 max-w-[140px]">{displayName}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{isAdmin ? 'Administrator' : 'Team Member'}</span>
                </div>
                <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${showProfileMenu ? 'rotate-180' : ''}`} />
              </div>
            )}
          </button>

        {/* Profile Menu Popover */}
        {showProfileMenu && (
          <>
          <div className="fixed inset-0 z-[60]" onClick={() => setShowProfileMenu(false)} />
          <div 
            ref={profileMenuRef} 
            className="fixed w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/30 p-1.5 z-[70] animate-fade-in"
            style={profileMenuPos ? { bottom: `${profileMenuPos.bottom}px`, left: `${profileMenuPos.left}px` } : { bottom: '80px', left: '16px' }}
          >
            {/* User info header */}
            <div className="px-3 py-3 mb-1">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{displayName}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{user?.email || ''}</p>
            </div>
            
            <div className="h-px bg-slate-100 dark:bg-slate-800 mx-1" />
            
            {/* Theme toggle */}
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors mt-1"
            >
              <div className="flex items-center gap-3">
                {isDarkMode ? <Moon size={15} className="text-slate-500 dark:text-slate-400" /> : <Sun size={15} className="text-slate-500 dark:text-slate-400" />}
                <span className="text-sm text-slate-600 dark:text-slate-400">{isDarkMode ? 'Dark Mode' : 'Light Mode'}</span>
              </div>
              <div className={`w-9 h-5 rounded-full relative transition-colors ${isDarkMode ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${isDarkMode ? 'left-[18px]' : 'left-0.5'}`}></div>
              </div>
            </button>
            
            <div className="h-px bg-slate-100 dark:bg-slate-800 mx-1 my-0.5" />
            
            <MenuButton icon={User} label="Profile" onClick={() => { onOpenProfile('profile'); setShowProfileMenu(false); }} />
            <MenuButton icon={Shield} label="Security" onClick={() => { onOpenProfile('security'); setShowProfileMenu(false); }} />
            <MenuButton icon={Bot} label="AI Configuration" onClick={() => { onOpenProfile('amble-config'); setShowProfileMenu(false); }} />
            <MenuButton icon={FileText} label="CX Configuration" onClick={() => { onOpenProfile('cx-config'); setShowProfileMenu(false); }} />
            
            {isAdmin && (
            <>
              <div className="h-px bg-slate-100 dark:bg-slate-800 mx-1 my-0.5" />
              <MenuButton icon={Settings} label="Manage Users" onClick={() => { onOpenProfile('users'); setShowProfileMenu(false); }} badge="Admin" />
            </>
            )}
            
            <div className="h-px bg-slate-100 dark:bg-slate-800 mx-1 my-0.5" />
            <button 
              onClick={() => { onLogout(); setShowProfileMenu(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <LogOut size={15} />
              Sign Out
            </button>
          </div>
          </>
        )}
      </div>
    </aside>
  );
}

// ============================================================================
// Reusable Nav Item Component
// ============================================================================
function NavItem({
  icon: Icon,
  label,
  isActive,
  isExpanded,
  onClick,
  badge,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  isActive: boolean;
  isExpanded: boolean;
  onClick: () => void;
  badge?: string | null;
}) {
  return (
    <button
      onClick={onClick}
      title={!isExpanded ? label : undefined}
      className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon
        size={19}
        className={
          isActive
            ? 'text-indigo-600 dark:text-indigo-400 shrink-0'
            : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 shrink-0 transition-colors'
        }
      />
      <span
        className={`text-sm transition-all duration-200 whitespace-nowrap ${
          isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
        }`}
      >
        {label}
      </span>
      {badge && isExpanded && (
        <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
          {badge}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// Reusable Menu Button Component
// ============================================================================
function MenuButton({
  icon: Icon,
  label,
  onClick,
  badge,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
    >
      <Icon size={15} />
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
          {badge}
        </span>
      )}
    </button>
  );
}
