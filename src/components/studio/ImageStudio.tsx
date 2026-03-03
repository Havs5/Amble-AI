import React, { useState, useRef, useEffect } from 'react';
import { generateImage, transferStyle } from '../../lib/studio/gemini-service';
import { Image, Wand2, Loader2, Download, Settings, Upload, LayoutGrid, RotateCcw, Eraser, Brush, Palette } from 'lucide-react';
import { useAuth } from '../auth/AuthContextRefactored';
import AssetGallery from '../gallery/AssetGallery';

type MediaType = 'GEN_IMAGE' | 'EDIT_IMAGE' | 'STYLE_TRANSFER' | 'GALLERY';

export const ImageStudio: React.FC = () => {
  const { user } = useAuth();
  const [mode, setMode] = useState<MediaType>('GEN_IMAGE');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultMedia, setResultMedia] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<{data: string, mime: string} | null>(null);
  const [styleFile, setStyleFile] = useState<{data: string, mime: string} | null>(null);

  // Editor State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [brushSize, setBrushSize] = useState(30);
  const [isDrawing, setIsDrawing] = useState(false);
  const [maskHistory, setMaskHistory] = useState<ImageData[]>([]);
  
  // Options
  const aspectRatio = '16:9';
  const resolution = '1K';
  const [selectedModel, setSelectedModel] = useState<string>('dall-e-3');
  const [showSettings, setShowSettings] = useState(false);

  // Update default model when mode changes
  useEffect(() => {
    if (mode === 'GEN_IMAGE') setSelectedModel('dall-e-3');
    if (mode === 'STYLE_TRANSFER') { setPrompt('Oil painting, vibrant colors'); }
  }, [mode]);

  const handleModeChange = (newMode: MediaType) => {
    setMode(newMode);
    // Auto-select generated image as reference if available
    if ((newMode === 'EDIT_IMAGE' || newMode === 'STYLE_TRANSFER') && resultMedia.length > 0) {
        const lastResult = resultMedia[0];
        if (lastResult.startsWith('data:image')) {
            const mime = lastResult.split(';')[0].split(':')[1];
            const data = lastResult.split(',')[1];
            setSelectedFile({ data, mime });
            setResultMedia([]); 
            if (newMode === 'EDIT_IMAGE') setPrompt('');
        }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'content' | 'style' = 'content') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const mime = base64String.split(';')[0].split(':')[1];
        const data = base64String.split(',')[1];
        if (target === 'content') {
            setSelectedFile({ data, mime });
            setMaskHistory([]);
        } else {
            setStyleFile({ data, mime });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Canvas Logic ---
  useEffect(() => {
    if (mode === 'EDIT_IMAGE' && selectedFile && canvasRef.current && containerRef.current) {
        const img = document.createElement('img');
        img.src = `data:${selectedFile.mime};base64,${selectedFile.data}`;
        img.onload = () => {
             // Simply clear logic here, rendering is handled in JSX via absolute positioning
             const canvas = canvasRef.current!;
             // Match natural aspect ratio or container?
             // Key: The visual canvas must match the displayed image dimensions exactly.
             // We'll rely on the container size.
             // But wait, if the image scales, the canvas must scale.
             // We'll set the canvas resolution to match the IMAGE resolution (or a fixed high res) 
             // and use CSS to fit it.
             
             // Safer: Set canvas width/height to offsetWidth/offsetHeight of the container once image loads.
             // But simpler: Set canvas to match image natural size, then use CSS to scale both.
             // However ensuring mouse events map correctly requires care.
             // Let's force a fixed resolution for editing (1024x1024?) or Natural.
             
             // Using Natural Size for precision
             canvas.width = img.naturalWidth;
             canvas.height = img.naturalHeight;
             const ctx = canvas.getContext('2d');
             if (ctx) ctx.clearRect(0,0, canvas.width, canvas.height);
        };
    }
  }, [selectedFile, mode]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    setIsDrawing(true);
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    // Save history
    const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    setMaskHistory(prev => [...prev.slice(-10), imageData]); // Keep last 10
    
    draw(e);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Coordinate mapping
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Scale brush size relative to image? 
      // brushSize is in screen pixels approx? No, passing raw number.
      // If image is 4000px, 30px is tiny. If 500px, 30px is huge.
      // Adjust brush size by scale
      ctx.lineWidth = brushSize * scaleX; 
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; 
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      
      ctx.beginPath();
      ctx.arc(x, y, (brushSize * scaleX) / 2, 0, Math.PI * 2);
      ctx.fill();
  };

  const prepareEditPayload = async () => {
     // See previous logical plan:
     // Create 1024x1024 Image + Mask
     if (!selectedFile || !canvasRef.current) return null;
     
     const size = 1024;
     const imgCanvas = document.createElement('canvas'); imgCanvas.width = size; imgCanvas.height = size;
     const imgCtx = imgCanvas.getContext('2d')!;
     
     const img = document.createElement('img');
     img.src = `data:${selectedFile.mime};base64,${selectedFile.data}`;
     await new Promise(r => img.onload = r);
     
     // Draw Image (contain)
     imgCtx.drawImage(img, 0, 0, size, size);
     
     const maskCanvas = document.createElement('canvas'); maskCanvas.width = size; maskCanvas.height = size;
     const maskCtx = maskCanvas.getContext('2d')!;
     
     // Fill Black (Opaque/Keep)
     maskCtx.fillStyle = '#000000';
     maskCtx.fillRect(0,0,size,size);
     
      // Draw User mask (Erase Black -> Transparent)
     maskCtx.globalCompositeOperation = 'destination-out';
     maskCtx.drawImage(canvasRef.current, 0, 0, size, size); // Scale drawn mask
     
     return {
         image: imgCanvas.toDataURL('image/png'),
         mask: maskCanvas.toDataURL('image/png')
     };
  };

  const handleSubmit = async () => {
    if (!prompt && mode !== 'EDIT_IMAGE' && mode !== 'STYLE_TRANSFER') return; 
    setLoading(true);
    setResultMedia([]);

    try {
      if (mode === 'GEN_IMAGE') {
        const images = await generateImage(prompt, resolution, aspectRatio, selectedModel, user?.id);
        setResultMedia(images);
      } else if (mode === 'STYLE_TRANSFER') {
          if (!selectedFile) { alert("Please upload a content image first."); return; }
          
          const images = await transferStyle(
             selectedFile,
             prompt,
             styleFile || undefined,
             user?.id
          );
          setResultMedia(images);
      } else if (mode === 'EDIT_IMAGE') {
          if (!selectedFile) { alert("No image selected"); return; }
          
          const payload = await prepareEditPayload();
          if (!payload) return;
          
          const response = await fetch('/api/image', {
             method: 'POST',
             headers: {'Content-Type': 'application/json'},
             body: JSON.stringify({
                 edit: true,
                 prompt,
                 image: payload.image,
                 mask: payload.mask,
                 n: 1,
                 userId: user?.id
             })
          });
          const data = await response.json();
          if (data.images) setResultMedia(data.images);
          else throw new Error(data.error || 'Failed');
      }
    } catch (e) {
      console.error(e);
      // alert("Generation failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
        {/* Toolbar */}
        <div className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center px-4 justify-between shrink-0">
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                <button onClick={() => handleModeChange('GEN_IMAGE')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'GEN_IMAGE' ? 'bg-white dark:bg-slate-800 shadow-sm text-purple-600 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                    <Image size={16} /> Generate
                </button>
                <button onClick={() => handleModeChange('STYLE_TRANSFER')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'STYLE_TRANSFER' ? 'bg-white dark:bg-slate-800 shadow-sm text-purple-600 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                    <Palette size={16} /> Restyler
                </button>
                <button onClick={() => handleModeChange('EDIT_IMAGE')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'EDIT_IMAGE' ? 'bg-white dark:bg-slate-800 shadow-sm text-purple-600 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                    <Wand2 size={16} /> In-Paint
                </button>
                <button onClick={() => handleModeChange('GALLERY')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'GALLERY' ? 'bg-white dark:bg-slate-800 shadow-sm text-purple-600 dark:text-purple-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                    <LayoutGrid size={16} /> Gallery
                </button>
            </div>
            
            <button onClick={() => setShowSettings(!showSettings)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <Settings size={18} />
            </button>
        </div>

        <div className="flex-1 flex overflow-hidden relative">
            {mode === 'GALLERY' ? (
                <div className="w-full h-full p-6 overflow-hidden">
                    <AssetGallery userId={user?.id || 'default'} />
                </div>
            ) : (
            <>
            {/* Sidebar */}
            <div className="w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 overflow-y-auto shrink-0 flex flex-col gap-6">
                
                {/* Mode Specific Inputs */}
                {(mode === 'EDIT_IMAGE' || mode === 'STYLE_TRANSFER') && (
                    <div className="space-y-3">
                         <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                {mode === 'STYLE_TRANSFER' ? 'Content Image' : 'Input Image'}
                            </label>
                            {selectedFile && <button onClick={() => { setSelectedFile(null); setMaskHistory([]); }} className="text-xs text-red-400 hover:text-red-500">Clear</button>}
                         </div>
                         <div className="relative group border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg hover:border-purple-500 transition-colors h-32 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
                            {selectedFile ? (
                                <img src={`data:${selectedFile.mime};base64,${selectedFile.data}`} className="h-full w-full object-contain p-2" />
                            ) : (
                                <>
                                    <Upload size={24} className="text-slate-400" />
                                    <span className="text-xs text-slate-400 mt-2">Upload Image</span>
                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={(e) => handleFileChange(e, 'content')} />
                                </>
                            )}
                         </div>
                    </div>
                )}

                {mode === 'STYLE_TRANSFER' && (
                    <div className="space-y-3">
                         <div className="flex justify-between items-center">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Style Reference (Optional)</label>
                            {styleFile && <button onClick={() => setStyleFile(null)} className="text-xs text-red-400 hover:text-red-500">Clear</button>}
                         </div>
                         <div className="relative group border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg hover:border-purple-500 transition-colors h-24 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
                             {styleFile ? (
                                <img src={`data:${styleFile.mime};base64,${styleFile.data}`} className="h-full w-full object-contain p-2" />
                            ) : (
                                <>
                                    <Upload size={20} className="text-slate-400" />
                                    <span className="text-xs text-slate-400 mt-2">Upload Style Image</span>
                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={(e) => handleFileChange(e, 'style')} />
                                </>
                            )}
                         </div>
                    </div>
                )}
                
                <div className="space-y-3">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {mode === 'STYLE_TRANSFER' ? 'Style Strategy / Prompt' : 'Prompt'}
                    </label>
                    <textarea 
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 min-h-[100px] resize-none"
                        placeholder={mode === 'EDIT_IMAGE' ? "Describe what to put in the masked area..." : mode === 'STYLE_TRANSFER' ? "E.g. 'Cyberpunk, rich neons' or 'Oil painting by Van Gogh'" : "Describe your creation..."}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                    />
                </div>

                {mode === 'EDIT_IMAGE' && (
                    <div className="space-y-4">
                         {!selectedFile ? (
                             <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center cursor-pointer hover:bg-slate-50 relative">
                                <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                                <Upload className="mx-auto mb-2 text-slate-400" size={24} />
                                <p className="text-xs text-slate-500">Upload Reference</p>
                             </div>
                         ) : (
                             <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
                                <div className="flex justify-between text-xs text-slate-500">
                                    <span className="flex items-center gap-1"><Brush size={12}/> Brush Size</span>
                                    <span>{brushSize}px</span>
                                </div>
                                <input type="range" min="10" max="100" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                                <div className="flex gap-2">
                                    <button onClick={() => {
                                        if (maskHistory.length > 0 && canvasRef.current) {
                                            const ctx = canvasRef.current.getContext('2d');
                                            ctx?.putImageData(maskHistory[maskHistory.length-1],0,0);
                                            setMaskHistory(p => p.slice(0,-1));
                                        }
                                    }} className="flex-1 py-1.5 text-xs bg-white dark:bg-slate-800 border rounded flex items-center justify-center gap-1">
                                        <RotateCcw size={12} /> Undo
                                    </button>
                                    <button onClick={() => {
                                         const ctx = canvasRef.current?.getContext('2d');
                                         ctx?.clearRect(0,0,9999,9999);
                                         setMaskHistory([]);
                                    }} className="flex-1 py-1.5 text-xs bg-white dark:bg-slate-800 border rounded flex items-center justify-center gap-1 text-red-500">
                                        <Eraser size={12} /> Clear
                                    </button>
                                </div>
                                <button onClick={() => { setSelectedFile(null); }} className="text-xs text-red-500 block w-full text-center mt-2 hover:underline">Remove Image</button>
                             </div>
                         )}
                    </div>
                )}

                <div className="mt-auto pt-4">
                    <button 
                        onClick={handleSubmit}
                        disabled={loading || (mode === 'EDIT_IMAGE' && !selectedFile)}
                        className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                        {loading ? 'Processing...' : (mode === 'EDIT_IMAGE' ? 'Generate Edits' : 'Generate')}
                    </button>
                </div>
            </div>

            {/* Preview Area */}
            <div className="flex-1 bg-slate-200 dark:bg-slate-900/50 p-8 overflow-y-auto flex flex-col items-center">
                {mode === 'EDIT_IMAGE' && selectedFile && resultMedia.length === 0 ? (
                    <div ref={containerRef} className="relative shadow-2xl rounded-lg overflow-hidden max-w-full max-h-[70vh] bg-black">
                        <img 
                            src={`data:${selectedFile.mime};base64,${selectedFile.data}`} 
                            className="block max-w-full max-h-[70vh] pointer-events-none select-none"
                        />
                        <canvas
                            ref={canvasRef}
                            className="absolute inset-0 cursor-crosshair touch-none mix-blend-screen"
                            style={{ width: '100%', height: '100%' }}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={() => setIsDrawing(false)}
                            onMouseLeave={() => setIsDrawing(false)}
                        />
                    </div>
                ) : (
                    <div className="w-full max-w-4xl grid grid-cols-1 gap-6">
                        {resultMedia.map((src, i) => (
                             <div key={i} className="bg-white dark:bg-slate-950 rounded-xl shadow-sm overflow-hidden group relative">
                                <img src={src} className="w-full h-auto" />
                                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <a href={src} download className="p-2 bg-white/90 dark:bg-slate-800/90 rounded-md hover:text-purple-600 text-slate-700 dark:text-slate-300"><Download size={16}/></a>
                                </div>
                             </div>
                        ))}
                         {resultMedia.length === 0 && !loading && (
                             <div className="text-center text-slate-400 mt-20">
                                 <Wand2 size={48} className="mx-auto mb-4 opacity-50" />
                                 <p>Ready to create masterpieces</p>
                             </div>
                         )}
                    </div>
                )}
            </div>
            </>
            )}
        </div>
    </div>
  );
};
