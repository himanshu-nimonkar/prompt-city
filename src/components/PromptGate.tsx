import { useState } from 'react';

interface PromptGateProps {
  onSubmit: (prompt: string) => void;
}

const EXAMPLES = [
  'Write a TypeScript API client with retries',
  'Generate a product hero image for a fintech app',
  'Transcribe this meeting and summarize action items',
  'Embed docs for RAG search over our wiki',
  'Best quality code review for a production PR',
];

export default function PromptGate({ onSubmit }: PromptGateProps) {
  const [prompt, setPrompt] = useState('');

  const submit = () => {
    const t = prompt.trim();
    if (!t) return;
    onSubmit(t);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(ellipse at 30% 20%, rgba(249,115,22,0.18), transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(56,189,248,0.15), transparent 45%), rgba(8,12,24,0.92)',
        backdropFilter: 'blur(12px)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: 'min(560px, 92vw)',
          background: 'rgba(255,255,255,0.96)',
          borderRadius: 20,
          padding: '32px 28px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #f6821f, #faad3f)',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: 18,
            }}
          >
            CF
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Prompt City</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              Compare models by cost, speed, quality & tokens
            </div>
          </div>
        </div>

        <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.55, margin: '16px 0 18px' }}>
          Enter a prompt. The model-advisor backend scores every catalog model. Buildings grow by
          cost; inside each tower, quality, speed, and tokens light up as colored cores.
        </p>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder="e.g. Refactor this React form to use react-hook-form…"
          rows={4}
          style={{
            width: '100%',
            resize: 'vertical',
            borderRadius: 12,
            border: '1.5px solid #e2e8f0',
            padding: '14px 16px',
            fontSize: 15,
            fontFamily: 'inherit',
            color: '#0f172a',
            outline: 'none',
            boxSizing: 'border-box',
            background: '#f8fafc',
          }}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setPrompt(ex)}
              style={{
                border: '1px solid #e2e8f0',
                background: '#fff',
                borderRadius: 999,
                padding: '6px 12px',
                fontSize: 12,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              {ex.length > 42 ? `${ex.slice(0, 40)}…` : ex}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!prompt.trim()}
          style={{
            marginTop: 20,
            width: '100%',
            border: 'none',
            borderRadius: 12,
            padding: '14px 18px',
            fontSize: 15,
            fontWeight: 600,
            cursor: prompt.trim() ? 'pointer' : 'not-allowed',
            color: '#fff',
            background: prompt.trim()
              ? 'linear-gradient(135deg, #f6821f 0%, #e11d48 100%)'
              : '#cbd5e1',
            boxShadow: prompt.trim() ? '0 8px 24px rgba(246,130,31,0.35)' : 'none',
          }}
        >
          Build my model city →
        </button>
        <div style={{ marginTop: 10, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
          ⌘/Ctrl + Enter to submit
        </div>
      </div>
    </div>
  );
}
