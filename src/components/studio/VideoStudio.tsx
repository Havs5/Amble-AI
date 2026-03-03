import {Video} from '@google/genai';
import React, {useCallback, useState} from 'react';
import LoadingIndicator from '../veo/LoadingIndicator';
import PromptForm from '../veo/PromptForm';
import VideoResult from '../veo/VideoResult';
import AssetGallery from '../gallery/AssetGallery';
import { useAuth } from '../auth/AuthContextRefactored';
import { LayoutGrid, Image as ImageIcon, Upload, FileVideo, Play, Sparkles, Loader2 } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getStorageInstance } from '@/lib/firebase';
import {
  AppState,
  GenerateVideoParams,
  GenerationMode,
  Resolution,
} from '@/types/veo';
import { UsageManager } from '../../lib/usageManager';

const VIDEO_MODELS = [
  { id: 'veo-3.0-generate-001', name: 'Veo 3.0', provider: 'Google', description: "High-quality video generation." },
  { id: 'sora-2', name: 'Sora 2', provider: 'OpenAI', description: "High-quality video generation." },
  { id: 'sora-2-pro', name: 'Sora 2 Pro', provider: 'OpenAI', description: "OpenAI's most powerful video model." },
];

export const VideoStudio: React.FC = () => {
  const { user } = useAuth();
  
  // Video State
  const [activeTab, setActiveTab] = useState<'create' | 'analyze' | 'gallery'>('create');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Analysis State
  const [analyzeFile, setAnalyzeFile] = useState<File | null>(null);
  const [analyzePrompt, setAnalyzePrompt] = useState('');
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [lastConfig, setLastConfig] = useState<GenerateVideoParams | null>(
    null,
  );
  const [lastVideoObject, setLastVideoObject] = useState<Video | null>(null);
  const [selectedModel, setSelectedModel] = useState(VIDEO_MODELS[0]);
  
  // A single state to hold the initial values for the prompt form
  const [initialFormValues, setInitialFormValues] =
    useState<GenerateVideoParams | null>(null);

  const handleAnalyze = async () => {
      if (!analyzeFile || !user) return;
      
      const storageInstance = getStorageInstance();
      if (!storageInstance) {
          setErrorMessage('Firebase Storage is not available');
          return;
      }
      
      setAppState(AppState.LOADING);
      setAnalysisResult(null);
      setErrorMessage(null);

      try {
          // 1. Upload
          const storageRef = ref(storageInstance, `uploads/${user.id}/${Date.now()}_${analyzeFile.name}`);
          const uploadTask = uploadBytesResumable(storageRef, analyzeFile);

          uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(progress);
            },
            (error) => { throw error; }
          );

          await uploadTask;
          const downloadUrl = await getDownloadURL(storageRef);

          // 2. Analyze
          const response = await fetch('/api/video/analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  videoUrl: downloadUrl,
                  prompt: analyzePrompt,
                  userId: user.id
              })
          });

          if (!response.ok) throw new Error('Analysis failed');
          
          const data = await response.json();
          setAnalysisResult(data.analysis);
          setAppState(AppState.SUCCESS);

      } catch (e: any) {
          console.error("Analysis Error:", e);
          setErrorMessage(e.message);
          setAppState(AppState.ERROR);
      } finally {
          setUploadProgress(0);
      }
  };

  const handleGenerate = useCallback(async (params: GenerateVideoParams) => {
    setAppState(AppState.LOADING);
    setErrorMessage(null);
    setLastConfig(params);
    // Reset initial form values for the next fresh start
    setInitialFormValues(null);

    try {
      if (user?.id) {
          UsageManager.checkLimits(user.id, 'studio');
      }

      const response = await fetch('/api/veo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          ...params, 
          model: selectedModel.id,
          userId: user?.id 
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        let errorMsg = 'Video generation failed';
        try {
            const json = JSON.parse(text);
            errorMsg = json.error || errorMsg;
        } catch {
            errorMsg = `Server Error (${response.status})`;
            if (response.status === 504) errorMsg += ': Gateway Timeout (Video took too long)';
            if (response.status === 502) errorMsg += ': Bad Gateway (Server overloaded)';
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      setVideoUrl(data.videoUrl);
      setLastVideoObject(data.videoObject);
      setAppState(AppState.SUCCESS);
    } catch (error) {
      console.error('Video generation failed:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'An unknown error occurred.';

      setErrorMessage(errorMessage);
      setAppState(AppState.ERROR);
    }
  }, [user, selectedModel]);

  const handleRetry = () => {
    if (lastConfig) {
      setInitialFormValues(lastConfig);
      setAppState(AppState.IDLE);
    }
  };

  const handleNewVideo = () => {
    setInitialFormValues(null);
    setAppState(AppState.IDLE);
    setVideoUrl(null);
    setLastVideoObject(null);
    setLastConfig(null);
  };

  const handleExtend = () => {
    if (lastConfig && lastVideoObject && videoUrl) {
      fetch(videoUrl)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], "generated_video.mp4", { type: "video/mp4" });
          
          // Convert blob to base64 for the params
          const reader = new FileReader();
          reader.onloadend = () => {
             const base64 = (reader.result as string).split(',')[1];
             
             setInitialFormValues({
                ...lastConfig,
                mode: GenerationMode.EXTEND_VIDEO,
                prompt: '', // Clear prompt for extension
                inputVideo: {
                    file: file,
                    base64: base64,
                    mimeType: 'video/mp4'
                },
                inputVideoObject: lastVideoObject,
                resolution: Resolution.P720 // Extensions must be 720p
              });
              setAppState(AppState.IDLE);
          };
          reader.readAsDataURL(blob);
        })
        .catch(e => {
            console.error("Failed to prepare video for extension", e);
             setInitialFormValues({
                ...lastConfig,
                mode: GenerationMode.EXTEND_VIDEO,
                prompt: '',
                inputVideoObject: lastVideoObject,
                resolution: Resolution.P720
              });
              setAppState(AppState.IDLE);
        });
    }
  };

  const canExtend =
    appState === AppState.SUCCESS &&
    lastConfig?.resolution === Resolution.P720 &&
    !!lastVideoObject;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
        {/* Video Toolbar */}
        <div className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center px-4 justify-between shrink-0">
            <div className="flex items-center gap-2">
                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('create')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        activeTab === 'create'
                            ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                    >
                        <LayoutGrid size={16} />
                        Create
                    </button>
                    <button
                        onClick={() => setActiveTab('analyze')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        activeTab === 'analyze'
                            ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                    >
                        <Sparkles size={16} />
                        Analyze
                    </button>
                    <button
                        onClick={() => setActiveTab('gallery')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                        activeTab === 'gallery'
                            ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                    >
                        <ImageIcon size={16} />
                        Gallery
                    </button>
                </div>
            </div>
            {activeTab === 'create' && (
                <div className="flex items-center gap-2">
                    <select 
                        value={selectedModel.id}
                        onChange={(e) => setSelectedModel(VIDEO_MODELS.find(m => m.id === e.target.value) || VIDEO_MODELS[0])}
                        className="bg-slate-100 dark:bg-slate-900 border-none text-sm rounded-md py-1.5 pl-3 pr-8 focus:ring-1 focus:ring-indigo-500"
                    >
                        {VIDEO_MODELS.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                </div>
            )}
        </div>

        {/* Video Content */}
        <div className={`flex-1 overflow-y-auto p-6 ${activeTab === 'create' ? 'flex flex-col justify-center' : ''}`}>
            {activeTab === 'analyze' ? (
               <div className="h-full flex flex-col items-center">
                 <div className="w-full max-w-2xl bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                        <h3 className="text-xl font-bold flex items-center gap-2 mb-2">
                            <Play className="text-indigo-600" />
                            Video Analysis
                        </h3>
                        <p className="text-sm text-slate-500">
                            Upload a video to get a frame-by-frame detailed analysis powered by Gemini 1.5 Pro Vision.
                        </p>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        {/* Upload */}
                        <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors relative">
                            <input 
                                type="file" 
                                accept="video/mp4,video/webm,video/quicktime" 
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                onChange={(e) => setAnalyzeFile(e.target.files?.[0] || null)}
                            />
                            {analyzeFile ? (
                                <div className="text-center">
                                    <FileVideo size={48} className="mx-auto text-indigo-500 mb-4" />
                                    <p className="font-medium">{analyzeFile.name}</p>
                                    <p className="text-xs text-slate-500 mt-1">{(analyzeFile.size / 1024 / 1024).toFixed(1)} MB</p>
                                </div>
                            ) : (
                                <div className="text-center">
                                    <Upload size={48} className="mx-auto text-slate-300 mb-4" />
                                    <p className="font-medium text-slate-600 dark:text-slate-400">Click to upload video</p>
                                    <p className="text-xs text-slate-400 mt-1">MP4, WebM up to 50MB</p>
                                </div>
                            )}
                        </div>

                        {/* Checkbox / Prompt */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Instructions (Optional)</label>
                            <textarea
                                value={analyzePrompt}
                                onChange={(e) => setAnalyzePrompt(e.target.value)}
                                placeholder="e.g. Describe the lighting changes in the second half..."
                                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none h-24"
                            />
                        </div>

                        {/* Action */}
                        <button
                            onClick={handleAnalyze}
                            disabled={!analyzeFile || appState === AppState.LOADING}
                            className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                                !analyzeFile || appState === AppState.LOADING
                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg hover:shadow-xl shadow-indigo-500/20'
                            }`}
                        >
                            {appState === AppState.LOADING ? (
                                <>
                                    <Loader2 className="animate-spin" size={18} />
                                    {uploadProgress > 0 && uploadProgress < 100 
                                        ? `Uploading ${Math.round(uploadProgress)}%` 
                                        : 'Analyzing...'}
                                </>
                            ) : (
                                <>
                                    <Sparkles size={18} />
                                    Analyze Video
                                </>
                            )}
                        </button>
                        
                        {errorMessage && (
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm border border-red-200 dark:border-red-800">
                                Error: {errorMessage}
                            </div>
                        )}
                    </div>
                 </div>

                 {/* Result */}
                 {analysisResult && (
                     <div className="w-full max-w-2xl mt-8 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-emerald-50/50 dark:bg-emerald-900/10">
                            <h3 className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                <Sparkles size={16} /> Analysis Result
                            </h3>
                        </div>
                        <div className="p-6 prose dark:prose-invert max-w-none text-sm">
                            <pre className="whitespace-pre-wrap font-sans">{analysisResult}</pre>
                        </div>
                     </div>
                 )}
               </div>            
            ) : activeTab === 'gallery' ? (
                <div className="max-w-6xl mx-auto w-full">
                    <AssetGallery userId={user?.id || 'default-user'} />
                </div>
            ) : (
                <div className="max-w-3xl mx-auto w-full">
                    {appState === AppState.IDLE && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <PromptForm
                                onGenerate={handleGenerate}
                                initialValues={initialFormValues}
                                selectedModel={selectedModel}
                            />
                        </div>
                    )}

                    {appState === AppState.LOADING && <LoadingIndicator />}

                    {appState === AppState.SUCCESS && videoUrl && (
                        <div className="animate-in zoom-in-95 duration-500">
                            <VideoResult
                                videoUrl={videoUrl}
                                onRetry={handleRetry}
                                onNewVideo={handleNewVideo}
                                onExtend={handleExtend}
                                canExtend={canExtend}
                            />
                        </div>
                    )}

                    {appState === AppState.ERROR && (
                        <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-center animate-in shake duration-300">
                            <p className="text-red-600 dark:text-red-400 font-medium mb-4">
                                {errorMessage || 'Something went wrong. Please try again.'}
                            </p>
                            <button
                                onClick={() => setAppState(AppState.IDLE)}
                                className="px-6 py-2 bg-red-100 dark:bg-red-600/20 hover:bg-red-200 dark:hover:bg-red-600/30 text-red-700 dark:text-red-400 rounded-lg transition-colors text-sm font-medium">
                                Try Again
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    </div>
  );
};
