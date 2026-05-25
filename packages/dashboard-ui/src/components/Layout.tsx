import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { FlaskConical, Activity, Sun, Moon } from 'lucide-react';
import { api } from '../api';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  useLocation();
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.health(),
    refetchInterval: 10000,
  });

  const runningCount = health?.data?.runningProjects?.length ?? 0;

  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') ?? 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Top bar */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        height: '56px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div className="flex items-center gap-3">
          <Link to="/projects" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--accent), #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px var(--accent-glow)',
            }}>
              <FlaskConical size={16} color="#fff" />
            </div>
            <span style={{ fontWeight: 700, fontSize: '1.0625rem', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              MockLab
            </span>
          </Link>

          <span style={{
            padding: '2px 8px',
            borderRadius: '999px',
            background: 'var(--accent-muted)',
            color: 'var(--text-accent)',
            fontSize: '0.6875rem',
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}>
            v0.1
          </span>
        </div>

        <div className="flex items-center gap-3">
          {runningCount > 0 && (
            <div className="flex items-center gap-2" style={{ color: 'var(--green)', fontSize: '0.8125rem' }}>
              <Activity size={14} />
              <span>{runningCount} running</span>
            </div>
          )}
          <button
            onClick={toggleTheme}
            className="btn btn-ghost btn-icon btn-sm"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title={theme === 'light' ? 'Skift til mørkt tema' : 'Skift til lyst tema'}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}
          >
            GitHub
          </a>
        </div>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
}
