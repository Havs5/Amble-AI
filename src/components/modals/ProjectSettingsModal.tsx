import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, FileText, Save } from 'lucide-react';
import { Project } from '../layout/ProjectSidebar';
import { ConfirmationModal } from './ConfirmationModal';

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project | null; // If null, creating new
  onSave: (projectData: Omit<Project, 'id' | 'createdAt'>) => void;
  onDelete?: (projectId: string) => void;
}

export function ProjectSettingsModal({ isOpen, onClose, project, onSave, onDelete }: ProjectSettingsModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [policies, setPolicies] = useState<string[]>([]);
  const [newPolicy, setNewPolicy] = useState('');
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (project) {
        setName(project.name);
        setDescription(project.description || '');
        setSystemPrompt(project.systemPrompt || '');
        setPolicies(project.policies || []);
      } else {
        // Reset for new project
        setName('');
        setDescription('');
        setSystemPrompt('');
        setPolicies([]);
      }
      setNewPolicy('');
    }
  }, [isOpen, project]);

  const handleAddPolicy = () => {
    if (newPolicy.trim()) {
      setPolicies([...policies, newPolicy.trim()]);
      setNewPolicy('');
    }
  };

  const removePolicy = (index: number) => {
    setPolicies(policies.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    onSave({
      name,
      description,
      systemPrompt,
      policies
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 mx-4">
        
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {project ? 'Edit Project' : 'Create New Project'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <form id="project-form" onSubmit={handleSubmit} className="space-y-6">
            
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Project Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-100"
                  placeholder="e.g., Marketing Campaign Q1"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-100 resize-none h-20"
                  placeholder="Brief description of the project..."
                />
              </div>
            </div>

            <hr className="border-slate-200 dark:border-slate-800" />

            {/* AI Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText size={16} className="text-indigo-500" />
                Project Guidelines
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  System Prompt Override
                  <span className="ml-2 text-xs font-normal text-slate-500">Overrides global Amble prompt for this project.</span>
                </label>
                <textarea 
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="w-full h-32 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-100 text-sm resize-none font-mono"
                  placeholder="You are a specialized assistant for..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Project Policies
                  <span className="ml-2 text-xs font-normal text-slate-500">Specific rules for this project.</span>
                </label>
                
                <div className="flex gap-2 mb-3">
                  <input 
                    type="text" 
                    value={newPolicy}
                    onChange={(e) => setNewPolicy(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPolicy())}
                    className="flex-1 p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-900 dark:text-slate-100 text-sm"
                    placeholder="Add a policy..."
                  />
                  <button 
                    type="button"
                    onClick={handleAddPolicy}
                    className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                  >
                    <Plus size={20} />
                  </button>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                  {policies.length === 0 ? (
                    <p className="text-sm text-slate-400 italic text-center py-2">No specific policies.</p>
                  ) : (
                    policies.map((policy, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 group">
                        <span className="text-sm text-slate-700 dark:text-slate-300">{policy}</span>
                        <button 
                          type="button"
                          onClick={() => removePolicy(idx)}
                          className="text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

          </form>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-between items-center">
          {project && onDelete ? (
            <button 
              type="button"
              onClick={() => setShowDeleteConfirmation(true)}
              className="text-red-500 hover:text-red-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              Delete Project
            </button>
          ) : <div></div>}
          
          <div className="flex gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              form="project-form"
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-lg shadow-indigo-500/20 flex items-center gap-2"
            >
              <Save size={16} />
              {project ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </div>

      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirmation}
        title="Delete Project?"
        message="Are you sure you want to delete this project and all its chats? This action cannot be undone."
        confirmLabel="Delete Project"
        isDangerous={true}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={() => {
            if (project && onDelete) {
                onDelete(project.id);
                onClose(); // Close the settings modal too
            }
        }}
      />
    </div>
  );
}
