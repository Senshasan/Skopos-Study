import { WebWorkerMLCEngineHandler, MLCEngine } from '@mlc-ai/web-llm';
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

// 1. WebLLM (WebGPU) Handler
let mlcEngine: MLCEngine | null = null;
let mlcHandler: WebWorkerMLCEngineHandler | null = null;

// 2. Transformers.js (CPU/WASM) Handler
let hfPipeline: any = null;
let currentRuntime: 'webllm' | 'transformers' | null = null;

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  // If this is a custom message from our app
  if (type === 'INIT_CUSTOM') {
    const { modelId, runtime } = payload;
    currentRuntime = runtime;

    try {
      if (runtime === 'webllm') {
        // We initialize WebLLM manually instead of using CreateWebWorkerMLCEngine on main thread
        // This gives us more control over the dual-runtime setup.
        mlcEngine = new MLCEngine();
        let lastProgressTime = 0;
        mlcEngine.setInitProgressCallback((progress) => {
          const now = Date.now();
          if (now - lastProgressTime > 100) {
            self.postMessage({ type: 'INIT_PROGRESS', payload: progress });
            lastProgressTime = now;
          }
        });
        
        await mlcEngine.reload(modelId);
        self.postMessage({ type: 'READY', payload: { modelId } });
      } else if (runtime === 'transformers') {
        // Initialize Transformers.js
          let lastHfProgress = 0;
          const progress_callback = (prog: any) => {
             const now = Date.now();
             if (now - lastHfProgress > 100 || prog.status === 'done' || prog.status === 'ready') {
               self.postMessage({ type: 'INIT_PROGRESS', payload: { text: prog.status === 'downloading' ? `Downloading ${prog.name}...` : 'Initializing...', progress: prog.progress ? prog.progress / 100 : 0 } });
               lastHfProgress = now;
             }
          };
          
          hfPipeline = await pipeline('text-generation', modelId, {
            device: 'wasm',
            dtype: 'q4',
            progress_callback
          });
        self.postMessage({ type: 'READY', payload: { modelId } });
      }
    } catch (error: any) {
      console.error("AI Worker Error:", error);
      self.postMessage({ type: 'ERROR', payload: { error: error.message || String(error) } });
    }
  }

  else if (type === 'CHAT_REQUEST') {
    const { messages, generationConfig, id } = payload;
    try {
      if (currentRuntime === 'webllm' && mlcEngine) {
        const asyncChunkGenerator = await mlcEngine.chat.completions.create({
          messages,
          stream: true,
          ...generationConfig
        }) as any;
        
        let fullResponse = '';
        for await (const chunk of asyncChunkGenerator) {
          const content = chunk.choices[0]?.delta?.content || '';
          fullResponse += content;
          self.postMessage({ type: 'CHAT_CHUNK', payload: { id, token: content, isComplete: false } });
        }
        self.postMessage({ type: 'CHAT_COMPLETE', payload: { id, fullResponse } });
        
      } else if (currentRuntime === 'transformers' && hfPipeline) {
        // Transformers.js chat template handling
        const prompt = hfPipeline.tokenizer.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true });
        
        const out = await hfPipeline(prompt, { max_new_tokens: 512, do_sample: true, temperature: 0.7 });
        let generated_text = out[0].generated_text;
        
        // Sometimes the prompt is included in the output depending on the model/tokenizer
        if (generated_text.startsWith(prompt)) {
          generated_text = generated_text.slice(prompt.length);
        }
        
        // Fake streaming for UI consistency without blocking
        const tokens = generated_text.split(/(?=\s)|(?<=\s)/); // Split keeping whitespace
        for (const token of tokens) {
          self.postMessage({ type: 'CHAT_CHUNK', payload: { id, token, isComplete: false } });
        }
        
        self.postMessage({ type: 'CHAT_COMPLETE', payload: { id, fullResponse: generated_text } });
      }
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', payload: { id, error: error.message } });
    }
  }
});