import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Play, Square, Trash2, Upload,
  Server, Clock, Activity, ChevronRight, FlaskConical,
} from 'lucide-react';
import { api, type ProjectMeta } from '../api';

export function ProjectsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [importProject, setImportProject] = useState('');
  const [specText, setSpecText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.listProjects(),
  });

  const createMutation = useMutation({
    mutationFn: ({ name, description }: { name: string; description: string }) =>
      api.createProject({ name, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.deleteProject(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });

  const startMutation = useMutation({
    mutationFn: (name: string) => api.startProject(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });

  const stopMutation = useMutation({
    mutationFn: (name: string) => api.stopProject(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });

  const importMutation = useMutation({
    mutationFn: ({ name, spec }: { name: string; spec: string }) =>
      api.importSpec(name, spec),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setImportProject('');
      setSpecText('');
      navigate(`/projects/${vars.name}`);
    },
  });

  const projects: ProjectMeta[] = data?.data ?? [];

  return (
    <div style={{ padding: '32px', overflowY: 'auto', height: '100%' }} className="fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between" style={{ marginBottom: '28px' }}>
        <div>
          <h1>Projects</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px', fontSize: '0.875rem' }}>
            Manage your mock API environments
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={15} />
          New project
        </button>
      </div>

      {/* Stats bar */}
      {projects.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          marginBottom: '24px',
        }}>
          {[
            { label: 'Total Projects', value: projects.length, icon: <Server size={16} /> },
            { label: 'Running', value: projects.filter(p => p.isRunning).length, icon: <Activity size={16} />, color: 'var(--green)' },
            { label: 'Stopped', value: projects.filter(p => !p.isRunning).length, icon: <Square size={16} />, color: 'var(--text-tertiary)' },
          ].map((stat) => (
            <div key={stat.label} className="card-elevated flex items-center gap-3">
              <div style={{ color: stat.color ?? 'var(--text-accent)', opacity: 0.8 }}>{stat.icon}</div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: stat.color ?? 'var(--text-primary)' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create project form */}
      {showCreate && (
        <div className="card fade-in" style={{ marginBottom: '24px', borderColor: 'var(--border-focus)' }}>
          <h3 style={{ marginBottom: '16px' }}>Create new project</h3>
          <div className="flex gap-3" style={{ marginBottom: '12px' }}>
            <input
              className="input"
              placeholder="project-name (e.g. crm-api)"
              value={newName}
              onChange={e => setNewName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              onKeyDown={e => e.key === 'Enter' && createMutation.mutate({ name: newName, description: newDesc })}
              autoFocus
            />
            <input
              className="input"
              placeholder="Description (optional)"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              onClick={() => createMutation.mutate({ name: newName, description: newDesc })}
              disabled={!newName || createMutation.isPending}
            >
              {createMutation.isPending ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Plus size={14} />}
              Create
            </button>
            <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Projects grid */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
          <span className="spinner" />
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state card">
          <FlaskConical size={40} />
          <h3>No projects yet</h3>
          <p>Create a project and import an OpenAPI spec to get started.</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            Create first project
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {projects.map((p) => (
            <ProjectCard
              key={p.name}
              project={p}
              onOpen={() => navigate(`/projects/${p.name}`)}
              onStart={() => startMutation.mutate(p.name)}
              onStop={() => stopMutation.mutate(p.name)}
              onDelete={() => {
                if (confirm(`Delete project "${p.name}"? This cannot be undone.`)) {
                  deleteMutation.mutate(p.name);
                }
              }}
              onImport={() => setImportProject(p.name)}
              isActing={
                startMutation.isPending || stopMutation.isPending || deleteMutation.isPending
              }
            />
          ))}
        </div>
      )}

      {/* Import modal */}
      {importProject && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, backdropFilter: 'blur(4px)',
        }}
          onClick={() => setImportProject('')}
        >
          <div
            className="card fade-in"
            style={{ width: '560px', maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: '4px' }}>Import OpenAPI spec</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '16px' }}>
              Project: <strong style={{ color: 'var(--text-accent)' }}>{importProject}</strong>
            </p>
            <textarea
              className="input"
              style={{ height: '200px', resize: 'vertical', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem' }}
              placeholder="Paste your OpenAPI 3.x YAML or JSON here…"
              value={specText}
              onChange={e => setSpecText(e.target.value)}
            />
            <div className="flex gap-2" style={{ marginTop: '12px' }}>
              <button
                className="btn btn-primary"
                onClick={() => importMutation.mutate({ name: importProject, spec: specText })}
                disabled={!specText.trim() || importMutation.isPending}
              >
                {importMutation.isPending ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Upload size={14} />}
                Import
              </button>
              <button className="btn btn-ghost" onClick={() => setImportProject('')}>Cancel</button>
            </div>
            {importMutation.isError && (
              <p style={{ color: 'var(--red)', fontSize: '0.8125rem', marginTop: '8px' }}>
                Import failed. Please check that the spec is valid OpenAPI 3.x.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ProjectCardProps {
  project: ProjectMeta;
  onOpen: () => void;
  onStart: () => void;
  onStop: () => void;
  onDelete: () => void;
  onImport: () => void;
  isActing: boolean;
}

function ProjectCard({ project: p, onOpen, onStart, onStop, onDelete, onImport, isActing }: ProjectCardProps) {
  return (
    <div
      className="card"
      style={{ cursor: 'pointer', transition: 'all var(--transition)', position: 'relative' }}
      onClick={onOpen}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`status-dot ${p.isRunning ? 'running' : 'stopped'}`} />
          <h3 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</h3>
        </div>
        <span className={`badge ${p.isRunning ? 'badge-green' : 'badge-gray'}`}>
          {p.isRunning ? 'Running' : 'Stopped'}
        </span>
      </div>

      {p.description && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '12px' }}>
          {p.description}
        </p>
      )}

      {/* Meta */}
      <div className="flex gap-3" style={{ marginBottom: '16px', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
        <span className="flex items-center gap-1">
          <Server size={11} />
          :{p.port}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {new Date(p.updatedAt).toLocaleDateString()}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
        {p.isRunning ? (
          <button className="btn btn-ghost btn-sm" onClick={onStop} disabled={isActing}>
            <Square size={12} />Stop
          </button>
        ) : (
          <button className="btn btn-success btn-sm" onClick={onStart} disabled={isActing}>
            <Play size={12} />Start
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onImport}>
          <Upload size={12} />Import
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDelete}>
          <Trash2 size={12} />
        </button>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onOpen}>
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}
