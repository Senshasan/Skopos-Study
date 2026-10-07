import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, User, Bot, Loader2, MessageSquare, BookOpen } from 'lucide-react';
import { Message } from '../lib/db';

interface ChatPanelProps {
  messages: Message[];
  isGenerating: boolean;
  currentResponse: string;
  onSendMessage: (text: string) => void;
  activeContext?: string; // e.g., "Studying: biology.pdf"
  mode?: 'chat' | 'document';
  isIndexing?: boolean;
}

export function ChatPanel({ messages, isGenerating, currentResponse, onSendMessage, activeContext, mode = 'chat', isIndexing }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentResponse]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating || (isIndexing && mode === 'document')) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const displayMessages = [...messages];
  if (isGenerating && currentResponse) {
    displayMessages.push({
      id: 'temp',
      role: 'assistant',
      content: currentResponse,
      timestamp: Date.now()
    });
  } else if (isGenerating) {
    // Show loading indicator
    displayMessages.push({
      id: 'temp',
      role: 'assistant',
      content: '...',
      timestamp: Date.now()
    });
  }

  // Filter out system messages for display
  const chatMessages = displayMessages.filter(m => m.role !== 'system');

  const isSendDisabled = !input.trim() || isGenerating || (isIndexing && mode === 'document');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      


      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {chatMessages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--color-text-muted)', maxWidth: '400px' }}>
            {mode === 'chat' ? (
              <>
                <MessageSquare size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
                <h2 style={{ color: 'var(--color-text-main)', marginBottom: '0.5rem' }}>General Chat</h2>
                <p>Ask me anything. I'll use my own knowledge to help you study.</p>
              </>
            ) : (
              <>
                <BookOpen size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
                <h2 style={{ color: 'var(--color-text-main)', marginBottom: '0.5rem' }}>Document Specialist</h2>
                <p>Upload a lecture script, textbook chapter, or research paper. I'll study it and answer your questions.</p>
              </>
            )}
          </div>
        ) : (
          chatMessages.map(msg => (
            <div key={msg.id} style={{
              display: 'flex',
              gap: '1rem',
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
            }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: msg.role === 'user' ? 'var(--color-primary)' : 'var(--color-bg-surface-hover)',
                color: 'white'
              }}>
                {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
              </div>
              <div style={{
                background: msg.role === 'user' ? 'var(--color-primary)' : 'transparent',
                border: msg.role === 'assistant' ? '1px solid var(--color-border)' : 'none',
                padding: '1rem 1.25rem',
                borderRadius: 'var(--radius-lg)',
                borderTopRightRadius: msg.role === 'user' ? 0 : 'var(--radius-lg)',
                borderTopLeftRadius: msg.role === 'assistant' ? 0 : 'var(--radius-lg)',
                color: msg.role === 'user' ? 'white' : 'var(--color-text-main)'
              }}>
                {msg.content === '...' ? (
                  <Loader2 size={20} className="animate-pulse" style={{ animationDuration: '1s', animationIterationCount: 'infinite' }} />
                ) : (
                  <div className="markdown-body">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({node, ...props}) => <p style={{ margin: 0, paddingBottom: '0.75rem' }} {...props} />
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '1rem 2rem', background: 'var(--color-bg-base)' }}>
        <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
          {activeContext && (
            <div style={{ position: 'absolute', top: '-1.5rem', left: '0.5rem', background: 'var(--color-primary)', color: 'white', fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Bot size={12} /> {activeContext}
            </div>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isIndexing && mode === 'document'
                ? "Building search index… please wait"
                : isGenerating
                  ? "AI is thinking..."
                  : mode === 'chat'
                    ? "Ask me anything..."
                    : "Ask about your document..."
            }
            disabled={isGenerating || (isIndexing && mode === 'document')}
            style={{
              width: '100%',
              padding: '1rem 3rem 1rem 1rem',
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--color-text-main)',
              fontFamily: 'inherit',
              resize: 'none',
              minHeight: '60px',
              maxHeight: '200px',
              outline: 'none',
              boxShadow: 'var(--shadow-sm)'
            }}
            rows={1}
          />
          <button 
            type="submit" 
            disabled={isSendDisabled}
            className="btn-primary"
            style={{ 
              position: 'absolute', right: '0.5rem', bottom: '0.75rem', 
              padding: '0.5rem', borderRadius: 'var(--radius-md)'
            }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
