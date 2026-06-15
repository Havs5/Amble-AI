import React, { useState, useEffect } from 'react';
import { X, Search, Shield, Zap, Activity, Edit2, Trash2, UserPlus, XCircle, ArrowLeft, BarChart2, Plus, Bot, FileText, AlertTriangle, DollarSign, Calendar, TrendingUp, Hash, Cpu, Loader2, Mic, RefreshCw, Users, Check } from 'lucide-react';
import { useAuth, AIConfig } from '../auth/AuthContextRefactored';
import { UsageManager, DetailedUsageStats, ModelUsageBreakdown } from '../../lib/usageManager';
import { UsageReport } from '../admin/UsageReport';
import { Toast } from '../ui/Toast';
import { NEWS_DEPARTMENTS } from '../../types/news';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, assignableRoles, can, canManageRole, defaultFeaturePermissions, roleLabel, normalizeRole, type UserRole } from '@/lib/roles';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
}

type DetailTab = 'profile' | 'usage' | 'settings' | 'danger';

// Stable serialization of all editable fields — used to detect unsaved changes.
const serializeEdits = (permissions: any, department: any, role: any, capabilities: any, limits: any, amble: any, cx: any) =>
  JSON.stringify({ permissions, department, role, capabilities, limits, amble, cx });

// ── User-list avatar + last-active helpers ──
const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#3b82f6'];
const initials = (name: string) =>
  (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
const avatarColor = (name: string) => {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const fmtLastActive = (v: any): string | null => {
  if (!v) return null;
  let d: Date;
  if (v?.toDate) d = v.toDate();                       // Firestore Timestamp
  else if (typeof v?.seconds === 'number') d = new Date(v.seconds * 1000);
  else if (typeof v === 'number') d = new Date(v);
  else if (typeof v === 'string') d = new Date(v);
  else return null;
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const DAY = 86400000;
  if (diff < 0) return null;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return d.toLocaleDateString();
};

export function UserManagementModal({ isOpen, onClose, onBack }: UserManagementModalProps) {
  const { users, addUser, user: currentUser, updateUserPermissions, updateUserCapabilities, updateUserConfig, updateUserDepartment, deleteUser, refreshUsers, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'usage'>('users');
  const [detailTab, setDetailTab] = useState<DetailTab>('profile');
  const [originalSnapshot, setOriginalSnapshot] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Add User State
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserDepartment, setNewUserDepartment] = useState('');

  const [newUserRole, setNewUserRole] = useState<UserRole>('staff');
  const [newUserPermissions, setNewUserPermissions] = useState({ accessAmble: true, accessBilling: true, accessPharmacy: false, accessKnowledge: false, accessClock: true });
  const [addUserError, setAddUserError] = useState('');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  // Edit State
  const [editCapabilities, setEditCapabilities] = useState<any>({});
  const [editLimits, setEditLimits] = useState<any>({});
  const [editPermissions, setEditPermissions] = useState({ accessAmble: true, accessBilling: true, accessPharmacy: false, accessKnowledge: false, accessClock: true });
  const [editDepartment, setEditDepartment] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('staff');
  const [userUsageStats, setUserUsageStats] = useState<DetailedUsageStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [statsDateRange, setStatsDateRange] = useState<'last30' | 'last7' | 'thisMonth' | 'all'>('last30');
  
  // AI Config State
  const [editConfigTab, setEditConfigTab] = useState<'amble' | 'cx'>('amble');
  const [editAmbleConfig, setEditAmbleConfig] = useState<AIConfig>({ 
    systemPrompt: 'You are Amble AI, a helpful general assistant.', 
    policies: [], 
    temperature: 0.7, 
    maxTokens: 8192 
  });
  const [editCxConfig, setEditCxConfig] = useState<AIConfig>({ 
    systemPrompt: 'You are an expert billing and dispute specialist assistant.', 
    policies: [], 
    temperature: 0.7, 
    maxTokens: 8192 
  });
  const [newPolicy, setNewPolicy] = useState('');
  const [policyError, setPolicyError] = useState('');
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  // Track original AI configs to avoid overwriting unchanged data
  const [originalAmbleConfig, setOriginalAmbleConfig] = useState<AIConfig | null>(null);
  const [originalCxConfig, setOriginalCxConfig] = useState<AIConfig | null>(null);



  // Filtered Users
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || normalizeRole(user.role) === roleFilter;
    return matchesSearch && matchesRole;
  });

  const loadStats = async (userId: string, range: string) => {
    setIsLoadingStats(true);
    try {
      let start: number | undefined; 
      let end = Date.now();
      const now = Date.now();
      
      if (range === 'last30') start = now - 30 * 24 * 60 * 60 * 1000;
      else if (range === 'last7') start = now - 7 * 24 * 60 * 60 * 1000;
      else if (range === 'thisMonth') {
        const d = new Date(); d.setDate(1); d.setHours(0,0,0,0);
        start = d.getTime();
      }
      // 'all' leaves start undefined

      const stats = await UsageManager.loadDetailedStats(userId, { start, end });
      setUserUsageStats(stats);
    } catch (e) {
      console.error("Error loading stats:", e);
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    // Prefetch usage in the BACKGROUND as soon as a user is selected (result is
    // cached for 2 min), so the Usage tab renders instantly when opened. Range
    // changes recompute from the cached logs (no re-query).
    if (selectedUser?.id) {
      loadStats(selectedUser.id, statsDateRange);
    }
  }, [selectedUser?.id, statsDateRange]);

  const handleEditUser = async (user: any) => {
    // Guard against losing unsaved edits when switching to a different user.
    if (selectedUser && user.id !== selectedUser.id && isDirty &&
        !window.confirm('You have unsaved changes. Discard them and switch users?')) {
      return;
    }
    setStatsDateRange('last30'); // Reset to default
    setDetailTab('profile'); // Always open on the Profile tab
    setSelectedUser(user);
    
    // Load limits from Firestore/UsageManager
    const limits = await UsageManager.loadLimits(user.id);
    setEditLimits(limits);
    
    // Permissions and Configs - include defaults for new fields
    const basePermissions = { accessAmble: true, accessBilling: true, accessPharmacy: false, accessKnowledge: false, accessClock: true };
    setEditPermissions({ ...basePermissions, ...user.permissions });
    setEditDepartment(user.department || '');
    setEditRole(normalizeRole(user.role));

    // Set AI Configs
    const ambleCfg = user.ambleConfig || { 
      systemPrompt: 'You are Amble AI, a helpful general assistant.', 
      policies: [], 
      temperature: 0.7, 
      maxTokens: 8192 
    };
    const cxCfg = user.cxConfig || { 
      systemPrompt: 'You are an expert billing and dispute specialist assistant.', 
      policies: [], 
      temperature: 0.7, 
      maxTokens: 8192 
    };
    setEditAmbleConfig(ambleCfg);
    setEditCxConfig(cxCfg);
    setOriginalAmbleConfig(ambleCfg);
    setOriginalCxConfig(cxCfg);

    // Capabilities - Fetch from Firestore or fallback to local (migration support)
    setEditCapabilities(user.capabilities || {});

    // Snapshot the loaded state so we can detect unsaved changes.
    setOriginalSnapshot(serializeEdits(
      { ...basePermissions, ...user.permissions },
      user.department || '',
      normalizeRole(user.role),
      user.capabilities || {},
      limits,
      ambleCfg,
      cxCfg,
    ));
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;
    
    setIsSavingUser(true);
    try {
      // Save all data without refreshing user list each time
      await UsageManager.saveLimits(editLimits, selectedUser.id);
      await updateUserPermissions(selectedUser.id, editPermissions, true);
      await updateUserDepartment(selectedUser.id, editDepartment, true);
      await updateUserCapabilities(selectedUser.id, editCapabilities, true);

      // Role change — only if it changed and the actor is allowed to manage
      // this user's (current) role. A Manager can only manage Staff.
      if (db && selectedUser.id && editRole !== normalizeRole(selectedUser.role) && canManageRole(currentUser?.role, selectedUser.role)) {
        await updateDoc(doc(db, 'users', selectedUser.id), { role: editRole });
      }

      if (updateUserConfig) {
        // Only save AI configs if they were actually modified
        const ambleChanged = JSON.stringify(editAmbleConfig) !== JSON.stringify(originalAmbleConfig);
        const cxChanged = JSON.stringify(editCxConfig) !== JSON.stringify(originalCxConfig);
        if (ambleChanged) await updateUserConfig(selectedUser.id, 'amble', editAmbleConfig, true);
        if (cxChanged) await updateUserConfig(selectedUser.id, 'cx', editCxConfig, true);
      }

      // Refresh user list once after all saves complete
      await refreshUsers();

      // Mark the form clean so the unsaved-changes guard doesn't fire.
      setOriginalSnapshot(serializeEdits(editPermissions, editDepartment, editRole, editCapabilities, editLimits, editAmbleConfig, editCxConfig));

      setToast({ message: 'User settings saved successfully', type: 'success' });
      
      setTimeout(() => {
        setToast(null);
        setSelectedUser(null);
        setIsSavingUser(false);
      }, 1500);
    } catch (e) {
      setIsSavingUser(false);
      setToast({ message: 'Failed to save settings', type: 'error' });
    }
  };

  const handleAddUser = async () => {
    setAddUserError('');
    if (!newUserName || !newUserEmail) {
      setAddUserError('Please fill in all fields');
      setToast({ message: 'Please fill in all required fields', type: 'error' });
      return;
    }

    setIsCreatingUser(true);
    try {
      const success = await addUser(newUserEmail, '', newUserName, newUserRole, newUserPermissions, undefined, newUserDepartment);
      
      if (success) {
        // Build access summary for toast
        const accessList = [];
        if (newUserPermissions.accessAmble) accessList.push('Amble AI');
        if (newUserPermissions.accessBilling) accessList.push('CX');
        if (newUserPermissions.accessPharmacy) accessList.push('Pharmacies');
        const accessSummary = accessList.length > 0 ? accessList.join(', ') : 'No modules';
        
        setToast({ 
          message: `✓ User "${newUserName}" created as ${newUserRole}. Access: ${accessSummary}. They can now sign in with Google.`, 
          type: 'success' 
        });
        setIsAddingUser(false);
        setNewUserName('');
        setNewUserEmail('');
        setNewUserDepartment('');
        setNewUserRole('staff');
        setNewUserPermissions({ accessAmble: true, accessBilling: true, accessPharmacy: false, accessKnowledge: false, accessClock: true });
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to create user';
      setAddUserError(errorMsg);
      setToast({ message: errorMsg, type: 'error' });
    } finally {
      setIsCreatingUser(false);
    }
  };



  const handleDeleteUser = () => {
    if (!selectedUser) return;
    setShowDeleteConfirmation(true);
  };

  const confirmDeleteUser = async () => {
    if (!selectedUser) return;
    
    try {
      await deleteUser(selectedUser.id);
      setToast({ message: 'User deleted successfully', type: 'success' });
      setSelectedUser(null);
      setShowDeleteConfirmation(false);
    } catch (error: any) {
      setToast({ message: 'Failed to delete user', type: 'error' });
    }
  };

  const handleAddPolicy = () => {
    if (!newPolicy.trim()) return;

    if (editConfigTab === 'amble') {
      if (editAmbleConfig.policies.includes(newPolicy.trim())) {
        setPolicyError('Policy already exists');
        return;
      }
      setEditAmbleConfig(prev => ({
        ...prev,
        policies: [...prev.policies, newPolicy.trim()]
      }));
    } else {
      if (editCxConfig.policies.includes(newPolicy.trim())) {
        setPolicyError('Policy already exists');
        return;
      }
      setEditCxConfig(prev => ({
        ...prev,
        policies: [...prev.policies, newPolicy.trim()]
      }));
    }
    setNewPolicy('');
    setPolicyError('');
  };

  const handleRemovePolicy = (index: number) => {
    if (editConfigTab === 'amble') {
      setEditAmbleConfig(prev => ({
        ...prev,
        policies: prev.policies.filter((_, i) => i !== index)
      }));
    } else {
      setEditCxConfig(prev => ({
        ...prev,
        policies: prev.policies.filter((_, i) => i !== index)
      }));
    }
  };

  // Unsaved-changes detection (current edits vs the snapshot taken on load).
  const currentSnapshot = serializeEdits(editPermissions, editDepartment, editRole, editCapabilities, editLimits, editAmbleConfig, editCxConfig);
  const isDirty = !!selectedUser && !!originalSnapshot && currentSnapshot !== originalSnapshot;
  const attemptClose = () => {
    if (!isDirty || window.confirm('You have unsaved changes. Discard them and close?')) onClose();
  };
  const attemptBack = () => {
    if (!isDirty || window.confirm('You have unsaved changes. Discard them?')) setSelectedUser(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[82vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 mx-4">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-4">
            {onBack && (
              <button 
                onClick={onBack}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500"
                title="Back to Settings"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">User Management</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Manage access, roles, and resource limits across the organization.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 mr-4">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'users' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
            >
              Users
            </button>
            {can(currentUser?.role, 'manageUsers') && (
            <button
              onClick={() => setActiveTab('usage')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'usage' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}
            >
              <BarChart2 size={16} />
              Usage Report
            </button>
            )}
          </div>

          <button
            onClick={attemptClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500"
          >
            <X size={20} />
          </button>
        </div>

        {activeTab === 'usage' ? (
          <div className="flex-1 overflow-y-auto p-5 bg-slate-50 dark:bg-slate-950/50">
            <UsageReport />
          </div>
        ) : (
        <div className="flex flex-1 overflow-hidden min-w-0">
          {/* Sidebar / List View */}
          <div className={`flex flex-col min-w-0 border-r border-slate-200 dark:border-slate-800 w-full lg:w-80 lg:flex-none ${(selectedUser || isAddingUser) ? 'hidden lg:flex' : 'flex'}`}>
            
            {/* Toolbar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Search users..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex gap-2">
                <select 
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as any)}
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="all">All Roles</option>
                  <option value="superadmin">{ROLE_LABELS.superadmin}</option>
                  <option value="manager">{ROLE_LABELS.manager}</option>
                  <option value="staff">{ROLE_LABELS.staff}</option>
                </select>
                {can(currentUser?.role, 'manageUsers') && (
                <button 
                  onClick={() => {
                    setSelectedUser(null);
                    setIsAddingUser(true);
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 ml-auto"
                >
                  <UserPlus size={16} />
                  Add User
                </button>
                )}
              </div>
            </div>

            {/* User List */}
            <div className="flex-1 overflow-y-auto">
              {authLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Loader2 className="animate-spin mb-3" size={28} />
                  <p className="text-sm font-medium">Loading users...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Users size={32} className="mb-3 opacity-50" />
                  {users.length === 0 ? (
                    <>
                      <p className="text-sm font-medium">No users found</p>
                      <p className="text-xs mt-1">Add a user to get started</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium">No matching users</p>
                      <p className="text-xs mt-1">Try adjusting your search or filter</p>
                    </>
                  )}
                </div>
              ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 sticky top-0 backdrop-blur-sm">
                  <tr>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {filteredUsers.map(user => (
                    <tr 
                      key={user.id} 
                      onClick={() => handleEditUser(user)}
                      className={`cursor-pointer transition-colors ${selectedUser?.id === user.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                            style={{ backgroundColor: avatarColor(user.name) }}
                          >
                            {initials(user.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-white truncate">{user.name}</div>
                            <div className="text-xs text-slate-500 truncate">{user.email}</div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {user.department && NEWS_DEPARTMENTS[user.department] && (
                                <span className="text-xs text-blue-500 dark:text-blue-400">{NEWS_DEPARTMENTS[user.department]}</span>
                              )}
                              {fmtLastActive(user.lastLoginAt) && (
                                <span className="text-[11px] text-slate-400">Active {fmtLastActive(user.lastLoginAt)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${normalizeRole(user.role) === 'superadmin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : normalizeRole(user.role) === 'manager' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                          {roleLabel(user.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button className="p-1 text-slate-400 hover:text-indigo-600 transition-colors">
                          <Edit2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>
          </div>

          {/* Detail View */}
          {isAddingUser ? (
            <div className="flex-[2] min-w-0 bg-slate-50 dark:bg-slate-950 p-5 overflow-y-auto">
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Add New User</h3>
                    <p className="text-slate-500 dark:text-slate-400">Create a new account for your organization.</p>
                  </div>
                  <button 
                    onClick={() => setIsAddingUser(false)}
                    className="px-3 py-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-5">
                  {addUserError && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm flex items-center gap-2">
                      <XCircle size={16} />
                      {addUserError}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Full Name</label>
                    <input 
                      type="text" 
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="e.g. John Doe"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email Address</label>
                    <input 
                      type="email" 
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="e.g. john@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Role</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {assignableRoles(currentUser?.role).map((r) => (
                        <label
                          key={r}
                          className={`p-4 rounded-lg border cursor-pointer transition-all ${newUserRole === r ? 'bg-indigo-50 border-indigo-500 dark:bg-indigo-900/20' : 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}
                        >
                          <input
                            type="radio"
                            name="role"
                            value={r}
                            checked={newUserRole === r}
                            onChange={() => { setNewUserRole(r); setNewUserPermissions(defaultFeaturePermissions(r)); }}
                            className="sr-only"
                          />
                          <div className="font-medium text-slate-900 dark:text-white mb-1">{ROLE_LABELS[r]}</div>
                          <div className="text-xs text-slate-500">{ROLE_DESCRIPTIONS[r]}</div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Department</label>
                    <select
                      value={newUserDepartment}
                      onChange={(e) => setNewUserDepartment(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="">Select a department...</option>
                      {Object.entries(NEWS_DEPARTMENTS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Access Control</label>
                    <div className="grid grid-cols-2 gap-4">
                      <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={newUserPermissions.accessAmble}
                          onChange={(e) => setNewUserPermissions({...newUserPermissions, accessAmble: e.target.checked})}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white text-sm">Amble AI</div>
                          <div className="text-xs text-slate-500">Access to AI chat features</div>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={newUserPermissions.accessBilling}
                          onChange={(e) => setNewUserPermissions({...newUserPermissions, accessBilling: e.target.checked})}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white text-sm">Customer Experience</div>
                          <div className="text-xs text-slate-500">Access to billing and cx tools</div>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <input
                          type="checkbox"
                          checked={newUserPermissions.accessPharmacy}
                          onChange={(e) => setNewUserPermissions({...newUserPermissions, accessPharmacy: e.target.checked})}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white text-sm">Pharmacies</div>
                          <div className="text-xs text-slate-500">Access to pharmacy systems (Revive, Align)</div>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={newUserPermissions.accessKnowledge}
                          onChange={(e) => setNewUserPermissions({...newUserPermissions, accessKnowledge: e.target.checked})}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white text-sm">Knowledge Base</div>
                          <div className="text-xs text-slate-500">Access to knowledge base files</div>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <input
                          type="checkbox"
                          checked={newUserPermissions.accessClock}
                          onChange={(e) => setNewUserPermissions({...newUserPermissions, accessClock: e.target.checked})}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white text-sm">Clock In/Out</div>
                          <div className="text-xs text-slate-500">Access to the time clock (punch in/out)</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button 
                      onClick={handleAddUser}
                      disabled={isCreatingUser}
                      className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isCreatingUser ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          Creating User...
                        </>
                      ) : (
                        'Create User'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : selectedUser ? (
            <div className="flex-[2] min-w-0 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5">
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedUser.name}</h3>
                    <p className="text-slate-500 dark:text-slate-400">{selectedUser.email}</p>
                  </div>
                  <button
                    onClick={attemptBack}
                    className="lg:hidden px-3 py-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"
                  >
                    Back
                  </button>
                </div>

                {/* Detail tabs */}
                <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
                  {([
                    { id: 'profile' as DetailTab, label: 'Profile' },
                    { id: 'usage' as DetailTab, label: 'Usage' },
                    { id: 'settings' as DetailTab, label: 'Settings' },
                    ...(can(currentUser?.role, 'manageUsers') ? [{ id: 'danger' as DetailTab, label: 'Danger' }] : []),
                  ]).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setDetailTab(t.id)}
                      className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        detailTab === t.id
                          ? (t.id === 'danger' ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-indigo-600 text-indigo-600 dark:text-indigo-400')
                          : (t.id === 'danger' ? 'border-transparent text-red-400 hover:text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* ── Usage tab ── */}
                {detailTab === 'usage' && (<>
                {/* Usage Stats Section */}
                {isLoadingStats ? (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="animate-spin text-indigo-500 mr-2" size={24} />
                    <span className="text-slate-500">Loading usage statistics...</span>
                  </div>
                </div>
                ) : userUsageStats && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <h4 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <BarChart2 size={20} className="text-indigo-500" />
                      Usage Statistics
                    </h4>
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 text-xs self-start sm:self-auto overflow-x-auto max-w-full">
                      {[
                        { id: 'last30', label: 'Last 30 Days' },
                        { id: 'thisMonth', label: 'This Month' },
                        { id: 'last7', label: '7 Days' },
                        { id: 'all', label: 'All' }
                      ].map(range => (
                        <button
                          key={range.id}
                          onClick={() => setStatsDateRange(range.id as any)}
                          className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-all ${
                            statsDateRange === range.id 
                              ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                          }`}
                        >
                          {range.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Today's Cost</span>
                        <DollarSign size={16} className="text-emerald-500" />
                      </div>
                      <div className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                        ${userUsageStats.today.cost.toFixed(4)}
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${((userUsageStats.today.cost / (editLimits.dailyCostLimit || 5)) * 100) > 90 ? 'bg-red-500' : 'bg-emerald-500'}`} 
                          style={{ width: `${Math.min(100, (userUsageStats.today.cost / (editLimits.dailyCostLimit || 5)) * 100)}%` }} 
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-slate-400">
                        <span>{userUsageStats.today.tokens.toLocaleString()} tokens</span>
                        <span>Limit: ${editLimits.dailyCostLimit || 5}</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                          {statsDateRange === 'last30' ? 'Last 30 Days' : 
                           statsDateRange === 'last7' ? 'Last 7 Days' : 
                           statsDateRange === 'thisMonth' ? 'This Month' : 'All Time'} Cost
                        </span>
                        <Calendar size={16} className="text-blue-500" />
                      </div>
                      <div className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                        ${(userUsageStats.range?.cost || 0).toFixed(4)}
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${(((userUsageStats.range?.cost || 0) / (editLimits.monthlyCostLimit || 50)) * 100) > 90 ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(100, ((userUsageStats.range?.cost || 0) / (editLimits.monthlyCostLimit || 50)) * 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-slate-400">
                        <span>{(userUsageStats.range?.tokens || 0).toLocaleString()} tokens</span>
                        <span>Monthly Limit: ${editLimits.monthlyCostLimit || 50}</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Requests</span>
                        <Hash size={16} className="text-purple-500" />
                      </div>
                      <div className="text-xl font-bold text-slate-900 dark:text-white">
                        {userUsageStats.totalRequests.toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        In selected range
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Avg Cost/Request</span>
                        <TrendingUp size={16} className="text-amber-500" />
                      </div>
                      <div className="text-xl font-bold text-slate-900 dark:text-white">
                        ${userUsageStats.avgCostPerRequest.toFixed(4)}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Based on {userUsageStats.totalRequests} requests
                      </div>
                    </div>
                  </div>

                  {/* Model Breakdown */}
                  {userUsageStats.modelBreakdown.length > 0 && (
                  <div className="mb-6">
                    <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                      <Cpu size={16} className="text-indigo-400" />
                      Cost Breakdown by Model
                    </h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-700">
                            <th className="text-left py-2 px-3 text-slate-500 dark:text-slate-400 font-medium">Model</th>
                            <th className="text-left py-2 px-3 text-slate-500 dark:text-slate-400 font-medium">Category</th>
                            <th className="text-right py-2 px-3 text-slate-500 dark:text-slate-400 font-medium">Requests</th>
                            <th className="text-right py-2 px-3 text-slate-500 dark:text-slate-400 font-medium">Usage</th>
                            <th className="text-right py-2 px-3 text-slate-500 dark:text-slate-400 font-medium">Cost</th>
                            <th className="text-right py-2 px-3 text-slate-500 dark:text-slate-400 font-medium">Rate</th>
                            <th className="text-right py-2 px-3 text-slate-500 dark:text-slate-400 font-medium">Output</th>
                          </tr>
                        </thead>
                        <tbody>
                          {userUsageStats.modelBreakdown.map((model, idx) => {
                            // Get unit label for pricing display
                            const getUnitLabel = (unit?: string) => {
                              switch (unit) {
                                case 'minute': return '/min';
                                case 'second': return '/sec';
                                case 'image': return '/img';
                                case 'character': return '/1M chars';
                                case 'video': return '/video';
                                default: return '/1M';
                              }
                            };
                            const unitLabel = getUnitLabel(model.unit);
                            
                            return (
                          <tr key={model.modelId} className={`${idx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800/30' : ''} hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors`}>
                            <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">{model.displayName}</td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                model.category === 'text' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                                model.category === 'image' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                                model.category === 'video' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                                'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                              }`}>
                                {model.category}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-300">{model.requests.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-300">
                              {model.unit === 'minute' ? `${(model.totalTokens / 60).toFixed(1)} min` : model.totalTokens.toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-right font-medium text-emerald-600 dark:text-emerald-400">${model.cost.toFixed(4)}</td>
                            <td className="py-2 px-3 text-right text-slate-500 dark:text-slate-400 text-xs">${model.inputRate}{unitLabel}</td>
                            <td className="py-2 px-3 text-right text-slate-500 dark:text-slate-400 text-xs">{model.outputRate > 0 ? `$${model.outputRate}${unitLabel}` : '-'}</td>
                          </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-300 dark:border-slate-600 font-semibold">
                            <td className="py-2 px-3 text-slate-900 dark:text-white">Total</td>
                            <td className="py-2 px-3"></td>
                            <td className="py-2 px-3 text-right text-slate-900 dark:text-white">{userUsageStats.totalRequests.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-slate-900 dark:text-white">{(userUsageStats.range?.tokens || 0).toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">${(userUsageStats.range?.cost || 0).toFixed(4)}</td>
                            <td className="py-2 px-3"></td>
                            <td className="py-2 px-3"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                  )}

                  {/* Daily Trend */}
                  {userUsageStats.dailyTrend.length > 0 && (
                  <div>
                    <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                      <TrendingUp size={16} className="text-emerald-400" />
                      Daily Cost Trend
                    </h5>
                    <div className="flex items-end gap-1.5 h-28">
                      {(() => {
                        const maxCost = Math.max(...userUsageStats.dailyTrend.map(d => d.cost), 0.0001);
                        const CHART_PX = 92;
                        return userUsageStats.dailyTrend.map((day) => {
                          // Pixel height (definite) so bars render regardless of parent sizing.
                          const barPx = day.cost > 0 ? Math.max(Math.round((day.cost / maxCost) * CHART_PX), 4) : 0;
                          return (
                            <div key={day.date} className="flex-1 flex flex-col items-center justify-end h-full group">
                              <div className="relative w-full flex flex-1 items-end justify-center">
                                <div
                                  className="w-full max-w-[26px] bg-gradient-to-t from-indigo-500 to-indigo-400 rounded-t group-hover:from-indigo-600 group-hover:to-indigo-500 transition-colors"
                                  style={{ height: `${barPx}px` }}
                                />
                                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                                  ${day.cost.toFixed(4)}
                                </div>
                              </div>
                              <span className="text-[10px] text-slate-400 mt-1">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                  )}
                </div>
                )}
                </>)}

                {/* ── Profile tab ── */}
                {detailTab === 'profile' && (<>
                {/* Department Section */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Shield size={20} className="text-purple-500" />
                    Role
                  </h4>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    disabled={!canManageRole(currentUser?.role, selectedUser.role)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {Array.from(new Set([normalizeRole(selectedUser.role), ...assignableRoles(currentUser?.role)])).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-2">
                    {canManageRole(currentUser?.role, selectedUser.role)
                      ? ROLE_DESCRIPTIONS[editRole]
                      : 'Only IT can change this user’s role.'}
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Users size={20} className="text-blue-500" />
                    Department
                  </h4>
                  <select
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    disabled={!can(currentUser?.role, 'manageUsers')}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="">No department assigned</option>
                    {Object.entries(NEWS_DEPARTMENTS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                {/* Permissions Section */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Shield size={20} className="text-green-500" />
                    Access Permissions
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white text-sm">Amble AI</div>
                        <div className="text-xs text-slate-500">Access to AI chat features</div>
                      </div>
                      <label className={`relative inline-flex items-center ${can(currentUser?.role, 'manageUsers') ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={editPermissions.accessAmble}
                          onChange={(e) => setEditPermissions({...editPermissions, accessAmble: e.target.checked})}
                          disabled={!can(currentUser?.role, 'manageUsers')}
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white text-sm">Customer Experience</div>
                        <div className="text-xs text-slate-500">Access to billing and cx tools</div>
                      </div>
                      <label className={`relative inline-flex items-center ${can(currentUser?.role, 'manageUsers') ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={editPermissions.accessBilling}
                          onChange={(e) => setEditPermissions({...editPermissions, accessBilling: e.target.checked})}
                          disabled={!can(currentUser?.role, 'manageUsers')}
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white text-sm">Pharmacies</div>
                        <div className="text-xs text-slate-500">Access to pharmacy systems (Revive, Align)</div>
                      </div>
                      <label className={`relative inline-flex items-center ${can(currentUser?.role, 'manageUsers') ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={editPermissions.accessPharmacy || false}
                          onChange={(e) => setEditPermissions({...editPermissions, accessPharmacy: e.target.checked})}
                          disabled={!can(currentUser?.role, 'manageUsers')}
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white text-sm">Knowledge Base</div>
                        <div className="text-xs text-slate-500">Access to knowledge base files</div>
                      </div>
                      <label className={`relative inline-flex items-center ${can(currentUser?.role, 'manageUsers') ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={editPermissions.accessKnowledge || false}
                          onChange={(e) => setEditPermissions({...editPermissions, accessKnowledge: e.target.checked})}
                          disabled={!can(currentUser?.role, 'manageUsers')}
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white text-sm">Clock In/Out</div>
                        <div className="text-xs text-slate-500">Access to the time clock (punch in/out)</div>
                      </div>
                      <label className={`relative inline-flex items-center ${can(currentUser?.role, 'manageUsers') ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={editPermissions.accessClock ?? true}
                          onChange={(e) => setEditPermissions({...editPermissions, accessClock: e.target.checked})}
                          disabled={!can(currentUser?.role, 'manageUsers')}
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>
                  </div>
                </div>

                </>)}

                {/* ── Settings tab ── */}
                {detailTab === 'settings' && (<>
                {/* AI Configuration Section - Only accessible to admins */}
                {can(currentUser?.role, 'manageUsers') && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Bot size={20} className="text-purple-500" />
                    AI Configuration
                  </h4>
                  
                  {/* Tabs */}
                  <div className="flex gap-2 mb-6 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg inline-flex">
                    <button
                      onClick={() => setEditConfigTab('amble')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${editConfigTab === 'amble' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
                    >
                      Amble AI
                    </button>
                    <button
                      onClick={() => setEditConfigTab('cx')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${editConfigTab === 'cx' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
                    >
                      Customer Experience
                    </button>
                  </div>

                  <div className="space-y-6">
                    {/* System Prompt */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        System Prompt
                        <span className="ml-2 text-xs font-normal text-slate-500">Instructions for how the AI should behave.</span>
                      </label>
                      <textarea 
                        value={editConfigTab === 'amble' ? editAmbleConfig.systemPrompt : editCxConfig.systemPrompt}
                        onChange={(e) => editConfigTab === 'amble' 
                          ? setEditAmbleConfig({...editAmbleConfig, systemPrompt: e.target.value})
                          : setEditCxConfig({...editCxConfig, systemPrompt: e.target.value})
                        }
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
                          onKeyDown={(e) => e.key === 'Enter' && handleAddPolicy()}
                          className="flex-1 p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-100 text-sm"
                          placeholder="Add a new policy..."
                        />
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            handleAddPolicy();
                          }}
                          className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                        >
                          <Plus size={20} />
                        </button>
                      </div>
                      
                      {policyError && (
                        <div className="text-xs text-red-500 mb-2 flex items-center gap-1">
                          <XCircle size={12} /> {policyError}
                        </div>
                      )}

                      <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                        {(editConfigTab === 'amble' ? editAmbleConfig.policies : editCxConfig.policies).length === 0 ? (
                          <div className="text-center py-4 text-slate-400 text-xs italic">No policies added yet.</div>
                        ) : (
                          (editConfigTab === 'amble' ? editAmbleConfig.policies : editCxConfig.policies).map((policy, index) => (
                            <div key={index} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 group hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors">
                              <FileText size={16} className="text-indigo-500 shrink-0" />
                              <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{policy}</span>
                              <button 
                                onClick={() => handleRemovePolicy(index)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Model Settings */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Temperature ({editConfigTab === 'amble' ? editAmbleConfig.temperature : editCxConfig.temperature})
                        </label>
                        <input 
                          type="range" 
                          min="0" 
                          max="1" 
                          step="0.1"
                          value={editConfigTab === 'amble' ? editAmbleConfig.temperature : editCxConfig.temperature}
                          onChange={(e) => editConfigTab === 'amble' 
                            ? setEditAmbleConfig({...editAmbleConfig, temperature: parseFloat(e.target.value)})
                            : setEditCxConfig({...editCxConfig, temperature: parseFloat(e.target.value)})
                          }
                          className="w-full accent-indigo-600"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Max Tokens ({editConfigTab === 'amble' ? editAmbleConfig.maxTokens : editCxConfig.maxTokens})
                        </label>
                        <input 
                          type="range" 
                          min="128" 
                          max="128000" 
                          step="128"
                          value={editConfigTab === 'amble' ? editAmbleConfig.maxTokens : editCxConfig.maxTokens}
                          onChange={(e) => editConfigTab === 'amble' 
                            ? setEditAmbleConfig({...editAmbleConfig, maxTokens: parseInt(e.target.value)})
                            : setEditCxConfig({...editCxConfig, maxTokens: parseInt(e.target.value)})
                          }
                          className="w-full accent-indigo-600"
                        />
                      </div>
                    </div>

                    {/* Knowledge Base (Placeholder for future implementation) */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Knowledge Base
                        <span className="ml-2 text-xs font-normal text-slate-500">Upload documents for context.</span>
                      </label>
                      <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-5 text-center hover:border-indigo-500 transition-colors cursor-not-allowed relative bg-slate-50/50 dark:bg-slate-800/50 opacity-60">
                         <div className="pointer-events-none">
                            <div className="mx-auto text-slate-400 mb-2 flex justify-center">
                                <Bot size={24} />
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              Knowledge Base management coming soon.
                            </p>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
                )}

                {/* Capabilities Section */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Zap size={20} className="text-amber-500" />
                    Premium Capabilities
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { key: 'webBrowse', label: 'Web Browsing', desc: 'Access real-time internet data' },
                      { key: 'vision', label: 'Vision', desc: 'Analyze uploaded images' },
                      { key: 'codeInterpreter', label: 'Code Interpreter', desc: 'Execute Python code' },
                      { key: 'longContext', label: 'Long Context', desc: 'Process large documents' },
                    ].map((cap) => (
                      <div key={cap.key} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors">
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white text-sm">{cap.label}</div>
                          <div className="text-xs text-slate-500">{cap.desc}</div>
                        </div>
                        <label className={`relative inline-flex items-center ${can(currentUser?.role, 'manageUsers') ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={editCapabilities[cap.key] || false}
                            onChange={(e) => setEditCapabilities({...editCapabilities, [cap.key]: e.target.checked})}
                            disabled={!can(currentUser?.role, 'manageUsers')}
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Voice Dictation Settings Section */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Mic size={20} className="text-indigo-500" />
                    Voice Dictation Settings
                  </h4>
                  
                  {/* Enable AI Dictation Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-800/50 dark:to-slate-900 mb-4">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                        Enable AI Dictation
                        {editCapabilities.aiDictation && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">Active</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">Use OpenAI Whisper for accurate speech-to-text transcription</div>
                    </div>
                    <label className={`relative inline-flex items-center ${can(currentUser?.role, 'manageUsers') ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={editCapabilities.aiDictation || false}
                        onChange={(e) => setEditCapabilities({...editCapabilities, aiDictation: e.target.checked})}
                        disabled={!can(currentUser?.role, 'manageUsers')}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {/* Dictation Mode Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                      Transcription Mode
                      <span className="ml-2 text-xs font-normal text-slate-400">Select quality vs. cost preference</span>
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { id: 'auto', name: 'Auto', desc: 'Browser first, Whisper fallback', badge: 'FREE', badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: '🔄' },
                        { id: 'browser', name: 'Browser', desc: 'Fast, basic accuracy', badge: 'FREE', badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: '🌐' },
                        { id: 'whisper', name: 'Whisper', desc: 'Best accuracy, medical terms', badge: '$0.006/min', badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: '🎯' },
                        { id: 'hybrid', name: 'Hybrid', desc: 'Real-time + Whisper polish', badge: '~$0.006/min', badgeColor: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', icon: '⚡' },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          onClick={() => can(currentUser?.role, 'manageUsers') && setEditCapabilities({...editCapabilities, dictationMode: mode.id})}
                          disabled={!can(currentUser?.role, 'manageUsers')}
                          className={`p-4 rounded-xl border-2 text-left transition-all ${
                            editCapabilities.dictationMode === mode.id 
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-md shadow-indigo-500/10' 
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          } ${!can(currentUser?.role, 'manageUsers') ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-lg">{mode.icon}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${mode.badgeColor}`}>{mode.badge}</span>
                          </div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{mode.name}</div>
                          <p className="text-[11px] text-slate-500 leading-snug">{mode.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Skip Correction Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 mb-4">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                        Skip AI Correction
                        {editCapabilities.skipCorrection && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Faster</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">Skip GPT-5 Mini text polish for faster, cheaper results (Whisper/Hybrid)</div>
                    </div>
                    <label className={`relative inline-flex items-center ${can(currentUser?.role, 'manageUsers') ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={editCapabilities.skipCorrection || false}
                        onChange={(e) => setEditCapabilities({...editCapabilities, skipCorrection: e.target.checked})}
                        disabled={!can(currentUser?.role, 'manageUsers')}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                </div>

                {/* Limits Section */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <Activity size={20} className="text-blue-500" />
                    Usage Limits
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Daily Budget ($)</label>
                      <input 
                        type="number" 
                        value={editLimits.dailyCostLimit || 0}
                        onChange={(e) => setEditLimits({...editLimits, dailyCostLimit: parseFloat(e.target.value)})}
                        disabled={!can(currentUser?.role, 'manageUsers')}
                        className={`w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none ${!can(currentUser?.role, 'manageUsers') ? 'opacity-60 cursor-not-allowed' : ''}`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Monthly Budget ($)</label>
                      <input 
                        type="number" 
                        value={editLimits.monthlyCostLimit || 0}
                        onChange={(e) => setEditLimits({...editLimits, monthlyCostLimit: parseFloat(e.target.value)})}
                        disabled={!can(currentUser?.role, 'manageUsers')}
                        className={`w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none ${!can(currentUser?.role, 'manageUsers') ? 'opacity-60 cursor-not-allowed' : ''}`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Image Limit (Daily)</label>
                      <input 
                        type="number" 
                        value={editLimits.imageLimit || 0}
                        onChange={(e) => setEditLimits({...editLimits, imageLimit: parseInt(e.target.value)})}
                        disabled={!can(currentUser?.role, 'manageUsers')}
                        className={`w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none ${!can(currentUser?.role, 'manageUsers') ? 'opacity-60 cursor-not-allowed' : ''}`}
                      />
                    </div>
                  </div>
                </div>

                </>)}

                {/* ── Danger tab ── */}
                {detailTab === 'danger' && (<>
                {/* Danger Zone */}
                {can(currentUser?.role, 'manageUsers') && (
                <div className="bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30 p-5">
                  <h4 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-4 flex items-center gap-2">
                    <Shield size={20} />
                    Danger Zone
                  </h4>
                  <div className="space-y-4">
                    {/* Delete User */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white text-sm">Delete User</div>
                        <div className="text-xs text-slate-500">Permanently remove this user and all their data.</div>
                      </div>
                      <button 
                        onClick={handleDeleteUser}
                        className="px-3 py-2 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        Delete Account
                      </button>
                    </div>
                  </div>
                </div>
                )}
                </>)}

              </div>
              </div>
              {can(currentUser?.role, 'manageUsers') && (
                <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3 flex items-center justify-end">
                  <button
                    onClick={handleSaveUser}
                    disabled={isSavingUser}
                    className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSavingUser ? (<><Loader2 className="animate-spin" size={16} />Saving...</>) : ('Save Changes')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-[2] min-w-0 hidden lg:flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 dark:bg-slate-950/50">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <Edit2 size={24} className="opacity-50" />
              </div>
              <p>Select a user to view details and manage settings</p>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmation && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 animate-in zoom-in-95 duration-200 mx-4">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle size={32} className="text-red-600 dark:text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Delete User?</h3>
              <p className="text-slate-500 dark:text-slate-400">
                Are you sure you want to permanently delete <span className="font-semibold text-slate-900 dark:text-white">"{selectedUser?.name}"</span>? 
                This action cannot be undone and will remove all associated data.
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirmation(false)}
                className="flex-1 py-2.5 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteUser}
                className="flex-1 py-2.5 px-4 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 shadow-lg shadow-red-500/20 transition-all active:scale-95"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
