import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { UsageManager } from '../lib/usageManager';
import { useAuth } from '@/components/auth/AuthContextRefactored';

interface UseAiDictationProps {
  onResult: (text: string) => void;
  /** 
   * Mode selection for cost optimization:
   * - 'auto': Use free browser API first, fallback to Whisper if unsupported
   * - 'browser': Force browser Web Speech API (FREE but less accurate)
   * - 'whisper': Force OpenAI Whisper API (paid but most accurate)
   * - 'hybrid': Use browser for interim, Whisper for final polish (best quality)
   * 
   * If not specified, uses user's saved preference from settings
   */
  mode?: 'auto' | 'browser' | 'whisper' | 'hybrid';
  /** Skip GPT correction step to save costs (only applies to whisper/hybrid modes). Uses user's setting if not specified. */
  skipCorrection?: boolean;
  language?: string;
  /** Callback for interim results (real-time feedback) */
  onInterimResult?: (text: string) => void;
  /** Callback for status updates */
  onStatusChange?: (status: 'idle' | 'recording' | 'processing' | 'error') => void;
  /** Auto-stop after silence (in milliseconds). 0 = disabled (default). Recommended: 3000-5000ms if enabled */
  silenceTimeout?: number;
  /** Maximum recording duration in milliseconds. Default: 300000 (5 min) */
  maxDuration?: number;
}

export function useAiDictation({ 
  onResult, 
  mode,
  skipCorrection,
  language = 'en-US',
  onInterimResult,
  onStatusChange,
  silenceTimeout = 0, // Disabled by default - user controls when to stop
  maxDuration = 300000 // 5 minutes max
}: UseAiDictationProps) {
  const { user } = useAuth();
  
  // Use user's saved settings as defaults, with fallback to 'auto' and false
  const userMode = useMemo(() => 
    mode ?? (user?.capabilities?.dictationMode as 'auto' | 'browser' | 'whisper' | 'hybrid') ?? 'auto',
    [mode, user?.capabilities?.dictationMode]
  );
  const userSkipCorrection = useMemo(() => 
    skipCorrection ?? user?.capabilities?.skipCorrection ?? false,
    [skipCorrection, user?.capabilities?.skipCorrection]
  );
  
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimResult, setInterimResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  // Refs for MediaRecorder (Whisper mode)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Refs for Web Speech API (Browser mode)
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  
  // Refs for silence detection and auto-stop
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lastSoundTimeRef = useRef<number>(0);
  
  // Refs for callbacks to avoid stale closures and unnecessary re-renders
  const onResultRef = useRef(onResult);
  const onInterimResultRef = useRef(onInterimResult);
  
  // Update callback refs on every render
  useEffect(() => {
    onResultRef.current = onResult;
    onInterimResultRef.current = onInterimResult;
  });
  
  // Check if browser speech is supported (must check in useEffect for SSR safety)
  const [isBrowserSpeechSupported, setIsBrowserSpeechSupported] = useState(false);
  
  useEffect(() => {
    const supported = typeof window !== 'undefined' && 
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    setIsBrowserSpeechSupported(supported);
    console.log('[AiDictation] Browser speech support:', supported);
  }, []);
  
  // Determine effective mode based on user settings
  const effectiveMode = userMode === 'auto' 
    ? (isBrowserSpeechSupported ? 'browser' : 'whisper')
    : userMode;
  
  // Debug log mode changes
  useEffect(() => {
    console.log('[AiDictation] Mode config - userMode:', userMode, 'effectiveMode:', effectiveMode, 'browserSupported:', isBrowserSpeechSupported);
  }, [userMode, effectiveMode, isBrowserSpeechSupported]);

  // Notify status changes
  useEffect(() => {
    if (onStatusChange) {
      if (error) onStatusChange('error');
      else if (isProcessing) onStatusChange('processing');
      else if (isRecording) onStatusChange('recording');
      else onStatusChange('idle');
    }
  }, [isRecording, isProcessing, error, onStatusChange]);

  // Sync recording state ref
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  // Initialize Browser Speech Recognition
  // Note: We use refs for callbacks to avoid re-creating recognition on every parent render
  useEffect(() => {
    // Skip if not browser or hybrid mode
    if (effectiveMode !== 'browser' && effectiveMode !== 'hybrid') {
      console.log('[AiDictation] Skipping browser recognition init for mode:', effectiveMode);
      return;
    }
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('[AiDictation] SpeechRecognition API not available');
      return;
    }
    
    console.log('[AiDictation] Initializing browser speech recognition for mode:', effectiveMode);
    
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = language;
    // Improve recognition accuracy
    recognitionRef.current.maxAlternatives = 1;

    recognitionRef.current.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      setInterimResult(interimTranscript);
      // Send interim results to callback for real-time feedback (use ref for latest callback)
      if (onInterimResultRef.current && interimTranscript) {
        onInterimResultRef.current(interimTranscript);
      }

      if (finalTranscript) {
        console.log('[AiDictation] Browser recognition final result:', finalTranscript.substring(0, 50) + '...');
        // Reset silence timer on speech
        lastSoundTimeRef.current = Date.now();
        // Use ref for latest callback to avoid stale closure
        onResultRef.current(finalTranscript);
      }
    };

    recognitionRef.current.onerror = (event: any) => {
      console.error('[AiDictation] Speech recognition error:', event.error);
      const errorMessages: Record<string, string> = {
        'not-allowed': 'Microphone access denied. Please allow microphone access.',
        'no-speech': 'No speech detected. Please try again.',
        'audio-capture': 'No microphone found. Please check your device.',
        'network': 'Network error. Please check your connection.',
        'aborted': 'Recognition was cancelled.',
      };
      setError(errorMessages[event.error] || `Recognition error: ${event.error}`);
      if (event.error === 'not-allowed' || event.error === 'audio-capture') {
        setIsRecording(false);
      }
    };

    recognitionRef.current.onstart = () => {
      console.log('[AiDictation] Browser recognition started');
    };
    
    recognitionRef.current.onend = () => {
      console.log('[AiDictation] Browser recognition ended, isRecording:', isRecordingRef.current);
      if (isRecordingRef.current) {
        // Auto-restart if recording wasn't manually stopped (handles Chrome bug)
        try {
          console.log('[AiDictation] Auto-restarting recognition...');
          recognitionRef.current?.start();
        } catch (e) {
          console.error('[AiDictation] Failed to auto-restart:', e);
          setIsRecording(false);
        }
      }
    };
    
    console.log('[AiDictation] Browser recognition initialized successfully');
    
    return () => {
      if (recognitionRef.current) {
        console.log('[AiDictation] Cleaning up browser recognition');
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // May already be stopped
        }
        recognitionRef.current = null;
      }
    };
  }, [effectiveMode, language]); // Removed callback deps - using refs instead

  // Helper to cleanup timers
  const cleanupTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setRecordingDuration(0);
  }, []);

  // Start recording based on mode
  const startRecording = useCallback(async () => {
    setError(null);
    startTimeRef.current = Date.now();
    lastSoundTimeRef.current = Date.now();
    
    // Start duration tracking
    durationIntervalRef.current = setInterval(() => {
      setRecordingDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    
    // Set max duration timer
    if (maxDuration > 0) {
      maxDurationTimerRef.current = setTimeout(() => {
        console.log('Max duration reached, stopping recording');
        stopRecording();
      }, maxDuration);
    }
    
    if (effectiveMode === 'browser') {
      // Use FREE browser speech recognition
      console.log('[AiDictation] Starting browser recognition, ref exists:', !!recognitionRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsRecording(true);
          console.log('[AiDictation] Browser recognition start() called successfully');
        } catch (e: any) {
          console.error('[AiDictation] Failed to start browser recognition:', e);
          // Handle "already started" error gracefully
          if (e.message?.includes('already started')) {
            console.log('[AiDictation] Recognition was already started, setting recording state');
            setIsRecording(true);
          } else {
            setError('Failed to start speech recognition. Please try again.');
            cleanupTimers();
          }
        }
      } else {
        console.error('[AiDictation] Recognition ref is null - browser speech not initialized');
        setError('Speech recognition not available. Please refresh the page or try a different browser.');
        cleanupTimers();
      }
    } else {
      // Use Whisper (paid) or hybrid mode
      try {
        // Request high-quality audio for better transcription
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000, // Whisper optimal sample rate
            channelCount: 1, // Mono is better for speech
          } 
        });
        streamRef.current = stream;
        
        // Set up audio analysis for silence detection
        if (silenceTimeout > 0) {
          try {
            audioContextRef.current = new AudioContext();
            const source = audioContextRef.current.createMediaStreamSource(stream);
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            source.connect(analyserRef.current);
            
            // Monitor audio levels for silence detection
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            const checkAudioLevel = () => {
              if (!isRecordingRef.current || !analyserRef.current) return;
              
              analyserRef.current.getByteFrequencyData(dataArray);
              const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
              
              // If there's sound, reset the silence timer (threshold 5 = very sensitive to quiet speech)
              if (average > 5) {
                lastSoundTimeRef.current = Date.now();
              } else {
                // Check for silence duration
                const silenceDuration = Date.now() - lastSoundTimeRef.current;
                if (silenceDuration > silenceTimeout) {
                  console.log('Silence detected, stopping recording');
                  stopRecording();
                  return;
                }
              }
              
              requestAnimationFrame(checkAudioLevel);
            };
            requestAnimationFrame(checkAudioLevel);
          } catch (e) {
            console.warn('Could not set up silence detection:', e);
          }
        }
        
        // Determine best supported format
        const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
        const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
        
        const mediaRecorder = new MediaRecorder(stream, { 
          mimeType: supportedMimeType,
          audioBitsPerSecond: 128000 // Good quality without excessive file size
        });
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        mediaRecorder.onstop = async () => {
          setIsProcessing(true);
          cleanupTimers();
          
          // Close audio context
          if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
          }
          
          const audioBlob = new Blob(chunksRef.current, { type: supportedMimeType });
          
          // Check if we have valid audio
          if (audioBlob.size < 1000) {
            setError('Recording too short. Please try again.');
            setIsProcessing(false);
            streamRef.current?.getTracks().forEach(track => track.stop());
            return;
          }
          
          // Convert to Base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64String = (reader.result as string).split(',')[1];
            
            try {
              const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  audio: base64String,
                  skipCorrection: userSkipCorrection,
                  language: language.split('-')[0] // Send 'en' instead of 'en-US'
                })
              });
              
              if (response.ok) {
                const data = await response.json();
                if (data.text && data.text.trim()) {
                  console.log('[AiDictation] Whisper transcription result:', data.text.substring(0, 50) + '...');
                  // Use ref for latest callback
                  onResultRef.current(data.text);
                  setError(null);
                  
                  // Track Usage (Whisper)
                  const duration = (Date.now() - startTimeRef.current) / 1000;
                  UsageManager.trackUsage('whisper-1', 0, 0, false, false, user?.id, duration);
                } else {
                  setError('No speech detected. Please try again.');
                }
              } else {
                const errorData = await response.json().catch(() => ({}));
                setError(errorData.error || 'Transcription failed. Please try again.');
                console.error('[AiDictation] Transcription failed:', errorData);
              }
            } catch (err) {
              console.error('Error sending audio:', err);
              setError('Network error. Please check your connection.');
            } finally {
              setIsProcessing(false);
              // Stop all tracks to release microphone
              streamRef.current?.getTracks().forEach(track => track.stop());
            }
          };
          
          reader.onerror = () => {
            setError('Failed to process audio. Please try again.');
            setIsProcessing(false);
            streamRef.current?.getTracks().forEach(track => track.stop());
          };
        };

        // In hybrid mode, also start browser recognition for interim results
        if (effectiveMode === 'hybrid' && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            // May already be running
          }
        }

        // Record in chunks for better reliability
        mediaRecorder.start(1000);
        setIsRecording(true);
        console.log('[AiDictation] Whisper/hybrid mode recording started');
      } catch (err: any) {
        console.error('[AiDictation] Error accessing microphone:', err);
        const errorMessages: Record<string, string> = {
          'NotAllowedError': 'Microphone access denied. Please allow access in your browser settings.',
          'NotFoundError': 'No microphone found. Please connect a microphone.',
          'NotReadableError': 'Microphone is already in use by another application.',
        };
        setError(errorMessages[err.name] || 'Could not access microphone. Please try again.');
        cleanupTimers();
      }
    }
  }, [effectiveMode, userSkipCorrection, user?.id, maxDuration, silenceTimeout, cleanupTimers, language]);

  // Stop recording
  const stopRecording = useCallback(() => {
    console.log('[AiDictation] Stopping recording, mode:', effectiveMode);
    cleanupTimers();
    
    if (effectiveMode === 'browser') {
      if (recognitionRef.current) {
        console.log('[AiDictation] Stopping browser recognition');
        recognitionRef.current.stop();
        setIsRecording(false);
      }
    } else {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        console.log('[AiDictation] Stopping media recorder');
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
      // Also stop browser recognition in hybrid mode
      if (effectiveMode === 'hybrid' && recognitionRef.current) {
        console.log('[AiDictation] Stopping browser recognition (hybrid mode)');
        recognitionRef.current.stop();
      }
    }
    setInterimResult('');
  }, [effectiveMode, cleanupTimers]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // Clear error
  const clearError = useCallback(() => setError(null), []);

  return {
    isRecording,
    isProcessing,
    interimResult,
    startRecording,
    stopRecording,
    toggleRecording,
    // Expose info about current mode for UI
    currentMode: effectiveMode,
    isBrowserSupported: isBrowserSpeechSupported,
    /** Estimated cost per minute in USD */
    estimatedCostPerMinute: effectiveMode === 'browser' ? 0 : 0.006,
    /** Current error message if any */
    error,
    /** Clear the current error */
    clearError,
    /** Current recording duration in seconds */
    recordingDuration,
    /** Maximum recording duration in seconds */
    maxDurationSeconds: Math.floor(maxDuration / 1000),
  };
}
