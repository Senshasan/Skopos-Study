# Skopos Study — A Case Study in Private, Localized AI Inference

> **⚠️ Honest Disclaimer**
>
> This project does not work in a production-ready sense, and I want to be upfront about that. The architecture is sound, the vision is real, and I believe in every technology choice made here — but student-tier hardware is a hard ceiling. Heavily quantized, sub-7B parameter models running inside a browser tab are simply not capable enough yet to deliver the quality of reasoning this application demands. Context gets lost, JSON parsing fails, small models hallucinate, and inference is slow on integrated GPUs. This is a documented constraint of the current state of on-device AI, not a flaw in the design.
>
> What this project *is*, is a rigorous, first-principles exploration of what becomes possible when you push the modern web platform to its absolute limit. It is presented here not as a finished product, but as a **technical case study in private, zero-server, in-browser AI** — a proof-of-concept architecture that I believe will be production-viable within the next hardware generation.

---

## The Vision

The central question Skopos tries to answer is: *can the entire AI pipeline — document parsing, semantic embedding, vector retrieval, and LLM inference — run completely inside a web browser, with no data ever leaving the user's machine?*

The motivation is data privacy. Students and professionals routinely upload sensitive documents — research papers, medical notes, legal contracts, proprietary code — to cloud-based AI products. Every one of those uploads is a liability. Skopos was designed as a counter-proposal: a fully local, offline-capable RAG (Retrieval-Augmented Generation) study assistant where the data never moves.

The answer is: **yes, architecturally, it can work**. The browser platform now exposes enough primitives — WebGPU, WebAssembly, Web Workers, IndexedDB, and the Cache API — to host a complete ML inference stack without a single HTTP call to a backend. The missing piece is not the design. It's the hardware.

---

## Key Technology Stack

Skopos is built on a carefully chosen stack where each dependency solves a specific problem at the edge.

| Layer | Technology | Purpose |
|---|---|---|
| **UI Framework** | React 19 + TypeScript + Vite | Fast, typed SPA with native ESM worker support |
| **LLM Inference (GPU)** | `@mlc-ai/web-llm` | WebGPU-accelerated quantized LLM inference in-browser |
| **LLM Inference (CPU)** | `@huggingface/transformers` (WASM) | Pure WebAssembly fallback for devices without WebGPU |
| **Embedding** | Transformers.js — `paraphrase-multilingual-MiniLM-L12-v2` | CPU-side vector embeddings for semantic retrieval |
| **Vision** | Transformers.js — `SmolVLM-256M` / `Florence-2-base` | Multimodal image understanding and OCR |
| **Persistence** | `idb` (IndexedDB) | Structured client-side storage for vectors, documents, and chat history |
| **Document Parsing** | `pdfjs-dist`, `mammoth`, `xlsx` | Client-side text extraction from PDF, DOCX, XLSX, CSV |
| **Model Caching** | Browser Cache API (via web-llm) | Persistent multi-gigabyte model weight caching |

---

## Architecture Overview

The application is split into three parallel processing planes that communicate exclusively through message passing — keeping the main React UI thread free at all times.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        React UI (Main Thread)                        │
│   App.tsx · Sidebar · ChatPanel · StudyTools · DocumentViewer        │
└──────────────────┬──────────────┬────────────────┬───────────────────┘
                   │postMessage   │postMessage      │postMessage
          ┌────────▼───────┐ ┌───▼──────────┐ ┌───▼──────────────┐
          │  ai-worker.ts  │ │embedding-    │ │  vision-worker   │
          │  (WebLLM /     │ │worker.ts     │ │  .ts             │
          │   WASM LLM)    │ │(MiniLM Embed)│ │  (SmolVLM)       │
          └────────────────┘ └──────────────┘ └──────────────────┘
                                     │
                           ┌─────────▼──────────┐
                           │   IndexedDB (idb)   │
                           │  conversations      │
                           │  documents          │
                           │  document_chunks    │
                           │  settings           │
                           └────────────────────┘
```

---

## How It Works — From Code to Feature

### 1. Hardware Detection & Model Selection (`gpu-detect.ts`, `model-registry.ts`)

Before anything else, the app queries the WebGPU API to understand what the user's hardware can actually support. `detectGPUCapabilities()` calls `navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })` and reads two key adapter properties:

- **`maxStorageBufferBindingSize`** — used to tier the device from `low` (< 1 GB) to `ultra` (≥ 4 GB). This is the single most reliable proxy for VRAM available to the GPU adapter.
- **`shader-f16` feature flag** — determines whether the GPU can run float-16 quantized weights natively, or needs to fall back to the larger float-32 variants.

```typescript
// gpu-detect.ts (simplified)
const maxBufferSizeMB = Math.round(maxBufferSize / (1024 * 1024));
const supportsF16 = adapter.features.has('shader-f16');

let tier: GPUTier = 'low';
if (maxBufferSizeMB >= 4096) tier = 'ultra';
else if (maxBufferSizeMB >= 2048) tier = 'high';
else if (maxBufferSizeMB >= 1024) tier = 'medium';
```

The `model-registry.ts` maintains a tiered catalogue of five text models and two vision models, ranging from a 360M parameter CPU-only model up to a 7B WebGPU model. The `getRecommendedModel()` function picks the largest model the detected tier can support, and `resolveModelId()` automatically swaps to the `f32` fallback if `shader-f16` is unsupported.

**Available Text Models:**

| Model | Params | Runtime | Min. VRAM |
|---|---|---|---|
| Qwen2.5 7B | 7B | WebGPU | 4 GB+ |
| Phi-3.5 Mini | 3.8B | WebGPU | 2.5 GB+ |
| Gemma-2 2B | 2B | WebGPU | 1.5 GB+ |
| Qwen2.5 0.5B | 0.5B | WebGPU | 0.5 GB+ |
| SmolLM2 360M | 360M | WASM/CPU | System RAM |

---

### 2. Model Loading, Caching & Persistence (`ai-worker.ts`)

All model initialization happens inside a dedicated `ai-worker.ts` Web Worker, completely decoupled from the React render cycle. The worker manages two distinct runtimes simultaneously:

**WebLLM Runtime (WebGPU path):**
```typescript
mlcEngine = new MLCEngine();
mlcEngine.setInitProgressCallback((progress) => {
  self.postMessage({ type: 'INIT_PROGRESS', payload: progress });
});
await mlcEngine.reload(modelId);
```
`web-llm` handles the model download from Hugging Face Hub and immediately begins caching the weights in the browser's native **Cache API**. On subsequent visits, the multi-gigabyte model files are served from the local cache — no re-download. Progress is throttled to 100ms intervals before being posted to the main thread to avoid flooding the message queue.

**Transformers.js Runtime (WASM/CPU path):**
For devices without WebGPU, the worker falls back to a Transformers.js `text-generation` pipeline running on WebAssembly with `dtype: 'q4'` quantization. This path is significantly slower but works on any modern browser, including mobile.

The `useWebLLM.ts` hook wires up the worker via `useRef`, maintains a `Promise` map keyed by `crypto.randomUUID()` to correctly resolve concurrent requests, and exposes reactive state (`isReady`, `isGenerating`, `progress`, `currentResponse`) for the UI.

---

### 3. Document Parsing (`document-parsers.ts`, `pdf-parser.ts`)

Files are parsed entirely on the client. The `parseDocument()` function dispatches to format-specific handlers based on MIME type and file extension:

- **PDF** → `pdfjs-dist`: Iterates every page, extracts text content, and applies a heuristic to detect scanned PDFs that have no selectable text layer. If identified as scanned, the user is instructed to upload page images for vision processing instead.
- **DOCX** → `mammoth`: Converts Microsoft Word documents to plain text using a pure-JS DOM parser.
- **XLSX / CSV** → `xlsx` (SheetJS): Reads workbooks, converts each sheet to CSV, and concatenates with sheet-name headers.
- **Markdown / Plain Text** → `TextDecoder`: Read directly from the `ArrayBuffer`.
- **Images** → Deferred. The extracted text placeholder is replaced on-demand by the vision model's description.

The resulting document object (including its `extractedText`) is stored in IndexedDB immediately after parsing.

---

### 4. Semantic Chunking & Embedding (`rag-engine.ts`, `embedding-worker.ts`)

Once text is extracted, it needs to be split into meaningful segments before embedding. The `chunkText()` function implements a **sliding window with overlap**:

```typescript
// rag-engine.ts
export function chunkText(text: string, maxWords: number = 300, overlap: number = 50): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + maxWords).join(' '));
    i += maxWords - overlap; // 50-word overlap preserves sentence continuity across boundaries
  }
  return chunks;
}
```

The 50-word overlap is deliberate — it prevents relevant sentences from being split across two chunks that would never appear together in a retrieval result.

Each chunk is sent via `postMessage` to `embedding-worker.ts`, which runs `Xenova/paraphrase-multilingual-MiniLM-L12-v2` through Transformers.js with mean pooling and L2 normalization:

```typescript
// embedding-worker.ts — singleton pipeline with WebGPU → WASM fallback
static async getInstance(progress_callback?: Function) {
  if (this.instance === null) {
    this.instance = await pipeline(this.task, this.model, { progress_callback })
      .catch(async (e) => {
        console.warn('WebGPU embedding init failed, falling back to WASM:', e);
        return await pipeline(this.task, this.model, { device: 'wasm', progress_callback });
      });
  }
  return this.instance;
}
```

The output is a `Float32Array` — a raw numeric vector. The worker converts it to a plain `number[]` before posting back, because `Float32Array` is transferable but the `idb` library serializes `number[]` more reliably across storage cycles.

The resulting `(chunkText, embedding)` pairs are written to the `document_chunks` IndexedDB store in a single atomic transaction via `storeChunks()`.

---

### 5. Persistence Schema (`db.ts`)

The IndexedDB database is typed end-to-end using the `idb` library's `DBSchema` interface. The schema is versioned at `skopos-study-v1` and contains four object stores:

```typescript
interface SkoposDB extends DBSchema {
  conversations: { key: string; value: Conversation; indexes: { 'updatedAt': number } };
  documents:     { key: string; value: Document;      indexes: { 'uploadedAt': number } };
  document_chunks: {
    key: string;
    value: DocumentChunk; // { id, documentId, text, embedding: Float32Array | number[], chunkIndex }
    indexes: { 'documentId': string }; // ← enables fast per-document chunk lookup
  };
  settings:      { key: string; value: Settings };
}
```

The `documentId` index on `document_chunks` is the performance-critical piece. Without it, retrieving all chunks for a specific document would require a full table scan. With it, `index.getAll(docId)` is a single indexed read — important when a document has hundreds of chunks.

Conversation messages are stored inline as a `Message[]` array within the `Conversation` object (not normalized), which keeps single-conversation reads to one IDB transaction and simplifies the history API.

---

### 6. Retrieval-Augmented Generation (`rag-engine.ts`, `App.tsx`)

When a user sends a message while a document is active, the query goes through a full RAG pass before reaching the LLM:

**Step 1 — Query Embedding:** The user's question is sent to `embedding-worker.ts` to be embedded with the same model and parameters used for the document chunks (cosine similarity is only meaningful when both vectors share the same embedding space).

**Step 2 — Similarity Search:** `searchChunks()` loads all stored chunk embeddings for the active document from IndexedDB, then runs a brute-force cosine similarity search in-memory:

```typescript
// rag-engine.ts
export function cosineSimilarity(vecA: number[] | Float32Array, vecB: number[] | Float32Array): number {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

The top-K (default: 3) highest-scoring chunks are returned.

**Step 3 — Context Injection:** The retrieved chunks are injected into the system prompt with a hard instruction to the model:

```typescript
// App.tsx
systemPrompt += `\n\nCRITICAL: The excerpts below are from the student's own study material 
and are the authoritative source of truth for this conversation. You MUST answer based on 
these excerpts even if the content contradicts general knowledge...`;
```

This prompt engineering is specifically designed to fight hallucination — a critical issue with small, quantized models that will confidently substitute their parametric knowledge for the user's actual study material.

**Step 4 — Inference:** The assembled `[system, ...history, user]` message array is sent to `ai-worker.ts`. The last 6 conversation turns are included as history (`conv.messages.slice(-6)`) to maintain continuity without exceeding context limits. The WebLLM engine streams response tokens back via `CHAT_CHUNK` messages, and the UI appends them to `currentResponse` in real-time.

---

### 7. Vision Pipeline (`vision-worker.ts`)

Image documents are handled through a separate `vision-worker.ts` that loads a dedicated multimodal model. The default is `Xenova/SmolVLM-256M-Instruct` (lightweight), with `Xenova/Florence-2-base` available as a higher-quality option for documents heavy with OCR or diagrams.

The worker uses `AutoModelForVision2Seq` and `AutoProcessor` from Transformers.js, processes the image through the vision-language model's chat template, and returns a natural language description. This description is stored as the document's `extractedText`, making it available to the RAG pipeline for subsequent chat queries about the image — completing the multimodal retrieval loop.

---

### 8. Study Tools (`study-engine.ts`, `useStudyTools.ts`, `StudyTools.tsx`)

On top of the core RAG chat, the app exposes a structured study tools panel powered by the same local LLM. Three tools are implemented:

- **Flashcard Generator** — sends a carefully engineered prompt to produce a `JSON` array of `{ front, back }` pairs. A regex extractor (`response.match(/\[[\s\S]*\]/)`) strips any markdown fences or preamble the model might prepend before `JSON.parse()`.
- **Quiz Generator** — produces 3-5 multiple-choice questions with adjustable difficulty, outputting `{ question, options[], correctAnswer, explanation }` objects.
- **Summarizer** — supports four summary styles: `brief`, `detailed`, `bullet`, and `eli5`, each with a distinct instruction injected into the system prompt.

The `useStudyTools.ts` hook handles the async state and error boundaries, separating generation logic from component rendering.

---

## What Worked, What Didn't, and What Would Make It Work

### What worked architecturally
- The three-worker concurrency model keeps the UI entirely non-blocking — the React thread never waits on ML inference.
- The IndexedDB schema with typed `idb` wrappers is clean, fast, and survives page refreshes perfectly. Documents and their embeddings persist exactly as designed.
- The GPU tier detection and automatic model selection works reliably. The f16/f32 fallback resolved real compatibility issues during development.
- The cosine similarity retrieval is mathematically correct and performs well in the browser — searching 500 chunks takes under 10ms.
- Model weight caching through the Cache API is transparent and effective. After the first load, the app starts fully offline.

### What failed in practice
- **Model quality**: 0.5B–2B quantized models lack the reasoning depth needed to reliably extract key concepts from dense academic text and format them as valid JSON. The flashcard and quiz generators work intermittently at best.
- **Context length**: Small models have short context windows. Injecting 3 × 300-word RAG chunks, a system prompt, and 6 turns of history regularly overflows them.
- **Streaming latency**: On integrated student-tier GPUs, even the Gemma-2 2B model generates at 3–8 tokens/second — perceptible enough to feel broken rather than "streaming."

### What would change the outcome
Skopos would be fully functional with access to a 7B+ parameter model on a discrete GPU, or with a browser-side model serving technology that allows larger context windows. As WebGPU matures and model compression research advances, the viability of this exact architecture improves every quarter.

---

## Running Locally

> **Requires:** Node.js 18+, a Chromium-based browser (Chrome 113+ or Edge 113+) for WebGPU support.

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
```

On first load, the app will detect your GPU and prompt you to select a model. The selected model's weights will be downloaded from Hugging Face Hub (ranging from ~200 MB for SmolLM2 to ~4 GB for Qwen2.5-7B) and cached persistently in your browser.

> **Note:** Building for production (`npm run build`) requires the `vite.config.ts` to include the appropriate `worker` and `optimizeDeps` configuration for the Web Worker bundles.

---

## Project Structure

```
src/
├── App.tsx                    # Root component — orchestrates all hooks and panels
├── ai-worker.ts               # Web Worker: WebLLM (WebGPU) + Transformers.js (WASM) runtimes
├── embedding-worker.ts        # Web Worker: MiniLM embedding pipeline (WebGPU → WASM fallback)
├── vision-worker.ts           # Web Worker: SmolVLM vision-language model
│
├── lib/
│   ├── db.ts                  # Typed IndexedDB schema and singleton connection (idb)
│   ├── rag-engine.ts          # chunkText(), cosineSimilarity(), storeChunks(), searchChunks()
│   ├── model-registry.ts      # Model catalogue, GPU tier → model mapping, f16/f32 resolution
│   ├── gpu-detect.ts          # WebGPU adapter query and hardware tier classification
│   ├── document-parsers.ts    # Format-aware document parsing dispatcher
│   ├── pdf-parser.ts          # pdfjs-dist integration with scanned-PDF detection
│   └── study-engine.ts        # Prompt templates for flashcards, quiz, summary, and problem explain
│
├── hooks/
│   ├── useWebLLM.ts           # Worker lifecycle, Promise map for request/response correlation
│   ├── useRAG.ts              # Embedding request + similarity search orchestration
│   ├── useDocuments.ts        # Document CRUD and upload state
│   ├── useConversations.ts    # Conversation CRUD and message history management
│   ├── useStudyTools.ts       # Flashcard/quiz/summary generation with JSON parsing
│   ├── useVisionModel.ts      # Vision worker lifecycle and analyzeImage() API
│   └── useGPUDetection.ts     # GPU capability detection with loading state
│
└── components/
    ├── Onboarding.tsx          # First-run model selection with GPU capability display
    ├── Header.tsx              # Status bar: model name, GPU adapter, ready state
    ├── Sidebar.tsx             # Conversation list + document library
    ├── ChatPanel.tsx           # Message thread with streaming token display
    ├── DocumentViewer.tsx      # Extracted text and image analysis panel
    ├── StudyTools.tsx          # Flashcard deck, quiz runner, and summary views
    ├── SettingsPanel.tsx       # Runtime model switching
    └── UploadZone.tsx          # Drag-and-drop file upload with format validation
```

---

## Skills Demonstrated

This project was an exercise in pushing JavaScript and browser APIs into territory they weren't originally designed for. The specific competencies it exercises:

- **Browser ML Pipeline Design** — constructing a full RAG stack using only browser-native APIs and WASM/WebGPU runtimes
- **Web Workers & Concurrency** — three parallel worker threads with typed message-passing protocols and Promise-based correlation
- **WebGPU Integration** — querying adapter capabilities, managing quantization formats, and handling the WebGPU → WASM graceful degradation path
- **Typed IndexedDB** — schema design with indexes, versioned upgrades, and atomic transactions in TypeScript
- **Prompt Engineering** — designing structured-output prompts for small models, including JSON extraction fallbacks
- **Async State Management** — managing multiple concurrent loading states (GPU detect → model download → embedding → inference) in React without Suspense
- **Client-Side Parsing** — format detection and text extraction for PDF, DOCX, XLSX, CSV, and image formats entirely without a server

---

*Skopos (σκοπός) — Greek for "aim", "goal", or "the one who watches". The name reflects the application's intent: to help you understand what you're looking at.*
