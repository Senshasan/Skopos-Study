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
    id: 'DeepSeek-R1-Distill-Qwen-14B-q4f16_1-MLC',
    fallbackId: 'DeepSeek-R1-Distill-Qwen-14B-q4f32_1-MLC',
    displayName: 'DeepSeek-R1-Distill 14B',
    params: '14B',
    runtime: 'webllm',
    tier: 'ultra',
    estimatedVRAM: '8GB+',
    description: 'Opt-in reasoning heavy-hitter. Produces deep thinking traces before answering.',
  },
  {
    id: 'Qwen3-14B-Instruct-q4f16_1-MLC',
    fallbackId: 'Qwen3-14B-Instruct-q4f32_1-MLC',
    displayName: 'Qwen3 14B',
    params: '14B',
    runtime: 'webllm',
    tier: 'ultra',
    estimatedVRAM: '8GB+',
    description: 'Powerful model with deep reasoning and hybrid thinking mode. Best for desktops.',
  },
  {
    id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
    fallbackId: 'Llama-3.1-8B-Instruct-q4f32_1-MLC',
    displayName: 'Llama 3.1 8B',
    params: '8B',
    runtime: 'webllm',
    tier: 'high',
    estimatedVRAM: '5GB+',
    description: 'Best all-rounder instruction following model.',
  },
  {
    id: 'Qwen3-4B-Instruct-q4f16_1-MLC',
    fallbackId: 'Qwen3-4B-Instruct-q4f32_1-MLC',
    displayName: 'Qwen3 4B',
    params: '4B',
    runtime: 'webllm',
    tier: 'medium',
    estimatedVRAM: '3.5GB+',
    description: 'Fast, smart, with optional thinking mode. Great balance.',
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
  displayName: 'Multilingual MiniLM',
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
  return TEXT_MODELS.filter(m => tierRank[m.tier] <= targetRank);
}