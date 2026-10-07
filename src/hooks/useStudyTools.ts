import { useState, useCallback } from 'react';
import { StudyEngine } from '../lib/study-engine';
import { useWebLLM } from './useWebLLM';
import { getAllChunksForDocument, searchChunks } from '../lib/rag-engine';

export interface Flashcard {
  front: string;
  back: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

type SearchFn = (query: string, documentIds: string[], topK?: number) => Promise<{ text: string }[]>;

/**
 * Attempt to parse JSON from a model response, with a retry that asks the model to fix its output.
 */
const parseWithRetry = async (
  response: string,
  sendMessage: ReturnType<typeof useWebLLM>['sendMessage']
): Promise<any> => {
  // Try 1: extract JSON array directly
  const match = response.match(/\[[\s\S]*\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* fall through */ }
  }
  // Try 2: ask the model to fix its own output
  const fixPrompt = `The following is malformed JSON. Fix it and return ONLY the valid JSON array:\n${response}`;
  const fixed = await sendMessage([{ role: 'user', content: fixPrompt }]);
  const fixMatch = fixed.match(/\[[\s\S]*\]/);
  if (fixMatch) return JSON.parse(fixMatch[0]);
  throw new Error('Could not parse model output as JSON after retry');
};

export function useStudyTools(
  sendMessage: ReturnType<typeof useWebLLM>['sendMessage'],
  search?: SearchFn
) {
  const [isGenerating, setIsGenerating] = useState(false);

  /**
   * Get context text using targeted RAG search when available,
   * falling back to chunk sampling for document context.
   */
  const getContextForStudyTool = async (
    fallbackText: string,
    documentId: string | undefined,
    searchQuery: string
  ): Promise<string> => {
    if (!documentId) return fallbackText.substring(0, 30000);

    // Targeted RAG search if search function is available
    if (search) {
      const relevantChunks = await search(searchQuery, [documentId], 8);
      if (relevantChunks.length > 0) {
        return relevantChunks.map(c => c.text).join('\n\n');
      }
    }

    // Fallback: get all chunks and sample
    const chunks = await getAllChunksForDocument(documentId);
    if (chunks.length > 0) {
      const selected = chunks.slice(0, 15);
      return selected.map(c => c.text).join('\n\n');
    }

    // Last resort: use raw text
    let contextText = fallbackText;
    if (contextText.length > 30000) contextText = contextText.substring(0, 30000);
    return contextText;
  };

  /**
   * Get summary context: uses intro + conclusion heuristic (first N + last N chunks).
   */
  const getSummaryContext = async (
    fallbackText: string,
    documentId?: string
  ): Promise<string> => {
    if (!documentId) return fallbackText.substring(0, 30000);

    const allChunks = await getAllChunksForDocument(documentId);
    if (allChunks.length > 0) {
      // Sort by chunk index
      allChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      // Intro + conclusion heuristic
      const introChunks = allChunks.slice(0, 4);
      const outroChunks = allChunks.length > 4 ? allChunks.slice(-2) : [];
      const selected = [...introChunks, ...outroChunks];
      return selected.map(c => c.text).join('\n\n');
    }

    let contextText = fallbackText;
    if (contextText.length > 30000) contextText = contextText.substring(0, 30000);
    return contextText;
  };

  const generateFlashcards = useCallback(async (text: string, documentId?: string): Promise<Flashcard[]> => {
    setIsGenerating(true);
    try {
      const contextText = await getContextForStudyTool(text, documentId, 'key concepts definitions terms vocabulary');
      const prompt = StudyEngine.getFlashcardPrompt(contextText);
      const response = await sendMessage([{ role: 'user', content: prompt }]);
      return await parseWithRetry(response, sendMessage);
    } catch (err) {
      console.error('Failed to generate flashcards:', err);
      throw new Error("Failed to generate valid flashcards after multiple attempts.");
    } finally {
      setIsGenerating(false);
    }
  }, [sendMessage, search]);

  const generateQuiz = useCallback(async (text: string, difficulty: string = 'medium', documentId?: string): Promise<QuizQuestion[]> => {
    setIsGenerating(true);
    try {
      const contextText = await getContextForStudyTool(text, documentId, 'important facts details examples evidence');
      const prompt = StudyEngine.getQuizPrompt(contextText, difficulty);
      const response = await sendMessage([{ role: 'user', content: prompt }]);
      return await parseWithRetry(response, sendMessage);
    } catch (err) {
      console.error('Failed to generate quiz:', err);
      throw new Error("Failed to generate a valid quiz after multiple attempts.");
    } finally {
      setIsGenerating(false);
    }
  }, [sendMessage, search]);

  const generateSummary = useCallback(async (text: string, style: 'brief' | 'detailed' | 'bullet' | 'eli5', documentId?: string): Promise<string> => {
    setIsGenerating(true);
    try {
      const contextText = await getSummaryContext(text, documentId);
      const prompt = StudyEngine.getSummaryPrompt(contextText, style);
      return await sendMessage([{ role: 'user', content: prompt }]);
    } finally {
      setIsGenerating(false);
    }
  }, [sendMessage]);
  
  const explainProblem = useCallback(async (text: string): Promise<string> => {
    const prompt = StudyEngine.getProblemExplainerPrompt(text);
    return await sendMessage([{ role: 'user', content: prompt }]);
  }, [sendMessage]);

  return { isGenerating, generateFlashcards, generateQuiz, generateSummary, explainProblem };
}
