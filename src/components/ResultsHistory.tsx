import { useState, useCallback, useEffect } from 'react';
import { AppNav } from '@/components/AppNav';
import {
  getAllResults,
  addResults,
  deleteResult,
  clearAllResults,
  exportResults,
  importResults,
  type DrawResult,
} from '@/lib/resultsDb';
import { syncOnceResults } from '@/lib/onceResultsSync';

export function ResultsHistory() {
  const [results, setResults] = useState<DrawResult[]>([]);
  const [message, setMessage] = useState<{ text: string; kind: '' | 'ok' | 'warn' }>({ text: '', kind: '' });
  const [filter, setFilter] = useState('');
  const [loadingOnce, setLoadingOnce] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 100;
  const [theme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('pick3_theme') as 'dark' | 'light') || 'dark';
  });

  const reload = useCallback(() => setResults(getAllResults()), []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    reload();
  }, [reload, theme]);

  const handleSyncOnce = useCallback(async (loadBundledIfEmpty = true) => {
    setLoadingOnce(true);
    setMessage({ text: 'Actualizando base de datos del Triplex ONCE...', kind: 'ok' });
    try {
      const result = await syncOnceResults(loadBundledIfEmpty);
      const added = result.addedBundled + result.addedLatest;
      const latest = result.latestDraw
        ? formatLatestDrawMessage(result.latestDraw)
        : '';
      const suffix = result.latestOnline
        ? latest
        : ` Últimos resultados en vivo no respondieron; usando base local incluida.${result.error ? ` (${escapeHtml(result.error)})` : ''}`;
      setMessage({
        text: `Base actualizada: <b>${added}</b> nuevos, <b>${result.total.toLocaleString()}</b> en total.${suffix}`,
        kind: result.latestOnline ? 'ok' : 'warn',
      });
      reload();
    } catch {
      setMessage({ text: 'Error al actualizar la base de datos del Triplex ONCE.', kind: 'warn' });
    } finally {
      setLoadingOnce(false);
    }
  }, [reload]);

  useEffect(() => {
    handleSyncOnce(true);

    const interval = window.setInterval(() => {
      handleSyncOnce(false);
    }, 15 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [handleSyncOnce]);

  const handleDelete = useCallback((id: string) => {
    deleteResult(id);
    setMessage({ text: 'Resultado eliminado.', kind: 'ok' });
    reload();
  }, [reload]);

  const handleClearAll = useCallback(() => {
    if (!confirm('¿Borrar todos los resultados?')) return;
    clearAllResults();
    setMessage({ text: 'Todos los resultados eliminados.', kind: 'ok' });
    reload();
  }, [reload]);

  const handleExport = useCallback(() => {
    const json = exportResults();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `triplex_once_results_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ text: 'Exportado correctamente.', kind: 'ok' });
  }, []);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const count = importResults(reader.result as string);
          setMessage({ text: `Importados <b>${count}</b> resultados nuevos.`, kind: 'ok' });
          reload();
        } catch {
          setMessage({ text: 'Error al importar archivo.', kind: 'warn' });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [reload]);

  const handleLoadOnce = useCallback(async () => {
    setLoadingOnce(true);
    setMessage({ text: 'Restaurando historial base del Triplex ONCE...', kind: 'ok' });
    try {
      const res = await fetch('/once-triplex-history.json');
      if (!res.ok) throw new Error('No se pudo descargar');
      const data: { number: string; date: string; period: string; fireball?: string }[] = await res.json();
      clearAllResults();
      addResults(data);
      const result = await syncOnceResults(false);
      const latest = result.latestDraw
        ? formatLatestDrawMessage(result.latestDraw)
        : '';
      const suffix = result.latestOnline
        ? latest
        : ' Últimos resultados en vivo no respondieron; queda restaurada la base local.';
      setMessage({
        text: `Base restaurada con <b>${getAllResults().length.toLocaleString()}</b> resultados del Triplex ONCE.${suffix}`,
        kind: result.latestOnline ? 'ok' : 'warn',
      });
      reload();
    } catch {
      setMessage({ text: 'Error al cargar el historial del Triplex ONCE.', kind: 'warn' });
    } finally {
      setLoadingOnce(false);
    }
  }, [reload]);

  const filtered = filter
    ? results.filter(r => r.number.includes(filter) || r.date.includes(filter) || r.period.includes(filter))
    : results;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [filter]);

  return (
    <div className="max-w-[1060px] mx-auto px-4 pb-4 pt-12 sm:pt-16 min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center gap-3 flex-wrap py-1.5 px-0.5">
        <h1 className="m-0 text-xl font-black tracking-wide">Historial de Resultados</h1>
        <AppNav active="history" />
      </div>

      {/* Actions Bar */}
      <div className="pick3-card">
        <div className="flex gap-2.5 flex-wrap items-center justify-between">
          <div className="flex gap-2.5 items-center">
            <span className="text-xs font-black" style={{ color: 'hsl(var(--muted))' }}>
              {results.length} resultado{results.length !== 1 ? 's' : ''}
            </span>
            <input
              type="text"
              placeholder="Buscar..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="text-input"
              style={{ width: 150 }}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="btn btn-florida ripple"
              onClick={() => handleSyncOnce(true)}
              disabled={loadingOnce}
            >
              {loadingOnce ? 'Actualizando...' : 'Actualizar ONCE'}
            </button>
            <button className="btn ripple" onClick={handleLoadOnce} disabled={loadingOnce}>
              Restaurar Base
            </button>
            <button className="btn ripple" onClick={handleExport}>Exportar</button>
            <button className="btn ripple" onClick={handleImport}>Importar</button>
            <button className="btn btn-danger ripple" onClick={handleClearAll}>Borrar Todo</button>
          </div>
        </div>
        {message.text && (
          <div className={`msg ${message.kind} mt-2.5`} dangerouslySetInnerHTML={{ __html: message.text }} />
        )}
      </div>

      {/* Results Table */}
      <div className="pick3-card mt-3 flex-1">
        {filtered.length === 0 ? (
          <div className="text-center py-8" style={{ color: 'hsl(var(--muted))' }}>
            <p className="text-sm">No hay resultados aún.</p>
            <p className="text-xs mt-1">La app cargará automáticamente el historial del Triplex ONCE.</p>
          </div>
        ) : (
          <>
            <div className="results-table">
              <div className="results-header">
                <span>Número</span>
                <span>Fecha</span>
                <span>Sorteo</span>
                <span></span>
              </div>
              {paged.map(r => (
                <div key={r.id} className="results-row">
                  <span className="font-black tracking-[2px] text-[15px]">{r.number}</span>
                  <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>{r.date}</span>
                  <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
                    {r.period}{r.fireball ? ` • FB ${r.fireball}` : ''}
                  </span>
                  <button
                    className="small-btn btn-danger ripple"
                    onClick={() => handleDelete(String(r.id))}
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex gap-2 items-center justify-center mt-3 flex-wrap">
                <button
                  className="btn ripple"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  ← Anterior
                </button>
                <span className="text-xs font-bold" style={{ color: 'hsl(var(--muted))' }}>
                  Página {page + 1} de {totalPages}
                </span>
                <button
                  className="btn ripple"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Siguiente →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatLatestDrawMessage(draw: Pick<DrawResult, 'number' | 'period' | 'date' | 'fireball'>): string {
  const fireball = draw.fireball ? `, FB ${escapeHtml(draw.fireball)}` : '';
  return ` Último disponible: <b>${escapeHtml(draw.number)}</b> (${escapeHtml(draw.period)}, ${escapeHtml(draw.date)}${fireball}).`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
