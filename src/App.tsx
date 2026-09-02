import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { DocumentMode } from './components/DocumentMode';
import { Onboarding } from './components/Onboarding';
import { SettingsPanel } from './components/SettingsPanel';
import { UploadZone } from './components/UploadZone';

import { useGPUDetection } from './hooks/useGPUDetection';
import { useWebLLM } from './hooks/useWebLLM';
import { useVisionModel } from './hooks/useVisionModel';
import { useDocuments } from './hooks/useDocuments';
import { useConversations } from './hooks/useConversations';
import { useStudyTools } from './hooks/useStudyTools';
import { useRAG } from './hooks/useRAG';

import { getRecommendedModel, resolveModelId, TEXT_MODELS } from './lib/model-registry';

export default function App() {
  const { capabilities, isDetecting } = useGPUDetection();
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [currentModelId, setCurrentModelId] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'document'>('chat');

  const { isReady: llmReady, isGenerating, progress: llmProgress, currentResponse, error: llmError, initModel, sendMessage } = useWebLLM();
  const { isReady: visionReady, isProcessing: visionProcessing, progress: visionProgress, analyzeImage } = useVisionModel();

  const { search, indexDocument } = useRAG();
  const { documents, activeDocumentId, setActiveDocumentId, isUploading, isIndexing, uploadFile, deleteDocument } = useDocuments(indexDocument);
  const { conversations, activeConversationId, setActiveConversationId, activeConversation, createConversation, addMessage, deleteConversation } = useConversations();

  const studyTools = useStudyTools(sendMessage);

  // Auto-select recommended model based on capabilities
  useEffect(() => {
    if (capabilities && !hasOnboarded) {
      const rec = getRecommendedModel(capabilities);
      setCurrentModelId(rec.id);
    }
  }, [capabilities, hasOnboarded]);

  const handleOnboardingComplete = (selectedModelId: string) => {
    setCurrentModelId(selectedModelId);
    setHasOnboarded(true);
    const modelConfig = TEXT_MODELS.find(m => m.id === selectedModelId)!;
    // Resolve to f32 fallback if GPU doesn't support shader-f16
    const resolvedId = resolveModelId(modelConfig, capabilities!);
    initModel(resolvedId, modelConfig.runtime);
  };

  const handleModelChange = (modelId: string) => {
    setCurrentModelId(modelId);
    const modelConfig = TEXT_MODELS.find(m => m.id === modelId)!;
    // Resolve to f32 fallback if GPU doesn't support shader-f16
    const resolvedId = resolveModelId(modelConfig, capabilities!);
    initModel(resolvedId, modelConfig.runtime);
  };

  const handleSendMessage = async (text: string) => {
    if (!activeConversationId) {
      const conv = await createConversation(currentModelId, text.slice(0, 30));
      _sendMessageToEngine(text, conv.id);
    } else {
      _sendMessageToEngine(text, activeConversationId);
    }
  };

  const _sendMessageToEngine = async (text: string, convId: string) => {
    await addMessage(convId, 'user', text);

    const activeDoc = documents.find(d => d.id === activeDocumentId);
    let systemPrompt = "You are Skopos Study, a helpful, precise, and encouraging AI study assistant.";

    if (activeDoc && activeDoc.type !== 'image') {
      const relevantChunks = await search(text, [activeDoc.id]);
      console.log('RAG chunks:', relevantChunks.length, relevantChunks);
      if (relevantChunks.length > 0) {
        systemPrompt += `\n\nBelow are relevant excerpts from the student's study material. Please base your answers heavily on this context to ensure you are aligning with what they are studying:\n\n=== STUDY MATERIAL EXCERPTS ===\n`;
        relevantChunks.forEach(chunk => {
          systemPrompt += chunk.text + "\n---\n";
        });
        systemPrompt += "=== END OF EXCERPTS ===\n";
      }
    } else if (activeDoc && activeDoc.type === 'image') {
      systemPrompt += `\n\nThe user is currently looking at an image document named "${activeDoc.name}".`;
      if (activeDoc.extractedText && activeDoc.extractedText !== '[Image Document - Analyze with AI to extract description]') {
        systemPrompt += `\n\nImage AI Analysis: ${activeDoc.extractedText}`;
      }
    }

    const conv = conversations.find(c => c.id === convId);
    const history = conv ? conv.messages.slice(-10).map(m => ({ role: m.role, content: m.content })) : [];

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: text },
    ];

    try {
      const response = await sendMessage(messages as any);
      await addMessage(convId, 'assistant', response);
    } catch (err) {
      console.error("Chat generation failed", err);
    }
  };

  const activeDoc = documents.find(d => d.id === activeDocumentId) || null;

  if (isDetecting || !capabilities) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-base)' }}>
        Probing Hardware...
      </div>
    );
  }

  return (
    <div className="app-container">
      {!hasOnboarded && (
        <Onboarding
          capabilities={capabilities}
          recommendedModel={getRecommendedModel(capabilities)}
          onComplete={handleOnboardingComplete}
        />
      )}

      {llmProgress && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--color-bg-surface)', padding: '2rem', borderRadius: 'var(--radius-lg)', textAlign: 'center', maxWidth: '400px' }}>
            <h3>{llmProgress.text}</h3>
            {llmProgress.text.includes('Loading GPU') && (
              <p style={{ color: 'var(--color-warning)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Compiling shaders. This is a heavy operation and may briefly freeze your browser. Please wait...
              </p>
            )}
            <div style={{ width: '300px', height: '8px', background: 'var(--color-bg-base)', borderRadius: '4px', margin: '1rem auto', overflow: 'hidden' }}>
              <div style={{ width: `${((llmProgress.progress || 0) * 100).toFixed(0)}%`, height: '100%', background: 'var(--color-primary)', transition: 'width 0.2s' }} />
            </div>
          </div>
        </div>
      )}

      {llmError && (
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', background: 'var(--color-error)', color: 'white', padding: '1rem', borderRadius: 'var(--radius-md)', zIndex: 100, boxShadow: 'var(--shadow-lg)' }}>
          <h4 style={{ margin: '0 0 0.5rem 0' }}>Initialization Error</h4>
          <p style={{ margin: 0, fontSize: '0.9rem', maxWidth: '300px' }}>{llmError}</p>
        </div>
      )}

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          capabilities={capabilities}
          currentModelId={currentModelId}
          onModelChange={handleModelChange}
        />
      )}

      {showUpload && (
        <UploadZone
          isUploading={isUploading}
          onUpload={async (f) => {
            try {
              await uploadFile(f);
            } finally {
              // Always close the overlay, even if upload throws
              setShowUpload(false);
            }
          }}
        />
      )}

      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={setActiveConversationId}
        onNewConversation={() => setActiveConversationId(null)}
        onDeleteConversation={deleteConversation}
        documents={documents}
        activeDocumentId={activeDocumentId}
        onSelectDocument={setActiveDocumentId}
        onDeleteDocument={deleteDocument}
        onUploadClick={() => setShowUpload(true)}
        isIndexing={isIndexing}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header
          isModelReady={llmReady}
          gpuAdapterName={capabilities?.adapterName || 'CPU'}
          modelName={TEXT_MODELS.find(m => m.id === currentModelId)?.displayName || currentModelId}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onOpenSettings={() => setShowSettings(true)}
        />

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {activeTab === 'chat' ? (
            <ChatPanel
              messages={activeConversation?.messages || []}
              isGenerating={isGenerating}
              currentResponse={currentResponse}
              onSendMessage={handleSendMessage}
              activeContext={activeDoc ? `Studying: ${activeDoc.name}` : undefined}
            />
          ) : (
            <DocumentMode
              activeDoc={activeDoc}
              visionProcessing={visionProcessing}
              onAnalyzeImage={async (url) => {
                try {
                  const res = await analyzeImage(url);
                  console.log(res);
                } catch (err) {
                  console.error('Vision analysis failed:', err);
                }
              }}
              isGenerating={studyTools.isGenerating}
              isModelReady={llmReady}
              onGenerateFlashcards={() => studyTools.generateFlashcards(activeDoc?.extractedText || 'No text', activeDoc?.id)}
              onGenerateQuiz={() => studyTools.generateQuiz(activeDoc?.extractedText || 'No text', 'medium', activeDoc?.id)}
              onGenerateSummary={() => studyTools.generateSummary(activeDoc?.extractedText || 'No text', 'brief')}
            />
          )}
        </div>
      </div>
    </div>
  );
}