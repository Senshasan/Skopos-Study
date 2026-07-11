export type GPUTier = 'ultra' | 'high' | 'medium' | 'low' | 'cpu';

export interface GPUCapabilities {
  supported: boolean;
  adapterName: string;
  maxBufferSize: number;
  maxBufferSizeMB: number;
  recommendedTier: GPUTier;
  supportsF16: boolean;
}

declare global {
  interface Navigator {
    gpu?: any;
  }
}

export async function detectGPUCapabilities(): Promise<GPUCapabilities> {
  if (!navigator.gpu) {
    return {
      supported: false,
      adapterName: 'Unknown (CPU)',
      maxBufferSize: 0,
      maxBufferSizeMB: 0,
      recommendedTier: 'cpu',
      supportsF16: false,
    };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error('No appropriate GPU adapter found.');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapterExt = adapter as any;
    const info = adapterExt.info
      ? adapterExt.info
      : adapterExt.requestAdapterInfo
        ? await adapterExt.requestAdapterInfo()
        : {};

    const maxBufferSize = adapter.limits.maxStorageBufferBindingSize;
    const maxBufferSizeMB = Math.round(maxBufferSize / (1024 * 1024));
    const supportsF16 = adapter.features.has('shader-f16');

    let tier: GPUTier = 'low';
    if (maxBufferSizeMB >= 4096) {
      tier = 'ultra';
    } else if (maxBufferSizeMB >= 2048) {
      tier = 'high';
    } else if (maxBufferSizeMB >= 1024) {
      tier = 'medium';
    }

    return {
      supported: true,
      adapterName: info.description || info.vendor || 'Generic WebGPU Adapter',
      maxBufferSize,
      maxBufferSizeMB,
      recommendedTier: tier,
      supportsF16,
    };
  } catch (err) {
    console.error('Failed to request WebGPU adapter:', err);
    return {
      supported: false,
      adapterName: 'Unknown (Fallback)',
      maxBufferSize: 0,
      maxBufferSizeMB: 0,
      recommendedTier: 'cpu',
      supportsF16: false,
    };
  }
}