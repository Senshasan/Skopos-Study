import { useState } from 'react';
import { GPUCapabilities } from '../lib/gpu-detect';
import { ModelConfig, TEXT_MODELS, getAvailableModels } from '../lib/model-registry';
import { Download, HardDrive, ShieldCheck, ChevronRight } from 'lucide-react';

interface OnboardingProps {
  capabilities: GPUCapabilities;
  recommendedModel: ModelConfig;
  onComplete: (modelId: string) => void;
}

export function Onboarding({ capabilities, recommendedModel, onComplete }: OnboardingProps) {
  const [selectedModel, setSelectedModel] = useState(recommendedModel.id);

  const availableModels = getAvailableModels(capabilities);

  if (!capabilities.supported) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--color-bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: '600px', width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-error)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: 'var(--shadow-lg)', padding: '3rem', textAlign: 'center' }}>
          <ShieldCheck size={48} style={{ color: 'var(--color-error)', margin: '0 auto 1.5rem auto' }} />
          <h1 style={{ fontSize: '1.75rem', marginBottom: '1rem', color: 'var(--color-error)' }}>WebGPU Not Available</h1>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Skopos Study v2 requires a WebGPU-compatible browser and a dedicated graphics card with at least 8GB of VRAM or system RAM (for Unified Memory). 
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            We've removed the slow CPU fallback models to focus on delivering a high-performance experience. Please try again on a supported device or browser (Chrome/Edge desktop).
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'var(--color-bg-base)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{
        maxWidth: '800px', width: '100%',
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{ padding: '3rem', borderBottom: '1px solid var(--color-border)' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem', background: 'linear-gradient(to right, var(--color-primary), var(--color-accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Welcome to Skopos Study
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--color-text-muted)' }}>
            Your private, 100% local AI study assistant.
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '3rem' }}>
            <div>
              <ShieldCheck size={32} style={{ color: 'var(--color-success)', marginBottom: '1rem' }} />
              <h3>Complete Privacy</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>All processing happens on your device. Your documents never leave your computer.</p>
            </div>
            <div>
              <HardDrive size={32} style={{ color: 'var(--color-primary)', marginBottom: '1rem' }} />
              <h3>Hardware Accelerated</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>We use WebGPU to run advanced AI models directly in your browser.</p>
            </div>
          </div>
        </div>
        
        <div style={{ padding: '3rem', background: 'rgba(0,0,0,0.2)' }}>
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Download size={20} />
            Initial Model Download
          </h3>
          
          <div style={{ 
            padding: '1rem', background: 'var(--color-bg-base)', 
            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-strong)',
            marginBottom: '2rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Detected Hardware:</span>
              <strong>{capabilities.adapterName}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Recommended Model Tier:</span>
              <span style={{ textTransform: 'capitalize', color: 'var(--color-accent)' }}>{capabilities.recommendedTier}</span>
            </div>
          </div>

          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            To get started, we need to download the AI model to your browser cache. This only happens once.
          </p>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <select 
              className="input-base" 
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{ flex: 1 }}
            >
              {availableModels.map(model => (
                <option key={model.id} value={model.id}>
                  {model.displayName} ({model.estimatedVRAM}) {model.id === recommendedModel.id ? '★ Recommended' : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              className="btn btn-primary" 
              style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}
              onClick={() => onComplete(selectedModel)}
            >
              Download & Start <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
