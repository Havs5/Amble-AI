import React, { useState } from 'react';
import { Sparkles, Film, Image, Radio } from 'lucide-react';
import { ImageStudio } from './ImageStudio';
import { VideoStudio } from './VideoStudio';
import { LiveStudio } from './LiveStudio';

export const MediaStudio: React.FC = () => {
  const [studioTab, setStudioTab] = useState<'video' | 'media' | 'live'>('media');

  return (
    <div className="flex h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Sidebar Navigation */}
      <div className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Sparkles size={20} />
                Amble Studio
            </h2>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
             <button 
                onClick={() => setStudioTab('media')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${studioTab === 'media' ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
                <Image size={18} />
                Image Studio
            </button>
            <button 
                onClick={() => setStudioTab('video')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${studioTab === 'video' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
                <Film size={18} />
                Video Generation
            </button>
            <button 
                onClick={() => setStudioTab('live')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${studioTab === 'live' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
                <Radio size={18} />
                Audio Studio
            </button>
        </nav>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 text-center">
            Powered by Vstream X
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
        {studioTab === 'video' ? (
            <VideoStudio />
        ) : studioTab === 'media' ? (
            <ImageStudio />
        ) : studioTab === 'live' ? (
            <LiveStudio />
        ) : null}
      </div>
    </div>
  );
};

export default MediaStudio;
