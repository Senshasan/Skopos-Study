import { useState, useCallback } from 'react';
import { StudyEngine } from '../lib/study-engine';
import { useWebLLM } from './useWebLLM';
import { getAllChunks } from '../lib/rag-engine';
import { StudyEngine } from '../lib/study-engine';
import { useWebLLM } from './useWebLLM';

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

export function useStudyTools(sendMessage: ReturnType<typeof useWebLLM>['sendMessage']) {
  const [isGenerating, setIsGenerating] = useState(false);

  const getContextText = async (text: string, documentId?: string) => {
    let contextText = text;
    if (documentId) {
      const chunks = await getAllChunks(documentId);
      if (chunks.length > 0) {
        // Simple random sampling for study tools to fit context window
        const shuffled = [...chunks].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 15); // ~15 * 250 words = ~3750 words
        contextText = selected.map(c => c.text).join('\n\n');
      }
    }
    // Hard limit to avoid OOM
    if (contextText.length > 30000) contextText = contextText.substring(0, 30000);
    return contextText;
  };

  const generateFlashcards = useCallback(async (text: string, documentId?: string): Promise<Flashcard[]> => {
    setIsGenerating(true);
    const contextText = await getContextText(text, documentId);
    let retries = 2;
    while (retries >= 0) {
      try {
        const prompt = StudyEngine.getFlashcardPrompt(contextText) + (retries < 2 ? "\n\nPlease ensure the output is strictly valid JSON." : "");
        const response = await sendMessage([{ role: 'user', content: prompt }]);
        
        // Clean up potential markdown formatting or prefix text
        let jsonStr = response;
        const match = response.match(/\[[\s\S]*\]/);
        if (match) {
          jsonStr = match[0];
        }
        
        return JSON.parse(jsonStr);
      } catch (err) {
        retries--;
        if (retries < 0) {
          setIsGenerating(false);
          throw new Error("Failed to generate valid flashcards after multiple attempts.");
        }
      }
    }
    setIsGenerating(false);
    return [];
  }, [sendMessage]);

  const generateQuiz = useCallback(async (text: string, difficulty: string = 'medium', documentId?: string): Promise<QuizQuestion[]> => {
    setIsGenerating(true);
    const contextText = await getContextText(text, documentId);
    let retries = 2;
    while (retries >= 0) {
      try {
        const prompt = StudyEngine.getQuizPrompt(contextText, difficulty) + (retries < 2 ? "\n\nPlease ensure the output is strictly valid JSON." : "");
        const response = await sendMessage([{ role: 'user', content: prompt }]);
        
        let jsonStr = response;
        const match = response.match(/\[[\s\S]*\]/);
        if (match) {
          jsonStr = match[0];
        }
        
        return JSON.parse(jsonStr);
      } catch (err) {
        retries--;
        if (retries < 0) {
          setIsGenerating(false);
          throw new Error("Failed to generate a valid quiz after multiple attempts.");
        }
      }
    }
    setIsGenerating(false);
    return [];
  }, [sendMessage]);

  const generateSummary = useCallback(async (text: string, style: 'brief' | 'detailed' | 'bullet' | 'eli5'): Promise<string> => {
    const prompt = StudyEngine.getSummaryPrompt(text, style);
    return await sendMessage([{ role: 'user', content: prompt }]);
  }, [sendMessage]);
  
  const explainProblem = useCallback(async (text: string): Promise<string> => {
    const prompt = StudyEngine.getProblemExplainerPrompt(text);
    return await sendMessage([{ role: 'user', content: prompt }]);
  }, [sendMessage]);

  return { isGenerating, generateFlashcards, generateQuiz, generateSummary, explainProblem };
}
