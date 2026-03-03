'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings, DollarSign, Save, AlertTriangle, Check, RefreshCw,
  Sliders, Target, Clock, Zap, Shield, TrendingUp, Info
} from 'lucide-react';
import { UsageManager, UsageLimits } from '@/lib/usageManager';
import { useAuth } from '@/components/auth/AuthContextRefactored';
import { Toast } from '@/components/ui/Toast';

interface BillingSettingsProps {
  onClose?: () => void;
  className?: string;
}

const DEFAULT_LIMITS: UsageLimits = {
  dailyCostLimit: 20.0,
  monthlyCostLimit: 200.0,
  ambleAiLimit: 10.0,
  cxLimit: 10.0,
  studioLimit: 10.0,
};

const PRESET_PLANS = [
  { name: 'Starter', daily: 5, monthly: 50, color: 'from-slate-500 to-slate-600' },
  { name: 'Professional', daily: 20, monthly: 200, color: 'from-indigo-500 to-purple-500' },
  { name: 'Enterprise', daily: 100, monthly: 1000, color: 'from-amber-500 to-orange-500' },
];

export function BillingSettings({ onClose, className = '' }: BillingSettingsProps) {
  const { user } = useAuth();
  const [limits, setLimits] = useState<UsageLimits>(DEFAULT_LIMITS);
  const [originalLimits, setOriginalLimits] = useState<UsageLimits>(DEFAULT_LIMITS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadLimits = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      const userLimits = await UsageManager.loadLimits(user.id);
      setLimits(userLimits);
      setOriginalLimits(userLimits);
    } catch (error) {
      console.error('Failed to load limits:', error);
      setToast({ message: 'Failed to load settings', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadLimits();
  }, [loadLimits]);

  useEffect(() => {
    const changed = JSON.stringify(limits) !== JSON.stringify(originalLimits);
    setHasChanges(changed);
  }, [limits, originalLimits]);

  const handleSave = async () => {
    if (!user?.id) return;
    
    setIsSaving(true);
    try {
      await UsageManager.saveLimits(limits, user.id);
      setOriginalLimits(limits);
      setHasChanges(false);
      setToast({ message: 'Settings saved successfully!', type: 'success' });
    } catch (error) {
      console.error('Failed to save limits:', error);
      setToast({ message: 'Failed to save settings', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setLimits(originalLimits);
    setHasChanges(false);
  };

  const applyPreset = (preset: typeof PRESET_PLANS[0]) => {
    setLimits((prev: UsageLimits) => ({
      ...prev,
      dailyCostLimit: preset.daily,
      monthlyCostLimit: preset.monthly,
      ambleAiLimit: preset.daily * 0.5,
      studioLimit: preset.daily * 0.3,
      cxLimit: preset.daily * 0.2,
    }));
  };

  const updateLimit = (key: keyof UsageLimits, value: number) => {
    setLimits((prev: UsageLimits) => ({ ...prev, [key]: value }));
  };

  if (!user) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Please sign in to manage billing settings.</p>
      </div>
    );
  }

  return (
    <div className={`glass-card rounded-2xl ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
            <Settings className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Billing & Limits</h2>
            <p className="text-xs text-muted-foreground">Manage your usage limits and budget</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            ✕
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="p-4 space-y-6">
          {/* Quick Presets */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} className="text-amber-400" />
              <h3 className="text-sm font-semibold">Quick Presets</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PRESET_PLANS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(preset)}
                  className={`p-3 rounded-xl border border-white/10 hover:border-white/20 transition-all hover:-translate-y-0.5 group`}
                >
                  <div className={`text-xs font-bold bg-gradient-to-r ${preset.color} bg-clip-text text-transparent`}>
                    {preset.name}
                  </div>
                  <div className="text-lg font-bold mt-1">${preset.daily}</div>
                  <div className="text-[10px] text-muted-foreground">per day</div>
                </button>
              ))}
            </div>
          </div>

          {/* Global Limits */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Target size={14} className="text-indigo-400" />
              <h3 className="text-sm font-semibold">Global Spending Limits</h3>
            </div>

            {/* Daily Limit */}
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-blue-400" />
                  <span className="text-sm font-medium">Daily Limit</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={limits.dailyCostLimit}
                    onChange={(e) => updateLimit('dailyCostLimit', parseFloat(e.target.value) || 0)}
                    className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:border-indigo-500"
                    min={0}
                    step={1}
                  />
                </div>
              </div>
              <input
                type="range"
                value={limits.dailyCostLimit}
                onChange={(e) => updateLimit('dailyCostLimit', parseFloat(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500"
                min={0}
                max={100}
                step={1}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>$0</span>
                <span>$100</span>
              </div>
            </div>

            {/* Monthly Limit */}
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-purple-400" />
                  <span className="text-sm font-medium">Monthly Limit</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={limits.monthlyCostLimit}
                    onChange={(e) => updateLimit('monthlyCostLimit', parseFloat(e.target.value) || 0)}
                    className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:border-purple-500"
                    min={0}
                    step={10}
                  />
                </div>
              </div>
              <input
                type="range"
                value={limits.monthlyCostLimit}
                onChange={(e) => updateLimit('monthlyCostLimit', parseFloat(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-500"
                min={0}
                max={1000}
                step={10}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>$0</span>
                <span>$1,000</span>
              </div>
            </div>
          </div>

          {/* Category Limits */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sliders size={14} className="text-emerald-400" />
              <h3 className="text-sm font-semibold">Category Limits</h3>
              <span className="text-[10px] text-muted-foreground">(per day)</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {/* Amble AI Limit */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                    <Zap size={14} className="text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Amble AI (Chat)</p>
                    <p className="text-[10px] text-muted-foreground">Text generation & chat</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={limits.ambleAiLimit}
                    onChange={(e) => updateLimit('ambleAiLimit', parseFloat(e.target.value) || 0)}
                    className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-indigo-500"
                    min={0}
                    step={1}
                  />
                </div>
              </div>

              {/* Studio Limit */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center">
                    <Shield size={14} className="text-pink-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Amble Studio</p>
                    <p className="text-[10px] text-muted-foreground">Image & video generation</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={limits.studioLimit}
                    onChange={(e) => updateLimit('studioLimit', parseFloat(e.target.value) || 0)}
                    className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-pink-500"
                    min={0}
                    step={1}
                  />
                </div>
              </div>

              {/* CX Limit */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <DollarSign size={14} className="text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Customer Experience</p>
                    <p className="text-[10px] text-muted-foreground">Embedded AI & widgets</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={limits.cxLimit}
                    onChange={(e) => updateLimit('cxLimit', parseFloat(e.target.value) || 0)}
                    className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-emerald-500"
                    min={0}
                    step={1}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-blue-200">
                When any limit is reached, requests will be blocked until the next period. 
                Category limits are enforced within the global daily limit.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4 border-t border-white/10">
            <button
              onClick={handleReset}
              disabled={!hasChanges || isSaving}
              className="flex-1 py-2.5 px-4 rounded-xl border border-white/10 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-medium hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default BillingSettings;
