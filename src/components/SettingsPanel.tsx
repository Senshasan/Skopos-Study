import { X, Cpu, HardDrive } from 'lucide-react';
import { GPUCapabilities } from '../lib/gpu-detect';
import { TEXT_MODELS, VISION_MODELS } from '../lib/model-registry';

interface SettingsPanelProps {
  onClose: () => void;
  capabilities: GPUCapabilities | null;
  currentModelId: string;
  onModelChange: (modelId: string) => void;
  // We'll stub vision model selection for now, it uses SmolVLM default
}

export function SettingsPanel({ onClose, capabilities, currentModelId, onModelChange }: SettingsPanelProps) {
  
  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: '400px',
      background: 'var(--color-bg-surface)', backdropFilter: 'blur(16px)',
      borderLeft: '1px solid var(--color-border)',
      boxShadow: '-10px 0 20px rgba(0,0,0,0.5)',
      zIndex: 100, display: 'flex', flexDirection: 'column'
    }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Settings</h2>
        <button className="btn-icon" onClick={onClose}><X size={20} /></button>
      </div>

      <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
        <section style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Hardware</h3>
          
          <div style={{ background: 'var(--color-bg-base)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Cpu size={16} color="var(--color-primary)" />
              <strong style={{ fontSize: '0.9rem' }}>{capabilities?.adapterName || 'Unknown'}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              <HardDrive size={16} />
              Buffer Limit: {capabilities?.maxBufferSizeMB ? `${capabilities.maxBufferSizeMB} MB` : 'N/A'}
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-success)' }}>
              WebGPU Supported: {capabilities?.supported ? 'Yes' : 'No'}
            </div>
          </div>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Text LLM Selection</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            Changing models will require downloading the new model if it isn't cached.
          </p>
          
          <select 
            className="input-base" 
            value={currentModelId} 
            onChange={(e) => onModelChange(e.target.value)}
          >
            {TEXT_MODELS.map(model => (
              <option key={model.id} value={model.id}>
                {model.displayName} - {model.estimatedVRAM}
              </option>
            ))}
          </select>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Vision Model</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            Used when analyzing images. Loads on-demand.
          </p>
          <select className="input-base" defaultValue={VISION_MODELS.default.id}>
            <option value={VISION_MODELS.default.id}>{VISION_MODELS.default.displayName} (Default, Fast)</option>
          </select>
        </section>
      </div>
    </div>
  );
}
