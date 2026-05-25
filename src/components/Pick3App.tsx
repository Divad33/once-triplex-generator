import { useRef, useCallback } from 'react';
import { AppNav } from '@/components/AppNav';
import { usePick3 } from '@/hooks/usePick3';

export function Pick3App() {
  const {
    numbers,
    seed,
    updateSeed,
    message,
    status,
    history,
    theme,
    generate,
    copyNumber,
    copyAll,
    clearAll,
    clearHistory,
    loadFromHistory,
    toggleTheme,
    haptic,
    getBallDigits,
    getDigitColor,
  } = usePick3();

  const outputRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      haptic(10);
      generate();
    }
  };

  const ballDigits = getBallDigits();

  // Ripple effect handler
  const triggerRipple = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    el.style.setProperty('--rx', `${x}px`);
    el.style.setProperty('--ry', `${y}px`);
    
    el.classList.remove('rippling');
    void el.offsetWidth;
    el.classList.add('rippling');
    setTimeout(() => el.classList.remove('rippling'), 520);
  }, []);

  const handleRippleClick = useCallback((e: React.PointerEvent<HTMLElement>, action: () => void) => {
    triggerRipple(e);
    haptic(10);
    action();
  }, [triggerRipple, haptic]);

  return (
    <div className="max-w-[1060px] mx-auto px-4 pb-4 pt-12 sm:pt-16 min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-start gap-3 flex-wrap py-1.5 px-0.5">
        <div className="flex gap-3 items-center min-w-[240px]">
          {/* Balls */}
          <div className="flex gap-2.5 items-center justify-center p-0.5">
            {ballDigits.map((digit, idx) => (
              <div
                key={idx}
                className="pick3-ball"
                style={{ background: getDigitColor(digit, idx) }}
              >
                {digit}
              </div>
            ))}
          </div>
          <h1 className="m-0 text-xl font-black tracking-wide">Generador</h1>
          <button
            className="btn btn-tonal btn-icon ripple"
            onPointerDown={(e) => handleRippleClick(e, toggleTheme)}
            aria-label="Cambiar tema"
            title="Cambiar tema"
          >
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
        </div>

        <AppNav active="generator" />
      </div>

      {/* Main Card */}
      <div className="pick3-card">
        {/* Controls Row */}
        <div className="flex gap-2.5 flex-wrap items-center mt-3">
          <div 
            className="input-wrapper ripple"
            onPointerDown={(e) => { triggerRipple(e); haptic(10); }}
          >
            <input
              type="text"
              inputMode="numeric"
              maxLength={3}
              placeholder="000"
              value={seed}
              onChange={(e) => updateSeed(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => haptic(8)}
              className="seed-input"
              aria-label="Número de 3 dígitos"
            />
          </div>

          <button
            className="btn btn-primary ripple"
            onPointerDown={(e) => handleRippleClick(e, generate)}
          >
            Generar 27
          </button>
          <button
            className="btn ripple"
            onPointerDown={(e) => handleRippleClick(e, copyAll)}
          >
            Copiar todo
          </button>
          <button
            className="btn ripple"
            onPointerDown={(e) => handleRippleClick(e, clearAll)}
          >
            Limpiar
          </button>

          <div className="status-pill ripple" title="Estado">
            <span className={`status-dot ${status.warn ? 'warn' : ''}`} />
            <span>{status.text}</span>
          </div>
        </div>

        {/* Message */}
        <div 
          className={`msg ${message.kind}`}
          dangerouslySetInnerHTML={{ __html: message.text }}
        />

        {/* Grid Layout */}
        <div className="grid grid-cols-[1.2fr_0.8fr] gap-3 mt-3 max-[920px]:grid-cols-1">
          {/* Results Panel */}
          <div className="panel">
            <h2>Resultados</h2>
            <div className="rlist">
              {numbers.map((n, idx) => (
                <div
                  key={idx}
                  className="num ripple"
                  onPointerDown={(e) => handleRippleClick(e, () => copyNumber(n))}
                >
                  {n}
                </div>
              ))}
            </div>
          </div>

          {/* Output Panel */}
          <div className="panel">
            <h2>Salida</h2>
            <textarea
              ref={outputRef}
              readOnly
              value={numbers.join(' ')}
              className="output-area"
            />

            <div className="flex justify-between items-center mt-2.5">
              <div className="text-xs font-black" style={{ color: 'hsl(var(--muted))' }}>
                Historial del generador
              </div>
              <button
                className="btn btn-danger ripple"
                onPointerDown={(e) => handleRippleClick(e, clearHistory)}
              >
                Borrar
              </button>
            </div>

            {/* History List */}
            <div className="grid gap-2 mt-2.5">
              {history.length === 0 ? (
                <div className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
                  Aún no hay historial.
                </div>
              ) : (
                history.map((item, idx) => (
                  <div key={idx} className="hist-item">
                    <div>
                      <b>{item.seed}</b>{' '}
                      <span className="text-xs" style={{ color: 'hsl(var(--muted))' }}>
                        • {item.when}
                      </span>
                    </div>
                    <button
                      className="small-btn ripple"
                      onPointerDown={(e) => handleRippleClick(e, () => loadFromHistory(item.seed))}
                    >
                      Abrir
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


