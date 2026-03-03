'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronDown, Check, Sparkles, Zap, BrainCircuit, 
  Cpu, Globe, Crown, Star, TrendingUp, Clock, Shield,
  Search, X
} from 'lucide-react';
import { Provider, ReasoningMode } from '@/utils/modelConstants';

// Enhanced model categories with rich metadata
export interface ModelOption {
  id: string;
  name: string;
  provider: Provider;
  description?: string;
  badge?: 'new' | 'popular' | 'fast' | 'pro';
  contextWindow?: number;
  tier?: 'free' | 'standard' | 'premium';
}

export interface ModelCategory {
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  bgGradient: string;
  models: ModelOption[];
}

// Amble AI Chat Models
export const AMBLE_AI_MODEL_CATEGORIES: ModelCategory[] = [
  {
    label: 'Instant',
    description: 'Lightning-fast responses',
    icon: Zap,
    iconColor: 'text-amber-500',
    bgGradient: 'from-amber-500/10 to-orange-500/10',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-5 Mini', provider: 'openai', description: 'Fast & efficient', badge: 'fast', contextWindow: 128000, tier: 'standard' },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'google', description: 'Blazing speed', badge: 'popular', contextWindow: 1000000, tier: 'standard' },
    ]
  },
  {
    label: 'Thinking',
    description: 'Deep reasoning & analysis',
    icon: BrainCircuit,
    iconColor: 'text-indigo-500',
    bgGradient: 'from-indigo-500/10 to-purple-500/10',
    models: [
      { id: 'gpt-4o', name: 'GPT-5', provider: 'openai', description: 'Advanced reasoning', badge: 'popular', contextWindow: 128000, tier: 'premium' },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', provider: 'google', description: 'Deep analysis', badge: 'new', contextWindow: 2000000, tier: 'premium' },
      { id: 'o1', name: 'o3 Reasoning', provider: 'openai', description: 'Complex problem solving', badge: 'pro', contextWindow: 128000, tier: 'premium' },
    ]
  }
];

// Billing View Models (Patient Experience)
export const BILLING_MODEL_CATEGORIES: ModelCategory[] = [
  {
    label: 'Quick Response',
    description: 'Fast billing analysis',
    icon: Zap,
    iconColor: 'text-emerald-500',
    bgGradient: 'from-emerald-500/10 to-teal-500/10',
    models: [
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'google', description: 'Instant insights', badge: 'fast', tier: 'standard' },
      { id: 'gpt-4o-mini', name: 'GPT-5 Mini', provider: 'openai', description: 'Quick analysis', badge: 'popular', tier: 'standard' },
    ]
  },
  {
    label: 'Deep Analysis',
    description: 'Complex case review',
    icon: BrainCircuit,
    iconColor: 'text-violet-500',
    bgGradient: 'from-violet-500/10 to-purple-500/10',
    models: [
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', provider: 'google', description: 'Thorough review', badge: 'new', tier: 'premium' },
      { id: 'gpt-4o', name: 'GPT-5', provider: 'openai', description: 'Expert analysis', badge: 'pro', tier: 'premium' },
    ]
  }
];

const BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: 'bg-gradient-to-r from-emerald-500 to-teal-500', text: 'text-white', label: 'NEW' },
  popular: { bg: 'bg-gradient-to-r from-amber-500 to-orange-500', text: 'text-white', label: 'POPULAR' },
  fast: { bg: 'bg-gradient-to-r from-cyan-500 to-blue-500', text: 'text-white', label: 'FAST' },
  pro: { bg: 'bg-gradient-to-r from-purple-500 to-pink-500', text: 'text-white', label: 'PRO' },
};

const TIER_ICONS: Record<string, React.ReactNode> = {
  free: <Globe size={12} className="text-slate-400" />,
  standard: <Star size={12} className="text-amber-400" />,
  premium: <Crown size={12} className="text-purple-500" />,
};

interface ModelSelectorProps {
  categories: ModelCategory[];
  selectedModelId: string;
  onSelect: (model: ModelOption) => void;
  variant?: 'default' | 'compact' | 'pill';
  showSearch?: boolean;
  className?: string;
}

export function ModelSelector({
  categories,
  selectedModelId,
  onSelect,
  variant = 'default',
  showSearch = true,
  className = ''
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Flatten all models for selection lookup
  const allModels = categories.flatMap(c => c.models);
  const selectedModel = allModels.find(m => m.id === selectedModelId);
  const selectedCategory = categories.find(cat => cat.models.some(m => m.id === selectedModelId));

  // Filter models based on search
  const filteredCategories = categories.map(cat => ({
    ...cat,
    models: cat.models.filter(m => 
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(cat => cat.models.length > 0);

  // Flatten filtered for keyboard navigation
  const flatFiltered = filteredCategories.flatMap(c => c.models);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;
    
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    // Use setTimeout to avoid capturing the click that opened the dropdown
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search on open
  useEffect(() => {
    if (isOpen && showSearch && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen, showSearch]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex(i => (i + 1) % flatFiltered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(i => (i - 1 + flatFiltered.length) % flatFiltered.length);
      } else if (e.key === 'Enter' && flatFiltered[highlightedIndex]) {
        e.preventDefault();
        handleSelect(flatFiltered[highlightedIndex]);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, highlightedIndex, flatFiltered]);

  const handleSelect = (model: ModelOption) => {
    onSelect(model);
    setIsOpen(false);
    setSearchQuery('');
  };

  const renderTrigger = () => {
    if (variant === 'pill') {
      return (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="group flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md hover:shadow-indigo-500/10 transition-all duration-200"
        >
          {selectedCategory && (
            <div className={`p-1 rounded-full bg-gradient-to-br ${selectedCategory.bgGradient}`}>
              <selectedCategory.icon size={12} className={selectedCategory.iconColor} />
            </div>
          )}
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {selectedModel?.name || 'Select Model'}
          </span>
          {selectedModel?.badge && (
            <span className={`text-[8px] font-bold px-1 py-0.5 rounded-full ${BADGE_STYLES[selectedModel.badge].bg} ${BADGE_STYLES[selectedModel.badge].text}`}>
              {BADGE_STYLES[selectedModel.badge].label}
            </span>
          )}
          <ChevronDown 
            size={14} 
            className={`text-slate-400 group-hover:text-indigo-500 transition-all duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          />
        </button>
      );
    }

    if (variant === 'compact') {
      return (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="group flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
        >
          {selectedCategory && <selectedCategory.icon size={14} className={selectedCategory.iconColor} />}
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {selectedModel?.name || 'Select'}
          </span>
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      );
    }

    // Default variant - rich trigger
    return (
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/60 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-600/60 hover:shadow-lg hover:shadow-indigo-500/10 dark:hover:shadow-indigo-500/5 transition-all duration-200"
      >
        {/* Gradient border effect on hover */}
        <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5" />
        
        <div className="relative flex items-center gap-2">
          {selectedCategory && (
            <div className={`p-1.5 rounded-lg bg-gradient-to-br ${selectedCategory.bgGradient}`}>
              <selectedCategory.icon size={14} className={selectedCategory.iconColor} />
            </div>
          )}
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                {selectedModel?.name || 'Select Model'}
              </span>
              {selectedModel?.badge && (
                <span className={`text-[8px] font-bold px-1 py-0.5 rounded-full ${BADGE_STYLES[selectedModel.badge].bg} ${BADGE_STYLES[selectedModel.badge].text}`}>
                  {BADGE_STYLES[selectedModel.badge].label}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <ChevronDown 
          size={14} 
          className={`ml-auto text-slate-400 group-hover:text-indigo-500 transition-all duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>
    );
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {renderTrigger()}
      
      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <div 
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none" 
            onClick={() => setIsOpen(false)} 
          />
          
          {/* Dropdown Panel */}
          <div className="absolute left-0 top-full mt-1.5 w-72 max-h-[60vh] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/60 rounded-xl shadow-xl shadow-slate-200/40 dark:shadow-slate-950/40 overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
            
            {/* Search Header */}
            {showSearch && (
              <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search models..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setHighlightedIndex(0);
                    }}
                    className="w-full pl-8 pr-6 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-0 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/30 placeholder-slate-400"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            )}
            
            {/* Model Categories */}
            <div className="overflow-y-auto max-h-[calc(60vh-50px)] overscroll-contain">
              {filteredCategories.length === 0 ? (
                <div className="p-6 text-center">
                  <Cpu size={24} className="mx-auto text-slate-300 dark:text-slate-600 mb-1.5" />
                  <p className="text-xs text-slate-500">No models found</p>
                </div>
              ) : (
                filteredCategories.map((category, catIdx) => (
                  <div key={category.label} className={catIdx > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}>
                    {/* Category Header */}
                    <div className={`sticky top-0 px-3 py-2 bg-gradient-to-r ${category.bgGradient} backdrop-blur-sm border-b border-slate-100/50 dark:border-slate-800/50`}>
                      <div className="flex items-center gap-1.5">
                        <div className="p-1 rounded-md bg-white/60 dark:bg-slate-800/60">
                          <category.icon size={12} className={category.iconColor} />
                        </div>
                        <div>
                          <h3 className="text-[10px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                            {category.label}
                          </h3>
                        </div>
                      </div>
                    </div>
                    
                    {/* Model Options */}
                    <div className="py-0.5">
                      {category.models.map((model, modelIdx) => {
                        const globalIdx = flatFiltered.findIndex(m => m.id === model.id);
                        const isSelected = model.id === selectedModelId;
                        const isHighlighted = globalIdx === highlightedIndex;
                        
                        return (
                          <button
                            key={model.id}
                            onClick={() => handleSelect(model)}
                            onMouseEnter={() => setHighlightedIndex(globalIdx)}
                            className={`w-full text-left px-3 py-2 transition-all duration-100 ${
                              isSelected
                                ? 'bg-indigo-50 dark:bg-indigo-900/20'
                                : isHighlighted
                                  ? 'bg-slate-50 dark:bg-slate-800/50'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {/* Selection indicator */}
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                                  isSelected 
                                    ? 'border-indigo-500 bg-indigo-500' 
                                    : 'border-slate-300 dark:border-slate-600'
                                }`}>
                                  {isSelected && <Check size={10} className="text-white" />}
                                </div>
                                
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-xs font-medium ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                      {model.name}
                                    </span>
                                    {model.badge && (
                                      <span className={`text-[7px] font-bold px-1 py-0.5 rounded-full ${BADGE_STYLES[model.badge].bg} ${BADGE_STYLES[model.badge].text}`}>
                                        {BADGE_STYLES[model.badge].label}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-1.5">
                                {model.tier && TIER_ICONS[model.tier]}
                                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-md ${
                                  model.provider === 'openai' 
                                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                }`}>
                                  {model.provider === 'openai' ? 'OpenAI' : 'Google'}
                                </span>
                              </div>
                            </div>
                            
                            {/* Context Window Indicator */}
                            {model.contextWindow && (
                              <div className="mt-1 ml-6 flex items-center gap-1">
                                <div className="flex-1 h-0.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" 
                                    style={{ width: `${Math.min((model.contextWindow / 2000000) * 100, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[8px] text-slate-400 font-mono">
                                  {model.contextWindow >= 1000000 
                                    ? `${(model.contextWindow / 1000000).toFixed(0)}M` 
                                    : `${(model.contextWindow / 1000).toFixed(0)}K`
                                  } ctx
                                </span>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Footer */}
            <div className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[8px] text-slate-500">
                <span className="flex items-center gap-0.5"><Star size={8} className="text-amber-400" /> Std</span>
                <span className="flex items-center gap-0.5"><Crown size={8} className="text-purple-500" /> Pro</span>
              </div>
              <span className="text-[8px] text-slate-400">↑↓ • Enter • Esc</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
