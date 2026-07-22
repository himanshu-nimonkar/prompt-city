import type { AnalysisMeta, BuildingData, BuildingFilter } from '../types';

interface HUDProps {
  nearbyBuilding: BuildingData | null;
  viewMode: 'thirdPerson' | 'orbit';
  onToggleView: () => void;
  prompt: string;
  analysis: AnalysisMeta | null;
  buildings: BuildingData[];
  filter: BuildingFilter;
  onFilterChange: (f: BuildingFilter) => void;
  onSelectBuilding: (b: BuildingData) => void;
  onChangePrompt: () => void;
}

const FILTERS: { id: BuildingFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'text', label: 'Text' },
  { id: 'image', label: 'Image' },
  { id: 'embedding', label: 'Embed' },
  { id: 'live', label: 'Live-only' },
];

export default function HUD({
  nearbyBuilding,
  viewMode,
  onToggleView,
  prompt,
  analysis,
  buildings,
  filter,
  onFilterChange,
  onSelectBuilding,
  onChangePrompt,
}: HUDProps) {
  const m = nearbyBuilding?.metrics;

  const top5 = buildings
    .filter((b) => b.metrics)
    .slice()
    .sort((a, b) => (a.metrics?.rank ?? 999) - (b.metrics?.rank ?? 999))
    .slice(0, 5);

  return (
    <div className="hud">
      <div
        className="hud-panel"
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(15,23,42,0.08)',
          borderRadius: 14,
          padding: '14px 16px',
          color: '#334155',
          fontSize: 13,
          fontFamily: 'Inter, system-ui, sans-serif',
          lineHeight: 1.7,
          backdropFilter: 'blur(12px)',
          maxWidth: 320,
          boxShadow: '0 10px 40px rgba(15,23,42,0.12)',
        }}
      >
        <div style={{ color: '#0f172a', marginBottom: 6, fontWeight: 700, letterSpacing: 0.4 }}>
          Prompt City
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
          <span style={{ color: '#f6821f', fontWeight: 600 }}>Prompt:</span>{' '}
          {prompt.length > 80 ? `${prompt.slice(0, 78)}…` : prompt}
        </div>
        {analysis && (
          <div style={{ fontSize: 11, color: '#0369a1', marginBottom: 8, lineHeight: 1.45 }}>
            <b>{analysis.taskType}</b>
            {analysis.cacheHit ? ' · cache hit' : ''}
            {analysis.scoringSource
              ? ` · ${analysis.scoringSource === 'llm' ? 'quality: AI' : 'quality: heuristic'}`
              : ''}
            {analysis.measurementMode ? ` · metrics: ${analysis.measurementMode}` : ''}
            {typeof analysis.liveMeasured === 'number'
              ? ` · live ${analysis.liveMeasured}/${analysis.liveAttempted ?? '?'}`
              : ''}
            <br />
            {analysis.taskSummary}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onFilterChange(f.id)}
                style={{
                  ...chipStyle,
                  background: on ? '#0ea5e9' : '#f8fafc',
                  color: on ? '#fff' : '#334155',
                  borderColor: on ? '#0284c7' : '#e2e8f0',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 12 }}>
          <span style={{ color: '#0ea5e9', fontWeight: 600 }}>WASD</span> walk ·{' '}
          <span style={{ color: '#0ea5e9', fontWeight: 600 }}>drag</span> look ·{' '}
          <span style={{ color: '#0ea5e9', fontWeight: 600 }}>click</span> inspect
        </div>
        <div style={{ fontSize: 12 }}>
          <span style={{ color: '#0ea5e9', fontWeight: 600 }}>E</span> inspect ·{' '}
          <span style={{ color: '#0ea5e9', fontWeight: 600 }}>F</span> orbit
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onToggleView} style={btnStyle}>
            {viewMode === 'thirdPerson' ? 'Orbit view' : 'Walk view'}
          </button>
          <button
            type="button"
            onClick={onChangePrompt}
            style={{ ...btnStyle, background: '#fff7ed', borderColor: '#fdba74', color: '#c2410c' }}
          >
            New prompt
          </button>
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: '#94a3b8',
            borderTop: '1px solid #e2e8f0',
            paddingTop: 8,
            lineHeight: 1.55,
          }}
        >
          <b style={{ color: '#0f172a' }}>Building encodes:</b>
          <br />
          Height+$ = cost · Width/blue = quality · Green = speed · Purple = tokens
        </div>
      </div>

      {/* Leaderboard strip */}
      {top5.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 8,
            maxWidth: 'min(920px, 92vw)',
            overflowX: 'auto',
            padding: '4px 2px',
            zIndex: 30,
          }}
        >
          {top5.map((b) => {
            const mm = b.metrics!;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelectBuilding(b)}
                style={{
                  flex: '0 0 auto',
                  textAlign: 'left',
                  border: '1px solid rgba(15,23,42,0.1)',
                  background: 'rgba(255,255,255,0.95)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  minWidth: 148,
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, color: '#f6821f' }}>#{mm.rank}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: b.color, marginTop: 2 }}>
                  {b.shortName}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {mm.qualityLabel} · {mm.costLabel}
                  <br />
                  {mm.speedLabel} · {mm.tokensLabel}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {nearbyBuilding && (
        <div
          style={{
            position: 'absolute',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255,255,255,0.95)',
            border: '1px solid rgba(15,23,42,0.1)',
            borderRadius: 14,
            padding: '12px 20px',
            color: '#0f172a',
            fontSize: 14,
            fontFamily: 'Inter, system-ui, sans-serif',
            backdropFilter: 'blur(12px)',
            textAlign: 'center',
            minWidth: 340,
            boxShadow: '0 12px 40px rgba(15,23,42,0.15)',
          }}
        >
          <div style={{ color: nearbyBuilding.color, fontWeight: 700, marginBottom: 4 }}>
            {nearbyBuilding.shortName}
            {m ? ` · #${m.rank}` : ''}
          </div>
          {m ? (
            <div
              style={{
                display: 'flex',
                gap: 14,
                justifyContent: 'center',
                fontSize: 12,
                color: '#475569',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>
                cost <b style={{ color: '#c2410c' }}>{m.costLabel}</b>
              </span>
              <span>
                speed <b style={{ color: '#15803d' }}>{m.speedLabel}</b>
              </span>
              <span>
                quality <b style={{ color: '#1d4ed8' }}>{m.qualityLabel}</b>
              </span>
              <span>
                tok <b style={{ color: '#7e22ce' }}>{m.tokensLabel}</b>
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#64748b' }}>{nearbyBuilding.provider}</div>
          )}
          <div style={{ marginTop: 6, fontSize: 12, color: '#b45309' }}>
            Click or press <b style={{ color: '#0ea5e9' }}>E</b> for full breakdown
          </div>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(255,255,255,0.9)',
          border: '1px solid rgba(15,23,42,0.08)',
          borderRadius: 10,
          padding: '8px 14px',
          color: '#475569',
          fontSize: 11,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 600,
          letterSpacing: 0.6,
          boxShadow: '0 6px 20px rgba(15,23,42,0.1)',
        }}
      >
        {viewMode === 'thirdPerson' ? 'WALK' : 'ORBIT'} · DAY
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12,
  color: '#334155',
  cursor: 'pointer',
  fontWeight: 600,
};

const chipStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 999,
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
};
