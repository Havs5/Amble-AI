import React, { useState, useEffect } from 'react';
import { X, Shield, User, LogOut, Users, Plus, Bot, FileText, Trash2, Upload, Sliders, MessageSquare, Zap, BarChart2, DollarSign, Calendar, TrendingUp, AlertTriangle, Settings, Moon, Sun, Palette, Mail, Check, Clock } from 'lucide-react';
import { useAuth } from '../auth/AuthContextRefactored';
import { UsageManager, TokenUsage, UsageLimits } from '../../lib/usageManager';
import { UserCapabilityKey } from '../../lib/capabilities';
import { NEWS_DEPARTMENTS } from '../../types/news';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { auth } from '../../lib/firebase';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  onSave: (name: string) => void;
  initialTab?: 'profile' | 'security' | 'users' | 'amble-config' | 'cx-config' | 'premium' | 'usage';
  
  // Amble AI Props
  amblePrompt: string;
  onSaveAmblePrompt: (prompt: string) => void;
  amblePolicies: string[];
  onSaveAmblePolicies: (policies: string[]) => void;
  ambleConfig?: { temperature: number; maxTokens: number };
  onSaveAmbleConfig?: (config: { temperature: number; maxTokens: number }) => void;
  onSaveAmbleSettings?: (prompt: string, policies: string[], config: { temperature: number; maxTokens: number }) => void;

  // Capabilities Props
  activeCapabilities?: Record<UserCapabilityKey, boolean>;
  onSaveCapabilities?: (capabilities: Record<UserCapabilityKey, boolean>) => void;

  // Customer Experience Props
  cxPrompt: string;
  onSaveCxPrompt: (prompt: string) => void;
  cxPolicies: string[];
  onSaveCxPolicies: (policies: string[]) => void;
  cxConfig?: { temperature: number; maxTokens: number };
  onSaveCxConfig?: (config: { temperature: number; maxTokens: number }) => void;
  onSaveCxSettings?: (prompt: string, policies: string[], config: { temperature: number; maxTokens: number }) => void;
  onOpenUserManagement?: () => void;

  // Appearance (wired to the app-level theme in AmbleApp)
  isDarkMode?: boolean;
  setIsDarkMode?: (dark: boolean) => void;
}

export function ProfileModal({ 
  isOpen, 
  onClose, 
  userName, 
  onSave, 
  initialTab = 'profile',
  amblePrompt,
  onSaveAmblePrompt,
  amblePolicies,
  onSaveAmblePolicies,
  ambleConfig,
  onSaveAmbleConfig,
  onSaveAmbleSettings,
  activeCapabilities,
  onSaveCapabilities,
  cxPrompt,
  onSaveCxPrompt,
  cxPolicies,
  onSaveCxPolicies,
  cxConfig,
  onSaveCxConfig,
  onSaveCxSettings,
  onOpenUserManagement,
  isDarkMode,
  setIsDarkMode,
}: ProfileModalProps) {
  const { user, logout, addUser, users, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'security' | 'users' | 'amble-config' | 'cx-config' | 'premium' | 'usage'>(initialTab);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  // Use user.name directly from auth context, fall back to prop
  const [tempUserName, setTempUserName] = useState(user?.name || userName);
  const [tempEmail, setTempEmail] = useState(user?.email || '');
  const [profileMessage, setProfileMessage] = useState('');
  
  // Usage Stats State
  const [usageStats, setUsageStats] = useState<any>(null);
  const [usageLimits, setUsageLimits] = useState<UsageLimits>({ 
      dailyCostLimit: 5, 
      monthlyCostLimit: 50,
      ambleAiLimit: 10,
      cxLimit: 10,
      studioLimit: 10
  });
  const [isEditingLimits, setIsEditingLimits] = useState(false);

  // Premium Settings State
  const [userCapabilities, setUserCapabilities] = useState<Record<string, boolean>>({});
  const [premiumSettings, setPremiumSettings] = useState({
    enableBrowse: false,
    enableVoice: false,
    enableCode: false,
    enableImage: false,
    dailyBudget: 5,
    imageLimit: 50,
    videoLimit: 10
  });

  // Amble Config State
  const [tempAmblePrompt, setTempAmblePrompt] = useState(amblePrompt);
  const [tempAmblePolicies, setTempAmblePolicies] = useState<string[]>(amblePolicies);
  const [dictationEnabled, setDictationEnabled] = useState(activeCapabilities?.dictation ?? true);
  
  // CX Config State
  const [tempCxPrompt, setTempCxPrompt] = useState(cxPrompt);
  const [tempCxPolicies, setTempCxPolicies] = useState<string[]>(cxPolicies);

  const [newPolicy, setNewPolicy] = useState('');
  const [aiConfigMessage, setAiConfigMessage] = useState('');
  
  // Advanced AI Settings (Shared for now, or could be split)
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [files, setFiles] = useState<File[]>([]);

  // Add User State
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
  const [addUserMessage, setAddUserMessage] = useState('');

  useEffect(() => {
    // Always sync with the current user from auth context
    if (user) {
      setTempUserName(user.name || 'User');
      setTempEmail(user.email);
      if (!selectedUserId) setSelectedUserId(user.id);
    }
    setTempAmblePrompt(amblePrompt);
    setTempAmblePolicies(amblePolicies);
    setTempCxPrompt(cxPrompt);
    setTempCxPolicies(cxPolicies);
    // Sync dictation setting
    setDictationEnabled(activeCapabilities?.dictation ?? true);
  }, [userName, amblePrompt, amblePolicies, cxPrompt, cxPolicies, isOpen, user, activeCapabilities]);

  useEffect(() => {
    if (isOpen) {
      // Safety check: tabs handled elsewhere or removed default to 'profile'.
      // (amble-config / cx-config are now managed in User Management, not here.)
      if (initialTab === 'users' || initialTab === 'premium' || initialTab === 'amble-config' || initialTab === 'cx-config') {
        setActiveTab('profile');
      } else {
        setActiveTab(initialTab);
      }
      setProfileMessage('');
      setAddUserMessage('');
      setAiConfigMessage('');
    }
  }, [isOpen, initialTab]);

  // Sync Advanced Settings when tab changes
  useEffect(() => {
    if (activeTab === 'amble-config' && ambleConfig) {
      setTemperature(ambleConfig.temperature);
      setMaxTokens(ambleConfig.maxTokens);
    } else if (activeTab === 'cx-config' && cxConfig) {
      setTemperature(cxConfig.temperature);
      setMaxTokens(cxConfig.maxTokens);
    }
  }, [activeTab, ambleConfig, cxConfig]);

  // Load Data for Selected User
  useEffect(() => {
    if (!isOpen || !selectedUserId) return;

    const loadData = async () => {
      if (activeTab === 'usage') {
        const limits = await UsageManager.loadLimits(selectedUserId);
        setUsageLimits(limits);
        
        try {
          // Load Usage from Firestore (Source of Truth)
          // UsageManager.getStats() reads from LocalStorage which doesn't reflect backend generation
          const usageRef = collection(db, 'usage_logs');
          const q = query(usageRef, where('userId', '==', selectedUserId));
          const snapshot = await getDocs(q);
          
          const history = snapshot.docs
            .map(doc => {
              const data = doc.data();
              return {
                timestamp: data.timestamp?.toDate?.().getTime() || 0,
                entry: {
                  date: data.timestamp?.toDate?.().toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
                  modelId: data.modelId || 'unknown',
                  inputTokens: data.inputTokens || 0,
                  outputTokens: data.outputTokens || 0,
                  cost: data.cost || 0
                } as TokenUsage
              };
            })
            .sort((a, b) => a.timestamp - b.timestamp) // Sort Oldest first
            .map(item => item.entry);

          // Sync with LocalStorage to ensure client-side limits are enforced based on real data
          UsageManager.setHistory(history, selectedUserId);

          const today = new Date().toISOString().split('T')[0];
          const currentMonth = today.substring(0, 7);

          const daily = history.filter(h => h.date === today);
          const monthly = history.filter(h => h.date.startsWith(currentMonth));

          const sum = (items: TokenUsage[]) => ({
            cost: items.reduce((acc, curr) => acc + curr.cost, 0),
            tokens: items.reduce((acc, curr) => acc + curr.inputTokens + curr.outputTokens, 0)
          });

          setUsageStats({
            today: sum(daily),
            month: sum(monthly),
            history
          });
        } catch (e) {
          console.error("Failed to load usage from Firestore, falling back to local:", e);
          setUsageStats(UsageManager.getStats(selectedUserId));
        }
      }
    };

    loadData();

    if (activeTab === 'premium') {
      const savedCaps = localStorage.getItem(`amble_capabilities_${selectedUserId}`);
      if (savedCaps) {
        try { setUserCapabilities(JSON.parse(savedCaps)); } catch (e) {}
      } else {
        // Default caps if none found
        setUserCapabilities({
            streaming: true,
            realtimeVoice: false,
            webBrowse: false,
            citations: false,
            fileSearch: false,
            codeInterpreter: false,
            imageGen: false,
            jsonSchema: false,
            functionCalling: false,
            vision: false,
            audioIn: false,
            videoIn: false,
            longContext: false
        });
      }
    }
  }, [isOpen, activeTab, selectedUserId]);

  const handleSavePremiumSettings = () => {
    if (!selectedUserId) return;
    
    const currentLimits = UsageManager.getLimits(selectedUserId);
    const newLimits = {
      ...currentLimits,
      dailyCostLimit: premiumSettings.dailyBudget,
      imageLimit: premiumSettings.imageLimit,
      videoLimit: premiumSettings.videoLimit
    };
    
    UsageManager.setLimits(newLimits, selectedUserId);

    const newCapabilities = {
      ...userCapabilities,
      enableBrowse: premiumSettings.enableBrowse,
      enableVoice: premiumSettings.enableVoice,
      enableCode: premiumSettings.enableCode,
      enableImage: premiumSettings.enableImage,
    };

    localStorage.setItem(`amble_capabilities_${selectedUserId}`, JSON.stringify(newCapabilities));
    setUserCapabilities(newCapabilities);
    
    setProfileMessage('Premium settings saved successfully');
    setTimeout(() => setProfileMessage(''), 3000);
  };

  const handleSaveUsageLimits = async () => {
    try {
      await UsageManager.saveLimits(usageLimits, selectedUserId);
      setIsEditingLimits(false);
    } catch (e) {
        console.error("Failed to save usage limits:", e);
    }
  };

  const handleToggleUserCapability = (cap: string) => {
    const newState = { ...userCapabilities, [cap]: !userCapabilities[cap] };
    setUserCapabilities(newState);
    localStorage.setItem(`amble_capabilities_${selectedUserId}`, JSON.stringify(newState));
  };

  const handleSaveAmbleConfig = () => {
    if (onSaveAmbleSettings) {
      onSaveAmbleSettings(tempAmblePrompt, tempAmblePolicies, { temperature, maxTokens });
    } else {
      onSaveAmblePrompt(tempAmblePrompt);
      onSaveAmblePolicies(tempAmblePolicies);
      if (onSaveAmbleConfig) {
          onSaveAmbleConfig({ temperature, maxTokens });
      }
    }
    // Save dictation capability (other dictation settings are managed by admin in User Management)
    if (onSaveCapabilities && activeCapabilities) {
      onSaveCapabilities({ ...activeCapabilities, dictation: dictationEnabled });
    }
    setAiConfigMessage('Amble AI Configuration saved successfully');
  };

  const handleSaveCxConfig = () => {
    if (onSaveCxSettings) {
      onSaveCxSettings(tempCxPrompt, tempCxPolicies, { temperature, maxTokens });
    } else {
      onSaveCxPrompt(tempCxPrompt);
      onSaveCxPolicies(tempCxPolicies);
      if (onSaveCxConfig) {
          onSaveCxConfig({ temperature, maxTokens });
      }
    }
    setAiConfigMessage('Customer Experience Configuration saved successfully');
  };

  const handleAddPolicy = (isCx: boolean) => {
    if (newPolicy.trim()) {
      if (isCx) {
        setTempCxPolicies([...tempCxPolicies, newPolicy.trim()]);
      } else {
        setTempAmblePolicies([...tempAmblePolicies, newPolicy.trim()]);
      }
      setNewPolicy('');
    }
  };

  const removePolicy = (index: number, isCx: boolean) => {
    if (isCx) {
      setTempCxPolicies(tempCxPolicies.filter((_, i) => i !== index));
    } else {
      setTempAmblePolicies(tempAmblePolicies.filter((_, i) => i !== index));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles([...files, ...Array.from(e.target.files)]);
    }
  };

  const handleUpdateProfile = async () => {
    if (!tempUserName || !tempEmail) {
      setProfileMessage('Name and email are required');
      return;
    }
    try {
      const success = await updateProfile(tempUserName, tempEmail);
      if (success) {
        // User object is updated in AuthContext, which will propagate the new name
        if (onSave) onSave(tempUserName); // Optional callback for parent notification
        setProfileMessage('Profile updated successfully');
      } else {
        setProfileMessage('Failed to update profile. Email might be taken.');
      }
    } catch (error) {
      console.error("Profile update error:", error);
      setProfileMessage('An error occurred. Please try logging out and back in.');
    }
  };

  // Real account metadata from Firebase Auth (Google sign-in).
  const fmtMetaDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const signInEmail = auth?.currentUser?.email || user?.email || '';
  const memberSince = fmtMetaDate(auth?.currentUser?.metadata?.creationTime);
  const lastSignIn = fmtMetaDate(auth?.currentUser?.metadata?.lastSignInTime);
  const photoURL = auth?.currentUser?.photoURL || '';
  const userDepartment = (user as any)?.department || '';
  const rolePretty = ((user?.role as string) || 'user').replace(/^superadmin$/, 'IT');

  const [isAddingUser, setIsAddingUser] = useState(false);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword || !newUserName) {
      setAddUserMessage('All fields are required');
      return;
    }
    
    setIsAddingUser(true);
    setAddUserMessage('');
    
    try {
      const success = await addUser(newUserEmail, newUserPassword, newUserName, newUserRole);
      if (success) {
        setAddUserMessage(`✓ User "${newUserName}" created as ${newUserRole}. They can now log in with their credentials.`);
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserName('');
        setNewUserRole('user');
        
        // Clear success message after 5 seconds (more time to read detailed message)
        setTimeout(() => setAddUserMessage(''), 5000);
      } else {
        setAddUserMessage('Failed to add user. Email might already be in use.');
      }
    } catch (error) {
      setAddUserMessage('An error occurred while adding the user.');
    } finally {
      setIsAddingUser(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-background/95 dark:bg-background/90 backdrop-blur-xl w-full max-w-5xl rounded-3xl shadow-2xl border border-border/50 overflow-hidden flex flex-col md:flex-row h-[700px] animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 mx-4 ring-1 ring-white/10">
        
        {/* Sidebar */}
        <div className="w-full md:w-72 bg-muted/30 border-r border-border/50 p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-8 px-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Settings size={18} />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Settings</h2>
          </div>
          
          <nav className="space-y-1.5 flex-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === 'profile' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
            >
              <User size={18} />
              Profile
            </button>
            <button
              onClick={() => setActiveTab('appearance')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === 'appearance' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
            >
              <Palette size={18} />
              Appearance
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === 'security' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
            >
              <Shield size={18} />
              Account &amp; Security
            </button>
            {/* AI / Customer Experience configuration is managed centrally in
                User Management (IT only) — no longer a per-user editor here. */}
            {user?.role === 'admin' && (
              <>
                 <div className="pt-4 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Administration</div>
                <button
                  onClick={onOpenUserManagement}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                >
                  <Users size={18} />
                  Manage Users
                </button>
              </>
            )}
          </nav>

          <button 
            onClick={logout}
            className="mt-auto w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500 dark:text-slate-400"
          >
            <X size={20} />
          </button>

          {activeTab === 'profile' && (
            <div className="space-y-6 w-full max-w-md mx-auto">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Profile</h3>
              {profileMessage && (
                <div className={`p-3 rounded-lg text-sm ${profileMessage.includes('success') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                  {profileMessage}
                </div>
              )}

              {/* Avatar + identity */}
              <div className="flex items-center gap-4">
                {photoURL ? (
                  <img src={photoURL} alt={tempUserName} className="w-16 h-16 rounded-full object-cover ring-2 ring-indigo-500/20" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold">
                    {(tempUserName || 'U').trim().charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">{tempUserName || 'User'}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 capitalize">{rolePretty}</span>
                    {userDepartment && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{NEWS_DEPARTMENTS[userDepartment] || userDepartment}</span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Display Name</label>
                <input
                  type="text"
                  value={tempUserName}
                  onChange={(e) => setTempUserName(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-100"
                  placeholder="Enter your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="email"
                    value={signInEmail}
                    readOnly
                    disabled
                    className="w-full pl-10 pr-4 p-3 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 cursor-not-allowed"
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-400">Managed by your Google account — sign in with Google to change it.</p>
              </div>
              <button
                onClick={handleUpdateProfile}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                Save Changes
              </button>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6 w-full max-w-md mx-auto">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Appearance</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Choose how Amble looks on this device.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Theme</label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { id: 'light', label: 'Light', icon: <Sun size={18} />, active: !isDarkMode, onClick: () => setIsDarkMode?.(false) },
                    { id: 'dark', label: 'Dark', icon: <Moon size={18} />, active: !!isDarkMode, onClick: () => setIsDarkMode?.(true) },
                  ] as const).map((opt) => (
                    <button
                      key={opt.id}
                      onClick={opt.onClick}
                      className={`relative flex flex-col items-start gap-3 p-4 rounded-xl border-2 transition-all ${opt.active ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}
                    >
                      {opt.active && (
                        <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                          <Check size={12} />
                        </span>
                      )}
                      <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${opt.id === 'dark' ? 'bg-slate-900 text-amber-300' : 'bg-amber-100 text-amber-500'}`}>
                        {opt.icon}
                      </span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{opt.label}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-400">Your choice is saved on this browser.</p>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6 w-full max-w-md mx-auto">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Account &amp; Security</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Your sign-in is handled by Google — there's no separate password to manage here.</p>
              </div>

              {/* Sign-in method */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Signed in with Google</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{signInEmail || '—'}</div>
                </div>
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 shrink-0">
                  <Check size={11} /> Active
                </span>
              </div>

              {/* Account details */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Shield size={14} /> Role</span>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100 capitalize">{rolePretty}</span>
                </div>
                {userDepartment && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Users size={14} /> Department</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{NEWS_DEPARTMENTS[userDepartment] || userDepartment}</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Calendar size={14} /> Member since</span>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{memberSince}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Clock size={14} /> Last sign-in</span>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{lastSignIn}</span>
                </div>
              </div>

              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 border border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
