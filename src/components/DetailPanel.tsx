import { useEffect } from 'react';
import type { AnalysisMeta, BuildingData } from '../types';

interface DetailPanelProps {
  building: BuildingData;
  prompt: string | null;
  analysis: AnalysisMeta | null;
  onClose: () => void;
}

function MetricRow({
  label,
  value,
  score,
  color,
  hint,
}: {
  label: string;
  value: string;
  score: number;
  color: string;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: 0.6 }}>{label}</span>
        <span style={{ fontSize: 14, color: '#0f172a', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{hint}</div>
      )}
      <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${Math.min(100, Math.max(0, score))}%`,
            borderRadius: 999,
            background: color,
            boxShadow: `0 0 12px ${color}66`,
          }}
        />
      </div>
    </div>
  );
}

export default function DetailPanel({ building, prompt, analysis, onClose }: DetailPanelProps) {
  const m = building.metrics;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 360,
        height: '100%',
        background: 'rgba(255,255,255,0.97)',
        borderLeft: '1px solid rgba(15,23,42,0.08)',
        backdropFilter: 'blur(16px)',
        padding: '28px 22px',
        color: '#0f172a',
        fontFamily: 'Inter, system-ui, sans-serif',
        overflowY: 'auto',
        zIndex: 40,
        animation: 'slideIn 0.25s ease-out',
        pointerEvents: 'auto',
        boxShadow: '-12px 0 40px rgba(15,23,42,0.1)',
      }}
    >
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: '#f1f5f9',
          border: '1px solid #e2e8f0',
          color: '#64748b',
          fontSize: 18,
          cursor: 'pointer',
          width: 34,
          height: 34,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ×
      </button>

      <div style={{ marginBottom: 20, paddingRight: 36 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: building.color,
            display: 'inline-block',
            marginRight: 8,
            boxShadow: `0 0 10px ${building.color}`,
          }}
        />
        <span style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
          {building.kind ?? building.modelType} · {building.provider}
        </span>
        <h2 style={{ fontSize: 20, margin: '10px 0 4px', color: '#0f172a' }}>{building.shortName}</h2>
        <div style={{ color: '#94a3b8', fontSize: 12, wordBreak: 'break-all' }}>{building.name}</div>
        {m && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
            Rank <b style={{ color: '#0f172a' }}>#{m.rank}</b>
            {' · '}
            Overall <b style={{ color: '#0f172a' }}>{m.overall.toFixed(1)}</b>/100
          </div>
        )}
      </div>

      {prompt && (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            marginBottom: 16,
            fontSize: 12,
            color: '#9a3412',
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, color: '#c2410c' }}>Your prompt</div>
          {prompt}
        </div>
      )}

      {analysis && (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            marginBottom: 20,
            fontSize: 12,
            color: '#0c4a6e',
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Task: {analysis.taskType}
            {analysis.cacheHit ? ' · cached' : ''}
            {analysis.scoringSource
              ? analysis.scoringSource === 'llm'
                ? ' · quality: Workers AI'
                : ' · quality: heuristic'
              : ''}
          </div>
          {analysis.taskSummary}
          <div style={{ marginTop: 6, color: '#0369a1' }}>
            Est. tokens in/out: {analysis.estInputTokens} / {analysis.estOutputTokens}
          </div>
          {analysis.measurementMode && (
            <div style={{ marginTop: 4, color: '#0369a1' }}>
              Metrics: <b>{analysis.measurementMode}</b>
              {typeof analysis.liveMeasured === 'number'
                ? ` · live-ran ${analysis.liveMeasured}/${analysis.liveAttempted ?? '?'}`
                : ''}
            </div>
          )}
        </div>
      )}

      {m ? (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 12, letterSpacing: 0.8 }}>
            METRICS (NUMBERS)
            {m.metricsSource ? ` · ${m.metricsSource}` : ''}
          </div>
          {m.latencyMs != null && m.latencyMs > 0 && (
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 10 }}>
              Measured latency: <b>{Math.round(m.latencyMs)} ms</b>
              {m.via ? ` via ${m.via}` : ''}
            </div>
          )}
          <MetricRow
            label="COST"
            value={m.costLabel}
            score={m.cost}
            color="#f97316"
            hint={`$${m.estCostUsd.toFixed(6)} USD estimated for this run`}
          />
          <MetricRow
            label="SPEED"
            value={m.speedLabel}
            score={m.speed}
            color="#22c55e"
            hint={`speed score ${(m.speedScore * 100).toFixed(0)}/100`}
          />
          <MetricRow
            label="QUALITY"
            value={m.qualityLabel}
            score={m.quality}
            color="#3b82f6"
            hint="task fit from Workers AI agent"
          />
          <MetricRow
            label="TOKEN USAGE"
            value={m.tokensLabel}
            score={Math.min(100, (m.tokens / 8000) * 100)}
            color="#a855f7"
            hint={`${m.tokens.toLocaleString()} tokens (in+out est.)`}
          />

          {m.rationale && (
            <div
              style={{
                marginTop: 4,
                padding: 12,
                borderRadius: 12,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontSize: 12,
                color: '#475569',
                lineHeight: 1.55,
              }}
            >
              <b style={{ color: '#0f172a' }}>Why this score</b>
              <br />
              {m.rationale}
            </div>
          )}

          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              fontSize: 12,
              color: '#475569',
              lineHeight: 1.55,
            }}
          >
            <b style={{ color: '#0f172a' }}>How this building shows metrics</b>
            <br />
            <span style={{ color: '#f97316' }}>Height + orange $ badge</span> = cost
            <br />
            <span style={{ color: '#3b82f6' }}>Width + glow + blue Q bar</span> = quality
            <br />
            <span style={{ color: '#22c55e' }}>Green neon edges + S bar</span> = speed
            <br />
            <span style={{ color: '#a855f7' }}>Purple roof beam/rings + T bar</span> = tokens
          </div>
        </>
      ) : (
        <div style={{ color: '#64748b', fontSize: 13 }}>Submit a prompt to score this model.</div>
      )}

      <div style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 28 }}>
        Esc to close
      </div>
    </div>
  );
}
