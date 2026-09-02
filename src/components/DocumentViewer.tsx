import { Document } from '../lib/db';
import { Eye, Wand2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DocumentViewerProps {
  document: Document | null;
  onAnalyzeImage?: (imageUrl: string) => void;
  isAnalyzingImage?: boolean;
}

export function DocumentViewer({ document, onAnalyzeImage, isAnalyzingImage }: DocumentViewerProps) {
  if (!document) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <Eye size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
          <p>No document selected</p>
        </div>
      </div>
    );
  }

  const isImage = document.type === 'image';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg-base)' }}>
      <div style={{ 
        padding: '1rem', 
        borderBottom: '1px solid var(--color-border)', 
        background: 'var(--color-bg-surface)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0, fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {document.name}
        </h3>
        
        {isImage && onAnalyzeImage && (
          <button 
            className="btn btn-accent" 
            onClick={() => onAnalyzeImage(document.blobData || '')} 
            disabled={isAnalyzingImage || !document.blobData}
          >
            <Wand2 size={16} />
            {isAnalyzingImage ? 'Analyzing...' : 'Analyze Image'}
          </button>
        )}
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
        <div style={{ 
          background: 'var(--color-bg-surface)', 
          padding: '2rem', 
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          {isImage && document.blobData && (
            <img 
              src={document.blobData} 
              alt={document.name}
              style={{ maxWidth: '100%', maxHeight: '400px', display: 'block', margin: '0 auto 2rem auto', borderRadius: 'var(--radius-sm)' }}
            />
          )}
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {document.extractedText || '*No text extracted*'}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
