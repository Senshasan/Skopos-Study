import { Settings, Cpu, ChevronDown } from 'lucide-react';

interface HeaderProps {
  isModelReady: boolean;
  gpuAdapterName: string;
  modelName: string;
  activeTab: 'chat' | 'document';
  onTabChange: (tab: 'chat' | 'document') => void;
  onOpenSettings: () => void;
}

export function Header({ isModelReady, gpuAdapterName, modelName, activeTab, onTabChange, onOpenSettings }: HeaderProps) {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1rem 1.5rem',
      borderBottom: '1px solid var(--color-border)',
      background: 'var(--color-bg-surface)',
      backdropFilter: 'blur(12px)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          width: '32px', 
          height: '32px', 
          borderRadius: 'var(--radius-md)', 
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
          color: 'white',
          fontWeight: 'bold',
          fontSize: '1.2rem'
        }}>
          S
        </div>
        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Skopos Study</h1>
      </div>

      <div style={{ display: 'flex', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-lg)', padding: '0.25rem', border: '1px solid var(--color-border)' }}>
        <button
          className="btn"
          style={{ 
            borderRadius: 'var(--radius-md)', 
            background: activeTab === 'chat' ? 'var(--color-bg-surface-hover)' : 'transparent',
            color: activeTab === 'chat' ? 'var(--color-text-main)' : 'var(--color-text-muted)'
          }}
          onClick={() => onTabChange('chat')}
        >
          Chat
        </button>
        <button
          className="btn"
          style={{ 
            borderRadius: 'var(--radius-md)', 
            background: activeTab === 'document' ? 'var(--color-bg-surface-hover)' : 'transparent',
            color: activeTab === 'document' ? 'var(--color-text-main)' : 'var(--color-text-muted)'
          }}
          onClick={() => onTabChange('document')}
        >
          Document Specialist
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          <Cpu size={16} />
          <span title={gpuAdapterName} style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {gpuAdapterName}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.75rem', background: 'var(--color-bg-base)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', fontSize: '0.875rem' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isModelReady ? 'var(--color-success)' : 'var(--color-warning)',
            boxShadow: isModelReady ? '0 0 8px var(--color-success)' : 'none'
          }} />
          {modelName}
        </div>

        <button className="btn-icon" onClick={onOpenSettings} title="Settings">
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
}
