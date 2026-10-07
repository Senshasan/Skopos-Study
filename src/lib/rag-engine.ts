import { getDB, DocumentChunk } from './db';
import { v4 as uuidv4 } from 'uuid';

/**
 * Paragraph-first semantic chunking with word-count targeting and overlap.
 * Splits on double newlines first, merges small paragraphs, splits oversized ones,
 * and keeps the last paragraph as overlap into the next chunk.
 */
export function chunkText(text: string, targetWords: number = 300, overlap: number = 50): string[] {
  // Split on paragraph boundaries and filter tiny fragments
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 20);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).length;

    if (currentWordCount + paraWords > targetWords && current.length > 0) {
      chunks.push(current.join('\n\n'));
      // Overlap: keep last paragraph as start of next chunk
      const overlapParas = current.slice(-1);
      const overlapWordCount = overlapParas.join(' ').split(/\s+/).length;
      current = [...overlapParas, para];
      currentWordCount = overlapWordCount + paraWords;
    } else {
      current.push(para);
      currentWordCount += paraWords;
    }
  }

  if (current.length > 0) chunks.push(current.join('\n\n'));

  // Secondary pass: split any remaining oversized chunks by sentence
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    const wordCount = chunk.split(/\s+/).length;
    if (wordCount > targetWords * 2) {
      const sentences = chunk.match(/[^.!?]+[.!?]+/g) || [chunk];
      let subChunk = '';
      let subWordCount = 0;
      for (const sent of sentences) {
        const sentWords = sent.trim().split(/\s+/).length;
        if (subWordCount + sentWords > targetWords && subChunk) {
          finalChunks.push(subChunk.trim());
          subChunk = sent;
          subWordCount = sentWords;
        } else {
          subChunk += (subChunk ? ' ' : '') + sent;
          subWordCount += sentWords;
        }
      }
      if (subChunk) finalChunks.push(subChunk.trim());
    } else {
      finalChunks.push(chunk);
    }
  }

  return finalChunks.length > 0 ? finalChunks : [text.trim()];
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

const SIMILARITY_THRESHOLD = 0.25;

export async function searchChunks(
  queryVector: number[] | Float32Array,
  documentIds: string[],
  topK: number = 5,
  threshold: number = SIMILARITY_THRESHOLD
): Promise<DocumentChunk[]> {
  const db = await getDB();
  const tx = db.transaction('document_chunks', 'readonly');
  const index = tx.store.index('documentId');
  
  let allRelevantChunks: DocumentChunk[] = [];
  
  for (const docId of documentIds) {
    const chunks = await index.getAll(docId);
    allRelevantChunks = allRelevantChunks.concat(chunks);
  }

  // Calculate similarity, filter by threshold, and sort
  const scoredChunks = allRelevantChunks
    .map(chunk => ({
      chunk,
      score: cosineSimilarity(queryVector, chunk.embedding)
    }))
    .filter(sc => sc.score >= threshold);

  scoredChunks.sort((a, b) => b.score - a.score);
  return scoredChunks.slice(0, topK).map(sc => sc.chunk);
}

export async function getAllChunksForDocument(documentId: string): Promise<DocumentChunk[]> {
  const db = await getDB();
  const tx = db.transaction('document_chunks', 'readonly');
  return tx.store.index('documentId').getAll(documentId);
}

// Legacy alias
export const getAllChunks = getAllChunksForDocument;
