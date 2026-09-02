import { getDB, DocumentChunk } from './db';
import { v4 as uuidv4 } from 'uuid';

export function chunkText(text: string, maxWords: number = 250): string[] {
  // Semantic splitting by paragraphs first
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxWords * 5) { // rough char limit
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  
  // Secondary pass for huge paragraphs without newlines
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.split(/\s+/).length > maxWords * 1.5) {
      // split by sentences
      const sentences = chunk.match(/[^.!?]+[.!?]+/g) || [chunk];
      let subChunk = '';
      for (const sent of sentences) {
        if (subChunk.length + sent.length > maxWords * 5) {
          if (subChunk) finalChunks.push(subChunk.trim());
          subChunk = sent;
        } else {
          subChunk += (subChunk ? ' ' : '') + sent;
        }
      }
      if (subChunk) finalChunks.push(subChunk.trim());
    } else {
      finalChunks.push(chunk);
    }
  }

  return finalChunks;
}

export function cosineSimilarity(vecA: number[] | Float32Array, vecB: number[] | Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function storeChunks(documentId: string, chunksText: string[], embeddings: number[][]) {
  const db = await getDB();
  const tx = db.transaction('document_chunks', 'readwrite');
  
  for (let i = 0; i < chunksText.length; i++) {
    const chunk: DocumentChunk = {
      id: uuidv4(),
      documentId,
      text: chunksText[i],
      embedding: embeddings[i],
      chunkIndex: i
    };
    tx.store.put(chunk);
  }
  await tx.done;
}

export async function searchChunks(queryVector: number[] | Float32Array, documentIds: string[], topK: number = 3): Promise<DocumentChunk[]> {
  const db = await getDB();
  const tx = db.transaction('document_chunks', 'readonly');
  const index = tx.store.index('documentId');
  
  let allRelevantChunks: DocumentChunk[] = [];
  
  for (const docId of documentIds) {
    const chunks = await index.getAll(docId);
    allRelevantChunks = allRelevantChunks.concat(chunks);
  }

  // Calculate similarity and sort
  const scoredChunks = allRelevantChunks.map(chunk => ({
    chunk,
    score: cosineSimilarity(queryVector, chunk.embedding)
  }));

  scoredChunks.sort((a, b) => b.score - a.score);

  // Filter by threshold to avoid hallucinating on irrelevant matches
  const threshold = 0.45;
  return scoredChunks.filter(sc => sc.score > threshold).slice(0, topK).map(sc => sc.chunk);
}

export async function getAllChunks(documentId: string): Promise<DocumentChunk[]> {
  const db = await getDB();
  const tx = db.transaction('document_chunks', 'readonly');
  const index = tx.store.index('documentId');
  return index.getAll(documentId);
}
