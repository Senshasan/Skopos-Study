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
import { getDB } from './lib/db';

// Threshold: if document is under ~1500 words, inject full text instead of RAG
const RAG_THRESHOLD_WORDS = 1500;

function getDocumentMode(doc: { extractedText: string } | null): 'full-context' | 'rag' {
  if (!doc || !doc.extractedText) return 'full-context';
  const wordCount = doc.extractedText.split(/\s+/).length;
  return wordCount <= RAG_THRESHOLD_WORDS ? 'full-context' : 'rag';
}

export default function App() {
  const { capabilities, isDetecting } = useGPUDetection();
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [currentModelId, setCurrentModelId] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'document'>('chat');

  const { isReady: llmReady, isGenerating, progress: llmProgress, currentResponse, error: llmError, clearError, initModel, sendMessage } = useWebLLM();
  const { isReady: visionReady, isProcessing: visionProcessing, progress: visionProgress, analyzeImage } = useVisionModel();

  // Hoist useRAG to App — single worker instance
  const { isReady: ragReady, isProcessing: ragProcessing, progress: ragProgress, indexDocument, search, getEmbedding } = useRAG();

  const { documents, activeDocumentId, setActiveDocumentId, isUploading, isIndexing, uploadFile, deleteDocument, loadDocuments } = useDocuments(indexDocument);
  const { conversations, activeConversationId, setActiveConversationId, activeConversation, createConversation, addMessage, deleteConversation } = useConversations();

  // Pass search to study tools for targeted RAG queries
  const studyTools = useStudyTools(sendMessage, search);

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

    // Only inject document context in Document Specialist mode
    if (activeTab === 'document' && activeDoc && activeDoc.type !== 'image') {
      const mode = getDocumentMode(activeDoc);

      if (mode === 'full-context') {
        // Short document — inject full text
        systemPrompt += `\n\nThe student has uploaded study material. Use the text below as your PRIMARY source for answering. Quote or paraphrase from it directly when relevant. If the text doesn't cover the question, say so briefly and answer from general knowledge.`;
        systemPrompt += `\n\n=== STUDY MATERIAL ===\n${activeDoc.extractedText}\n=== END ===\n`;
      } else {
        // Long document — RAG search
        const conv = conversations.find(c => c.id === convId);
        const historyMessages = conv ? conv.messages.slice(-10) : [];
        // If history is long AND we have RAG chunks, reduce topK to save context
        const ragTopK = historyMessages.length > 6 ? 2 : 5;
        const relevantChunks = await search(text, [activeDoc.id], ragTopK);
        console.log('RAG chunks:', relevantChunks.length, relevantChunks);

        if (relevantChunks.length > 0) {
          systemPrompt += `\n\nThe student has uploaded study material. Use the excerpts below as your PRIMARY source for answering. Quote or paraphrase from them directly when relevant. If the excerpts don't cover the question, say so briefly and answer from general knowledge.\n\n`;
          systemPrompt += `=== STUDY MATERIAL ===\n`;
          relevantChunks.forEach(chunk => {
            systemPrompt += chunk.text + '\n---\n';
          });
          systemPrompt += `=== END ===\n`;
        }
      }
    } else if (activeTab === 'document' && activeDoc && activeDoc.type === 'image') {
      systemPrompt += `\n\nThe user is currently looking at an image document named "${activeDoc.name}".`;
      if (activeDoc.extractedText && activeDoc.extractedText !== '[Image Document - Analyze with AI to extract description]') {
        systemPrompt += `\n\nImage AI Analysis: ${activeDoc.extractedText}`;
      }
    }
    // In Chat mode (activeTab === 'chat'), no document context is injected — pure LLM chat

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
  const docMode = activeDoc ? getDocumentMode(activeDoc) : null;

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <h4 style={{ margin: 0 }}>Initialization Error</h4>
            <button onClick={clearError} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '0 0 0 1rem', fontSize: '1.2rem', lineHeight: 1 }}>✕</button>
          </div>
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
              // Auto-switch to document mode when uploading
              setActiveTab('document');
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
        onSelectDocument={(id) => {
          setActiveDocumentId(id);
          setActiveTab('document');
        }}
        onDeleteDocument={deleteDocument}
        onUploadClick={() => setShowUpload(true)}
        isIndexing={isIndexing}
        activeTab={activeTab}
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
              mode="chat"
            />
          ) : (
            <>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Context mode indicator */}
                {activeDoc && activeDoc.type !== 'image' && (
                  <div style={{
                    padding: '0.5rem 1rem',
                    borderBottom: '1px solid var(--color-border)',
                    background: 'var(--color-bg-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8rem'
                  }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.2rem 0.6rem',
                      borderRadius: 'var(--radius-xl)',
                      background: docMode === 'full-context' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                      color: docMode === 'full-context' ? 'var(--color-success)' : 'var(--color-primary)',
                      fontWeight: 500
                    }}>
                      <span style={{ fontSize: '0.65rem' }}>{docMode === 'full-context' ? '🟢' : '🔵'}</span>
                      {docMode === 'full-context' ? 'Full Context' : 'RAG Active'}
                    </span>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      {docMode === 'full-context'
                        ? '— Short document — using complete text'
                        : '— Long document — searching for relevant sections'}
                    </span>
                    {isIndexing && (
                      <span style={{
                        marginLeft: 'auto',
                        color: 'var(--color-warning)',
                        fontSize: '0.75rem',
                        fontWeight: 500
                      }}>
                        ⏳ Building search index…
                      </span>
                    )}
                  </div>
                )}

                {/* Document mode: chat + document viewer + study tools */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                  <ChatPanel
                    messages={activeConversation?.messages || []}
                    isGenerating={isGenerating}
                    currentResponse={currentResponse}
                    onSendMessage={handleSendMessage}
                    activeContext={activeDoc ? `Studying: ${activeDoc.name}` : undefined}
                    mode="document"
                    isIndexing={isIndexing}
                  />
                  <DocumentMode
                    activeDoc={activeDoc}
                    visionProcessing={visionProcessing}
                    onAnalyzeImage={async (url) => {
                      if (activeDoc?.type === 'image' && url) {
                        try {
                          const description = await analyzeImage(url);
                          // Persist the vision analysis result to IDB
                          const db = await getDB();
                          const updated = { ...activeDoc, extractedText: description };
                          await db.put('documents', updated);
                          await loadDocuments(); // trigger refresh
                        } catch (err) {
                          console.error('Vision analysis failed:', err);
                        }
                      }
                    }}
                    isGenerating={studyTools.isGenerating}
                    isModelReady={llmReady}
                    onGenerateFlashcards={() => studyTools.generateFlashcards(activeDoc?.extractedText || 'No text', activeDoc?.id)}
                    onGenerateQuiz={() => studyTools.generateQuiz(activeDoc?.extractedText || 'No text', 'medium', activeDoc?.id)}
                    onGenerateSummary={() => studyTools.generateSummary(activeDoc?.extractedText || 'No text', 'brief', activeDoc?.id)}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}