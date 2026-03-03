import { useState, useRef, useCallback, useEffect } from 'react';

interface UseStandardDictationProps {
  onResult: (text: string) => void;
  language?: string;
}

export function useStandardDictation({ onResult, language = 'en-US' }: UseStandardDictationProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [interimResult, setInterimResult] = useState('');
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);

  // Sync ref
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    // browser compatibility check
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = language;

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

        if (finalTranscript) {
            onResult(finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        if (event.error === 'not-allowed') {
             setIsRecording(false);
        }
      };
      
      recognitionRef.current.onend = () => {
         // Auto restart if it wasn't manually stopped (optional, behavior depends on UX preference)
         // For now, let's treat end as stop.
         if(isRecordingRef.current) {
             setIsRecording(false);
         }
      };
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [language, onResult]); // Intentionally not including isRecording to avoid re-binding

  const startRecording = useCallback(() => {
    if (recognitionRef.current) {
      // Clean start
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch(e) {
        console.error("Failed to start recognition", e);
      }
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
        recognitionRef.current.stop();
        setIsRecording(false);
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    interimResult,
    isProcessing: false, // Standard dictation is usually instant/local, no processing loading state needed
    startRecording,
    stopRecording,
    toggleRecording,
    isSupported: !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  };
}
