import { useCallback, useEffect, useState } from 'react';
import { AppNav } from '@/components/AppNav';
import { useOnceLatestResults } from '@/hooks/useOnceLatestResults';
import type { OnceLatestResult } from '@/lib/onceTriplex';
import { syncOnceResults } from '@/lib/onceResultsSync';
import { enableDrawNotifications } from '@/lib/drawNotifications';

const SORTEO_LABELS: Record<number, string> = {
  1: 'Sorteo 1 (10:00)',
  2: 'Sorteo 2 (12:00)',
  3: 'Sorteo 3 (14:00)',
  4: 'Sorteo 4 (17:00)',
  5: 'Sorteo 5 (21:15)',
};

const HomePage = () => {
  const latestOnce = useOnceLatestResults();
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: '' | 'ok' | 'warn' }>({ text: '', kind: '' });
  const [theme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('pick3_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setMessage({ text: 'Actualizando resultados…', kind: 'ok' });
    try {
      const result = await syncOnceResults(false);
      setMessage({
        text: result.latestOnline
          ? 'Resultados al día.'
          : 'No se pudo conectar con ONCE; se mantiene la última base disponible.',
        kind: result.latestOnline ? 'ok' : 'warn',
      });
    } catch {
      setMessage({ text: 'Error al actualizar resultados.', kind: 'warn' });
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleEnableNotifications = useCallback(async () => {
    setMessage({ text: 'Activando notificaciones de sorteos…', kind: 'ok' });
    try {
      const result = await enableDrawNotifications();
      if (result.pushRegistered && result.pushServerReady) {
        setMessage({
          text: 'Push FCM y recordatorios locales activados para los sorteos.',
          kind: 'ok',
        });
        return;
      }
      if (result.localEnabled) {
        setMessage({
          text: 'Recordatorios locales activados. Push FCM queda pendiente de configuración.',
          kind: 'ok',
        });
        return;
      }
      setMessage({
        text: 'No se pudieron activar las notificaciones. Revisa los permisos en Android.',
        kind: 'warn',
      });
    } catch {
      setMessage({ text: 'No se pudieron programar las notificaciones.', kind: 'warn' });
    }
  }, []);

  const sorteoResults = [1, 2, 3, 4, 5].map((sorteo) =>
    latestOnce.results.find((r) => r.sorteo === sorteo),
  );

  const updatedLabel = latestOnce.updatedAt
    ? new Date(latestOnce.updatedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div className="max-w-[1060px] mx-auto px-4 pb-4 pt-12 sm:pt-16 min-h-screen flex flex-col">
      <div className="flex justify-between items-center gap-3 flex-wrap py-1.5 px-0.5">
        <h1 className="m-0 text-xl font-black tracking-wide flex items-center gap-2">
          <OnceBadge />
          <span>Triplex ONCE</span>
        </h1>
        <AppNav active="home" />
      </div>

      <div className="pick3-card mt-3">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <div className="text-xs font-bold" style={{ color: 'hsl(var(--muted))' }}>
              Último sorteo
            </div>
            <div className="text-sm font-black" style={{ color: 'hsl(var(--primary))' }}>
              Triplex de la ONCE
              {updatedLabel && (
                <span className="ml-2 text-xs font-bold" style={{ color: 'hsl(var(--muted))' }}>
                  · actualizado {updatedLabel}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="btn btn-tonal ripple"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? 'Actualizando…' : 'Actualizar'}
            </button>
            <button className="btn btn-primary ripple" onClick={handleEnableNotifications}>
              Notificar sorteos
            </button>
          </div>
        </div>

        {message.text && (
          <div className={`msg ${message.kind}`}>{message.text}</div>
        )}

        {latestOnce.loading ? (
          <div className="text-center py-8" style={{ color: 'hsl(var(--muted))' }}>
            Cargando resultados…
          </div>
        ) : latestOnce.error ? (
          <div className="text-center py-8" style={{ color: 'hsl(var(--muted))' }}>
            Sin respuesta oficial. Inténtalo de nuevo en unos minutos.
          </div>
        ) : (
          <div className="home-results-grid">
            {sorteoResults.map((result, i) => (
              <HomeSorteoRow
                key={i + 1}
                sorteo={i + 1}
                result={result}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface HomeSorteoRowProps {
  sorteo: number;
  result?: OnceLatestResult;
}

function HomeSorteoRow({ sorteo, result }: HomeSorteoRowProps) {
  const digits = (result?.number || '').split('');
  const label = SORTEO_LABELS[sorteo] || `Sorteo ${sorteo}`;
  const icon = sorteo <= 4 ? '\u2600\uFE0F' : '\uD83C\uDF19';

  return (
    <div className="home-result-row">
      <div className="home-result-period">
        <span className="home-result-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="home-result-label">{label}</span>
      </div>
      <div className="home-result-games">
        <div className="home-result-game">
          <div className="home-result-game-label">Triplex</div>
          {result ? (
            <div className="home-result-digits">
              {digits.map((digit, idx) => (
                <span key={idx} className="home-result-digit">
                  {digit}
                </span>
              ))}
            </div>
          ) : (
            <div className="home-result-digits home-result-digits-empty">&mdash; &mdash; &mdash;</div>
          )}
        </div>
      </div>
    </div>
  );
}

function OnceBadge() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="florida-badge"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="onceBadgeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#onceBadgeGrad)" stroke="#f0fdf4" strokeWidth="1.5" />
      <text
        x="16"
        y="13"
        textAnchor="middle"
        fontSize="7"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="900"
        fill="#fff"
        letterSpacing="-0.3"
      >
        ONCE
      </text>
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fontSize="8"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontWeight="900"
        fill="#dcfce7"
        letterSpacing="-0.3"
      >
        3X
      </text>
    </svg>
  );
}

export default HomePage;
