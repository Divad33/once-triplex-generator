import { Link } from 'react-router-dom';

export type AppNavMode =
  | 'home'
  | 'history'
  | 'analysis'
  | 'terminals'
  | 'patterns'
  | 'forecast'
  | 'generator';

interface NavItem {
  to: string;
  label: string;
  mode: AppNavMode;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', mode: 'home' },
  { to: '/history', label: 'Historial', mode: 'history' },
  { to: '/analysis', label: 'Análisis', mode: 'analysis' },
  { to: '/terminales', label: 'Terminales', mode: 'terminals' },
  { to: '/patrones', label: 'Patrones', mode: 'patterns' },
  { to: '/pronostico', label: 'Pronóstico', mode: 'forecast' },
  { to: '/generador', label: 'Generador', mode: 'generator' },
];

interface AppNavProps {
  active: AppNavMode;
}

export function AppNav({ active }: AppNavProps) {
  return (
    <nav className="app-nav">
      {NAV_ITEMS.map((item) => {
        const isActive = item.mode === active;
        return (
          <Link
            key={item.mode}
            to={item.to}
            className={`app-nav-link no-underline ripple ${isActive ? 'is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
