import { GPUTier, GPUCapabilities } from './gpu-detect';
import { EMBEDDING_MODEL_ID, VISION_MODEL_ID } from './constants';

export interface ModelConfig {
  id: string;
  fallbackId?: string;
  displayName: string;
  params: string;
  runtime: 'webllm' | 'transformers';
  tier: GPUTier;
  estimatedVRAM: string;
  description: string;
}

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
    id: 'Phi-4-mini-instruct-q4f16_1-MLC',
    fallbackId: 'Phi-4-mini-instruct-q4f32_1-MLC',
    displayName: 'Phi-4 Mini',
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
];

export const VISION_MODELS = {
  default: {
    id: VISION_MODEL_ID,
    displayName: 'SmolVLM 256M',
    description: 'Fast, lightweight image understanding.',
  },
};

export const EMBEDDING_MODEL = {
  id: EMBEDDING_MODEL_ID,
  displayName: 'Multilingual MiniLM-L12',
  dimensions: 384,
};

const tierRank: Record<GPUTier, number> = {
  low: 1,
  medium: 2,
  high: 3,
  ultra: 4,
};

// Returns the f16 model id if the GPU supports it, otherwise the f32 fallback.
export function resolveModelId(model: ModelConfig, capabilities: GPUCapabilities): string {
  if (!capabilities.supportsF16 && model.fallbackId) {
    return model.fallbackId;
  }
  return model.id;
}

export function getRecommendedModel(capabilities: GPUCapabilities): ModelConfig {
  const targetTier = capabilities.recommendedTier;
  // If low tier (no WebGPU or <3GB), recommend the lowest model we have, but it will probably OOM
  const targetRank = tierRank[targetTier] || 1; 

  // find the highest tier model that is <= targetRank
  // Models are currently sorted highest to lowest tier generally, but filter is safer
  const available = TEXT_MODELS.filter(m => tierRank[m.tier] <= targetRank);
  return available.length > 0 ? available[0] : TEXT_MODELS[TEXT_MODELS.length - 1];
}

export function getAvailableModels(capabilities: GPUCapabilities): ModelConfig[] {
  const targetRank = tierRank[capabilities.recommendedTier] || 1;
  const available = TEXT_MODELS.filter(m => tierRank[m.tier] <= targetRank);
  return available.length > 0 ? available : [TEXT_MODELS[TEXT_MODELS.length - 1]];
}