import { useState, useEffect, useCallback } from 'react';
import { getDB, Document } from '../lib/db';
import { parseDocument, DocType } from '../lib/document-parsers';

export function useDocuments(indexDocument?: (id: string, text: string) => Promise<void>) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);

  const loadDocuments = useCallback(async () => {
    const db = await getDB();
    const docs = await db.getAllFromIndex('documents', 'uploadedAt');
    setDocuments(docs.reverse());
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      const parsed = await parseDocument(file);
      const db = await getDB();
      
      const newDoc: Document = {
        id: parsed.id,
        name: parsed.name,
        type: parsed.type,
        extractedText: parsed.extractedText,
        uploadedAt: Date.now(),
        sizeBytes: file.size,
        blobData: parsed.blobData
      };

      await db.put('documents', newDoc);
      
      // Index for RAG if it has text
      if (parsed.extractedText && parsed.type !== 'image' && indexDocument) {
        // Run in background without blocking UI completely
        setIsIndexing(true);
        indexDocument(newDoc.id, parsed.extractedText).finally(() => setIsIndexing(false));
      }

      await loadDocuments();
      setActiveDocumentId(newDoc.id);
      return newDoc;
    } catch (err) {
      console.error("Upload failed", err);
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, [loadDocuments, indexDocument]);

  const deleteDocument = useCallback(async (id: string) => {
    const db = await getDB();
    await db.delete('documents', id);
    
    // Also delete chunks
    const tx = db.transaction('document_chunks', 'readwrite');
    const index = tx.store.index('documentId');
    const keys = await index.getAllKeys(id);
    await Promise.all(keys.map(key => tx.store.delete(key)));
    await tx.done;

    if (activeDocumentId === id) setActiveDocumentId(null);
    await loadDocuments();
  }, [activeDocumentId, loadDocuments]);

  return { documents, activeDocumentId, setActiveDocumentId, isUploading, isIndexing, uploadFile, deleteDocument, loadDocuments };
}
