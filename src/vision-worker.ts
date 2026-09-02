import { AutoModelForVision2Seq, AutoProcessor, RawImage, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

class VisionPipeline {
  static modelId = 'Xenova/SmolVLM-256M-Instruct';
  static model: any = null;
  static processor: any = null;

  static async getInstance(progress_callback?: Function) {
    if (this.model === null) {
      this.processor = await AutoProcessor.from_pretrained(this.modelId, { progress_callback: progress_callback as any });
      this.model = await AutoModelForVision2Seq.from_pretrained(this.modelId, {
        device: 'webgpu', // Will fallback or fail if not available. We can catch and try wasm
        dtype: 'q4',
        progress_callback: progress_callback as any
      }).catch(async (e) => {
        console.warn("WebGPU failed for vision, falling back to WASM", e);
        return await AutoModelForVision2Seq.from_pretrained(this.modelId, {
          device: 'wasm',
          dtype: 'q4',
          progress_callback: progress_callback as any
        });
      });
    }
    return { model: this.model, processor: this.processor };
  }
}

self.addEventListener('message', async (event) => {
  const { type, id, imageUrl, prompt } = event.data;

  if (type === 'INIT') {
    try {
      await VisionPipeline.getInstance((x: any) => {
        self.postMessage({ type: 'PROGRESS', progress: x });
      });
      self.postMessage({ type: 'PROGRESS', progress: { status: 'ready' } });
    } catch (e: any) {
      self.postMessage({ type: 'ERROR', error: e.message });
    }
  } else if (type === 'DESCRIBE_IMAGE') {
    try {
      const { model, processor } = await VisionPipeline.getInstance((x: any) => {
        self.postMessage({ type: 'PROGRESS', progress: x });
      });

      const image = await RawImage.fromURL(imageUrl);
      
      const defaultPrompt = prompt || "Describe this image in detail, noting any important text, diagrams, or objects.";
      const messages = [
        { role: 'user', content: [{ type: 'image' }, { type: 'text', text: defaultPrompt }] }
      ];
      
      const textPrompt = processor.apply_chat_template(messages, { add_generation_prompt: true });
      const inputs = await processor(textPrompt, image);

      const outputs = await model.generate({
        ...inputs,
        max_new_tokens: 256,
      });

      const generated_text = processor.batch_decode(outputs, { skip_special_tokens: true })[0];
      
      // Attempt to strip prompt from generated text
      let cleaned = generated_text;
      if (cleaned.includes(defaultPrompt)) {
        cleaned = cleaned.split(defaultPrompt).pop()?.trim() || cleaned;
      }

      self.postMessage({
        type: 'VISION_RESULT',
        id,
        description: cleaned,
      });
    } catch (error: any) {
      self.postMessage({
        type: 'ERROR',
        id,
        error: error.message,
      });
    }
  }
});
