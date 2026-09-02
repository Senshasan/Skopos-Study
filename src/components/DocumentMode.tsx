import { DocumentViewer } from './DocumentViewer';
import { StudyTools } from './StudyTools';
import { Document } from '../lib/db';
import { Flashcard, QuizQuestion } from '../hooks/useStudyTools';

interface DocumentModeProps {
  activeDoc: Document | null;
  visionProcessing: boolean;
  onAnalyzeImage: (url: string) => Promise<void>;
  isGenerating: boolean;
  isModelReady: boolean;
  onGenerateFlashcards: () => Promise<Flashcard[]>;
  onGenerateQuiz: () => Promise<QuizQuestion[]>;
  onGenerateSummary: () => Promise<string>;
}

export function DocumentMode({
  activeDoc,
  visionProcessing,
  onAnalyzeImage,
  isGenerating,
  isModelReady,
  onGenerateFlashcards,
  onGenerateQuiz,
  onGenerateSummary
}: DocumentModeProps) {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <DocumentViewer
          document={activeDoc}
          isAnalyzingImage={visionProcessing}
          onAnalyzeImage={onAnalyzeImage}
        />
      </div>
      <div style={{ width: '400px', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border)' }}>
        <StudyTools
          isGenerating={isGenerating}
          isModelReady={isModelReady}
          onGenerateFlashcards={onGenerateFlashcards}
          onGenerateQuiz={onGenerateQuiz}
          onGenerateSummary={onGenerateSummary}
        />
      </div>
    </div>
  );
}
