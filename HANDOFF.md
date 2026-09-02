# Skopos Study v2 — Implementation Handoff

## Goal
Fix all diagnosed bugs, improve the RAG pipeline, and restructure the UX around two explicit modes: **General Chat** and **Document Specialist**. Maintain portfolio viability throughout — every architectural decision should be explainable.

---

## Part 1: Critical Bug Fixes (do these first)

### 1.1 Fix Vision Worker — `src/App.tsx`

**Problem:** `onAnalyzeImage` ignores its `url` argument and hardcodes an Unsplash stock photo. Result is console-logged and discarded.

**Fix:**
```tsx
// In DocumentViewer's onAnalyzeImage prop handler:
onAnalyzeImage={async (url) => {
  if (activeDoc?.type === 'image' && url) {
    const description = await analyzeImage(url);
    // Update the document's extractedText in IDB so it persists
    const db = await getDB();
    const updated = { ...activeDoc, extractedText: description };
    await db.put('documents', updated);
    await loadDocuments(); // trigger refresh
  }
}}
```
Pass the actual blob URL from `DocumentViewer`. Store the result back into `doc.extractedText` so it persists across sessions and can be used in system prompts.

---

### 1.2 Fix Duplicate Embedding Workers — `src/App.tsx` + `src/hooks/useDocuments.ts`

**Problem:** `useDocuments` calls `useRAG()` internally, and `App.tsx` calls `useRAG()` separately. Two workers instantiate and download the same embedding model.

**Fix:** Hoist `useRAG` to `App.tsx`. Pass `indexDocument` down to `useDocuments` as a parameter.

```ts
// App.tsx
const { isReady, isProcessing, progress, indexDocument, search, getEmbedding } = useRAG();
const { documents, ... } = useDocuments(indexDocument); // pass it in

// useDocuments.ts — change signature
export function useDocuments(indexDocument: (id: string, text: string) => Promise<void>) {
  // remove internal useRAG() call
  ...
}
```

---

### 1.3 Fix Embedding Model Mismatch — `src/embedding-worker.ts` + `src/lib/model-registry.ts`

**Problem:** Registry declares `Xenova/all-MiniLM-L6-v2` (384-dim) but worker hardcodes `Xenova/paraphrase-multilingual-MiniLM-L12-v2`. Registry constant is never consumed.

**Decision:** Keep the multilingual model — it's strictly more capable for multilingual study material (which aligns with Skopos's language background). Update the registry to match and actually import/use the constant.

**Fix:**
```ts
// model-registry.ts
export const EMBEDDING_MODEL = {
  id: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  displayName: 'Multilingual MiniLM-L12',
  dimensions: 384,
};

// embedding-worker.ts — consume from registry
import { EMBEDDING_MODEL } from '../lib/model-registry';

class EmbeddingPipeline {
  static model = EMBEDDING_MODEL.id; // no longer hardcoded
  ...
}
```

Note: Vite worker imports need careful handling. Either use a shared constants file (no Vite-special imports) or duplicate the string with a comment referencing the registry.

---

## Part 2: RAG Pipeline Improvements

### 2.1 Semantic-Aware Chunking — `src/lib/rag-engine.ts`

**Problem:** Word-count chunking ignores document structure. Paragraphs split mid-thought.

**Fix:** Paragraph-first chunking — split on double newlines first, then merge small paragraphs and split oversized ones:

```ts
export function chunkText(text: string, targetWords = 300, overlap = 50): string[] {
  // Split on paragraph boundaries
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 20);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).length;

    if (currentWordCount + paraWords > targetWords && current.length > 0) {
      chunks.push(current.join('\n\n'));
      // Overlap: keep last paragraph as start of next chunk
      const overlapParas = current.slice(-1);
      current = [...overlapParas, para];
      currentWordCount = overlapParas.join(' ').split(/\s+/).length + paraWords;
    } else {
      current.push(para);
      currentWordCount += paraWords;
    }
  }

  if (current.length > 0) chunks.push(current.join('\n\n'));
  return chunks;
}
```

---

### 2.2 Batched Embedding Generation — `src/hooks/useRAG.ts`

**Problem:** Serial `await getEmbedding(chunk)` loop — one round-trip per chunk.

**Fix:** Add a `getEmbeddingBatch` method that sends all chunks concurrently and resolves when all return:

```ts
const getEmbeddingBatch = useCallback((texts: string[]): Promise<number[][]> => {
  return Promise.all(texts.map(text => getEmbedding(text)));
}, [getEmbedding]);

// In indexDocument:
const chunks = chunkText(text, 300, 50);
const embeddings = await getEmbeddingBatch(chunks); // parallel, not serial
await storeChunks(documentId, chunks, embeddings);
```

Note: The embedding worker handles one request at a time (single model instance). `Promise.all` here queues all requests and the worker processes them in order — this is still faster than serial await because postMessage delivery and JS microtask overhead is eliminated.

---

### 2.3 Similarity Threshold — `src/lib/rag-engine.ts`

**Problem:** Always returns topK chunks regardless of relevance score.

**Fix:**
```ts
const SIMILARITY_THRESHOLD = 0.25; // tune as needed

export async function searchChunks(
  queryVector: number[] | Float32Array,
  documentIds: string[],
  topK: number = 5,
  threshold: number = SIMILARITY_THRESHOLD
): Promise<DocumentChunk[]> {
  ...
  const scoredChunks = allRelevantChunks
    .map(chunk => ({ chunk, score: cosineSimilarity(queryVector, chunk.embedding) }))
    .filter(sc => sc.score >= threshold); // ← threshold gate

  scoredChunks.sort((a, b) => b.score - a.score);
  return scoredChunks.slice(0, topK).map(sc => sc.chunk);
}
```

Increase default topK from 3 to 5 since threshold will naturally filter low-quality results.

---

### 2.4 RAG for Study Tools — `src/App.tsx` / `src/components/StudyTools.tsx`

**Problem:** Study tools dump full `extractedText` into the prompt — will silently truncate on large docs.

**Fix:** Pass `search` into `useStudyTools` and have each tool do a targeted RAG pass with a broad query:

```ts
// For flashcards:
const relevantChunks = await search('key concepts definitions terms', [documentId]);
const text = relevantChunks.map(c => c.text).join('\n\n');
// use `text` instead of full extractedText

// For quiz:
const relevantChunks = await search('important facts details examples', [documentId]);

// For summary:
// Send first N chunks + last N chunks (intro + conclusion heuristic)
const allChunks = await getAllChunks(documentId); // need this util
const text = [...allChunks.slice(0, 4), ...allChunks.slice(-2)].map(c => c.text).join('\n\n');
```

Add `getAllChunksForDocument(documentId)` to `rag-engine.ts`:
```ts
export async function getAllChunksForDocument(documentId: string): Promise<DocumentChunk[]> {
  const db = await getDB();
  const tx = db.transaction('document_chunks', 'readonly');
  return tx.store.index('documentId').getAll(documentId);
}
```

---

### 2.5 Indexing Status Indicator

**Problem:** Indexing runs silently in the background with no UI feedback.

**Fix:**
- Add `isIndexing` / `indexingProgress` state to `useDocuments` (passed up from `useRAG`)
- Show a subtle badge or progress bar on the document in the sidebar while indexing
- Block the "Document" tab's chat from sending while indexing is in progress, with a tooltip: "Building search index…"

---

## Part 3: Two-Tab UX Restructure

This is the biggest UX change. Split the main interface into two explicitly named modes accessible via top-level tabs (or a prominent toggle in the Header).

### 3.1 Tab Structure

```
┌─────────────────────────────────────────────────┐
│  Header  [💬 Chat]  [📄 Document Specialist]     │
└─────────────────────────────────────────────────┘
```

State: `activeMode: 'chat' | 'document'` in `App.tsx`.

---

### 3.2 Tab 1: Chat Mode

**Behaviour:**
- Pure LLM chat. No document context injected.
- Conversation history persisted as normal.
- System prompt: generic study assistant persona only.
- No document selector visible here — it would be confusing.

**When to use (explain in UI):** "Ask me anything. I'll use my own knowledge to help you study."

---

### 3.3 Tab 2: Document Specialist Mode

**Behaviour:**
- Document selector in sidebar (already exists).
- When a document is selected, show the document's **context mode indicator** (see 3.4).
- Study Tools panel available only here.
- Vision analysis available only for image documents here.

**When to use:** "Upload a lecture script, textbook chapter, or research paper. I'll study it and answer your questions."

---

### 3.4 Context Mode Indicator (RAG vs Full Context)

Based on document word count, determine whether to use RAG or full-context injection. Display this decision visibly in the UI.

```ts
// Threshold: if document is under ~1500 words, inject full text
const RAG_THRESHOLD_WORDS = 1500;

function getDocumentMode(doc: Document): 'full-context' | 'rag' {
  const wordCount = doc.extractedText.split(/\s+/).length;
  return wordCount <= RAG_THRESHOLD_WORDS ? 'full-context' : 'rag';
}
```

Show a small badge near the active document:
- 🟢 **Full Context** — "Short document — using complete text" 
- 🔵 **RAG Active** — "Long document — searching for relevant sections"

In `_sendMessageToEngine`, branch on this:
```ts
const mode = getDocumentMode(activeDoc);

if (mode === 'full-context') {
  systemPrompt += `\n\n=== STUDY MATERIAL ===\n${activeDoc.extractedText}\n=== END ===`;
} else {
  const relevantChunks = await search(text, [activeDoc.id]);
  if (relevantChunks.length > 0) {
    // existing RAG injection logic (cleaned up)
  }
}
```

---

## Part 4: Model Registry Cleanup

### 4.1 Remove Sub-Quality Models

Drop `Qwen2.5-0.5B` and `SmolLM2-360M` from `TEXT_MODELS`. These produce output that actively undermines the study assistant use case (hallucination, JSON failure for study tools). Their presence makes the app appear broken on low-end hardware.

**New floor:** Gemma-2 2B (`medium` tier) as the minimum. This is still usable on an iGPU.

**New registry:**
```ts
export const TEXT_MODELS: ModelConfig[] = [
  {
    id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',
    fallbackId: 'Qwen2.5-7B-Instruct-q4f32_1-MLC',
    displayName: 'Qwen2.5 7B',
    params: '7B',
    runtime: 'webllm',
    tier: 'ultra',
    estimatedVRAM: '4GB+',
    description: 'Best reasoning and instruction following. Recommended for discrete GPUs.',
  },
  {
    // Consider upgrading to Phi-4-mini if available in WebLLM catalog
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    fallbackId: 'Phi-3.5-mini-instruct-q4f32_1-MLC',
    displayName: 'Phi-3.5 Mini',
    params: '3.8B',
    runtime: 'webllm',
    tier: 'high',
    estimatedVRAM: '2.5GB+',
    description: 'Strong reasoning in a compact package. Good for modern laptops.',
  },
  {
    id: 'gemma-2-2b-it-q4f16_1-MLC',
    fallbackId: 'gemma-2-2b-it-q4f32_1-MLC',
    displayName: 'Gemma-2 2B',
    params: '2B',
    runtime: 'webllm',
    tier: 'medium',
    estimatedVRAM: '1.5GB+',
    description: 'Minimum recommended. Works on most hardware with WebGPU support.',
  },
  // NOTE: No CPU fallback. If WebGPU is unavailable, show a clear "not supported" message
  // rather than offering a model that will disappoint the user.
];
```

**Check the WebLLM model catalog** (`@mlc-ai/web-llm`) for Phi-4-mini-instruct and Qwen3 variants — these may have been added and would be significantly better than Phi-3.5.

### 4.2 No WebGPU = Honest Error, Not a Bad Fallback

Instead of routing to SmolLM2-360M on CPU, show a clear message:
> "WebGPU is required for Skopos Study. Please use Chrome 113+ or Edge 113+ with hardware acceleration enabled."

This is more honest and a better user experience than loading a 360M model that can't do the job.

---

## Part 5: Prompt Quality Improvements

### 5.1 Fix RAG System Prompt Framing — `src/App.tsx`

Current prompt uses adversarial framing ("CRITICAL: answer based on excerpts even if it contradicts general knowledge") which confuses small models. Replace:

```ts
// Replace current RAG system prompt injection with:
systemPrompt += `\n\nThe student has uploaded study material. Use the excerpts below as your PRIMARY source for answering. Quote or paraphrase from them directly when relevant. If the excerpts don't cover the question, say so briefly and answer from general knowledge.\n\n`;
systemPrompt += `=== STUDY MATERIAL ===\n`;
relevantChunks.forEach(chunk => {
  systemPrompt += chunk.text + '\n---\n';
});
systemPrompt += `=== END ===\n`;
```

### 5.2 JSON Generation Safety — `src/hooks/useStudyTools.ts`

Add retry with a simpler prompt fallback for JSON parse failures:

```ts
const parseWithRetry = async (response: string, prompt: string): Promise<any> => {
  // Try 1: extract JSON array directly
  const match = response.match(/\[[\s\S]*\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  // Try 2: ask the model to fix its own output
  const fixPrompt = `The following is malformed JSON. Fix it and return ONLY the valid JSON array:\n${response}`;
  const fixed = await sendMessage([{ role: 'user', content: fixPrompt }]);
  const fixMatch = fixed.match(/\[[\s\S]*\]/);
  if (fixMatch) return JSON.parse(fixMatch[0]);
  throw new Error('Could not parse model output as JSON after retry');
};
```

### 5.3 Extend Conversation History — `src/App.tsx`

Increase from 6 to 10 messages. Mitigate context pressure by trimming RAG chunks if history is long:

```ts
const historyMessages = conv.messages.slice(-10);
// If history is long AND we have RAG chunks, reduce topK
const ragTopK = historyMessages.length > 6 ? 2 : 5;
const relevantChunks = await search(text, [activeDoc.id], ragTopK);
```

---

## Part 6: Fix the Fake Streaming Delay — `src/ai-worker.ts`

The 20ms fixed delay in the Transformers.js path creates multi-second artificial delays on long outputs.

```ts
// Replace fixed delay with adaptive delay based on token length
const baseDelay = 8; // ms
for (const token of tokens) {
  self.postMessage({ type: 'CHAT_CHUNK', payload: { id, token, isComplete: false } });
  await new Promise(r => setTimeout(r, baseDelay));
}
```

Or remove delay entirely and rely on the natural rendering cadence of React state updates.

---

## Implementation Priority Order

| Priority | Task | Files |
|----------|------|-------|
| 1 | Fix duplicate workers | `App.tsx`, `useDocuments.ts`, `useRAG.ts` |
| 2 | Fix vision bug | `App.tsx`, `DocumentViewer.tsx` |
| 3 | Fix embedding model mismatch | `embedding-worker.ts`, `model-registry.ts` |
| 4 | Two-tab UX restructure | `App.tsx`, `Header.tsx`, new `ChatMode.tsx`, new `DocumentMode.tsx` |
| 5 | RAG threshold + mode indicator | `App.tsx`, `Sidebar.tsx` or document panel |
| 6 | Semantic chunking | `rag-engine.ts` |
| 7 | Batched embeddings | `useRAG.ts` |
| 8 | Similarity threshold | `rag-engine.ts` |
| 9 | Study tools RAG pass | `useStudyTools.ts`, `rag-engine.ts` |
| 10 | Model registry cleanup + no-WebGPU error | `model-registry.ts`, `Onboarding.tsx` |
| 11 | Prompt quality improvements | `App.tsx`, `study-engine.ts` |
| 12 | Indexing status in UI | `useDocuments.ts`, `Sidebar.tsx` |
| 13 | Extend conversation history | `App.tsx` |
| 14 | JSON retry logic | `useStudyTools.ts` |
| 15 | Fix fake streaming delay | `ai-worker.ts` |

---

## Key Decisions to Lock In Before Implementing

1. **WebLLM catalog check** — Before writing the model registry, check `@mlc-ai/web-llm`'s current supported model list for Phi-4-mini and Qwen3 variants. The registry should reflect what's actually downloadable.

2. **RAG threshold** — `1500 words` is the proposed default. Adjust based on the context window of the minimum model (Gemma-2 2B has a 4K context window; at ~1.3 tokens/word, 1500 words ≈ 1950 tokens, which is safe with system prompt overhead).

3. **No CPU fallback** — Dropping SmolLM2-360M means users without WebGPU see an error, not a degraded experience. This is the right call for a study tool but should be communicated clearly in the README and onboarding.

4. **Tab naming** — "Chat" and "Document Specialist" work. Could also be "General" / "Document Mode" or "Ask Anything" / "Study a Document". Pick before building the component.

5. **Embedding model upgrade** — Sticking with `paraphrase-multilingual-MiniLM-L12-v2` is fine for the portfolio story (multilingual + your language background). If retrieval quality needs improvement later, `Xenova/bge-small-en-v1.5` (English-only but higher retrieval benchmark scores) is the next upgrade.

---

## What This v2 Should Demonstrate (Portfolio Framing)

After these changes, the README's "what worked / what didn't" split becomes sharper:

- **Fixed:** The vision pipeline, worker duplication, model consistency
- **Improved:** RAG quality (semantic chunking, thresholding, batching), prompt design, UX clarity
- **Honest limitation:** Still browser-native, still quantized, still requires WebGPU — but now the app itself isn't the source of failure

The two-tab structure is a genuinely portfolio-worthy architectural decision: it demonstrates you understand when to use RAG vs direct context injection, and you've made that decision explicit and visible to the user rather than hiding it.

