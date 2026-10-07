# Skopos Study

> **A Browser-Native RAG System**
> *A case study in building fully local AI inference using modern web technologies.*

> **Project Status**
> Skopos Study is **not** a production-ready application. It is an engineering case study exploring the limits of browser-native AI. While the underlying architecture proved successful, current browser-side inference with heavily quantized small language models does not yet provide the level of reasoning quality required for a reliable study assistant.
>
> Rather than abandoning the project, I chose to publish it because I believe the engineering challenges, architectural decisions, and lessons learned are just as valuable as a finished product.
> With ever growing hardware capabilties and continuously more efficient and capable smaller open weights models hitting the market, I remain hopeful for the future of projects like this and I'm exicted to see where it will take us.

---

## Why this repository exists

Most AI portfolio projects demonstrate how to integrate a cloud API.

Skopos explores a different question:

> **How much of the modern AI stack can be moved entirely onto the user's device?**

Instead of relying on remote inference servers, Skopos performs document parsing, semantic search, vector storage, retrieval, and language model inference entirely inside a modern web browser. Uploaded documents never leave the user's machine, no backend services are required, and the application continues to function offline once its models have been downloaded.

The project began as a private AI-powered study assistant. Along the way, it became something arguably more interesting: an exploration of what today's browser platform can achieve—and where its current limitations still lie.

---

## Architecture at a Glance

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        React UI (Main Thread)                       │
│  Chat · Documents · Study Tools · Settings · Conversations          │
└──────────────────┬──────────────┬────────────────┬──────────────────┘
                   │postMessage   │postMessage     │postMessage
          ┌────────▼───────┐ ┌────▼─────────┐ ┌────▼─────────────┐
          │ AI Worker      │ │ Embedding    │ │ Vision Worker    │
          │ WebLLM/WebGPU  │ │ Transformers │ │ Image Analysis   │
          │ + WASM Fallback│ │ MiniLM       │ │ OCR / VLM        │
          └────────────────┘ └──────────────┘ └──────────────────┘
                                     │
                           ┌─────────▼──────────┐
                           │    IndexedDB       │
                           │ Documents          │
                           │ Embeddings         │
                           │ Conversations      │
                           │ Settings           │
                           └────────────────────┘
```

The application mirrors the architecture of a traditional Retrieval-Augmented Generation (RAG) system while keeping every stage of the pipeline entirely local. Heavy workloads are isolated into dedicated Web Workers, document embeddings are persisted in IndexedDB, and language models run through WebGPU whenever supported by the user's hardware.

---

## Technical Highlights

* **100% local inference** — No backend, no API keys, no cloud inference.
* **Offline-first architecture** — Once downloaded, models and user data remain available without an internet connection.
* **Browser-native RAG pipeline** — Document parsing, embedding generation, vector search, prompt construction, and inference all execute locally.
* **Automatic hardware detection** — Dynamically selects the most suitable model based on available browser and GPU capabilities.
* **Concurrent worker architecture** — Dedicated workers for inference, embedding generation, and vision tasks keep the interface responsive during heavy computation.
* **Persistent vector storage** — Documents, conversations, and embeddings are stored locally using IndexedDB.
* **Graceful fallback strategy** — Automatically falls back to WebAssembly when WebGPU is unavailable.

---

## Technology Stack

| Layer                  | Technologies                    |
| ---------------------- | ------------------------------- |
| Frontend               | React 19, TypeScript, Vite      |
| Local LLM Inference    | `@mlc-ai/web-llm`, WebGPU       |
| CPU / Fallback Runtime | Transformers.js (WASM)          |
| Embeddings             | MiniLM via Transformers.js      |
| Vision                 | SmolVLM / Florence-2            |
| Persistence            | IndexedDB (`idb`)               |
| Document Parsing       | `pdfjs-dist`, `mammoth`, `xlsx` |
| Parallel Processing    | Web Workers                     |

---

## Engineering Challenges

Designing a browser-native AI application introduces constraints that simply don't exist in traditional cloud deployments.

Some of the problems explored throughout this project include:

* running language models inside the browser using WebGPU
* selecting appropriate models for widely varying consumer hardware
* maintaining a responsive UI while multiple machine learning pipelines execute concurrently
* storing and querying vector embeddings without a server-side database
* balancing context size, latency, memory consumption, and reasoning quality
* designing robust prompt templates for heavily quantized language models
* supporting offline usage while caching multi-gigabyte model weights locally

Many of these problems have established solutions on the server. Solving them entirely inside the browser proved to be an interesting engineering exercise in its own right.

---

## What Worked

Although the application never became production-ready, many of the underlying systems performed exactly as intended.

* Browser-native document parsing for multiple file formats
* Local embedding generation and semantic retrieval
* Multi-worker architecture with non-blocking UI
* Automatic hardware capability detection
* IndexedDB persistence for conversations and vector data
* Browser-side model caching for offline operation
* Streaming inference using WebGPU-enabled models

Architecturally, the project validated that a complete RAG pipeline can operate entirely inside the browser without external infrastructure.

---

## Current Limitations

The primary bottleneck was **model capability**, not application architecture.

Consumer hardware capable of running browser-native inference typically requires heavily quantized language models in the 0.5B–7B parameter range. While some of these models perform surprisingly well for many tasks, they proved insufficient for the level of reliability expected from an educational assistant.

The project exposed several practical limitations:

* weaker reasoning on complex academic material
* unreliable structured JSON generation
* limited context windows
* noticeable inference latency on integrated GPUs

These constraints ultimately prevented Skopos from becoming a tool I would confidently recommend for everyday study.

---

## Why I'm Publishing This

I believe engineering projects don't have to become successful products to be worth sharing.

Skopos demonstrates that modern browsers are capable of hosting remarkably sophisticated AI workloads entirely on-device. At the same time, it highlights the gap that still exists between what current browser runtimes can technically execute and what users expect from a dependable AI application.

For me, that exploration—and the lessons learned throughout it—is more valuable than pretending the project solved problems it didn't.

---

## Documentation

This README provides a high-level overview of the project.

Additional documentation is available for readers interested in the technical details.

* 📖 [**IMPLEMENTATION.md**](IMPLEMENTATION.md) — Detailed walkthrough of the architecture, workers, RAG pipeline, GPU detection, persistence layer, and implementation decisions.
* 📖 [**LESSONS_LEARNED.md**](LESSONS_LEARNED.md) — Engineering retrospective discussing browser limitations, local inference trade-offs, quantization, and why the project ultimately stopped where it did.


---

## Running Locally

```bash
npm install
npm run dev
```

A Chromium-based browser with WebGPU support is recommended for the best experience.

On first launch, the application downloads the selected language model from Hugging Face and stores it locally. Subsequent launches can operate entirely offline.


I hope this repository is useful not only as an example of modern web engineering, but also as an honest account of the trade-offs involved in moving increasingly complex AI workloads from the cloud to the edge.
