import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  modelUsed: string;
  messages: Message[];
}

export interface Document {
  id: string;
  name: string;
  type: string;
  extractedText: string;
  uploadedAt: number;
  sizeBytes: number;
  blobData?: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  text: string;
  embedding: Float32Array | number[];
  chunkIndex: number;
}

export interface Settings {
  key: string;
  value: any;
}

interface SkoposDB extends DBSchema {
  conversations: {
    key: string;
    value: Conversation;
    indexes: { 'updatedAt': number };
  };
  documents: {
    key: string;
    value: Document;
    indexes: { 'uploadedAt': number };
  };
  document_chunks: {
    key: string;
    value: DocumentChunk;
    indexes: { 'documentId': string };
  };
  settings: {
    key: string;
    value: Settings;
  };
}

let dbPromise: Promise<IDBPDatabase<SkoposDB>>;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<SkoposDB>('skopos-study-v1', 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('conversations')) {
          const store = db.createObjectStore('conversations', { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('documents')) {
          const store = db.createObjectStore('documents', { keyPath: 'id' });
          store.createIndex('uploadedAt', 'uploadedAt');
        }
        if (!db.objectStoreNames.contains('document_chunks')) {
          const store = db.createObjectStore('document_chunks', { keyPath: 'id' });
          store.createIndex('documentId', 'documentId');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}
