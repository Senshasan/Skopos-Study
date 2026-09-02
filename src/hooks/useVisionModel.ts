import { useState, useEffect, useRef, useCallback } from 'react';

export function useVisionModel() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ status: string, name?: string, progress?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolves = useRef<Record<string, (val: string) => void>>({});
  const rejects = useRef<Record<string, (err: any) => void>>({});

  useEffect(() => {
    initWorker();
    // Cleanup on unmount
    return () => workerRef.current?.terminate();
  }, []);

  const initWorker = () => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../vision-worker.ts', import.meta.url), { type: 'module' });
      workerRef.current.onmessage = (e) => {
        const { type, id, description, error: err, progress: prog } = e.data;
        if (type === 'PROGRESS') {
          setProgress(prog);
          if (prog.status === 'ready') {
            setIsReady(true);
            setProgress(null);
          }
        } else if (type === 'VISION_RESULT') {
          setIsProcessing(false);
          if (resolves.current[id]) {
            resolves.current[id](description);
            delete resolves.current[id];
            delete rejects.current[id];
          }
        } else if (type === 'ERROR') {
          setError(err);
          setIsProcessing(false);
          if (id && rejects.current[id]) {
            rejects.current[id](new Error(err));
            delete resolves.current[id];
            delete rejects.current[id];
          }
        }
      };
      workerRef.current.postMessage({ type: 'INIT' });
    }
  };

  const analyzeImage = useCallback((imageUrl: string, prompt?: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) initWorker();
      setIsProcessing(true);
      setError(null);
      
      const id = crypto.randomUUID();
      resolves.current[id] = resolve;
      rejects.current[id] = reject;
      
      workerRef.current?.postMessage({
        type: 'DESCRIBE_IMAGE',
        imageUrl,
        prompt,
        id
      });
    });
  }, []);

  const unload = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setIsReady(false);
    setProgress(null);
  }, []);

  return { isReady, isProcessing, progress, error, analyzeImage, unload };
}
