import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { 
    Activity, Volume2, 
    Square, MessageSquare, History, ArrowUp, Plus, Trash2 
} from 'lucide-react';

// --- Types ---
interface ToolFunction {
    name: string;
    description: string;
}

type AudioMode = 'realtime' | 'tts';
type Provider = 'openai' | 'google';

// Open AI Voices
const OPENAI_VOICES = [
    { id: 'alloy', name: 'Alloy (Neutral-female)' },
    { id: 'echo', name: 'Echo (Neutral-male)' },
    { id: 'fable', name: 'Fable (British-male)' },
    { id: 'onyx', name: 'Onyx (Deep-male)' },
    { id: 'nova', name: 'Nova (Energetic-female)' },
    { id: 'shimmer', name: 'Shimmer (Resonant-female)' }
];

// Google Voices (Gemini Native)
const GOOGLE_VOICES = [
    { id: 'Puck', name: 'Puck' },
    { id: 'Charon', name: 'Charon' },
    { id: 'Kore', name: 'Kore' },
    { id: 'Fenrir', name: 'Fenrir' },
    { id: 'Aoede', name: 'Aoede' }
];

export const LiveStudio: React.FC = () => {
    // --- State ---
    const [mode, setMode] = useState<AudioMode>('realtime');
    const [provider, setProvider] = useState<Provider>('openai');
    
    // Realtime State
    const [isActive, setIsActive] = useState(false);
    const [micPermission, setMicPermission] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>("Ready to create");
    
    // TTS State
    const [ttsText, setTtsText] = useState('');
    const [ttsLoading, setTtsLoading] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    // Settings
    const [voice, setVoice] = useState('alloy');
    const [model, setModel] = useState('gpt-4o-realtime-preview');
    const [instructions, setInstructions] = useState('You are a helpful assistant.');
    const [speed, setSpeed] = useState(1.0);
    const [turnDetection, setTurnDetection] = useState<'normal' | 'semantic' | 'disabled'>('normal');
    
    // Functions
    const [tools, setTools] = useState<ToolFunction[]>([]);

    // --- Refs ---
    // Use 'any' type to avoid strict TS conflicts with dynamic SDK types
    const sessionRef = useRef<any>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    
    // --- Effects ---
    useEffect(() => {
        // Reset voice selection when provider changes to valid default
        if (provider === 'openai' && !OPENAI_VOICES.find(v => v.id === voice)) {
            setVoice('alloy');
            setModel('gpt-4o-realtime-preview');
        } else if (provider === 'google' && !GOOGLE_VOICES.find(v => v.id === voice)) {
            setVoice('Puck');
            setModel('gemini-2.0-flash-exp');
        }
    }, [provider]);

    useEffect(() => {
        checkMic();
        return () => stopSession();
    }, []);

    const checkMic = async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            setMicPermission(true);
        } catch {
            setMicPermission(false);
        }
    };

    // --- Actions ---

    const startSession = async () => {
        if (provider === 'google') {
            await startGeminiSession();
        } else {
            // OpenAI Realtime Mock (Client-side key required for real WebSocket, using simulate for demo unless configured)
            setStatusMessage("OpenAI Realtime requires Backend WebSocket Relay. Switching to Gemini for demo.");
            setProvider('google');
            setTimeout(() => startGeminiSession(), 1000);
        }
    };

    const startGeminiSession = async () => {
        if (isActive) return;
        
        setStatusMessage("Connecting...");
        try {
             const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
             if (!apiKey) throw new Error("API Key missing");
             
             const ai = new GoogleGenAI({ apiKey });
             
             // Initialize Audio Contexts
             const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
             const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
             inputAudioContextRef.current = inputCtx;
             outputAudioContextRef.current = outputCtx;

             // Connect
             const session = await ai.live.connect({
                 model: 'gemini-2.0-flash-exp',
                 config: {
                     responseModalities: [Modality.AUDIO],
                     speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
                     systemInstruction: { parts: [{ text: instructions }] },
                     // Add tools config here if needed, mapped from 'tools' state
                 },
                 callbacks: {
                     onmessage: (msg: LiveServerMessage) => {
                         // Handle incoming audio
                         if (msg.serverContent?.modelTurn?.parts) {
                             for (const part of msg.serverContent.modelTurn.parts) {
                                 if (part.inlineData && part.inlineData.data) {
                                     playAudioChunk(part.inlineData.data, outputAudioContextRef.current!);
                                 }
                             }
                         }
                     }
                 }
             });
             
             sessionRef.current = session;
             
             setIsActive(true);
             setStatusMessage("Connected. Listening...");

             // Setup Mic Stream
             await setupAudioInput(session, inputCtx);

        } catch (e: any) {
            console.error('Connection failed:', e);
            setStatusMessage(`Error: ${e.message}`);
            setIsActive(false);
        }
    };

    const setupAudioInput = async (session: any, inputCtx: AudioContext) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
                if (!sessionRef.current) return;
                
                const inputData = e.inputBuffer.getChannelData(0);
                // Simple downsampling/conversion if needed, but 16kHz context handles rate.
                // We just need base64 PCM 16 bit usually, or Float32 depending on what Gemini expects.
                // Gemini supports raw PCM. Let's send regular base64 of the buffer.
                
                // Convert float32 to int16 for efficient transport/compatibility
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                
                // Convert to base64
                let binary = '';
                const bytes = new Uint8Array(pcm16.buffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64 = btoa(binary);

                // Send to session
                try {
                    // Check if send method exists (it should on LiveSession)
                     session.send({ realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm", data: base64 }] } });
                } catch(err) {
                    console.error("Error sending audio frame", err);
                }
            };
            
            source.connect(processor);
            processor.connect(inputCtx.destination);
            
            sourceRef.current = source;
            processorRef.current = processor;
        } catch (e) {
            console.error("Audio Input Setup Error", e);
        }
    };

    const playAudioChunk = (base64: string, ctx: AudioContext) => {
        // Decode Base64 to ArrayBuffer
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        
        // Create Audio Buffer (assuming 24kHz output from Gemini)
        const float32 = new Float32Array(bytes.length / 2);
        const dataView = new DataView(bytes.buffer);
        
        for (let i = 0; i < bytes.length / 2; i++) {
            const int16 = dataView.getInt16(i * 2, true);
            float32[i] = int16 / 32768.0;
        }

        const buffer = ctx.createBuffer(1, float32.length, 24000);
        buffer.copyToChannel(float32, 0);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
    };

    const stopSession = () => {
        setIsActive(false);
        setStatusMessage("Session ended");
        
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (sourceRef.current) {
            sourceRef.current.disconnect(); 
            sourceRef.current = null;
        }
        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') inputAudioContextRef.current.close();
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') outputAudioContextRef.current.close();
        
        if (sessionRef.current) {
             // Try close if available
             try { sessionRef.current.close(); } catch {}
             sessionRef.current = null;
        }
    };

    const handleGenerateTTS = async () => {
        if (!ttsText) return;
        setTtsLoading(true);
        setAudioUrl(null);
        
        try {
            if (provider === 'openai') {
                const res = await fetch('/api/audio/speech', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        text: ttsText, 
                        model: model === 'tts-1-hd' ? 'tts-1-hd' : 'tts-1',
                        voice, 
                        speed 
                    })
                });
                if (!res.ok) throw new Error('TTS Failed');
                const blob = await res.blob();
                setAudioUrl(URL.createObjectURL(blob));
            } else {
                alert("Gemini TTS integration pending backend update. Switching to OpenAI for demo.");
            }
        } catch (e) {
            console.error(e);
            alert("Failed to generate speech");
        } finally {
            setTtsLoading(false);
        }
    };
    
    const addMockFunction = () => {
        const newTool = {
            name: "get_weather",
            description: "Get current weather in a location"
        };
        setTools([...tools, newTool]);
    };

    const removeTool = (index: number) => {
        const newTools = [...tools];
        newTools.splice(index, 1);
        setTools(newTools);
    };

    // --- Render ---

    return (
        <div className="flex h-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col relative bg-slate-50 dark:bg-slate-950">
                {/* Header/Tabs */}
                <div className="absolute top-4 left-4 z-10 flex gap-2">
                    <span className="font-bold text-lg mr-4 p-1">Audio</span>
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-1 flex border border-slate-200 dark:border-slate-800 shadow-sm">
                        <button 
                            onClick={() => setMode('realtime')}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${mode === 'realtime' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                        >
                            Realtime
                        </button>
                        <button 
                            onClick={() => setMode('tts')}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${mode === 'tts' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                        >
                            Text to speech
                        </button>
                    </div>
                </div>

                {/* Right Header Controls */}
                <div className="absolute top-4 right-4 z-10 flex gap-4 text-slate-500 dark:text-slate-400">
                     <div className="flex items-center gap-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-full cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm">
                        <span className={`w-2 h-2 rounded-full ${provider === 'openai' ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                        <select 
                            value={provider} 
                            onChange={(e) => setProvider(e.target.value as Provider)}
                            className="bg-transparent border-none outline-none text-slate-700 dark:text-slate-200 cursor-pointer text-xs uppercase font-bold"
                        >
                            <option value="openai">OpenAI</option>
                            <option value="google">Gemini</option>
                        </select>
                     </div>
                     <button className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white px-3 py-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"><History size={16} /> History</button>
                </div>

                {/* Mode: Realtime */}
                {mode === 'realtime' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8">
                        {isActive ? (
                            <div className="flex flex-col items-center gap-8 animate-in fade-in zoom-in-95 duration-500">
                                <div className="relative">
                                    <div className="w-32 h-32 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center animate-pulse">
                                        <Activity className="w-12 h-12 text-blue-500" />
                                    </div>
                                    <div className="absolute -inset-4 border border-blue-500/30 rounded-full animate-ping opacity-20"></div>
                                </div>
                                <div className="text-center space-y-2">
                                    <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">Listening...</h3>
                                    <p className="text-slate-500 dark:text-slate-400">{statusMessage}</p>
                                </div>
                                <button 
                                    onClick={stopSession}
                                    className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full font-medium transition-colors flex items-center gap-2 shadow-lg"
                                >
                                    <Square size={20} fill="currentColor" /> Stop session
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-6 max-w-lg text-center animate-in fade-in duration-500">
                                <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm">
                                    <Activity className="w-8 h-8 text-slate-400" />
                                </div>
                                <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">Create a realtime prompt</h1>
                                
                                <button 
                                    onClick={() => !micPermission ? checkMic() : startSession()}
                                    className="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-black rounded-full font-medium hover:opacity-90 transition-all flex items-center gap-2 shadow-lg"
                                >
                                    <MessageSquare size={18} /> {micPermission ? 'Start session' : 'Enable microphone'}
                                </button>

                                <div className="flex flex-wrap justify-center gap-2 mt-4">
                                    {[
                                        { label: "Friendly assistant", text: "You are a friendly and helpful AI assistant." },
                                        { label: "Language tutor", text: "You are a patient language tutor helping the user practice speaking." },
                                        { label: "Debate partner", text: "You are a skilled debate partner. Challenge my ideas respectfully." }
                                    ].map(item => (
                                        <span 
                                            key={item.label}
                                            onClick={() => setInstructions(item.text)}
                                            className="px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors shadow-sm"
                                        >
                                            {item.label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Mode: TTS */}
                {mode === 'tts' && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
                         {audioUrl ? (
                             <div className="w-full max-w-md bg-white dark:bg-slate-900 p-6 rounded-2xl flex flex-col items-center gap-4 border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 shadow-lg">
                                <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mb-2">
                                    <Volume2 size={32} />
                                </div>
                                <h3 className="text-lg font-medium text-slate-900 dark:text-white">Audio Generated</h3>
                                <audio controls src={audioUrl} className="w-full mt-2" autoPlay />
                                <button 
                                    onClick={() => setAudioUrl(null)}
                                    className="mt-4 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                                >
                                    Generate New
                                </button>
                             </div>
                         ) : (
                             <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-4 opacity-50">
                                 <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-xl flex items-center justify-center border border-slate-200 dark:border-slate-800">
                                    <Activity size={24} />
                                 </div>
                                 <p>{ttsLoading ? 'Generating speech...' : 'Generated speech will appear here'}</p>
                             </div>
                         )}

                         <div className="absolute bottom-8 w-full max-w-3xl px-4">
                            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 focus-within:border-slate-300 dark:focus-within:border-slate-700 transition-colors shadow-lg">
                                <textarea 
                                    value={ttsText}
                                    onChange={(e) => setTtsText(e.target.value)}
                                    placeholder="Enter your message..." 
                                    rows={3}
                                    className="w-full bg-transparent border-none outline-none text-sm resize-none mb-2 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600"
                                />
                                <div className="flex justify-end">
                                    <button 
                                        onClick={handleGenerateTTS}
                                        disabled={!ttsText || ttsLoading}
                                        className="p-2 bg-slate-900 dark:bg-white text-white dark:text-black rounded-full hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <ArrowUp size={18} />
                                    </button>
                                </div>
                            </div>
                         </div>
                    </div>
                )}
            </div>

            {/* Sidebar Settings */}
            <div className="w-80 bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 p-4 space-y-6 overflow-y-auto">
                <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 block">Model</label>
                    <div className="relative">
                        <select 
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 appearance-none pointer-events-auto text-slate-900 dark:text-slate-200"
                        >
                            {provider === 'openai' ? (
                                <>
                                    <option value="gpt-4o-realtime-preview">gpt-4o-realtime-preview</option>
                                    <option value="gpt-4o-mini-realtime-preview">gpt-4o-mini-realtime-preview</option>
                                    {mode === 'tts' && <option value="tts-1">tts-1 (Standard)</option>}
                                    {mode === 'tts' && <option value="tts-1-hd">tts-1-hd (High Def)</option>}
                                </>
                            ) : (
                                <>
                                    <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash</option>
                                    <option value="gemini-2.0-pro-exp">Gemini 2.0 Pro</option>
                                </>
                            )}
                        </select>
                         {/* Custom Arrow */}
                         <div className="absolute right-3 top-2.5 pointer-events-none text-slate-500">
                             <ArrowUp size={12} className="rotate-180" />
                         </div>
                    </div>
                </div>

                <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 block">
                        Instructions
                    </label>
                    <textarea 
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm min-h-[100px] outline-none focus:border-blue-500 resize-none text-slate-900 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-600"
                        placeholder="System instructions..."
                    />
                </div>

                <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 block">
                        Voice
                    </label>
                    <div className="relative">
                        <select 
                            value={voice} 
                            onChange={(e) => setVoice(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 appearance-none text-slate-900 dark:text-slate-200"
                        >
                            {(provider === 'openai' ? OPENAI_VOICES : GOOGLE_VOICES).map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                        <div className="absolute right-3 top-2.5 pointer-events-none text-slate-500">
                             <ArrowUp size={12} className="rotate-180" />
                         </div>
                    </div>
                </div>

                {mode === 'realtime' && (
                    <>
                        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                             <div className="flex items-center justify-between">
                                <label className="text-sm text-slate-700 dark:text-slate-300">Turn Detection</label>
                                <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-0.5 border border-slate-200 dark:border-slate-800">
                                    {['Normal', 'Semantic', 'Disabled'].map(t => (
                                        <button 
                                            key={t}
                                            onClick={() => setTurnDetection(t.toLowerCase() as any)}
                                            className={`px-2 py-1 text-[10px] rounded-md transition-colors ${turnDetection === t.toLowerCase() ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-400'}`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                             </div>
                             
                             <div>
                                <div className="flex justify-between text-xs text-slate-500 mb-1">
                                    <span>Threshold</span>
                                    <span>0.50</span>
                                </div>
                                <input type="range" className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer" />
                             </div>
                             <div>
                                <div className="flex justify-between text-xs text-slate-500 mb-1">
                                    <span>Silence duration</span>
                                    <span>500ms</span>
                                </div>
                                <input type="range" className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer" />
                             </div>
                        </div>

                        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 block">
                                Functions
                            </label>
                            
                            {tools.length > 0 && (
                                <div className="space-y-2 mb-3">
                                    {tools.map((tool, i) => (
                                        <div key={i} className="flex items-center justify-between bg-slate-100 dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-sm">
                                            <span className="font-mono text-xs dark:text-slate-300">{tool.name}</span>
                                            <button onClick={() => removeTool(i)} className="text-slate-400 hover:text-red-500"><Trash2 size={14}/></button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <button 
                                onClick={addMockFunction}
                                className="w-full py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 transition-colors"
                            >
                                <Plus size={14} /> Add Function
                            </button>
                        </div>
                    </>
                )}

                {mode === 'tts' && (
                    <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                        <div>
                            <div className="flex justify-between text-xs text-slate-500 mb-1">
                                <span>Speed</span>
                                <span>{speed.toFixed(2)}x</span>
                            </div>
                            <input 
                                type="range" 
                                min="0.25" 
                                max="4.0" 
                                step="0.25" 
                                value={speed} 
                                onChange={(e) => setSpeed(Number(e.target.value))}
                                className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                            />
                        </div>
                         
                         <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
                                Response Format
                            </label>
                            <div className="relative">
                                <select className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 appearance-none text-slate-900 dark:text-slate-200">
                                    <option>MP3</option>
                                    <option>AAC</option>
                                    <option>WAV</option>
                                    <option>FLAC</option>
                                </select>
                                <div className="absolute right-3 top-2.5 pointer-events-none text-slate-500">
                                    <ArrowUp size={12} className="rotate-180" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
