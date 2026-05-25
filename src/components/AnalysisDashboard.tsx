import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AppNav, type AppNavMode } from '@/components/AppNav';
import { getAllResults } from '@/lib/resultsDb';
import {
  analyze,
  type AnalysisResult,
  type PredictionSet,
  type TerminalTransitionMatrix,
  type DigitTransitionsBundle,
  type ForecastBundle,
  type ForecastMatrix,
} from '@/lib/analysis';
import { syncOnceResults } from '@/lib/onceResultsSync';

type PredTab = keyof PredictionSet;

const PRED_LABELS: Record<PredTab, string> = {
  combined: 'Combinado',
  byFrequency: 'Por Frecuencia',
  byHotDigits: 'Dígitos Calientes',
  byPattern: 'Por Patrón',
};

const DIGIT_COLORS = [
  '#8ab4f8', '#81c995', '#fdd663', '#f28b82', '#c58af9',
  '#78d9ec', '#a7ffeb', '#ffb4a2', '#b3c7ff', '#ffd6a5',
];

export function AnalysisDashboard({
  mode = 'pick3',
}: {
  mode?: AnalysisMode;
}) {
  const [theme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('pick3_theme') as 'dark' | 'light') || 'dark';
  });
  const [predTab, setPredTab] = useState<PredTab>('combined');
  const [terminalPredTab, setTerminalPredTab] = useState<PredTab>('combined');
  const [results, setResults] = useState(() => getAllResults());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    setSyncing(true);
    syncOnceResults(true)
      .then(() => setResults(getAllResults()))
      .catch(() => setResults(getAllResults()))
      .finally(() => setSyncing(false));
  }, []);

  const analysis: AnalysisResult = useMemo(() => {
    return analyze(results);
  }, [results]);

  const copyPredictions = useCallback((nums: string[]) => {
    const text = nums.join(' ');
    navigator.clipboard?.writeText(text).catch(() => {});
  }, []);

  const maxFreq = useMemo(() => Math.max(...analysis.numberFrequency.map(f => f.count), 1), [analysis]);
  const maxTerminalFreq = useMemo(() => Math.max(...analysis.terminalPairs.map(f => f.count), 1), [analysis]);
  const title =
    mode === 'terminals' ? 'Análisis Terminales' :
    mode === 'patterns' ? 'Patrones' :
    mode === 'forecast' ? 'Pronóstico' :
    'Análisis Triplex';

  if (analysis.totalDraws === 0) {
    return (
      <div className="max-w-[1060px] mx-auto px-4 pb-4 pt-12 sm:pt-16 min-h-screen flex flex-col">
        <div className="flex justify-between items-center gap-3 flex-wrap py-1.5 px-0.5">
          <h1 className="m-0 text-xl font-black tracking-wide">{title}</h1>
          <AnalysisNav mode={mode} />
        </div>
        <div className="pick3-card mt-3 text-center py-12">
          <p className="text-sm" style={{ color: 'hsl(var(--muted))' }}>
            {syncing ? 'Actualizando base de datos...' : 'No hay datos para analizar.'}
          </p>
          <p className="text-xs mt-2" style={{ color: 'hsl(var(--muted))' }}>
            Primero actualiza la base de datos en la sección de <Link to="/history" className="underline" style={{ color: 'hsl(var(--primary))' }}>Historial</Link>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1060px] mx-auto px-4 pb-4 pt-12 sm:pt-16 min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center gap-3 flex-wrap py-1.5 px-0.5">
        <h1 className="m-0 text-xl font-black tracking-wide">{title}</h1>
        <AnalysisNav mode={mode} />
      </div>

      {mode === 'forecast' ? (
        <ForecastView analysis={analysis} />
      ) : mode === 'patterns' ? (
        <PatternsView analysis={analysis} />
      ) : mode === 'terminals' ? (
        <TerminalAnalysisView
          analysis={analysis}
          predTab={terminalPredTab}
          setPredTab={setTerminalPredTab}
          copyPredictions={copyPredictions}
          maxFreq={maxTerminalFreq}
        />
      ) : (
        <Pick3AnalysisView
          analysis={analysis}
          predTab={predTab}
          setPredTab={setPredTab}
          copyPredictions={copyPredictions}
          maxFreq={maxFreq}
        />
      )}
    </div>
  );
}

function Pick3AnalysisView({
  analysis,
  predTab,
  setPredTab,
  copyPredictions,
  maxFreq,
}: {
  analysis: AnalysisResult;
  predTab: PredTab;
  setPredTab: (tab: PredTab) => void;
  copyPredictions: (nums: string[]) => void;
  maxFreq: number;
}) {
  return (
    <>

      {/* Stats Overview */}
      <div className="pick3-card mt-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Sorteos" value={String(analysis.totalDraws)} />
          <StatCard label="Números Únicos" value={String(analysis.numberFrequency.length)} />
          <StatCard label="Más Frecuente" value={analysis.numberFrequency[0]?.number || '-'} sub={`${analysis.numberFrequency[0]?.count || 0} veces`} />
          <StatCard label="Menos Frecuente" value={analysis.numberFrequency[analysis.numberFrequency.length - 1]?.number || '-'} sub={`${analysis.numberFrequency[analysis.numberFrequency.length - 1]?.count || 0} veces`} />
        </div>
      </div>

      {/* Predictions */}
      <div className="pick3-card mt-3">
        <h2 className="text-sm font-black mb-2.5">Predicciones</h2>
        <div className="flex gap-2 flex-wrap mb-3">
          {(Object.keys(PRED_LABELS) as PredTab[]).map(tab => (
            <button
              key={tab}
              className={`btn ripple ${predTab === tab ? 'btn-primary' : ''}`}
              onClick={() => setPredTab(tab)}
            >
              {PRED_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="rlist">
          {analysis.predictions[predTab].length === 0 ? (
            <div className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
              Se necesitan al menos 3 resultados para predicciones por patrón.
            </div>
          ) : (
            analysis.predictions[predTab].map((n, idx) => (
              <div key={idx} className="num prediction-num ripple">
                {n}
              </div>
            ))
          )}
        </div>

        {analysis.predictions[predTab].length > 0 && (
          <button
            className="btn btn-tonal ripple mt-3"
            onClick={() => copyPredictions(analysis.predictions[predTab])}
          >
            Copiar Predicciones
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        {/* Hot Numbers */}
        <div className="pick3-card">
          <h2 className="text-sm font-black mb-2.5">Números Calientes 🔥</h2>
          <div className="flex gap-2 flex-wrap">
            {analysis.hotNumbers.map((n, idx) => (
              <span key={idx} className="num hot-num">{n}</span>
            ))}
          </div>
        </div>

        {/* Cold Numbers */}
        <div className="pick3-card">
          <h2 className="text-sm font-black mb-2.5">Números Fríos ❄️</h2>
          <div className="flex gap-2 flex-wrap">
            {analysis.coldNumbers.map((n, idx) => (
              <span key={idx} className="num cold-num">{n}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Digit Frequency by Position */}
      <div className="pick3-card mt-3">
        <h2 className="text-sm font-black mb-2.5">Frecuencia por Posición</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(['Primera', 'Segunda', 'Tercera'] as const).map((posName, posIdx) => (
            <div key={posIdx}>
              <h3 className="text-xs font-black mb-2" style={{ color: 'hsl(var(--muted))' }}>
                {posName} cifra
              </h3>
              <div className="flex flex-col gap-1.5">
                {[...analysis.digitFrequency[posIdx]]
                  .sort((a, b) => b.count - a.count)
                  .map(d => (
                    <DigitFrequencyRow key={d.digit} entry={d} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Number Frequency */}
      <div className="pick3-card mt-3">
        <h2 className="text-sm font-black mb-2.5">Top 20 Números Más Frecuentes</h2>
        <div className="flex flex-col gap-1.5">
          {analysis.numberFrequency.slice(0, 20).map(f => (
            <div key={f.number} className="freq-bar-row">
              <span className="font-black tracking-[2px] text-[13px]" style={{ minWidth: 40 }}>
                {f.number}
              </span>
              <div className="freq-bar-track">
                <div
                  className="freq-bar-fill"
                  style={{ width: `${(f.count / maxFreq) * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold" style={{ minWidth: 50, textAlign: 'right' }}>
                {f.count}x ({f.pct.toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pairs */}
      <div className="pick3-card mt-3">
        <h2 className="text-sm font-black mb-2.5">Pares Más Frecuentes</h2>
        <div className="flex gap-2 flex-wrap">
          {analysis.pairs.slice(0, 15).map((p, idx) => (
            <div key={idx} className="pair-chip">
              <span className="font-black">{p.pair}</span>
              <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>{p.count}x</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function TerminalAnalysisView({
  analysis,
  predTab,
  setPredTab,
  copyPredictions,
  maxFreq,
}: {
  analysis: AnalysisResult;
  predTab: PredTab;
  setPredTab: (tab: PredTab) => void;
  copyPredictions: (nums: string[]) => void;
  maxFreq: number;
}) {
  return (
    <>
      <div className="pick3-card mt-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Sorteos" value={String(analysis.totalDraws)} />
          <StatCard label="Terminales Únicos" value={String(analysis.terminalPairs.length)} />
          <StatCard label="Más Frecuente" value={analysis.terminalPairs[0]?.pair || '-'} sub={`${analysis.terminalPairs[0]?.count || 0} veces`} />
          <StatCard label="Más Atrasado" value={analysis.overdueTerminalPairs[0]?.pair || '-'} sub={`${analysis.overdueTerminalPairs[0]?.drawsAgo || 0} sorteos`} />
        </div>
      </div>

      <div className="pick3-card mt-3">
        <h2 className="text-sm font-black mb-1">Predicciones Terminales</h2>
        <p className="text-xs mt-0 mb-2.5" style={{ color: 'hsl(var(--muted))' }}>
          Predice los últimos 2 dígitos del Triplex con la misma lógica del análisis principal.
        </p>
        <div className="flex gap-2 flex-wrap mb-3">
          {(Object.keys(PRED_LABELS) as PredTab[]).map(tab => (
            <button
              key={tab}
              className={`btn ripple ${predTab === tab ? 'btn-primary' : ''}`}
              onClick={() => setPredTab(tab)}
            >
              {PRED_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="rlist terminal-rlist">
          {analysis.terminalPredictions[predTab].length === 0 ? (
            <div className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
              Se necesitan al menos 3 resultados para predicciones por patrón.
            </div>
          ) : (
            analysis.terminalPredictions[predTab].map((pair, idx) => (
              <div key={idx} className="num prediction-num ripple">
                {pair}
              </div>
            ))
          )}
        </div>

        {analysis.terminalPredictions[predTab].length > 0 && (
          <button
            className="btn btn-tonal ripple mt-3"
            onClick={() => copyPredictions(analysis.terminalPredictions[predTab])}
          >
            Copiar Terminales
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <div className="pick3-card">
          <h2 className="text-sm font-black mb-2.5">Terminales Calientes 🔥</h2>
          <div className="flex gap-2 flex-wrap">
            {analysis.hotTerminalPairs.map((pair, idx) => (
              <span key={idx} className="num hot-num">{pair}</span>
            ))}
          </div>
        </div>

        <div className="pick3-card">
          <h2 className="text-sm font-black mb-2.5">Terminales Fríos ❄️</h2>
          <div className="flex gap-2 flex-wrap">
            {analysis.coldTerminalPairs.map((pair, idx) => (
              <span key={idx} className="num cold-num">{pair}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="pick3-card mt-3">
        <h2 className="text-sm font-black mb-2.5">Frecuencia por Posición</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(['Primera terminal', 'Segunda terminal'] as const).map((posName, posIdx) => (
            <div key={posIdx}>
              <h3 className="text-xs font-black mb-2" style={{ color: 'hsl(var(--muted))' }}>
                {posName}
              </h3>
              <div className="flex flex-col gap-1.5">
                {[...analysis.terminalDigitFrequency[posIdx]]
                  .sort((a, b) => b.count - a.count)
                  .map(d => (
                    <DigitFrequencyRow key={d.digit} entry={d} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pick3-card mt-3">
        <h2 className="text-sm font-black mb-2.5">Top 20 Terminales Más Frecuentes</h2>
        <div className="flex flex-col gap-1.5">
          {analysis.terminalPairs.slice(0, 20).map(entry => (
            <div key={entry.pair} className="freq-bar-row">
              <span className="font-black tracking-[2px] text-[13px]" style={{ minWidth: 40 }}>
                {entry.pair}
              </span>
              <div className="freq-bar-track">
                <div
                  className="freq-bar-fill"
                  style={{ width: `${(entry.count / maxFreq) * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold" style={{ minWidth: 50, textAlign: 'right' }}>
                {entry.count}x ({entry.pct.toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="pick3-card mt-3">
        <h2 className="text-sm font-black mb-2.5">Terminales Más Atrasados</h2>
        <div className="terminal-pair-grid">
          {analysis.overdueTerminalPairs.map((entry) => (
            <TerminalPairCard key={entry.pair} entry={entry} overdue />
          ))}
        </div>
      </div>
    </>
  );
}

function TerminalPairCard({
  entry,
  overdue = false,
}: {
  entry: AnalysisResult['terminalPairs'][number];
  overdue?: boolean;
}) {
  return (
    <div className={`terminal-pair-card ${overdue ? 'overdue' : ''}`}>
      <div className="terminal-pair-main">
        <strong>{entry.pair}</strong>
        <span>{entry.count}x • {entry.pct.toFixed(1)}%</span>
      </div>
      <div className="terminal-pair-meta">
        <span>{entry.drawsAgo === 0 ? 'Salió último' : `${entry.drawsAgo} sorteos atrás`}</span>
        <span>{entry.lastDate || '-'} {entry.lastPeriod ? `• ${entry.lastPeriod}` : ''}</span>
      </div>
    </div>
  );
}

function DigitFrequencyRow({ entry }: { entry: AnalysisResult['digitFrequency'][number][number] }) {
  return (
    <div className="digit-bar-row">
      <span
        className="digit-ball"
        style={{ background: DIGIT_COLORS[entry.digit] }}
      >
        {entry.digit}
      </span>
      <div className="digit-bar-track">
        <div
          className="digit-bar-fill"
          style={{
            width: `${entry.pct}%`,
            background: DIGIT_COLORS[entry.digit],
          }}
        />
      </div>
      <span className="text-xs font-bold" style={{ minWidth: 36, textAlign: 'right' }}>
        {entry.count} <span style={{ color: 'hsl(var(--muted))' }}>({entry.pct.toFixed(1)}%)</span>
      </span>
    </div>
  );
}

const MODE_TO_NAV: Record<NonNullable<AnalysisMode>, AppNavMode> = {
  pick3: 'analysis',
  terminals: 'terminals',
  patterns: 'patterns',
  forecast: 'forecast',
};

type AnalysisMode = 'pick3' | 'terminals' | 'patterns' | 'forecast';

function AnalysisNav({ mode }: { mode: AnalysisMode }) {
  return <AppNav active={MODE_TO_NAV[mode]} />;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="text-xs font-bold" style={{ color: 'hsl(var(--muted))' }}>{label}</div>
      <div className="text-2xl font-black tracking-[2px]">{value}</div>
      {sub && <div className="text-xs" style={{ color: 'hsl(var(--muted))' }}>{sub}</div>}
    </div>
  );
}

function TerminalTransitionsView({ transitions }: { transitions: TerminalTransitionMatrix }) {
  const { lastOrigin, lastOriginPredictions, strongestLinks } = transitions;
  const hasData = strongestLinks.length > 0 || lastOriginPredictions.length > 0;

  if (!hasData) {
    return (
      <div className="pick3-card mt-3">
        <h2 className="text-sm font-black mb-1">Patrones Par de Terminales → Par de Terminales</h2>
        <p className="text-xs mt-0" style={{ color: 'hsl(var(--muted))' }}>
          Se necesitan más sorteos para detectar qué pares de terminales suelen salir después de otros.
        </p>
      </div>
    );
  }

  return (
    <div className="pick3-card mt-3">
      <h2 className="text-sm font-black mb-1">Patrones Par de Terminales → Par de Terminales</h2>
      <p className="text-xs mt-0 mb-3" style={{ color: 'hsl(var(--muted))' }}>
        Agrupa los sorteos por su par de terminales (últimos 2 dígitos). Después de cada par del historial, ¿cuál tiende a salir? (mínimo 3 apariciones del origen)
      </p>

      {lastOriginPredictions.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-black mb-2">
            Tras el último par <span className="num">{lastOrigin}</span> suele salir:
          </h3>
          <div className="flex gap-2 flex-wrap">
            {lastOriginPredictions.map((pred, idx) => (
              <div key={idx} className="transition-chip">
                <span className="font-black">{pred.next}</span>
                <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
                  {pred.count}x ({pred.pct.toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {strongestLinks.length > 0 && (
        <div>
          <h3 className="text-xs font-black mb-2">Vínculos más fuertes del historial:</h3>
          <div className="flex flex-col gap-1.5">
            {strongestLinks.map((link, idx) => (
              <div key={idx} className="transition-row">
                <span className="num transition-origin">{link.origin}</span>
                <span className="transition-arrow" style={{ color: 'hsl(var(--muted))' }}>→</span>
                <span className="num transition-next">{link.next}</span>
                <span className="text-xs font-bold" style={{ minWidth: 80, textAlign: 'right' }}>
                  {link.count}x ({link.pct.toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type DigitMode = keyof DigitTransitionsBundle;

const DIGIT_MODE_LABELS: Record<DigitMode, string> = {
  all: 'Todos',
  dayToDay: 'S1-S4 (Día)',
  nightToNight: 'S5 (Noche)',
};

type DigitKind = 'hundreds' | 'decade' | 'terminal';

function digitHint(kind: DigitKind, digit: number): string {
  if (digit < 0) return '-';
  switch (kind) {
    case 'hundreds':
      return `${digit}00-${digit}99`;
    case 'decade':
      return `X${digit}X`;
    case 'terminal':
      return `XX${digit}`;
  }
}

function DigitBadge({ kind, digit }: { kind: DigitKind; digit: number }) {
  return (
    <div className="decade-badge">
      <span className="decade-badge-digit">{digit < 0 ? '-' : digit}</span>
      <span className="decade-badge-range">{digitHint(kind, digit)}</span>
    </div>
  );
}

function DigitTransitionsView({
  title,
  description,
  emptyMessage,
  followLabel,
  bundle,
  kind,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  followLabel: string;
  bundle: DigitTransitionsBundle;
  kind: DigitKind;
}) {
  const [mode, setMode] = useState<DigitMode>('all');
  const matrix = bundle[mode];
  const { lastDigit, lastDigitPredictions, strongestLinks, totalTransitions } = matrix;
  const hasData = strongestLinks.length > 0 || lastDigitPredictions.length > 0;

  return (
    <div className="pick3-card mt-3">
      <h2 className="text-sm font-black mb-1">{title}</h2>
      <p className="text-xs mt-0 mb-3" style={{ color: 'hsl(var(--muted))' }}>
        {description}
      </p>

      <div className="flex gap-2 flex-wrap mb-3">
        {(Object.keys(DIGIT_MODE_LABELS) as DigitMode[]).map(m => (
          <button
            key={m}
            className={`btn ripple ${mode === m ? 'btn-primary' : ''}`}
            onClick={() => setMode(m)}
          >
            {DIGIT_MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {!hasData ? (
        <p className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
          {emptyMessage}
        </p>
      ) : (
        <>
          {lastDigitPredictions.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-black mb-2 flex items-center gap-2 flex-wrap">
                {followLabel}
                <DigitBadge kind={kind} digit={lastDigit} />
                suele salir:
              </h3>
              <div className="flex gap-2 flex-wrap">
                {lastDigitPredictions.map((pred, idx) => (
                  <div key={idx} className="transition-chip">
                    <DigitBadge kind={kind} digit={pred.next} />
                    <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
                      {pred.count}x ({pred.pct.toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {strongestLinks.length > 0 && (
            <div>
              <h3 className="text-xs font-black mb-2">
                Vínculos más fuertes ({totalTransitions} transiciones analizadas):
              </h3>
              <div className="flex flex-col gap-1.5">
                {strongestLinks.map((link, idx) => (
                  <div key={idx} className="transition-row">
                    <DigitBadge kind={kind} digit={link.from} />
                    <span className="transition-arrow" style={{ color: 'hsl(var(--muted))' }}>→</span>
                    <DigitBadge kind={kind} digit={link.to} />
                    <span className="text-xs font-bold" style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      {link.count}x ({link.pct.toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PatternsView({ analysis }: { analysis: AnalysisResult }) {
  return (
    <>
      <div className="pick3-card mt-3">
        <p className="text-sm" style={{ color: 'hsl(var(--muted))' }}>
          Mira qué tiende a salir después de cada centena, decena, terminal y par de terminales
          según el historial completo del Triplex ONCE.
        </p>
      </div>

      <DigitTransitionsView
        title="Patrones Centena → Centena"
        description="Agrupa los sorteos por su centena (primer dígito). Centena 5 = números 500-599."
        emptyMessage="Se necesitan más sorteos para detectar patrones de centenas en este modo."
        followLabel="Tras la última centena"
        bundle={analysis.hundredsTransitions}
        kind="hundreds"
      />

      <DigitTransitionsView
        title="Patrones Decena → Decena"
        description="Agrupa los sorteos por su decena (dígito del medio). Decena 8 = números como 080, 481, 989."
        emptyMessage="Se necesitan más sorteos para detectar patrones de decenas en este modo."
        followLabel="Tras la última decena"
        bundle={analysis.decadeTransitions}
        kind="decade"
      />

      <DigitTransitionsView
        title="Patrones Terminal → Terminal"
        description="Agrupa los sorteos por su terminal (último dígito). Terminal 3 = números terminados en 3 (XX3)."
        emptyMessage="Se necesitan más sorteos para detectar patrones de terminales en este modo."
        followLabel="Tras el último terminal"
        bundle={analysis.singleTerminalTransitions}
        kind="terminal"
      />

      <TerminalTransitionsView transitions={analysis.terminalTransitions} />
    </>
  );
}

type ForecastMode = keyof ForecastBundle;

const FORECAST_MODE_LABELS: Record<ForecastMode, string> = {
  all: 'Todos',
  dayToDay: 'S1-S4 (Día)',
  nightToNight: 'S5 (Noche)',
};

function ForecastView({ analysis }: { analysis: AnalysisResult }) {
  const [mode, setMode] = useState<ForecastMode>('all');
  const forecast: ForecastMatrix = analysis.nextDrawForecast[mode];
  const hasData = forecast.rows.length > 0;

  return (
    <>
      <div className="pick3-card mt-3">
        <p className="text-sm" style={{ color: 'hsl(var(--muted))' }}>
          Combina los patrones de decena y terminal para sugerir 25 candidatos para el próximo
          sorteo: top 5 decenas que siguen a la última decena, cruzadas con el top 5 de
          terminales que siguen al último terminal.
        </p>
      </div>

      <div className="pick3-card mt-3">
        <div className="flex gap-2 flex-wrap mb-3">
          {(Object.keys(FORECAST_MODE_LABELS) as ForecastMode[]).map(m => (
            <button
              key={m}
              className={`btn ripple ${mode === m ? 'btn-primary' : ''}`}
              onClick={() => setMode(m)}
            >
              {FORECAST_MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {!hasData ? (
          <p className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
            Se necesitan más sorteos para construir el pronóstico en este modo.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
                Último:
              </span>
              <span className="num text-lg font-black tracking-[2px]">{forecast.lastPair}</span>
              <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
                (decena {forecast.lastDecade}, terminal {forecast.lastTerminal})
              </span>
            </div>

            <div className="forecast-grid">
              <div className="forecast-row forecast-row-header">
                <div className="forecast-cell forecast-cell-decade">Decena</div>
                <div className="forecast-cell forecast-cell-terminal">Terminal</div>
                <div className="forecast-cell forecast-cell-predictions">Predicciones</div>
              </div>
              {forecast.rows.map((row, idx) => (
                <div key={idx} className="forecast-row">
                  <div className="forecast-cell forecast-cell-decade">
                    <span className="num font-black text-lg">{row.decade}</span>
                  </div>
                  <div className="forecast-cell forecast-cell-terminal">
                    <span className="num font-black text-lg">{row.terminal}</span>
                  </div>
                  <div className="forecast-cell forecast-cell-predictions">
                    {row.predictions.map((p, i) => (
                      <span key={i} className="num forecast-prediction">{p}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
