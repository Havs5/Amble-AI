'use client';

import React, { useEffect, useState } from 'react';
import { Trash2, ExternalLink, Image as ImageIcon, Video as VideoIcon, Info } from 'lucide-react';

interface Asset {
  id: string;
  type: 'image' | 'video';
  url: string;
  prompt: string;
  model: string;
  createdAt: number;
  metadata?: any;
}

interface AssetGalleryProps {
  userId: string;
}

export default function AssetGallery({ userId }: AssetGalleryProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const fetchAssets = async () => {
    try {
      const res = await fetch(`/api/gallery?userId=${userId}`);
      const data = await res.json();
      if (data.assets) {
        setAssets(data.assets);
      }
    } catch (error) {
      console.error('Failed to fetch assets:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchAssets();
    }
  }, [userId]);

  const handleDelete = async (assetId: string) => {
    if (!confirm('Are you sure you want to delete this asset?')) return;

    try {
      const res = await fetch(`/api/gallery?assetId=${assetId}&userId=${userId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setAssets(assets.filter(a => a.id !== assetId));
        if (selectedAsset?.id === assetId) setSelectedAsset(null);
      }
    } catch (error) {
      console.error('Failed to delete asset:', error);
    }
  };

  if (loading) return <div className="p-4 text-center text-gray-400">Loading gallery...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {assets.map(asset => (
            <div 
              key={asset.id} 
              className="relative group aspect-square bg-gray-800 rounded-lg overflow-hidden cursor-pointer border border-gray-700 hover:border-blue-500 transition-colors"
              onClick={() => setSelectedAsset(asset)}
            >
              {asset.type === 'image' ? (
                <img src={asset.url} alt={asset.prompt} className="w-full h-full object-cover" />
              ) : (
                <video src={asset.url} className="w-full h-full object-cover" />
              )}
              
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="text-white text-xs p-2 text-center line-clamp-3">
                  {asset.prompt}
                </div>
              </div>
              
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {asset.type === 'image' ? <ImageIcon size={16} className="text-white" /> : <VideoIcon size={16} className="text-white" />}
              </div>
            </div>
          ))}
        </div>
        
        {assets.length === 0 && (
          <div className="text-center text-gray-500 mt-10">
            No generated assets found. Start creating!
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSelectedAsset(null)}>
          <div className="bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row" onClick={e => e.stopPropagation()}>
            <div className="flex-1 bg-black flex items-center justify-center p-4 relative">
              {selectedAsset.type === 'image' ? (
                <img src={selectedAsset.url} alt={selectedAsset.prompt} className="max-w-full max-h-[70vh] object-contain" />
              ) : (
                <video src={selectedAsset.url} controls className="max-w-full max-h-[70vh]" />
              )}
            </div>
            
            <div className="w-full md:w-80 p-6 border-l border-gray-800 overflow-y-auto">
              <h3 className="text-lg font-semibold text-white mb-4">Asset Details</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Prompt</label>
                  <p className="text-sm text-gray-300 mt-1">{selectedAsset.prompt}</p>
                </div>
                
                <div>
                  <label className="text-xs text-gray-500 uppercase">Model</label>
                  <p className="text-sm text-gray-300 mt-1">{selectedAsset.model}</p>
                </div>

                <div>
                  <label className="text-xs text-gray-500 uppercase">Created</label>
                  <p className="text-sm text-gray-300 mt-1">{new Date(selectedAsset.createdAt).toLocaleString()}</p>
                </div>

                {selectedAsset.metadata && (
                  <div>
                    <label className="text-xs text-gray-500 uppercase">Metadata</label>
                    <pre className="text-xs text-gray-400 mt-1 bg-gray-800 p-2 rounded overflow-x-auto">
                      {JSON.stringify(selectedAsset.metadata, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="pt-4 flex gap-2">
                  <a 
                    href={selectedAsset.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm transition-colors"
                  >
                    <ExternalLink size={16} /> Open
                  </a>
                  <button 
                    onClick={() => handleDelete(selectedAsset.id)}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/40 text-red-500 py-2 rounded-lg text-sm transition-colors"
                  >
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
