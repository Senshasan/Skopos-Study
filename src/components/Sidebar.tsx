import { MessageSquare, FileText, Plus, Image as ImageIcon, Trash2, Loader2 } from 'lucide-react';
import { Conversation, Document } from '../lib/db';

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  
  documents: Document[];
  activeDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onDeleteDocument: (id: string) => void;
  
  onUploadClick: () => void;
  isIndexing?: boolean;
  activeTab?: 'chat' | 'document';
}

export function Sidebar({
  conversations, activeConversationId, onSelectConversation, onNewConversation, onDeleteConversation,
  documents, activeDocumentId, onSelectDocument, onDeleteDocument, onUploadClick,
  isIndexing, activeTab
}: SidebarProps) {

  return (
    <div style={{
      width: '280px',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid var(--color-border)',
      background: 'var(--color-bg-surface)'
    }}>
      {/* Chats Section */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', margin: 0 }}>Chats</h2>
          <button className="btn-icon" onClick={onNewConversation} title="New Chat" style={{ padding: '0.25rem' }}>
            <Plus size={18} />
          </button>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.5rem' }}>
          {conversations.map(conv => (
            <div 
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem', margin: '0.25rem 0',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                background: activeConversationId === conv.id ? 'var(--color-bg-surface-hover)' : 'transparent',
                color: activeConversationId === conv.id ? 'var(--color-text-main)' : 'var(--color-text-muted)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                <MessageSquare size={16} style={{ flexShrink: 0 }} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9rem' }}>
                  {conv.title}
                </span>
              </div>
              <button 
                className="btn-icon" 
                onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id); }}
                style={{ padding: '0.25rem', opacity: activeConversationId === conv.id ? 1 : 0.3 }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: '1px', background: 'var(--color-border)', margin: '0 1rem' }} />

      {/* Documents Section */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', margin: 0 }}>Documents</h2>
            {isIndexing && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                padding: '0.15rem 0.5rem',
                borderRadius: 'var(--radius-xl)',
                background: 'rgba(99, 102, 241, 0.15)',
                color: 'var(--color-primary)',
                fontSize: '0.7rem',
                fontWeight: 500,
                animation: 'pulse 2s infinite'
              }}>
                <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                Indexing
              </div>
            )}
          </div>
          <button className="btn-icon" onClick={onUploadClick} title="Upload Document" style={{ padding: '0.25rem' }}>
            <Plus size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.5rem' }}>
          {documents.map(doc => (
            <div 
              key={doc.id}
              onClick={() => onSelectDocument(doc.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem', margin: '0.25rem 0',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                background: activeDocumentId === doc.id ? 'var(--color-bg-surface-hover)' : 'transparent',
                color: activeDocumentId === doc.id ? 'var(--color-text-main)' : 'var(--color-text-muted)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                {doc.type === 'image' ? <ImageIcon size={16} style={{ flexShrink: 0 }} /> : <FileText size={16} style={{ flexShrink: 0 }} />}
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9rem' }}>
                  {doc.name}
                </span>
              </div>
              <button 
                className="btn-icon" 
                onClick={(e) => { e.stopPropagation(); onDeleteDocument(doc.id); }}
                style={{ padding: '0.25rem', opacity: activeDocumentId === doc.id ? 1 : 0.3 }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
