import { Canvas } from '@react-three/fiber';
import { KeyboardControls } from '@react-three/drei';
import Scene from './components/Scene';
import HUD from './components/HUD';
import DetailPanel from './components/DetailPanel';
import PromptGate from './components/PromptGate';
import { useState, useCallback, useMemo, Component, type ReactNode } from 'react';
import type { AnalysisMeta, BuildingData, BuildingFilter } from './types';
import { BUILDINGS, buildingsFromResults } from './data/mockBuildings';
import { analyzePrompt } from './api/modelAdvisor';

const controls = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'leftward', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'rightward', keys: ['KeyD', 'ArrowRight'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'inspect', keys: ['KeyE'] },
  { name: 'toggleView', keys: ['KeyF'] },
];

function matchesFilter(b: BuildingData, filter: BuildingFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'live') return b.metrics?.metricsSource === 'live' || b.metrics?.metricsSource === 'history';
  if (filter === 'text') return b.modelType === 'text' || b.modelType === 'code' || b.modelType === 'vision';
  if (filter === 'image') return b.modelType === 'image';
  if (filter === 'embedding') return b.modelType === 'embedding';
  return true;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err.message || 'Render error' };
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: '#0f172a',
            color: '#fff',
            fontFamily: 'system-ui',
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div>
            <h2 style={{ marginBottom: 8 }}>3D scene failed to load</h2>
            <p style={{ color: '#94a3b8', maxWidth: 420 }}>{this.state.error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16,
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#f6821f',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [userPrompt, setUserPrompt] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingData | null>(null);
  const [nearbyBuilding, setNearbyBuilding] = useState<BuildingData | null>(null);
  const [viewMode, setViewMode] = useState<'thirdPerson' | 'orbit'>('orbit');
  const [buildings, setBuildings] = useState<BuildingData[]>(BUILDINGS);
  const [analysis, setAnalysis] = useState<AnalysisMeta | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [growKey, setGrowKey] = useState(0);
  const [filter, setFilter] = useState<BuildingFilter>('all');
  const [focusBuilding, setFocusBuilding] = useState<BuildingData | null>(null);

  const cityReady = Boolean(userPrompt && analysis && !analyzing);

  const handleInspect = useCallback((building: BuildingData | null) => {
    setSelectedBuilding(building);
    if (building) {
      setFocusBuilding(building);
      setViewMode('orbit');
    }
  }, []);

  const handleNearby = useCallback((building: BuildingData | null) => {
    setNearbyBuilding(building);
  }, []);

  const toggleView = useCallback(() => {
    setViewMode((prev) => (prev === 'thirdPerson' ? 'orbit' : 'thirdPerson'));
  }, []);

  const handlePrompt = useCallback(async (prompt: string) => {
    setUserPrompt(prompt);
    setSelectedBuilding(null);
    setNearbyBuilding(null);
    setFocusBuilding(null);
    setFilter('all');
    setViewMode('orbit');
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalysis(null);
    setBuildings(BUILDINGS.map((b) => ({ ...b, height: 6, metrics: undefined })));

    try {
      const res = await analyzePrompt(prompt);
      const next = buildingsFromResults(res.results);
      setBuildings(next);
      setAnalysis({
        analysisId: res.analysisId,
        taskType: res.taskType,
        taskSummary: res.taskSummary,
        estInputTokens: res.estInputTokens,
        estOutputTokens: res.estOutputTokens,
        scoringSource: res.scoringSource,
        measurementMode: res.measurementMode,
        liveMeasured: res.liveMeasured,
        liveAttempted: res.liveAttempted,
        cacheHit: res.cacheHit,
      });
      setGrowKey((k) => k + 1);
    } catch (err) {
      setAnalyzeError((err as Error).message || 'Analysis failed');
      setBuildings(BUILDINGS);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const visibleBuildings = useMemo(
    () => buildings.filter((b) => matchesFilter(b, filter)),
    [buildings, filter],
  );

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: '#87ceeb',
      }}
    >
      {!userPrompt && <PromptGate onSubmit={handlePrompt} />}

      {userPrompt && analyzing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(8,12,24,0.72)',
            backdropFilter: 'blur(8px)',
            fontFamily: 'Inter, system-ui, sans-serif',
            color: '#fff',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                border: '3px solid rgba(246,130,31,0.25)',
                borderTopColor: '#f6821f',
                margin: '0 auto 16px',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Scoring models…</div>
            <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
              Workers AI is ranking the full catalog and live-measuring top models for cost, speed,
              quality, and tokens. This can take up to about two minutes.
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>
              Live fan-out + optional embeddings/image probes + history blend
            </div>
          </div>
        </div>
      )}

      {userPrompt && analyzeError && !analyzing && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 95,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: 12,
            padding: '12px 16px',
            maxWidth: 480,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 13,
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
          }}
        >
          <b>Backend error:</b> {analyzeError}
          <div style={{ marginTop: 6, color: '#b91c1c', fontSize: 12 }}>
            Is model-advisor running on port 8787? (`cd model-advisor && npm run dev`)
          </div>
          <button
            type="button"
            onClick={() => {
              setUserPrompt(null);
              setAnalyzeError(null);
            }}
            style={{
              marginTop: 10,
              border: 'none',
              background: '#991b1b',
              color: '#fff',
              borderRadius: 8,
              padding: '6px 12px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      )}

      <ErrorBoundary>
        <KeyboardControls map={controls}>
          <Canvas
            shadows
            dpr={[1, 1.25]}
            camera={{ position: [36, 28, 48], fov: 50, near: 0.5, far: 600 }}
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: 'high-performance',
              toneMappingExposure: 0.98,
              logarithmicDepthBuffer: true,
              failIfMajorPerformanceCaveat: false,
              stencil: false,
            }}
            performance={{ min: 0.5 }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
            onCreated={({ gl, scene }) => {
              gl.setClearColor('#8ec8e8', 1);
              scene.background = null;
            }}
          >
            <Scene
              viewMode={viewMode}
              buildings={visibleBuildings}
              growKey={growKey}
              animateGrowth={cityReady}
              focusBuilding={focusBuilding}
              onInspect={handleInspect}
              onNearby={handleNearby}
              onToggleView={toggleView}
            />
          </Canvas>
        </KeyboardControls>
      </ErrorBoundary>

      {userPrompt && cityReady && (
        <HUD
          nearbyBuilding={nearbyBuilding}
          viewMode={viewMode}
          onToggleView={toggleView}
          prompt={userPrompt}
          analysis={analysis}
          buildings={buildings}
          filter={filter}
          onFilterChange={setFilter}
          onSelectBuilding={handleInspect}
          onChangePrompt={() => {
            setUserPrompt(null);
            setSelectedBuilding(null);
            setNearbyBuilding(null);
            setFocusBuilding(null);
            setAnalysis(null);
            setAnalyzeError(null);
            setFilter('all');
            setBuildings(BUILDINGS);
          }}
        />
      )}

      {selectedBuilding && (
        <DetailPanel
          building={selectedBuilding}
          prompt={userPrompt}
          analysis={analysis}
          onClose={() => handleInspect(null)}
        />
      )}
    </div>
  );
}
