import React, { useState, useEffect } from 'react';
import { X, Shield, User, LogOut, Key, Users, Plus, Bot, FileText, Trash2, Upload, Sliders, MessageSquare, Zap, BarChart2, DollarSign, Calendar, TrendingUp, AlertTriangle, Settings } from 'lucide-react';
import { useAuth } from '../auth/AuthContextRefactored';
import { UsageManager, TokenUsage, UsageLimits } from '../../lib/usageManager';
import { UserCapabilityKey } from '../../lib/capabilities';
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
  onOpenUserManagement
}: ProfileModalProps) {
  const { user, logout, resetPassword, addUser, users, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'users' | 'amble-config' | 'cx-config' | 'premium' | 'usage'>(initialTab);
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
    enableStudio: false,
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

  // Password Reset State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

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
      // Safety check: If tab is 'users' or 'premium' (which are now handled elsewhere or hidden), default to 'profile'
      if (initialTab === 'users' || initialTab === 'premium') {
        setActiveTab('profile');
      } else {
        setActiveTab(initialTab);
      }
      setProfileMessage('');
      setPasswordMessage('');
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
      enableStudio: premiumSettings.enableStudio,
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

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMessage('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage('Password must be at least 6 characters');
      return;
    }
    const success = await resetPassword(newPassword);
    if (success) {
      setPasswordMessage('Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPasswordMessage('Failed to update password');
    }
  };

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
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === 'security' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
            >
              <Shield size={18} />
              Security
            </button>
            <div className="pt-4 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Configuration</div>
            <button
              onClick={() => setActiveTab('amble-config')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === 'amble-config' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
            >
              <Bot size={18} />
              Amble AI
            </button>
            <button
              onClick={() => setActiveTab('cx-config')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === 'cx-config' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
            >
              <MessageSquare size={18} />
              Customer Experience
            </button>
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
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Profile Information</h3>
              {profileMessage && (
                <div className={`p-3 rounded-lg text-sm ${profileMessage.includes('success') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                  {profileMessage}
                </div>
              )}
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
                <input 
                  type="email" 
                  value={tempEmail}
                  onChange={(e) => setTempEmail(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-100"
                  placeholder="Enter your email"
                />
              </div>
              <button 
                onClick={handleUpdateProfile}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                Save Changes
              </button>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6 w-full max-w-md mx-auto">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Change Password</h3>
              <form onSubmit={handlePasswordReset} className="space-y-4">
                {passwordMessage && (
                  <div className={`p-3 rounded-lg text-sm ${passwordMessage.includes('success') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {passwordMessage}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">New Password</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="password" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-100"
                      placeholder="New password"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Confirm Password</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="password" 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-100"
                      placeholder="Confirm new password"
                    />
                  </div>
                </div>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium">
                  Update Password
                </button>
              </form>
            </div>
          )}

          {(activeTab === 'amble-config' || activeTab === 'cx-config') && (
            <div className="space-y-8">
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  {activeTab === 'amble-config' ? 'Amble AI Configuration' : 'Customer Experience Configuration'}
                </h3>
                {aiConfigMessage && (
                  <div className="p-3 rounded-lg text-sm bg-green-50 text-green-600">
                    {aiConfigMessage}
                  </div>
                )}
                
                {/* System Prompt */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    System Prompt
                    <span className="ml-2 text-xs font-normal text-slate-500">Instructions for how the AI should behave.</span>
                  </label>
                  <textarea 
                    value={activeTab === 'amble-config' ? tempAmblePrompt : tempCxPrompt}
                    onChange={(e) => activeTab === 'amble-config' ? setTempAmblePrompt(e.target.value) : setTempCxPrompt(e.target.value)}
                    className="w-full h-32 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-100 text-sm resize-none"
                    placeholder="You are a helpful assistant..."
                  />
                </div>

                {/* Policies */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Policies & Guidelines
                    <span className="ml-2 text-xs font-normal text-slate-500">Rules the AI must follow.</span>
                  </label>
                  
                  <div className="flex gap-2 mb-3">
                    <input 
                      type="text" 
                      value={newPolicy}
                      onChange={(e) => setNewPolicy(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddPolicy(activeTab === 'cx-config')}
                      className="flex-1 p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-100 text-sm"
                      placeholder="Add a new policy (e.g., 'Always verify CPT codes')"
                    />
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        handleAddPolicy(activeTab === 'cx-config');
                      }}
                      className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                      <Plus size={20} />
                    </button>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {(activeTab === 'amble-config' ? tempAmblePolicies : tempCxPolicies).length === 0 ? (
                      <p className="text-sm text-slate-400 italic text-center py-4">No policies added yet.</p>
                    ) : (
                      (activeTab === 'amble-config' ? tempAmblePolicies : tempCxPolicies).map((policy, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 group">
                          <div className="flex items-center gap-3">
                            <FileText size={16} className="text-indigo-500" />
                            <span className="text-sm text-slate-700 dark:text-slate-300">{policy}</span>
                          </div>
                          <button 
                            onClick={() => removePolicy(idx, activeTab === 'cx-config')}
                            className="text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* File Upload - Additional Documents */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Knowledge Base
                    <span className="ml-2 text-xs font-normal text-slate-500">Upload additional documents (auto-syncs from Google Drive on login).</span>
                  </label>
                  <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center hover:border-indigo-500 transition-colors cursor-pointer relative bg-slate-50/50 dark:bg-slate-800/50">
                    <input 
                      type="file" 
                      multiple 
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Upload className="mx-auto text-slate-400 mb-2" size={24} />
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Additional files: <span className="text-indigo-600 font-medium">browse</span>
                    </p>
                  </div>
                  {files.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {files.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm border border-slate-100 dark:border-slate-700">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <FileText size={14} className="text-slate-400 flex-shrink-0" />
                            <span className="truncate text-slate-700 dark:text-slate-300">{file.name}</span>
                          </div>
                          <button onClick={() => setFiles(files.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500 transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Advanced Settings */}
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-4 border border-slate-100 dark:border-slate-800">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sliders size={16} className="text-indigo-500" />
                    Advanced Settings
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                          Temperature
                          <span className="text-[10px] text-slate-400 font-normal">(Creativity)</span>
                        </label>
                        <span className="text-xs text-slate-500 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">{temperature}</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.1" 
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-full accent-indigo-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        title="Higher values make output more random/creative, lower values make it more focused/deterministic."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Max Tokens</label>
                      <input 
                        type="number" 
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                        className="w-full p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        step={128}
                        min={128}
                        max={128000}
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Controls response length. High values allow full tables/reports.</p>
                    </div>
                  </div>

                  {/* Voice Dictation Status - Read-only display of admin settings */}
                  {activeTab === 'amble-config' && (
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500">
                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                            <line x1="12" x2="12" y1="19" y2="22"/>
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">Voice Dictation</p>
                          <p className="text-[10px] text-slate-500">Managed by your administrator</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                          <span className="text-slate-500">Status:</span>
                          <span className={`ml-2 font-medium ${user?.capabilities?.aiDictation ? 'text-green-600 dark:text-green-400' : 'text-slate-400'}`}>
                            {user?.capabilities?.aiDictation ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                          <span className="text-slate-500">Mode:</span>
                          <span className="ml-2 font-medium text-slate-900 dark:text-white capitalize">
                            {user?.capabilities?.dictationMode || 'Auto'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                  <button 
                    onClick={activeTab === 'amble-config' ? handleSaveAmbleConfig : handleSaveCxConfig}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-lg shadow-indigo-500/20"
                  >
                    Save {activeTab === 'amble-config' ? 'Amble' : 'CX'} Configuration
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
