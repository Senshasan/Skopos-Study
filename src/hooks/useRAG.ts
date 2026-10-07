import { useState, useEffect, useRef, useCallback } from 'react';
import { chunkText, storeChunks, searchChunks } from '../lib/rag-engine';

export function useRAG() {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ status: string, name?: string, progress?: number } | null>(null);
  const resolves = useRef<Record<string, (val: any) => void>>({});
  const rejects = useRef<Record<string, (err: any) => void>>({});

  useEffect(() => {
    workerRef.current = new Worker(new URL('../embedding-worker.ts', import.meta.url), { type: 'module' });
    
    workerRef.current.onmessage = (e) => {
      const { type, id, embedding, error, progress: prog } = e.data;
      if (type === 'PROGRESS') {
        setProgress(prog);
        if (prog.status === 'ready') {
          setIsReady(true);
        }
      } else if (type === 'EMBED_RESULT') {
        if (resolves.current[id]) {
          resolves.current[id](embedding);
          delete resolves.current[id];
          delete rejects.current[id];
        }
      } else if (type === 'ERROR') {
        if (rejects.current[id]) {
          rejects.current[id](new Error(error));
          delete resolves.current[id];
          delete rejects.current[id];
        }
      }
    };

    // Keep it alive
    return () => workerRef.current?.terminate();
  }, []);

  const getEmbedding = useCallback((text: string): Promise<number[]> => {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      resolves.current[id] = resolve;
      rejects.current[id] = reject;
      workerRef.current?.postMessage({ type: 'EMBED', text, id });
    });
  }, []);

  const getEmbeddingBatch = useCallback((texts: string[]): Promise<number[][]> => {
    return Promise.all(texts.map(text => getEmbedding(text)));
  }, [getEmbedding]);

  const indexDocument = useCallback(async (documentId: string, text: string) => {
    setIsProcessing(true);
    try {
      const chunks = chunkText(text, 300, 50);
      const embeddings: number[][] = [];
      // Batch requests to avoid overwhelming the worker message queue for huge documents
      const batchSize = 10;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const batchEmbeddings = await getEmbeddingBatch(batch);
        embeddings.push(...batchEmbeddings);
      }
      await storeChunks(documentId, chunks, embeddings);
    } catch (err) {
      console.error("Failed to index document", err);
    } finally {
      setIsProcessing(false);
    }
  }, [getEmbeddingBatch]);

  const search = useCallback(async (query: string, documentIds: string[], topK: number = 5) => {
    const queryEmbedding = await getEmbedding(query);
    const results = await searchChunks(queryEmbedding, documentIds, topK);
    return results;
  }, [getEmbedding]);

  return { isReady, isProcessing, progress, indexDocument, search, getEmbedding };
}
