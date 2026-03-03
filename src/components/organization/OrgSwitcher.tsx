import React, { useState } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Building2, Check, ChevronDown } from 'lucide-react';

// Simple custom dropdown if radix not available
export function OrgSwitcher() {
  const { organizations, currentOrg, switchOrganization } = useOrganization();
  const [isOpen, setIsOpen] = useState(false);

  // If no orgs, show nothing (admin creates orgs elsewhere)
  if (!currentOrg && organizations.length === 0) {
      return null;
  }

  return (
    <div className="relative">
        <button 
           onClick={() => setIsOpen(!isOpen)}
           className="w-full flex items-center justify-between p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
        >
            <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-6 h-6 rounded bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <Building2 size={14} />
                </div>
                <span className="font-medium text-sm truncate max-w-[120px]">
                    {currentOrg?.name || 'Select Org'}
                </span>
            </div>
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
            <>
                <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                <div className="absolute top-full left-0 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl z-20 py-1 max-h-60 overflow-y-auto">
                    <div className="px-2 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Your Organizations
                    </div>
                    {organizations.map(org => (
                        <button
                            key={org.id}
                            onClick={() => { switchOrganization(org.id); setIsOpen(false); }}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors"
                        >
                            <span className={org.id === currentOrg?.id ? 'text-indigo-600 font-medium' : ''}>
                                {org.name}
                            </span>
                            {org.id === currentOrg?.id && <Check size={14} className="text-indigo-600" />}
                        </button>
                    ))}
                </div>
            </>
        )}
    </div>
  );
}
