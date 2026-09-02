import { useState } from 'react';
import { BookOpen, HelpCircle, Layers, Loader2, ArrowRight, ArrowLeft, RefreshCw } from 'lucide-react';
import { Flashcard, QuizQuestion } from '../hooks/useStudyTools';
import ReactMarkdown from 'react-markdown';

interface StudyToolsProps {
  onGenerateFlashcards: () => Promise<Flashcard[]>;
  onGenerateQuiz: () => Promise<QuizQuestion[]>;
  onGenerateSummary: () => Promise<string>;
  isGenerating: boolean;
  isModelReady: boolean;
}

export function StudyTools({ onGenerateFlashcards, onGenerateQuiz, onGenerateSummary, isGenerating, isModelReady }: StudyToolsProps) {
  const [activeTab, setActiveTab] = useState<'flashcards' | 'quiz' | 'summary'>('flashcards');
  const [error, setError] = useState<string | null>(null);
  
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [quizState, setQuizState] = useState<{ [index: number]: string }>({});
  const [showResults, setShowResults] = useState(false);

  const [summary, setSummary] = useState<string>('');

  const handleGenFlashcards = async () => {
    if (!isModelReady) return setError("Model is not ready yet.");
    setError(null);
    try {
      const cards = await onGenerateFlashcards();
      setFlashcards(cards);
      setCurrentCardIndex(0);
      setIsFlipped(false);
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  const handleGenQuiz = async () => {
    if (!isModelReady) return setError("Model is not ready yet.");
    setError(null);
    try {
      const q = await onGenerateQuiz();
      setQuiz(q);
      setQuizState({});
      setShowResults(false);
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  const handleGenSummary = async () => {
    if (!isModelReady) return setError("Model is not ready yet.");
    setError(null);
    try {
      const s = await onGenerateSummary();
      setSummary(s);
    } catch (err: any) {
      setError(err.message || String(err));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg-base)', borderLeft: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', padding: '1rem', gap: '0.5rem', background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border)' }}>
        <button 
          className="btn" 
          style={{ flex: 1, background: activeTab === 'flashcards' ? 'var(--color-bg-surface-hover)' : 'transparent', color: activeTab === 'flashcards' ? 'white' : 'var(--color-text-muted)' }}
          onClick={() => setActiveTab('flashcards')}
        ><Layers size={16}/> Flashcards</button>
        <button 
          className="btn" 
          style={{ flex: 1, background: activeTab === 'quiz' ? 'var(--color-bg-surface-hover)' : 'transparent', color: activeTab === 'quiz' ? 'white' : 'var(--color-text-muted)' }}
          onClick={() => setActiveTab('quiz')}
        ><HelpCircle size={16}/> Quiz</button>
        <button 
          className="btn" 
          style={{ flex: 1, background: activeTab === 'summary' ? 'var(--color-bg-surface-hover)' : 'transparent', color: activeTab === 'summary' ? 'white' : 'var(--color-text-muted)' }}
          onClick={() => setActiveTab('summary')}
        ><BookOpen size={16}/> Summary</button>
      </div>

      {error && (
        <div style={{ margin: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-error)', borderRadius: 'var(--radius-md)', color: 'var(--color-error)' }}>
          <strong>Error: </strong> {error}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
        {isGenerating ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
            <Loader2 size={32} className="animate-pulse" style={{ marginBottom: '1rem', color: 'var(--color-primary)' }} />
            <p>AI is studying the document...</p>
          </div>
        ) : (
          <>
            {/* Flashcards View */}
            {activeTab === 'flashcards' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {flashcards.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center' }}>
                    <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Generate flashcards based on the current document context.</p>
                    <button className="btn btn-primary" onClick={handleGenFlashcards}>Generate Flashcards</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '2rem' }}>
                    
                    <div 
                      onClick={() => setIsFlipped(!isFlipped)}
                      style={{
                        width: '100%', maxWidth: '400px', aspectRatio: '3/2',
                        background: isFlipped ? 'var(--color-bg-surface-hover)' : 'var(--color-bg-surface)',
                        border: '1px solid var(--color-border-strong)',
                        borderRadius: 'var(--radius-xl)',
                        padding: '2rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        boxShadow: 'var(--shadow-lg)'
                      }}
                    >
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 500 }}>
                        {isFlipped ? flashcards[currentCardIndex].back : flashcards[currentCardIndex].front}
                      </h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <button className="btn-icon" disabled={currentCardIndex === 0} onClick={() => { setCurrentCardIndex(p => p - 1); setIsFlipped(false); }}>
                        <ArrowLeft size={24} />
                      </button>
                      <span style={{ color: 'var(--color-text-muted)' }}>{currentCardIndex + 1} / {flashcards.length}</span>
                      <button className="btn-icon" disabled={currentCardIndex === flashcards.length - 1} onClick={() => { setCurrentCardIndex(p => p + 1); setIsFlipped(false); }}>
                        <ArrowRight size={24} />
                      </button>
                    </div>

                    <button className="btn btn-secondary" onClick={handleGenFlashcards} style={{ marginTop: 'auto' }}><RefreshCw size={16}/> Regenerate</button>
                  </div>
                )}
              </div>
            )}

            {/* Quiz View */}
            {activeTab === 'quiz' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {quiz.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center' }}>
                    <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Test your knowledge with a generated quiz.</p>
                    <button className="btn btn-primary" onClick={handleGenQuiz}>Generate Quiz</button>
                  </div>
                ) : (
                  <div>
                    {quiz.map((q, idx) => (
                      <div key={idx} style={{ background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', marginBottom: '1rem', border: '1px solid var(--color-border)' }}>
                        <h4 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>{idx + 1}. {q.question}</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {q.options.map((opt, i) => {
                            const isSelected = quizState[idx] === opt;
                            const isCorrect = opt === q.correctAnswer;
                            let bgColor = 'var(--color-bg-base)';
                            let borderColor = 'var(--color-border)';
                            
                            if (showResults) {
                              if (isCorrect) { bgColor = 'rgba(16, 185, 129, 0.2)'; borderColor = 'var(--color-success)'; }
                              else if (isSelected && !isCorrect) { bgColor = 'rgba(239, 68, 68, 0.2)'; borderColor = 'var(--color-error)'; }
                            } else if (isSelected) {
                              bgColor = 'var(--color-bg-surface-hover)'; borderColor = 'var(--color-primary)';
                            }

                            return (
                              <button 
                                key={i}
                                disabled={showResults}
                                onClick={() => setQuizState(prev => ({ ...prev, [idx]: opt }))}
                                style={{
                                  textAlign: 'left', padding: '1rem', borderRadius: 'var(--radius-md)',
                                  background: bgColor, border: `1px solid ${borderColor}`,
                                  color: 'var(--color-text-main)', cursor: showResults ? 'default' : 'pointer',
                                  transition: 'all 0.2s'
                                }}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        {showResults && (
                          <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-md)', borderLeft: `3px solid ${quizState[idx] === q.correctAnswer ? 'var(--color-success)' : 'var(--color-error)'}` }}>
                            <div className="markdown-body"><ReactMarkdown>{q.explanation}</ReactMarkdown></div>
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {!showResults ? (
                      <button 
                        className="btn btn-primary" 
                        style={{ width: '100%', padding: '1rem', marginTop: '1rem' }}
                        onClick={() => setShowResults(true)}
                        disabled={Object.keys(quizState).length < quiz.length}
                      >
                        Submit Answers
                      </button>
                    ) : (
                      <button className="btn btn-secondary" style={{ width: '100%', padding: '1rem', marginTop: '1rem' }} onClick={handleGenQuiz}>
                        Generate New Quiz
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Summary View */}
            {activeTab === 'summary' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {summary === '' ? (
                  <div style={{ margin: 'auto', textAlign: 'center' }}>
                    <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Get a quick summary of the current document context.</p>
                    <button className="btn btn-primary" onClick={handleGenSummary}>Generate Summary</button>
                  </div>
                ) : (
                  <div>
                    <div style={{ background: 'var(--color-bg-surface)', padding: '2rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', marginBottom: '1rem' }}>
                      <div className="markdown-body"><ReactMarkdown>{summary}</ReactMarkdown></div>
                    </div>
                    <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleGenSummary}><RefreshCw size={16}/> Regenerate</button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
