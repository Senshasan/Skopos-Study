import { useState, useEffect, useRef, useCallback } from 'react';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | { type: string, text?: string, image_url?: string }[];
}

export function useWebLLM() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ text: string, progress: number } | null>(null);
  const [currentResponse, setCurrentResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const resolves = useRef<Record<string, (val: string) => void>>({});
  const rejects = useRef<Record<string, (err: any) => void>>({});

  useEffect(() => {
    workerRef.current = new Worker(new URL('../ai-worker.ts', import.meta.url), { type: 'module' });
    
    workerRef.current.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'INIT_PROGRESS') {
        setProgress(payload);
      } else if (type === 'READY') {
        setIsReady(true);
        setProgress(null);
      } else if (type === 'CHAT_CHUNK') {
        setCurrentResponse(prev => prev + payload.token);
      } else if (type === 'CHAT_COMPLETE') {
        setIsGenerating(false);
        if (resolves.current[payload.id]) {
          resolves.current[payload.id](payload.fullResponse);
          delete resolves.current[payload.id];
          delete rejects.current[payload.id];
        }
      } else if (type === 'ERROR') {
        setError(payload.error);
        setProgress(null);
        setIsReady(false);
        setIsGenerating(false);
        setCurrentResponse('');
        if (payload.id && rejects.current[payload.id]) {
          rejects.current[payload.id](new Error(payload.error));
          delete resolves.current[payload.id];
          delete rejects.current[payload.id];
        }
      }
    };

    return () => workerRef.current?.terminate();
  }, []);

  const initModel = useCallback((modelId: string, runtime: 'webllm' | 'transformers') => {
    setIsReady(false);
    setError(null);
    setProgress({ text: 'Starting initialization...', progress: 0 });
    workerRef.current?.postMessage({
      type: 'INIT_CUSTOM',
      payload: { modelId, runtime }
    });
  }, []);

  const sendMessage = useCallback((messages: ChatMessage[], generationConfig: any = {}): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!isReady) {
        reject(new Error("Model is not ready"));
        return;
      }
      setIsGenerating(true);
      setCurrentResponse('');
      setError(null);
      
      const id = crypto.randomUUID();
      resolves.current[id] = resolve;
      rejects.current[id] = reject;
      
      workerRef.current?.postMessage({
        type: 'CHAT_REQUEST',
        payload: { messages, generationConfig, id }
      });
    });
  }, [isReady]);

  return { isReady, isGenerating, progress, currentResponse, error, initModel, sendMessage };
}
