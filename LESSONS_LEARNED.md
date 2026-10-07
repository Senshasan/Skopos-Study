# Lessons Learned: The Reality of Browser-Native AI

Skopos Study began as an ambitious attempt to build a holistic, all-knowing study assistant that runs entirely inside a web browser. Over the course of development, it evolved into a highly specialized local Document RAG tool. 

This document serves as an engineering retrospective on why that evolution happened, discussing the limitations of browser runtimes, the trade-offs of local inference, and the current realities of edge AI.

## 1. The Promise vs. Reality of Browser AI

The promise of browser-native AI is incredible: zero server costs, absolute data privacy, offline functionality, and no complex backend deployments. Libraries like `@mlc-ai/web-llm` and `Transformers.js` make the integration surprisingly straightforward from a code perspective.

**The Reality:** The hardware fragmentation among users is immense. While an Apple M3 Max with unified memory can run a 14B parameter model beautifully in Chrome, the average Windows laptop with Intel Iris Xe graphics will struggle to load a 2B parameter model without browser freezes or Out-Of-Memory (OOM) crashes.

Building for the browser means building for the lowest common denominator, or aggressively filtering users based on hardware.

## 2. The Fallback Fallacy

Initially, Skopos included fallback models (`SmolLM2-360M`) running on CPU/WASM for users without WebGPU support. 

**Lesson Learned:** We dropped the CPU fallbacks completely. While it is technically impressive that you *can* run a 360M parameter language model on a CPU in JavaScript, the output quality is insufficient for a study assistant. Small models hallucinate wildly, fail to follow complex system prompts, and cannot reliably format JSON.

By making WebGPU a strict requirement, we accepted a smaller user base in exchange for a baseline level of quality (e.g., `Gemma-2-2B` or `Phi-4-mini`).

## 3. WebGPU Nuances & UX Friction

WebGPU is powerful, but it is not seamless.

* **Shader Compilation:** The first time a user loads a model, WebGPU must compile compute shaders. This is a blocking, heavy operation. Even inside a Web Worker, it can cause the browser to stutter or briefly freeze. 
* **VRAM Limits:** Browsers impose strict limits on maximum buffer allocations per tab. A user might have a 12GB RTX 4070, but Chrome may limit the tab to 4GB of usable VRAM for WebGPU. This artificially limits the size of models we can run.
* **Cache Management:** Caching a 3GB model in the browser's Cache API is great for offline use, but browsers can aggressively evict this cache if disk space gets low, forcing massive re-downloads without warning.

## 4. Why Local RAG is the "Sweet Spot"

The original goal of Skopos was a "Holistic Study Assistant"—a tool you could ask complex, abstract questions about broad academic fields. 

**Lesson Learned:** Small, highly quantized models (1.5B - 8B parameters) are terrible at holistic, zero-shot reasoning. Their compressed weights simply don't contain the depth of world knowledge found in cloud models like GPT-4 or Claude 3.5. 

However, these same small models are **excellent** at reading comprehension. 

When we shifted focus to the **Document Specialist** mode (Local RAG), the quality skyrocketed. By parsing a user's document, chunking it semantically, searching via vector embeddings, and injecting the exact paragraphs into the prompt, the LLM no longer needed world knowledge. It just needed to summarize and format the text we handed it.

For targeted tasks grounded in explicit context, edge models punch far above their weight.

## 5. Prompt Engineering for Small Models

Prompting an 8B quantization in the browser is very different from prompting a frontier model.
* **Forget subtlety:** Small models ignore polite suggestions. Instructions must be blunt, capitalized, and highly structured (e.g., `[CRITICAL: DO NOT INVENT INFORMATION]`).
* **JSON is hard:** Even instruction-tuned small models frequently fail to close JSON brackets or properly escape quotes. We had to implement a "Self-Repair" loop that catches `JSON.parse` errors and feeds the stack trace back to the model, asking it to fix its own syntax. Surprisingly, this works almost every time.

## 6. Conclusion

Moving AI workloads to the edge is viable today, but it requires narrowing the scope of the application. 

You cannot build a flawless, omniscient oracle in the browser yet. But you *can* build incredibly fast, private, and capable tools that perform specific tasks over provided data. Skopos Study proves that localized RAG is not just a proof-of-concept; it is a highly practical architecture for modern web applications.
