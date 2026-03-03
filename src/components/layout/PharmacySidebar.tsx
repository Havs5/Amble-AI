import React from 'react';
import { Pill, Heart, Building2, ChevronLeft, ChevronRight } from 'lucide-react';

export type PharmacyType = 'revive' | 'align';

export interface Pharmacy {
  id: PharmacyType;
  name: string;
  description: string;
  url: string;
  icon: 'revive' | 'align';
  color: string;
  bgColor: string;
  activeBg: string;
}

export const PHARMACIES: Pharmacy[] = [
  {
    id: 'revive',
    name: 'Revive',
    description: 'Revival Pharmacy System',
    url: 'https://amble-revive.web.app',
    icon: 'revive',
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-100 dark:bg-rose-900/30',
    activeBg: 'shadow-rose-200/50 dark:shadow-rose-500/20'
  },
  {
    id: 'align',
    name: 'Align',
    description: 'Alignment Pharmacy System',
    url: 'https://amble-align.web.app',
    icon: 'align',
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    activeBg: 'shadow-indigo-200/50 dark:shadow-indigo-500/20'
  }
];

interface PharmacySidebarProps {
  activePharmacy: PharmacyType | null;
  onSelectPharmacy: (pharmacy: PharmacyType) => void;
  isCollapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function PharmacySidebar({ 
  activePharmacy, 
  onSelectPharmacy,
  isCollapsed,
  onCollapsedChange
}: PharmacySidebarProps) {
  
  const getPharmacyIcon = (iconType: string, size: number = 16) => {
    switch (iconType) {
      case 'revive':
        return <Heart size={size} className="shrink-0" />;
      case 'align':
        return <Building2 size={size} className="shrink-0" />;
      default:
        return <Pill size={size} className="shrink-0" />;
    }
  };

  return (
    <div 
      className={`${isCollapsed ? 'w-[72px]' : 'w-64'} bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full transition-all duration-300 ease-in-out relative`}
      onMouseEnter={() => onCollapsedChange(false)}
      onMouseLeave={() => onCollapsedChange(true)}
    >
      {/* Collapse/Expand Toggle */}
      <button
        onClick={() => onCollapsedChange(!isCollapsed)}
        className="absolute -right-3 top-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 shadow-md hover:shadow-lg transition-all z-50"
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Header */}
      <div className={`${isCollapsed ? 'p-3' : 'p-4'} border-b border-slate-200 dark:border-slate-800 flex items-center justify-center`}>
        {isCollapsed ? (
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Pill size={18} className="text-white" />
          </div>
        ) : (
          <h2 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Pill size={14} className="text-white" />
            </div>
            <span>Pharmacies</span>
          </h2>
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-y-auto ${isCollapsed ? 'p-2' : 'p-3'} space-y-2`}>
        {!isCollapsed && (
          <p className="text-xs text-slate-500 dark:text-slate-400 px-2 pb-2">
            Select a pharmacy to access its system. Your session will persist while you use Amble AI.
          </p>
        )}
        
        {PHARMACIES.map(pharmacy => {
          const isActive = activePharmacy === pharmacy.id;
          
          return (
            <button
              key={pharmacy.id}
              onClick={() => onSelectPharmacy(pharmacy.id)}
              title={isCollapsed ? pharmacy.name : undefined}
              className={`w-full flex ${isCollapsed ? 'justify-center' : 'items-start gap-3'} rounded-xl cursor-pointer text-left transition-all duration-200 group
                ${isCollapsed ? 'p-2' : 'p-3'}
                ${isActive 
                  ? `bg-white dark:bg-slate-800 shadow-lg ${pharmacy.activeBg}` 
                  : 'hover:bg-white dark:hover:bg-slate-800/50 hover:shadow-sm'
                }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 aspect-square ${
                isActive 
                  ? `${pharmacy.bgColor} ${pharmacy.color}` 
                  : `bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:${pharmacy.bgColor} group-hover:${pharmacy.color}`
              }`}>
                {getPharmacyIcon(pharmacy.icon, 18)}
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <div className={`font-medium text-sm ${
                    isActive 
                      ? pharmacy.color
                      : 'text-slate-700 dark:text-slate-300'
                  }`}>
                    {pharmacy.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {pharmacy.description}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      {!isCollapsed && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
            Sessions remain active while using Amble AI
          </p>
        </div>
      )}
    </div>
  );
}
