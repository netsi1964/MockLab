import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Play, Square, RefreshCw, Download,
  Search, Filter,
  BarChart2, Clock, AlertTriangle, CheckCircle,
  Zap, ShieldOff, Shuffle, Activity, Database, Save, Sparkles, Trash2, Terminal
} from 'lucide-react';
import { api, type EndpointConfig, type ProjectState, type RequestLogEntry } from '../api';

export function ProjectDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<'endpoints' | 'state'>('endpoints');

  const { data: projData, isLoading } = useQuery({
    queryKey: ['project', name],
    queryFn: () => api.getProject(name!),
    enabled: !!name,
    refetchInterval: 2000,
  });

  const startMutation = useMutation({
    mutationFn: () => api.startProject(name!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', name] }),
  });
  const stopMutation = useMutation({
    mutationFn: () => api.stopProject(name!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', name] }),
  });
  const resetStatsMutation = useMutation({
    mutationFn: () => api.resetStats(name!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', name] }),
  });

  const project = projData?.data;
  const endpoints = project?.endpoints ?? [];
  const isRunning = project?.isRunning ?? false;

  const filtered = endpoints.filter(ep =>
    ep.path.toLowerCase().includes(search.toLowerCase()) ||
    ep.method.toLowerCase().includes(search.toLowerCase()) ||
    ep.summary.toLowerCase().includes(search.toLowerCase())
  );

  const totalRequests = endpoints.reduce((s, e) => s + e.stats.requestCount, 0);
  const totalErrors = endpoints.reduce((s, e) => s + e.stats.errorCount, 0);
  const activeCount = endpoints.filter(e => e.enabled).length;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <span className="spinner" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <h3>Project not found</h3>
        <button className="btn btn-ghost" onClick={() => navigate('/projects')}>
          <ArrowLeft size={14} /> Back to projects
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Project header */}
      <div style={{
        padding: '20px 28px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        flexShrink: 0,
      }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="btn btn-ghost btn-icon" onClick={() => navigate('/projects')}>
              <ArrowLeft size={16} />
            </button>
            <div className="flex items-center gap-2">
              <div className={`status-dot ${isRunning ? 'running' : 'stopped'}`} />
              <h2>{name}</h2>
            </div>
            <span className={`badge ${isRunning ? 'badge-green' : 'badge-gray'}`}>
              {isRunning ? `Running :${project.project.port}` : 'Stopped'}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => resetStatsMutation.mutate()}
              data-tooltip="Reset all stats"
            >
              <RefreshCw size={13} />
            </button>
            <a
              className="btn btn-ghost btn-sm"
              href={api.exportProject(name!)}
              download
            >
              <Download size={13} />
            </a>
            {isRunning ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
              >
                <Square size={13} />Stop
              </button>
            ) : (
              <button
                className="btn btn-success btn-sm"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
              >
                <Play size={13} />Start
              </button>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex gap-6" style={{ marginTop: '16px' }}>
          {[
            { icon: <Activity size={13} />, label: 'Total requests', value: totalRequests },
            { icon: <AlertTriangle size={13} />, label: 'Errors', value: totalErrors, color: totalErrors > 0 ? 'var(--red)' : undefined },
            { icon: <CheckCircle size={13} />, label: 'Active endpoints', value: `${activeCount}/${endpoints.length}`, color: 'var(--green)' },
            { icon: <Clock size={13} />, label: 'Updated', value: new Date(project.project.updatedAt).toLocaleDateString() },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2" style={{ color: s.color ?? 'var(--text-secondary)', fontSize: '0.8125rem' }}>
              {s.icon}
              <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>{s.label}:</span>
              <strong style={{ color: s.color ?? 'var(--text-primary)' }}>{s.value}</strong>
            </div>
          ))}
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2" style={{ marginTop: '20px' }}>
          <button
            className={`btn btn-sm ${mainTab === 'endpoints' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMainTab('endpoints')}
            style={{
              borderRadius: 'var(--radius-md)',
              padding: '6px 16px',
              fontWeight: 600,
            }}
          >
            <Activity size={14} />
            <span>Endpoints</span>
          </button>
          <button
            className={`btn btn-sm ${mainTab === 'state' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMainTab('state')}
            style={{
              borderRadius: 'var(--radius-md)',
              padding: '6px 16px',
              fontWeight: 600,
            }}
          >
            <Database size={14} />
            <span>Database State</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {mainTab === 'endpoints' ? (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* Endpoint list */}
            <div style={{
              width: selectedId ? '380px' : '100%',
              flexShrink: 0,
              borderRight: selectedId ? '1px solid var(--border)' : undefined,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              transition: 'width var(--transition-slow)',
            }}>
              {/* Search bar */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{
                    position: 'absolute', left: '10px', top: '50%',
                    transform: 'translateY(-50%)', color: 'var(--text-tertiary)',
                  }} />
                  <input
                    className="input"
                    style={{ paddingLeft: '32px' }}
                    placeholder="Filter endpoints…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Endpoint list */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {filtered.length === 0 ? (
                  <div className="empty-state">
                    <p>No endpoints match your search.</p>
                  </div>
                ) : (
                  filtered.map(ep => (
                    <EndpointRow
                      key={ep.id}
                      endpoint={ep}
                      isSelected={ep.id === selectedId}
                      projectName={name!}
                      onClick={() => setSelectedId(ep.id === selectedId ? null : ep.id)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Endpoint detail panel */}
            {selectedId && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <EndpointPanel
                  endpoint={endpoints.find(e => e.id === selectedId)!}
                  projectName={name!}
                  onClose={() => setSelectedId(null)}
                  baseUrl={`http://${project.project.host}:${project.project.port}`}
                />
              </div>
            )}
          </div>
        ) : (
          <ProjectStateView projectName={name!} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Endpoint Row
// ---------------------------------------------------------------------------

function EndpointRow({
  endpoint: ep,
  isSelected,
  projectName,
  onClick,
}: {
  endpoint: EndpointConfig;
  isSelected: boolean;
  projectName: string;
  onClick: () => void;
}) {
  const qc = useQueryClient();
  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.updateEndpoint(projectName, ep.id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectName] }),
  });

  const method = ep.method.toLowerCase();

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: isSelected ? 'var(--accent-muted)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'all var(--transition)',
        opacity: ep.enabled ? 1 : 0.5,
      }}
      className={isSelected ? '' : 'fade-in'}
      onMouseEnter={e => !isSelected && (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={e => !isSelected && (e.currentTarget.style.background = 'transparent')}
    >
      <div className="flex items-center gap-2">
        <span className={`badge method method-${method}`}>{ep.method}</span>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.8125rem',
          color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {ep.path}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Status badge */}
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.6875rem',
            color: ep.currentStatus >= 400 ? 'var(--red)' : ep.currentStatus >= 300 ? 'var(--yellow)' : 'var(--green)',
          }}>
            {ep.currentStatus}
          </span>
          {/* Indicators */}
          {ep.delayMs > 0 && <span data-tooltip={`${ep.delayMs}ms delay`}><Zap size={11} color="var(--yellow)" /></span>}
          {ep.failureMode !== 'none' && <span data-tooltip="Failure injection"><Shuffle size={11} color="var(--red)" /></span>}
          {ep.authMode !== 'none' && <span data-tooltip="Auth required"><ShieldOff size={11} color="var(--blue)" /></span>}
          {/* Toggle */}
          <label className="toggle" onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={ep.enabled}
              onChange={e => toggleMutation.mutate(e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>
      {ep.summary !== `${ep.method} ${ep.path}` && (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: '4px', paddingLeft: '2px' }}>
          {ep.summary}
        </p>
      )}
      {ep.stats.requestCount > 0 && (
        <div className="flex gap-3" style={{ marginTop: '6px', color: 'var(--text-tertiary)', fontSize: '0.6875rem' }}>
          <span>{ep.stats.requestCount} req</span>
          <span>{ep.stats.avgResponseTimeMs}ms avg</span>
          {ep.stats.errorCount > 0 && <span style={{ color: 'var(--red)' }}>{ep.stats.errorCount} errors</span>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Endpoint Detail Panel
// ---------------------------------------------------------------------------

function EndpointPanel({
  endpoint: ep,
  projectName,
  onClose,
  baseUrl,
}: {
  endpoint: EndpointConfig;
  projectName: string;
  onClose: () => void;
  baseUrl: string;
}) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'config' | 'requests'>('config');

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<EndpointConfig>) =>
      api.updateEndpoint(projectName, ep.id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectName] }),
  });

  const resetMutation = useMutation({
    mutationFn: () => api.resetEndpoint(projectName, ep.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectName] }),
  });

  const save = (updates: Partial<EndpointConfig>) => updateMutation.mutate(updates);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Panel header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        flexShrink: 0,
      }}>
        <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
          <div className="flex items-center gap-2">
            <span className={`badge method method-${ep.method.toLowerCase()}`}>{ep.method}</span>
            <code style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{ep.path}</code>
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              data-tooltip="Reset to defaults"
            >
              <RefreshCw size={12} />Reset
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="flex gap-1">
          {(['config', 'requests'] as const).map(tab => (
            <button
              key={tab}
              className={`btn btn-sm ${activeTab === tab ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'config' ? <Filter size={12} /> : <BarChart2 size={12} />}
              {tab === 'config' ? 'Configuration' : 'Requests'}
            </button>
          ))}
        </div>
      </div>

      {/* Panel body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {activeTab === 'config' ? (
          <ConfigTab ep={ep} onSave={save} />
        ) : (
          <RequestsTab ep={ep} baseUrl={baseUrl} />
        )}
      </div>
    </div>
  );
}

function ConfigTab({
  ep,
  onSave,
}: {
  ep: EndpointConfig;
  onSave: (updates: Partial<EndpointConfig>) => void;
}) {
  const [status, setStatus] = useState(String(ep.currentStatus));
  const [delay, setDelay] = useState(String(ep.delayMs));
  const [authMode, setAuthMode] = useState(ep.authMode);
  const [failureMode, setFailureMode] = useState(ep.failureMode);
  const [failureRate, setFailureRate] = useState(String(Math.round(ep.failureRate * 100)));
  const [overrideJson, setOverrideJson] = useState(
    ep.overrideResponse != null ? JSON.stringify(ep.overrideResponse, null, 2) : ''
  );

  const handleSave = () => {
    let override: unknown | null = null;
    if (overrideJson.trim()) {
      try {
        override = JSON.parse(overrideJson);
      } catch {
        alert('Override response is not valid JSON');
        return;
      }
    }
    onSave({
      currentStatus: parseInt(status),
      delayMs: parseInt(delay) || 0,
      authMode,
      failureMode,
      failureRate: parseFloat(failureRate) / 100,
      overrideResponse: override,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Status code */}
      <ConfigSection title="Response Status" icon={<CheckCircle size={14} />}>
        <div className="flex gap-2">
          <input
            className="input"
            type="number"
            value={status}
            onChange={e => setStatus(e.target.value)}
            style={{ width: '100px' }}
          />
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            {[200, 201, 400, 401, 403, 404, 422, 500, 503].map(s => (
              <button
                key={s}
                className={`btn btn-sm ${status === String(s) ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setStatus(String(s))}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </ConfigSection>

      {/* Delay */}
      <ConfigSection title="Latency" icon={<Clock size={14} />}>
        <div className="flex items-center gap-3">
          <input
            className="input"
            type="range"
            min={0}
            max={5000}
            step={100}
            value={delay}
            onChange={e => setDelay(e.target.value)}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '80px' }}>
            <input
              className="input"
              type="number"
              value={delay}
              onChange={e => setDelay(e.target.value)}
              style={{ width: '70px', textAlign: 'center' }}
            />
            <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>ms</span>
          </div>
        </div>
      </ConfigSection>

      {/* Auth mode */}
      <ConfigSection title="Auth Mode" icon={<ShieldOff size={14} />}>
        <select
          className="input select"
          value={authMode}
          onChange={e => setAuthMode(e.target.value as typeof authMode)}
        >
          <option value="none">None (public)</option>
          <option value="bearer">Bearer token required</option>
          <option value="basic">Basic auth required</option>
          <option value="api-key">API key required</option>
        </select>
      </ConfigSection>

      {/* Failure mode */}
      <ConfigSection title="Failure Simulation" icon={<Shuffle size={14} />}>
        <select
          className="input select"
          value={failureMode}
          onChange={e => setFailureMode(e.target.value as typeof failureMode)}
          style={{ marginBottom: '8px' }}
        >
          <option value="none">No failure</option>
          <option value="random">Random failure</option>
          <option value="always">Always fail (500)</option>
          <option value="malformed">Malformed response</option>
          <option value="timeout">Timeout (30s)</option>
        </select>
        {failureMode === 'random' && (
          <div className="flex items-center gap-3">
            <input
              type="range"
              className="input"
              min={0}
              max={100}
              value={failureRate}
              onChange={e => setFailureRate(e.target.value)}
              style={{ flex: 1, accentColor: 'var(--red)' }}
            />
            <span style={{ color: 'var(--red)', fontWeight: 600, minWidth: '40px', textAlign: 'right' }}>
              {failureRate}%
            </span>
          </div>
        )}
      </ConfigSection>

      {/* Override response */}
      <ConfigSection title="Static Override Response" icon={<Zap size={14} />}>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginBottom: '8px' }}>
          If set, this JSON is always returned instead of the faker-generated payload.
        </p>
        <textarea
          className="input"
          style={{
            height: '140px',
            resize: 'vertical',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.75rem',
          }}
          placeholder='{"id": 1, "name": "Override"}'
          value={overrideJson}
          onChange={e => setOverrideJson(e.target.value)}
        />
        {overrideJson && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: '6px' }}
            onClick={() => setOverrideJson('')}
          >
            Clear override
          </button>
        )}
      </ConfigSection>

      <button className="btn btn-primary w-full" onClick={handleSave}>
        Apply changes
      </button>
    </div>
  );
}

function RequestsTab({ ep, baseUrl }: { ep: EndpointConfig; baseUrl: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedAction, setCopiedAction] = useState<string | null>(null);
  const omittedReplayHeaders = ['host', 'connection', 'postman-token', 'content-length', 'accept-encoding'];

  if (!ep.recentRequests || ep.recentRequests.length === 0) {
    return (
      <div className="empty-state">
        <BarChart2 size={28} />
        <h3>No requests yet</h3>
        <p>Make some requests to see them logged here.</p>
      </div>
    );
  }

  const generateHttpFormat = (req: RequestLogEntry) => {
    const lines = [];
    lines.push(`${req.method} ${baseUrl}${req.path}`);
    if (req.requestHeaders) {
      for (const [key, val] of Object.entries(req.requestHeaders)) {
        if (omittedReplayHeaders.includes(key.toLowerCase())) {
          continue;
        }
        lines.push(`${key}: ${val}`);
      }
    }
    lines.push('');
    if (req.requestBody) {
      try {
        const parsed = JSON.parse(req.requestBody);
        lines.push(JSON.stringify(parsed, null, 2));
      } catch {
        lines.push(req.requestBody);
      }
    }
    return lines.join('\n');
  };

  const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

  const generateCurlFormat = (req: RequestLogEntry) => {
    const lines = [`curl -X ${req.method} ${shellQuote(`${baseUrl}${req.path}`)}`];
    if (req.requestHeaders) {
      for (const [key, val] of Object.entries(req.requestHeaders)) {
        if (omittedReplayHeaders.includes(key.toLowerCase())) {
          continue;
        }
        lines.push(`  -H ${shellQuote(`${key}: ${val}`)}`);
      }
    }
    if (req.requestBody) {
      lines.push(`  --data-raw ${shellQuote(req.requestBody)}`);
    }
    return lines.join(' \\\n');
  };

  const generateResponseDisplay = (req: RequestLogEntry) => {
    const lines = [
      `Status: ${req.statusCode}`,
      `Response time: ${req.responseTimeMs}ms`,
      '',
      'Headers:',
      req.responseHeaders && Object.keys(req.responseHeaders).length > 0
        ? JSON.stringify(req.responseHeaders, null, 2)
        : '(no response headers logged)',
      '',
      'Body:',
      req.responseBody ?? '(no response body)',
    ];
    return lines.join('\n');
  };

  const makeRequestFilename = (req: RequestLogEntry, extension: 'http' | 'sh') => {
    const safePath = req.path
      .replace(/^\/+/, '')
      .replace(/\{([^}]+)\}/g, '$1')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    return `${req.method.toLowerCase()}-${safePath || 'request'}.${extension}`;
  };

  const downloadText = (filename: string, text: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadHttp = (req: RequestLogEntry) => {
    downloadText(makeRequestFilename(req, 'http'), generateHttpFormat(req));
  };

  const handleDownloadCurl = (req: RequestLogEntry) => {
    downloadText(makeRequestFilename(req, 'sh'), generateCurlFormat(req));
  };

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAction(key);
    setTimeout(() => setCopiedAction(null), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {ep.recentRequests.map(req => {
        const isExpanded = expandedId === req.id;
        return (
          <div
            key={req.id}
            className="card-elevated"
            style={{
              fontSize: '0.8125rem',
              cursor: 'pointer',
              transition: 'all var(--transition)',
              border: isExpanded ? '1px solid var(--accent)' : '1px solid var(--border)',
            }}
            onClick={() => setExpandedId(isExpanded ? null : req.id)}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: isExpanded ? '12px' : '0px' }}>
              <div className="flex items-center gap-2">
                <span className={`badge method method-${req.method.toLowerCase()}`}>{req.method}</span>
                <code style={{ color: 'var(--text-secondary)' }}>{req.path}</code>
              </div>
              <div className="flex items-center gap-3" style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                <span style={{
                  color: req.statusCode >= 400 ? 'var(--red)' : 'var(--green)',
                  fontWeight: 600,
                }}>
                  {req.statusCode}
                </span>
                <span>{req.responseTimeMs}ms</span>
                <span>{new Date(req.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>

            {isExpanded && (
              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  paddingTop: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* HTTP Request Representation (.http) */}
                <div>
                  <div className="flex items-center justify-between" style={{ marginBottom: '4px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Request:</div>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.6875rem', padding: '2px 8px', borderColor: 'var(--border)' }}
                        onClick={() => handleDownloadHttp(req)}
                      >
                        <Download size={11} />Get .http
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.6875rem', padding: '2px 8px', borderColor: 'var(--border)' }}
                        onClick={() => handleCopy(`${req.id}:http`, generateHttpFormat(req))}
                      >
                        {copiedAction === `${req.id}:http` ? 'Copied!' : 'Copy .http'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.6875rem', padding: '2px 8px', borderColor: 'var(--border)' }}
                        onClick={() => handleDownloadCurl(req)}
                      >
                        <Terminal size={11} />Get curl
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.6875rem', padding: '2px 8px', borderColor: 'var(--border)' }}
                        onClick={() => handleCopy(`${req.id}:curl`, generateCurlFormat(req))}
                      >
                        {copiedAction === `${req.id}:curl` ? 'Copied!' : 'Copy curl'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.6875rem', padding: '2px 8px', borderColor: 'var(--border)' }}
                        onClick={() => handleCopy(`${req.id}:request`, generateHttpFormat(req))}
                      >
                        {copiedAction === `${req.id}:request` ? 'Copied!' : 'Copy request'}
                      </button>
                    </div>
                  </div>
                  <pre style={{
                    margin: 0,
                    padding: '8px',
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    overflowX: 'auto',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.7rem',
                    color: 'var(--text-accent)',
                  }}>
                    {generateHttpFormat(req)}
                  </pre>
                </div>

                {/* Request Headers */}
                {req.requestHeaders && Object.keys(req.requestHeaders).length > 0 && (
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Request Headers:</div>
                    <pre style={{
                      margin: 0,
                      padding: '8px',
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      overflowX: 'auto',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                    }}>
                      {JSON.stringify(req.requestHeaders, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Request Body */}
                {req.requestBody && (
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Request Body:</div>
                    <pre style={{
                      margin: 0,
                      padding: '8px',
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      overflowX: 'auto',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                    }}>
                      {typeof req.requestBody === 'string' ? req.requestBody : JSON.stringify(req.requestBody, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Response Divider */}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: '4px', marginBottom: '4px' }} />

                <div className="flex items-center justify-between">
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Response:</div>
                  <div className="flex items-center gap-2" style={{ fontSize: '0.75rem' }}>
                    <span style={{
                      color: req.statusCode >= 400 ? 'var(--red)' : 'var(--green)',
                      fontWeight: 700,
                    }}>
                      {req.statusCode}
                    </span>
                    <span style={{ color: 'var(--text-tertiary)' }}>{req.responseTimeMs}ms</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '0.6875rem', padding: '2px 8px', borderColor: 'var(--border)' }}
                      onClick={() => handleCopy(`${req.id}:response`, generateResponseDisplay(req))}
                    >
                      {copiedAction === `${req.id}:response` ? 'Copied!' : 'Copy response'}
                    </button>
                  </div>
                </div>

                {/* Response Headers */}
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Response Headers:</div>
                  <pre style={{
                    margin: 0,
                    padding: '8px',
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    overflowX: 'auto',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.7rem',
                    color: req.responseHeaders && Object.keys(req.responseHeaders).length > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                  }}>
                    {req.responseHeaders && Object.keys(req.responseHeaders).length > 0
                      ? JSON.stringify(req.responseHeaders, null, 2)
                      : '(no response headers logged)'}
                  </pre>
                </div>

                {/* Response Body */}
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Response Body:</div>
                  <pre style={{
                    margin: 0,
                    padding: '8px',
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    overflowX: 'auto',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.7rem',
                    color: req.responseBody ? 'var(--green)' : 'var(--text-tertiary)',
                  }}>
                    {req.responseBody ?? '(no response body)'}
                  </pre>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ConfigSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2" style={{
        marginBottom: '10px',
        color: 'var(--text-secondary)',
        fontSize: '0.8125rem',
        fontWeight: 600,
      }}>
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

interface ProjectStateViewProps {
  projectName: string;
}

function ProjectStateView({ projectName }: ProjectStateViewProps) {
  const qc = useQueryClient();
  const [stateText, setStateText] = useState('');
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const getErrorMessage = (err: unknown) => err instanceof Error ? err.message : String(err);

  const handleCollectionClick = (name: string) => {
    if (!textareaRef.current) return;
    let searchStr = `"${name}":`;
    let index = stateText.indexOf(searchStr);
    if (index === -1) {
      searchStr = `"${name}"`;
      index = stateText.indexOf(searchStr);
    }
    if (index !== -1) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(index, index + searchStr.length);
      
      const textBefore = stateText.substring(0, index);
      const linesBefore = textBefore.split('\n').length;
      const lineHeight = 20.8;
      const targetScrollTop = Math.max(0, (linesBefore - 4) * lineHeight);
      textareaRef.current.scrollTop = targetScrollTop;
    }
  };

  const { data: stateResponse, isLoading, refetch: refetchState } = useQuery({
    queryKey: ['projectState', projectName],
    queryFn: () => api.getState(projectName),
  });

  useEffect(() => {
    if (stateResponse?.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStateText(JSON.stringify(stateResponse.data, null, 2));
    } else {
      setStateText('{}');
    }
  }, [stateResponse?.data]);

  const saveMutation = useMutation({
    mutationFn: (updatedState: ProjectState) => api.updateState(projectName, updatedState),
    onSuccess: () => {
      refetchState();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
      qc.invalidateQueries({ queryKey: ['project', projectName] });
    },
    onError: (err: unknown) => {
      alert('Error saving state: ' + getErrorMessage(err));
    }
  });

  const resetMutation = useMutation({
    mutationFn: () => api.resetState(projectName),
    onSuccess: () => {
      refetchState();
      setShowConfirmReset(false);
      qc.invalidateQueries({ queryKey: ['project', projectName] });
    },
    onError: (err: unknown) => {
      alert('Error resetting state: ' + getErrorMessage(err));
    }
  });

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(stateText);
      setStateText(JSON.stringify(parsed, null, 2));
    } catch (err: unknown) {
      alert('Cannot format. Invalid JSON: ' + getErrorMessage(err));
    }
  };

  const handleSave = () => {
    try {
      const parsed = JSON.parse(stateText) as ProjectState;
      saveMutation.mutate(parsed);
    } catch {
      alert('Cannot save: Invalid JSON structure.');
    }
  };

  let isValid = true;
  let validationError = '';
  try {
    if (stateText.trim()) {
      JSON.parse(stateText);
    }
  } catch (err: unknown) {
    isValid = false;
    validationError = getErrorMessage(err);
  }

  // Parse details for analytics
  const summary = {
    entitiesCount: 0,
    companiesCount: 0,
    cachedEndpointsCount: 0,
    totalRecords: 0,
    collections: [] as { name: string; count: number }[],
  };

  try {
    if (stateText) {
      const parsed = JSON.parse(stateText) as ProjectState;
      const entities = parsed.entities;
      if (entities && typeof entities === 'object' && !Array.isArray(entities)) {
        summary.entitiesCount = Object.keys(entities).length;
        for (const [name, items] of Object.entries(entities)) {
          if (Array.isArray(items)) {
            summary.collections.push({ name, count: items.length });
            summary.totalRecords += items.length;
          }
        }
      }
      if (Array.isArray(parsed.companies)) {
        summary.companiesCount = parsed.companies.length;
        summary.totalRecords += parsed.companies.length;
      }
      const endpoints = parsed.endpoints;
      if (endpoints && typeof endpoints === 'object' && !Array.isArray(endpoints)) {
        summary.cachedEndpointsCount = Object.keys(endpoints).length;
      }
    }
  } catch {
    // Ignore invalid draft JSON while the user is editing.
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 2fr',
      gap: '24px',
      height: '100%',
      padding: '24px',
      overflow: 'hidden',
    }}>
      {/* Left panel: Analytics */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        overflowY: 'auto'
      }}>
        {/* File Meta Card */}
        <div className="card-elevated" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              State Storage File
            </span>
            <span className={`badge ${summary.totalRecords > 0 ? 'badge-green' : 'badge-gray'}`}>
              {summary.totalRecords > 0 ? 'Active' : 'Uninitialized'}
            </span>
          </div>
          <code style={{
            fontSize: '0.75rem',
            background: 'var(--bg-base)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            wordBreak: 'break-all',
            color: 'var(--text-secondary)'
          }}>
            projects/{projectName}/state.json
          </code>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
            This JSON file stores stateful CRUD entities, companies, and route caches. Editing it updates mock server responses instantly.
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px'
        }}>
          <div className="card-elevated" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '16px' }}>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>TOTAL RECORDS</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{summary.totalRecords}</span>
          </div>
          <div className="card-elevated" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '16px' }}>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>COLLECTIONS</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{summary.collections.length}</span>
          </div>
          <div className="card-elevated" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '16px' }}>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>COMPANIES</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{summary.companiesCount}</span>
          </div>
          <div className="card-elevated" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '16px' }}>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>CACHED API CALLS</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{summary.cachedEndpointsCount}</span>
          </div>
        </div>

        {/* Collections Breakdown */}
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '200px' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={16} />
            Collections Breakdown
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
            {summary.collections.length === 0 && summary.companiesCount === 0 && (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                color: 'var(--text-tertiary)',
                fontSize: '0.8125rem',
                padding: '24px',
                textAlign: 'center'
              }}>
                No state collections detected. Start the mock server and query API endpoints to generate data dynamically, or paste some JSON.
              </div>
            )}
            {summary.companiesCount > 0 && (
              <div
                className="card-elevated"
                onClick={() => handleCollectionClick('companies')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer'
                }}
              >
                <div className="flex items-center gap-3">
                  <Database size={14} color="var(--accent)" />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    companies
                  </span>
                </div>
                <span className="badge badge-blue">
                  {summary.companiesCount} records
                </span>
              </div>
            )}
            {summary.collections.map((col) => (
              <div
                key={col.name}
                className="card-elevated"
                onClick={() => handleCollectionClick(col.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer'
                }}
              >
                <div className="flex items-center gap-3">
                  <Database size={14} color="var(--green)" />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {col.name}
                  </span>
                </div>
                <span className="badge badge-green">
                  {col.count} records
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel: Editor */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden'
      }} className="card">
        {/* Editor Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexShrink: 0
        }}>
          <div>
            <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>State Document Editor</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Directly edit raw values</span>
          </div>

          <div className="flex items-center gap-3">
            {isValid ? (
              <span className="badge badge-green" style={{ textTransform: 'none' }}>
                <CheckCircle size={12} /> JSON Valid
              </span>
            ) : (
              <span className="badge badge-red" style={{ textTransform: 'none' }}>
                <AlertTriangle size={12} /> JSON Invalid
              </span>
            )}
          </div>
        </div>

        {/* Editor Area */}
        <div style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          background: 'var(--bg-base)'
        }}>
          <textarea
            ref={textareaRef}
            style={{
              flex: 1,
              width: '100%',
              height: '100%',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.8125rem',
              padding: '16px',
              resize: 'none',
              outline: 'none',
              lineHeight: '1.6'
            }}
            placeholder={`{\n  "entities": {},\n  "companies": [],\n  "endpoints": {}\n}`}
            value={stateText}
            onChange={(e) => setStateText(e.target.value)}
          />
        </div>

        {/* Validation error message if invalid */}
        {!isValid && (
          <div style={{
            marginTop: '12px',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--red-muted)',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            fontSize: '0.75rem',
            fontFamily: 'JetBrains Mono, monospace',
            display: 'flex',
            alignItems: 'start',
            gap: '8px'
          }}>
            <AlertTriangle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <strong>Parsing Error:</strong> {validationError}
            </div>
          </div>
        )}

        {/* Confirm Reset Alert */}
        {showConfirmReset && (
          <div style={{
            marginTop: '12px',
            padding: '14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--yellow-muted)',
            border: '1px solid var(--yellow)',
            color: 'var(--yellow)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div className="flex gap-2">
              <AlertTriangle size={16} />
              <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                Are you sure you want to reset state.json?
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', opacity: 0.9 }}>
              This will completely delete the `state.json` file. It will be recreated on the next API request using default generated responses from your faker logic.
            </p>
            <div className="flex gap-2" style={{ marginLeft: 'auto' }}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setShowConfirmReset(false)}
                style={{ color: 'var(--text-primary)', borderColor: 'var(--border)' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-danger"
                style={{ background: 'var(--red)', color: '#fff' }}
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
              >
                {resetMutation.isPending ? 'Resetting...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        )}

        {/* Editor Actions Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '16px',
          flexShrink: 0
        }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleFormat}
            disabled={!isValid || !stateText.trim()}
          >
            <Sparkles size={12} />
            Format Document
          </button>

          <div className="flex gap-2">
            {!showConfirmReset && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setShowConfirmReset(true)}
              >
                <Trash2 size={12} />
                Reset State
              </button>
            )}

            <button
              className={`btn btn-sm ${justSaved ? 'btn-success' : 'btn-primary'}`}
              onClick={handleSave}
              disabled={!isValid || saveMutation.isPending}
              style={{ minWidth: '110px' }}
            >
              {saveMutation.isPending ? (
                <>
                  <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1 }} />
                  <span>Saving...</span>
                </>
              ) : justSaved ? (
                <>
                  <CheckCircle size={12} />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save size={12} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
