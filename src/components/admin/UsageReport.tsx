import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Area, AreaChart
} from 'recharts';
import { 
  DollarSign, Users, Activity, Trash2, Download, 
  RefreshCw, TrendingUp, Cpu, Calendar, Clock, Mic, 
  MessageSquare, Image, Video, Search, AlertTriangle
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, getDocs, orderBy, where, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { UsageManager } from '../../lib/usageManager';
import { Toast } from '../ui/Toast';

interface UsageLog {
  userId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: number;
  date: string;
}

interface UserUsage {
  userId: string;
  displayName: string;
  email?: string;
  totalCost: number;
  totalRequests: number;
  totalTokens: number;
  lastActive: number;
  modelBreakdown: Record<string, { cost: number; requests: number; tokens: number }>;
}

interface ModelStats {
  modelId: string;
  displayName: string;
  category: 'text' | 'image' | 'video' | 'audio';
  totalCost: number;
  totalRequests: number;
  totalTokens: number;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'];

const CATEGORY_COLORS: Record<string, string> = {
  text: '#6366f1',
  image: '#ec4899',
  video: '#f97316',
  audio: '#22c55e',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  text: <MessageSquare size={14} />,
  image: <Image size={14} />,
  video: <Video size={14} />,
  audio: <Mic size={14} />,
};

// Helper function
function getModelCategory(modelId: string): 'text' | 'image' | 'video' | 'audio' {
  if (modelId.includes('dall-e') || modelId.includes('imagen')) return 'image';
  if (modelId.includes('veo') || modelId.includes('sora')) return 'video';
  if (modelId.includes('whisper') || modelId.includes('tts')) return 'audio';
  return 'text';
}

export function UsageReport() {
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [userStats, setUserStats] = useState<UserUsage[]>([]);
  const [modelStats, setModelStats] = useState<ModelStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'all'>('month');
  const [isCleaning, setIsCleaning] = useState(false);
  const [isCleaningAll, setIsCleaningAll] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [userNamesCache, setUserNamesCache] = useState<Record<string, { name: string; email?: string }>>({});
  const [showResetModal, setShowResetModal] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  // Fetch user display names from Firestore - enhanced to check users_by_uid mapping
  const fetchUserNames = async (userIds: string[]) => {
    const namesMap: Record<string, { name: string; email?: string; mappedFrom?: string }> = { ...userNamesCache };
    const uncachedIds = userIds.filter(id => !namesMap[id]);
    
    for (const userId of uncachedIds) {
      try {
        // First check if userId is directly in users collection
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const data = userDoc.data();
          namesMap[userId] = { 
            name: data.name || data.displayName || data.email?.split('@')[0] || 'Unknown User',
            email: data.email
          };
        } else {
          // Check if this is a Firebase Auth UID that maps to a user
          const uidDoc = await getDoc(doc(db, 'users_by_uid', userId));
          if (uidDoc.exists()) {
            const mappedUserId = uidDoc.data()?.userId;
            if (mappedUserId) {
              const mappedUserDoc = await getDoc(doc(db, 'users', mappedUserId));
              if (mappedUserDoc.exists()) {
                const data = mappedUserDoc.data();
                namesMap[userId] = { 
                  name: data.name || data.displayName || data.email?.split('@')[0] || 'Unknown User',
                  email: data.email,
                  mappedFrom: mappedUserId
                };
              } else {
                namesMap[userId] = { name: userId.length > 20 ? userId.slice(0, 20) + '...' : userId };
              }
            }
          } else {
            // This is an orphaned user ID - no user document found
            namesMap[userId] = { name: userId.length > 20 ? userId.slice(0, 20) + '...' : userId };
          }
        }
      } catch {
        namesMap[userId] = { name: userId.length > 20 ? userId.slice(0, 20) + '...' : userId };
      }
    }
    
    setUserNamesCache(namesMap);
    return namesMap;
  };

  const fetchUsage = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    
    try {
      const usageRef = collection(db, 'usage_logs');
      const q = query(usageRef, orderBy('timestamp', 'desc'));
      
      // Apply time filter
      const now = Date.now();
      let startTime = 0;
      if (timeRange === 'day') startTime = now - 24 * 60 * 60 * 1000;
      else if (timeRange === 'week') startTime = now - 7 * 24 * 60 * 60 * 1000;
      else if (timeRange === 'month') startTime = now - 30 * 24 * 60 * 60 * 1000;

      let snapshot = await getDocs(q);

      if (snapshot.empty) {
        snapshot = await getDocs(collection(db, 'usage_logs'));
      }
      
      const fetchedLogs: UsageLog[] = [];
      const statsMap = new Map<string, UserUsage>();
      const modelMap = new Map<string, ModelStats>();

      snapshot.forEach(doc => {
        const data = doc.data() as UsageLog;
        if (!data || !data.userId) return;
        
        // Skip invalid/anonymous user entries (empty string, 'anonymous', 'undefined', etc.)
        const uid = data.userId.trim().toLowerCase();
        if (!uid || uid === 'anonymous' || uid === 'undefined' || uid === 'null' || uid.length < 10) return;
        
        // Time filter
        if (startTime > 0 && data.timestamp < startTime) return;

        // Calculate cost from tokens if not stored, using UsageManager
        const inputTokens = Number(data.inputTokens) || 0;
        const outputTokens = Number(data.outputTokens) || 0;
        const modelId = data.modelId || 'unknown';
        
        // Use stored cost if available, otherwise recalculate from tokens
        const isImage = modelId.includes('dall-e') || modelId.includes('imagen');
        const isVideo = modelId.includes('veo') || modelId.includes('sora');
        const calculatedCost = Number(data.cost) || UsageManager.calculateCost(modelId, inputTokens, outputTokens, isImage, isVideo);
        
        // Create log entry with calculated cost
        const logEntry: UsageLog = {
          ...data,
          cost: calculatedCost,
          inputTokens,
          outputTokens
        };
        
        fetchedLogs.push(logEntry);

        // User stats - use calculated cost
        const current: UserUsage = statsMap.get(data.userId) || { 
          userId: data.userId,
          displayName: data.userId,
          email: undefined,
          totalCost: 0, 
          totalRequests: 0, 
          totalTokens: 0,
          lastActive: 0,
          modelBreakdown: {} as Record<string, { cost: number; requests: number; tokens: number }>
        };

        current.totalCost += calculatedCost;
        current.totalTokens += inputTokens + outputTokens;
        current.totalRequests += 1;
        current.lastActive = Math.max(current.lastActive || 0, data.timestamp || 0);
        
        // Model breakdown per user
        if (!current.modelBreakdown[modelId]) {
          current.modelBreakdown[modelId] = { cost: 0, requests: 0, tokens: 0 };
        }
        current.modelBreakdown[modelId].cost += calculatedCost;
        current.modelBreakdown[modelId].requests += 1;
        current.modelBreakdown[modelId].tokens += inputTokens + outputTokens;
        
        statsMap.set(data.userId, current);

        // Model stats aggregation - use calculated cost
        const modelCurrent = modelMap.get(modelId) || {
          modelId,
          displayName: UsageManager.getModelDisplayName(modelId),
          category: getModelCategory(modelId),
          totalCost: 0,
          totalRequests: 0,
          totalTokens: 0,
        };
        modelCurrent.totalCost += calculatedCost;
        modelCurrent.totalRequests += 1;
        modelCurrent.totalTokens += inputTokens + outputTokens;
        modelMap.set(modelId, modelCurrent);
      });

      // Fetch user display names
      const userIds = Array.from(statsMap.keys());
      const namesMap = await fetchUserNames(userIds);
      
      // Enhance user stats with display names
      const enhancedUserStats = Array.from(statsMap.values()).map(stat => ({
        ...stat,
        displayName: namesMap[stat.userId]?.name || stat.userId,
        email: namesMap[stat.userId]?.email
      }));

      setLogs(fetchedLogs);
      setUserStats(enhancedUserStats.sort((a, b) => b.totalCost - a.totalCost));
      setModelStats(Array.from(modelMap.values()).sort((a, b) => b.totalCost - a.totalCost));
    } catch (error) {
      console.error("Error fetching usage logs:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, [timeRange]);

  const handleClearTestData = async () => {
    if (!confirm('Are you sure you want to delete all data for "debug_test_user"?')) return;
    setIsCleaning(true);
    try {
      const usageRef = collection(db, 'usage_logs');
      const q = query(usageRef, where('userId', '==', 'debug_test_user'));
      const snapshot = await getDocs(q);
      
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      await fetchUsage();
      setToast({ message: 'Test data cleared successfully.', type: 'success' });
    } catch (e) {
      console.error("Failed to clear data:", e);
      setToast({ message: 'Failed to clear data. See console.', type: 'error' });
    } finally {
      setIsCleaning(false);
    }
  };

  const executeReset = async () => {
    setIsCleaningAll(true);
    setShowResetModal(false); // Close modal immediately
    try {
      const usageRef = collection(db, 'usage_logs');
      const snapshot = await getDocs(usageRef);
      
      // Delete in batches to avoid timeout
      const batchSize = 100;
      const docs = snapshot.docs;
      
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = docs.slice(i, i + batchSize);
        await Promise.all(batch.map(doc => deleteDoc(doc.ref)));
      }
      
      // Clear local state
      setLogs([]);
      setUserStats([]);
      setModelStats([]);
      setUserNamesCache({});
      
      setToast({ message: `Successfully deleted ${docs.length} usage logs. Starting fresh!`, type: 'success' });
    } catch (e) {
      console.error("Failed to clear all data:", e);
      setToast({ message: 'Failed to clear data. See console.', type: 'error' });
    } finally {
      setIsCleaningAll(false);
    }
  };

  // Filter data based on selections
  const filteredUserStats = useMemo(() => {
    return userStats.filter(user => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        user.displayName.toLowerCase().includes(searchLower) || 
        user.userId.toLowerCase().includes(searchLower) ||
        (user.email && user.email.toLowerCase().includes(searchLower));
      return matchesSearch;
    });
  }, [userStats, searchTerm]);

  // Filtered model stats - recalculate from logs to respect both user and category filters
  const filteredModelStats = useMemo(() => {
    const modelMap = new Map<string, ModelStats>();
    
    logs.forEach(log => {
      // Filter by selected user
      if (selectedUser !== 'all' && log.userId !== selectedUser) return;
      
      const modelId = log.modelId || 'unknown';
      const category = getModelCategory(modelId);
      
      // Filter by selected category
      if (selectedCategory !== 'all' && category !== selectedCategory) return;
      
      const current = modelMap.get(modelId) || {
        modelId,
        displayName: UsageManager.getModelDisplayName(modelId),
        category,
        totalCost: 0,
        totalRequests: 0,
        totalTokens: 0,
      };
      current.totalCost += Number(log.cost) || 0;
      current.totalRequests += 1;
      current.totalTokens += (Number(log.inputTokens) || 0) + (Number(log.outputTokens) || 0);
      modelMap.set(modelId, current);
    });
    
    return Array.from(modelMap.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [logs, selectedUser, selectedCategory]);

  // Calculate totals - respect both user filter and category filter
  const totals = useMemo(() => {
    let filteredLogs = logs;
    
    // Filter by user
    if (selectedUser !== 'all') {
      filteredLogs = filteredLogs.filter(log => log.userId === selectedUser);
    }
    
    // Filter by category
    if (selectedCategory !== 'all') {
      filteredLogs = filteredLogs.filter(log => getModelCategory(log.modelId || 'unknown') === selectedCategory);
    }
    
    const uniqueUsers = new Set(filteredLogs.map(log => log.userId));
    
    return {
      cost: filteredLogs.reduce((acc, log) => acc + (Number(log.cost) || 0), 0),
      requests: filteredLogs.length,
      tokens: filteredLogs.reduce((acc, log) => acc + (Number(log.inputTokens) || 0) + (Number(log.outputTokens) || 0), 0),
      users: uniqueUsers.size,
    };
  }, [logs, selectedUser, selectedCategory]);

  // Prepare chart data - respect both filters
  const dailyTrendData = useMemo(() => {
    const dailyMap = new Map<string, { date: string; cost: number; requests: number }>();
    
    logs.forEach(log => {
      // Filter by selected user
      if (selectedUser !== 'all' && log.userId !== selectedUser) return;
      
      // Filter by selected category
      const category = getModelCategory(log.modelId || 'unknown');
      if (selectedCategory !== 'all' && category !== selectedCategory) return;
      
      const date = log.date || new Date(log.timestamp).toISOString().split('T')[0];
      const current = dailyMap.get(date) || { date, cost: 0, requests: 0 };
      current.cost += log.cost || 0;
      current.requests += 1;
      dailyMap.set(date, current);
    });

    return Array.from(dailyMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14); // Last 14 days
  }, [logs, selectedUser, selectedCategory]);

  // Category breakdown - respect user filter
  const categoryData = useMemo(() => {
    const catMap = new Map<string, { category: string; cost: number; requests: number }>();
    
    logs.forEach(log => {
      // Filter by selected user
      if (selectedUser !== 'all' && log.userId !== selectedUser) return;
      
      const category = getModelCategory(log.modelId || 'unknown');
      
      // Filter by selected category (if specific category selected, only show that one)
      if (selectedCategory !== 'all' && category !== selectedCategory) return;
      
      const current = catMap.get(category) || { category, cost: 0, requests: 0 };
      current.cost += Number(log.cost) || 0;
      current.requests += 1;
      catMap.set(category, current);
    });

    return Array.from(catMap.values());
  }, [logs, selectedUser, selectedCategory]);

  const exportData = () => {
    const csv = [
      ['User ID', 'Total Cost', 'Total Requests', 'Total Tokens', 'Last Active'].join(','),
      ...filteredUserStats.map(s => [
        s.userId,
        s.totalCost.toFixed(6),
        s.totalRequests,
        s.totalTokens,
        new Date(s.lastActive).toISOString()
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="animate-spin text-indigo-500 mr-3" size={24} />
        <span className="text-slate-500">Loading usage data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Time Range */}
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-slate-400" />
            <select 
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
            >
              <option value="day">Last 24 Hours</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>

          {/* User Filter */}
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-slate-400" />
            <select 
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 max-w-[160px]"
            >
              <option value="all">All Users ({userStats.length})</option>
              {userStats.map(user => (
                <option key={user.userId} value={user.userId}>
                  {user.displayName} {user.email ? `(${user.email})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <Cpu size={14} className="text-slate-400" />
            <select 
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
            >
              <option value="all">All Categories</option>
              <option value="text">Text Models</option>
              <option value="image">Image Models</option>
              <option value="video">Video Models</option>
              <option value="audio">Audio (Whisper/TTS)</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative flex-shrink min-w-[120px] max-w-[180px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
            />
          </div>

          {/* Actions - push to the right */}
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              onClick={() => fetchUsage(true)}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={exportData}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
            >
              <Download size={14} />
              Export
            </button>
            <button
              onClick={() => setShowResetModal(true)}
              disabled={isCleaningAll}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              title="Delete all usage data and start fresh"
            >
              <AlertTriangle size={14} />
              {isCleaningAll ? 'Clearing...' : 'Reset All'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Spend</h3>
            <div className="p-1.5 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-lg">
              <DollarSign size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none">${totals.cost.toFixed(4)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{timeRange === 'all' ? 'All time' : `Last ${timeRange === 'day' ? '24h' : timeRange === 'week' ? '7 days' : '30 days'}`}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Requests</h3>
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg">
              <Activity size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none">{totals.requests.toLocaleString()}</p>
          <p className="text-[10px] text-slate-500 mt-1">API calls made</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Users</h3>
            <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 rounded-lg">
              <Users size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none">{totals.users}</p>
          <p className="text-[10px] text-slate-500 mt-1">With usage history</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400">Avg Cost/Req</h3>
            <div className="p-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-lg">
              <TrendingUp size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none">
            ${totals.requests > 0 ? (totals.cost / totals.requests).toFixed(6) : '0.00'}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Per API call</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Trend Chart */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-indigo-500" />
            Cost Trend
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrendData}>
                <defs>
                  <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis 
                  dataKey="date" 
                  tick={{fill: '#64748b', fontSize: 11}} 
                  tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis tick={{fill: '#64748b', fontSize: 11}} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: 'none', borderRadius: '8px', color: '#fff' }}
                  formatter={(value) => [`$${(value as number || 0).toFixed(4)}`, 'Cost']}
                  labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                />
                <Area type="monotone" dataKey="cost" stroke="#6366f1" strokeWidth={2} fill="url(#colorCost)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Distribution Pie Chart */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <Cpu size={20} className="text-purple-500" />
            Cost by Category
          </h3>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="60%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="cost"
                  nameKey="category"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category] || COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: 'none', borderRadius: '8px', color: '#fff' }}
                  formatter={(value) => [`$${(value as number || 0).toFixed(4)}`, 'Cost']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {categoryData.map((cat) => (
                <div key={cat.category} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: CATEGORY_COLORS[cat.category] }}
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-300 capitalize flex items-center gap-1">
                    {CATEGORY_ICONS[cat.category]}
                    {cat.category}
                  </span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white ml-auto">
                    ${cat.cost.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Models Breakdown */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
            <Cpu size={20} className="text-indigo-500" />
            Model Usage Breakdown
          </h3>
          <p className="text-sm text-slate-500 mt-1">Detailed cost and usage per AI model including Whisper, TTS, and all text/image/video models</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4 text-left font-medium">Model</th>
                <th className="px-6 py-4 text-left font-medium">Category</th>
                <th className="px-6 py-4 text-right font-medium">Requests</th>
                <th className="px-6 py-4 text-right font-medium">Tokens/Units</th>
                <th className="px-6 py-4 text-right font-medium">Cost</th>
                <th className="px-6 py-4 text-right font-medium">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredModelStats.map((model) => {
                const percentage = totals.cost > 0 ? (model.totalCost / totals.cost) * 100 : 0;
                // Format usage based on category
                const formatUsage = () => {
                  if (model.category === 'audio') {
                    // For audio (whisper), totalTokens stores duration in seconds
                    const minutes = model.totalTokens / 60;
                    return `${minutes.toFixed(1)} min`;
                  } else if (model.category === 'image') {
                    return `${model.totalRequests} images`;
                  } else if (model.category === 'video') {
                    return `${model.totalTokens} sec`;
                  }
                  return model.totalTokens.toLocaleString();
                };
                
                return (
                  <tr key={model.modelId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 dark:text-white">{model.displayName}</div>
                      <div className="text-xs text-slate-400">{model.modelId}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        model.category === 'text' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' :
                        model.category === 'image' ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300' :
                        model.category === 'video' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' :
                        'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                      }`}>
                        {CATEGORY_ICONS[model.category]}
                        {model.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-300">
                      {model.totalRequests.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-300">
                      {formatUsage()}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      ${model.totalCost.toFixed(4)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                          <div 
                            className="h-2 rounded-full bg-indigo-500" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-slate-500 w-12 text-right">{percentage.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredModelStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No model usage data found for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
            {/* Total Footer Row */}
            {filteredModelStats.length > 0 && (
              <tfoot className="bg-slate-100 dark:bg-slate-900 border-t-2 border-slate-300 dark:border-slate-600">
                <tr className="font-semibold">
                  <td className="px-6 py-4 text-slate-900 dark:text-white">Total</td>
                  <td className="px-6 py-4"></td>
                  <td className="px-6 py-4 text-right text-slate-700 dark:text-slate-200">
                    {filteredModelStats.reduce((acc, m) => acc + m.totalRequests, 0).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-700 dark:text-slate-200">
                    {filteredModelStats.reduce((acc, m) => acc + m.totalTokens, 0).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                    ${filteredModelStats.reduce((acc, m) => acc + m.totalCost, 0).toFixed(4)}
                  </td>
                  <td className="px-6 py-4 text-right text-slate-500">100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* User Spending Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <Users size={20} className="text-purple-500" />
              User Spending Details
            </h3>
            <p className="text-sm text-slate-500 mt-1">Per-user cost breakdown with model usage</p>
          </div>
          {userStats.some(u => u.userId === 'debug_test_user') && (
            <button 
              onClick={handleClearTestData}
              disabled={isCleaning}
              className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-3 py-2 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex items-center gap-2"
            >
              <Trash2 size={14} />
              {isCleaning ? 'Cleaning...' : 'Clear Test Data'}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4 text-left font-medium">User</th>
                <th className="px-6 py-4 text-right font-medium">Requests</th>
                <th className="px-6 py-4 text-right font-medium">Total Tokens</th>
                <th className="px-6 py-4 text-left font-medium">Top Models</th>
                <th className="px-6 py-4 text-right font-medium">Last Active</th>
                <th className="px-6 py-4 text-right font-medium">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredUserStats.map((stat) => {
                const topModels = Object.entries(stat.modelBreakdown)
                  .sort((a, b) => b[1].cost - a[1].cost)
                  .slice(0, 3);
                
                return (
                  <tr key={stat.userId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 dark:text-white">{stat.displayName}</div>
                      {stat.email && <div className="text-xs text-slate-400">{stat.email}</div>}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-300">
                      {stat.totalRequests.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-300">
                      {stat.totalTokens.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {topModels.map(([modelId, data]) => (
                          <span 
                            key={modelId}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                            title={`${data.requests} requests, $${data.cost.toFixed(4)}`}
                          >
                            {UsageManager.getModelDisplayName(modelId)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-slate-500">
                      <div className="flex items-center justify-end gap-1">
                        <Clock size={14} />
                        {new Date(stat.lastActive).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">
                      ${stat.totalCost.toFixed(4)}
                    </td>
                  </tr>
                );
              })}
              {filteredUserStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No usage data found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Cost Bar Chart */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-6 flex items-center gap-2">
          <DollarSign size={20} className="text-green-500" />
          Cost per User
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filteredUserStats.slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={true} vertical={false} />
              <XAxis type="number" tick={{fill: '#64748b', fontSize: 11}} tickFormatter={(v) => `$${v.toFixed(2)}`} />
              <YAxis 
                type="category" 
                dataKey="displayName" 
                tick={{fill: '#64748b', fontSize: 11}} 
                width={150}
                tickFormatter={(v) => v.length > 20 ? v.slice(0, 20) + '...' : v}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: 'none', borderRadius: '8px', color: '#fff' }}
                formatter={(value) => [`$${(value as number || 0).toFixed(4)}`, 'Total Cost']}
                labelFormatter={(label) => label}
              />
              <Bar dataKey="totalCost" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-4 mb-4 text-red-600 dark:text-red-400">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold">Deleted All Data?</h3>
            </div>
            
            <p className="text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
              This will permanently delete <span className="font-bold text-slate-900 dark:text-white">ALL usage history</span>, 
              spending records, and model analytics. This action cannot be undone.
            </p>
            
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeReset}
                disabled={isCleaningAll}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-lg hover:shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isCleaningAll ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Yes, Delete Everything
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
