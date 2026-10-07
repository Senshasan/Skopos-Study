# Implementation Details

This document provides a technical walkthrough of Skopos Study's architecture, including its worker processes, the fully localized RAG pipeline, hardware detection strategies, and persistence layers.

## 1. Architecture Overview

Skopos is built as a Single Page Application (SPA) using **React 19** and **Vite**. To prevent the heavy machine learning workloads from freezing the user interface, the application employs a multi-worker architecture.

* **Main Thread**: Handles the React UI, state management, and IndexedDB interactions.
* **AI Worker (`ai-worker.ts`)**: Hosts the primary text generation models using `@mlc-ai/web-llm` and WebGPU.
* **Embedding Worker (`embedding-worker.ts`)**: Generates vector embeddings for document chunks using `Transformers.js` (WASM).
* **Vision Worker (`vision-worker.ts`)**: Handles image parsing and OCR/Visual Question Answering using VLM models like SmolVLM.

Communication between the main thread and these workers is handled via asynchronous message passing (`postMessage`), abstracted into React hooks (`useWebLLM`, `useRAG`, `useVisionModel`).

## 2. Hardware Detection & Model Selection

Browser-native AI must gracefully handle vastly different consumer hardware. When the application loads, `useGPUDetection` queries the browser's capabilities:

1. **WebGPU Support Check**: If `navigator.gpu` is unavailable, the app immediately shows a blocker.
2. **Adapter Probing**: It requests an adapter (`navigator.gpu.requestAdapter`) to read `adapter.info.architecture` and `adapter.limits.maxBufferSize`.
3. **Tier Classification**: 
   * `ultra`: Discrete GPUs with massive buffer sizes (e.g., Apple M-series, high-end RTX cards).
   * `high`/`medium`: Standard dedicated or integrated GPUs.
   * `low`: Older integrated graphics.
4. **Model Registry**: Based on the tier, `model-registry.ts` filters the available models (e.g., `Qwen2.5-7B` for ultra, `Phi-4-mini` for high, `Gemma-2-2B` for medium) so the user isn't presented with models that will instantly cause an Out-of-Memory (OOM) crash.

## 3. The Localized RAG Pipeline

The "Document Specialist" mode is a complete Retrieval-Augmented Generation pipeline built entirely in JavaScript.

### Document Parsing
When a user uploads a file, it is parsed by `document-parsers.ts`.
* **PDFs**: Handled by `pdfjs-dist`.
* **DOCX**: Handled by `mammoth`.
* **CSV/XLSX**: Handled by the `xlsx` library.
* **Images**: Passed to the Vision Worker.

### Semantic-Aware Chunking
Instead of blindly splitting text every 500 characters, `rag-engine.ts` uses a paragraph-first chunking strategy:
* It splits by double newlines (`\n\n`) to preserve paragraph boundaries.
* Paragraphs are batched together until they approach the target word count (~300 words).
* If a single paragraph exceeds the target, it falls back to sentence-level splitting.
* **Overlap**: A 50-word overlap is injected between chunks to maintain context continuity.

### Vector Generation & Storage
* The text chunks are passed to the **Embedding Worker**.
* Using the `Multilingual MiniLM-L12` model (via Transformers.js), the worker generates 384-dimensional floating-point vectors for each chunk.
* To speed up processing, vectors are generated in parallel batches (`Promise.all`).
* The resulting vectors and their corresponding text chunks are stored in **IndexedDB**.

### Semantic Search & Context Injection
When the user asks a question in Document mode:
1. The user's query is vectorized using the Embedding Worker.
2. The `searchChunks` function retrieves all chunks for the active document from IndexedDB.
3. It computes the **Cosine Similarity** between the query vector and every chunk vector.
4. Chunks scoring above the threshold (`0.25`) are sorted, and the top `K` (usually 5) are injected into the LLM prompt.

## 4. Persistence Layer

Skopos uses `idb` (a lightweight wrapper around IndexedDB) to store all state locally, enabling offline functionality.

* **Documents Store**: Stores metadata and raw extracted text.
* **Document Chunks Store**: Stores the split text and the `Float32Array` vectors.
* **Conversations Store**: Stores chat histories.
* **Images/Blobs**: Original files are stored as Data URLs (`blobData`) so they can be re-analyzed by the vision model later if needed.

## 5. Structured JSON Output & Self-Repair

A major feature of Skopos is generating structured Study Tools (Flashcards, Quizzes, Summaries). However, small quantized models frequently output malformed JSON (missing brackets, unescaped quotes).

To solve this, `useStudyTools.ts` implements a **Self-Repairing JSON Loop**:
1. It prompts the model to generate a JSON array.
2. It attempts to parse the response using a custom regex extraction (`extractJsonArray`).
3. If parsing fails, it appends the parser error to the prompt and asks the model: *"You produced invalid JSON. Here is the error... Please fix it."*
4. It retries this up to 3 times, significantly improving the success rate of structured data generation on edge hardware.
