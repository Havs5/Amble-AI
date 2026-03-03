
import React, { useState, useEffect } from 'react';
import { X, Copy, Download, Code, FileText, Maximize2, ChevronLeft, ChevronRight, History } from 'lucide-react';
import { useChat } from '@/contexts';
import { Artifact } from '@/types/chat';
import { ArtifactRenderer } from './ArtifactRenderer';

export function ArtifactsPanel() {
  const { activeArtifact, setActiveArtifact, artifacts } = useChat();
  const [versionIndex, setVersionIndex] = useState<number>(-1);

  // Reset version index when active artifact changes
  useEffect(() => {
    setVersionIndex(-1);
  }, [activeArtifact?.id]);

  if (!activeArtifact) return null;

  const currentIndex = artifacts.findIndex(a => a.id === activeArtifact.id);
  const totalArtifacts = artifacts.length;

  // Version Handling
  const versions = activeArtifact.versions || [];
  const hasVersions = versions.length > 1;
  const currentVersionIdx = versionIndex === -1 ? (versions.length > 0 ? versions.length - 1 : 0) : versionIndex;
  
  // Decide what content to show
  // If we have versions, use the selected version. If no versions, use main content.
  const displayContent = (versions.length > 0)
    ? versions[currentVersionIdx].content
    : (activeArtifact.content || '');
    
  const displayLabel = (versions.length > 0 && versions[currentVersionIdx].label) 
    ? versions[currentVersionIdx].label 
    : 'Latest';

  const displayTimestamp = (versions.length > 0)
    ? versions[currentVersionIdx].timestamp
    : activeArtifact.createdAt;

  const handlePrev = () => {
    if (currentIndex > 0) setActiveArtifact(artifacts[currentIndex - 1]);
  };

  const handleNext = () => {
    if (currentIndex < totalArtifacts - 1) setActiveArtifact(artifacts[currentIndex + 1]);
  };

  const traverseVersion = (direction: 'prev' | 'next') => {
      if (!hasVersions) return;
      
      const maxIdx = versions.length - 1;
      let newIdx = currentVersionIdx;
      
      if (direction === 'prev' && newIdx > 0) newIdx--;
      if (direction === 'next' && newIdx < maxIdx) newIdx++;
      
      setVersionIndex(newIdx);
  };

  const handleCopy = () => {
    if (displayContent) {
      navigator.clipboard.writeText(displayContent);
    }
  };

  const handleDownload = () => {
    if (!displayContent) return;
    const blob = new Blob([displayContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeArtifact.title.replace(/\s+/g, '_').toLowerCase()}_v${currentVersionIdx + 1}.${activeArtifact.language === 'typescript' ? 'ts' : 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-80 lg:w-96 border-l border-border bg-background flex flex-col h-full shadow-xl z-20 absolute right-0 top-0 bottom-0 lg:static">
      {/* Header */}
      <div className="flex flex-col border-b border-border/50">
        <div className="flex items-center justify-between p-4 pb-2">
            <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 mr-2">
            {activeArtifact.type === 'code' ? <Code className="w-4 h-4 text-blue-500 flex-shrink-0" /> : <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />}
            <span className="font-medium text-sm truncate">{activeArtifact.title}</span>
            </div>

            {/* Artifact Navigation (Between different files) */}
            {totalArtifacts > 1 && (
                <div className="flex items-center bg-secondary/50 rounded-lg p-0.5 mr-2 flex-shrink-0">
                    <button 
                        onClick={handlePrev} 
                        disabled={currentIndex <= 0}
                        className="p-1 hover:bg-background rounded-md transition-colors disabled:opacity-30"
                        title="Previous Artifact"
                    >
                        <ChevronLeft className="w-3 h-3" />
                    </button>
                    <span className="text-[10px] w-8 text-center font-medium">
                        {currentIndex + 1}/{totalArtifacts}
                    </span>
                    <button 
                        onClick={handleNext} 
                        disabled={currentIndex >= totalArtifacts - 1}
                        className="p-1 hover:bg-background rounded-md transition-colors disabled:opacity-30"
                        title="Next Artifact"
                    >
                        <ChevronRight className="w-3 h-3" />
                    </button>
                </div>
            )}

            <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={handleCopy} className="p-1.5 hover:bg-secondary rounded transition-colors" title="Copy Content">
                <Copy className="w-4 h-4" />
            </button>
            <button onClick={handleDownload} className="p-1.5 hover:bg-secondary rounded transition-colors" title="Download">
                <Download className="w-4 h-4" />
            </button>
            <button onClick={() => setActiveArtifact(null)} className="p-1.5 hover:bg-secondary rounded transition-colors" title="Close">
                <X className="w-4 h-4" />
            </button>
            </div>
        </div>

        {/* Version History Sub-Header */}
        {hasVersions && (
            <div className="px-4 pb-2 flex items-center justify-between bg-muted/20 border-t border-border/30 pt-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <History className="w-3 h-3" />
                    <span className="font-medium">Version History</span>
                </div>
                
                <div className="flex items-center p-0.5 bg-background rounded border border-border/50">
                    <button 
                        onClick={() => traverseVersion('prev')}
                        disabled={currentVersionIdx <= 0}
                        className="p-1 hover:bg-secondary rounded disabled:opacity-30 transition-colors"
                        title="Older Version"
                    >
                        <ChevronLeft className="w-3 h-3" />
                    </button>
                    <div className="px-2 flex flex-col items-center min-w-[80px]">
                        <span className="text-[10px] font-bold">V{currentVersionIdx + 1}</span>
                        <span className="text-[8px] text-muted-foreground truncate max-w-[70px]">{displayLabel}</span>
                    </div>
                    <button 
                        onClick={() => traverseVersion('next')}
                        disabled={currentVersionIdx >= versions.length - 1}
                        className="p-1 hover:bg-secondary rounded disabled:opacity-30 transition-colors"
                        title="Newer Version"
                    >
                        <ChevronRight className="w-3 h-3" />
                    </button>
                </div>
            </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-background border-t border-border/50 relative">
        {/* Version indicator overlay if not latest */}
        {hasVersions && currentVersionIdx < versions.length - 1 && (
            <div className="absolute top-2 right-4 z-10 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded text-[10px] font-medium backdrop-blur-sm pointer-events-none">
                Viewing Older Version
            </div>
        )}
        
        {activeArtifact.type === 'code' ? (
          <ArtifactRenderer content={displayContent} language={activeArtifact.language || 'plaintext'} />
        ) : (
          <div className="p-4 overflow-y-auto h-full prose prose-sm dark:prose-invert max-w-none">
            {displayContent}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border/50 bg-muted/20 text-xs text-muted-foreground flex justify-between">
        <span>{activeArtifact.language}</span>
        <span>{new Date(displayTimestamp).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
