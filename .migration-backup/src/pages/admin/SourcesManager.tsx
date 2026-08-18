import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { KnowledgeSource, ApiConnector } from '@/lib/types';
import {
  Plus,
  Save,
  Trash2,
  X,
  AlertCircle,
  Check,
  Database,
  Plug,
  Search,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Toggle                                                             */
/* ------------------------------------------------------------------ */
function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 ${
        checked ? 'bg-emerald-500' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Type badge                                                         */
/* ------------------------------------------------------------------ */
function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    database: 'bg-sky-50 text-sky-700 border-sky-200',
    api: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    file: 'bg-amber-50 text-amber-700 border-amber-200',
    webhook: 'bg-slate-100 text-slate-600 border-slate-200',
    rest: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    graphql: 'bg-pink-50 text-pink-700 border-pink-200',
    oauth2: 'bg-sky-50 text-sky-700 border-sky-200',
    api_key: 'bg-amber-50 text-amber-700 border-amber-200',
    bearer: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
        colors[type.toLowerCase()] ??
        'bg-gray-100 text-gray-600 border-gray-200'
      }`}
    >
      {type}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Source Add Modal                                                    */
/* ------------------------------------------------------------------ */
function AddSourceModal({
  onClose,
  onSave,
  saving,
}: {
  onClose: () => void;
  onSave: (data: { name: string; source_type: string }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState('database');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        onKeyDown={() => {}}
        role="presentation"
      />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">
            Add Knowledge Source
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Product Documentation"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source Type
            </label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white"
            >
              <option value="database">Database</option>
              <option value="api">API</option>
              <option value="file">File</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={() => onSave({ name: name.trim(), source_type: sourceType })}
            disabled={saving || !name.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Create
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Connector Add Modal                                                */
/* ------------------------------------------------------------------ */
function AddConnectorModal({
  onClose,
  onSave,
  saving,
}: {
  onClose: () => void;
  onSave: (data: {
    name: string;
    endpoint_pattern: string;
    auth_type: string;
  }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [authType, setAuthType] = useState('api_key');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        onKeyDown={() => {}}
        role="presentation"
      />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">
            Add API Connector
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Stripe API"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Endpoint Pattern
            </label>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="e.g. https://api.stripe.com/v1/*"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Auth Type
            </label>
            <select
              value={authType}
              onChange={(e) => setAuthType(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 bg-white"
            >
              <option value="api_key">API Key</option>
              <option value="bearer">Bearer Token</option>
              <option value="oauth2">OAuth 2.0</option>
              <option value="basic">Basic Auth</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={() =>
              onSave({
                name: name.trim(),
                endpoint_pattern: endpoint.trim(),
                auth_type: authType,
              })
            }
            disabled={saving || !name.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Create
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Source Card                                                         */
/* ------------------------------------------------------------------ */
function SourceCard({
  item,
  icon: Icon,
  onToggle,
  onDelete,
}: {
  item: { id: string; name: string; type: string; is_enabled: boolean };
  icon: typeof Database;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center">
            <Icon className="h-4 w-4 text-gray-500" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              {item.name}
            </h4>
            <TypeBadge type={item.type} />
          </div>
        </div>
        <Toggle checked={item.is_enabled} onChange={onToggle} />
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <span
          className={`text-xs font-medium ${
            item.is_enabled ? 'text-emerald-600' : 'text-gray-400'
          }`}
        >
          {item.is_enabled ? 'Active' : 'Disabled'}
        </span>

        {confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
            >
              <Check className="h-3 w-3" />
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function SourcesManager() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [connectors, setConnectors] = useState<ApiConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [showAddSource, setShowAddSource] = useState(false);
  const [showAddConnector, setShowAddConnector] = useState(false);
  const [saving, setSaving] = useState(false);

  /* -------- fetch -------- */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [srcRes, conRes] = await Promise.all([
      supabase
        .from('knowledge_sources')
        .select('*')
        .order('name', { ascending: true }),
      supabase
        .from('api_connectors')
        .select('*')
        .order('name', { ascending: true }),
    ]);

    if (srcRes.error) setError(srcRes.error.message);
    else setSources(srcRes.data ?? []);

    if (conRes.error) setError(conRes.error.message);
    else setConnectors(conRes.data ?? []);

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* -------- filter -------- */
  const q = search.toLowerCase();
  const filteredSources = search
    ? sources.filter((s) => s.name.toLowerCase().includes(q))
    : sources;
  const filteredConnectors = search
    ? connectors.filter((c) => c.name.toLowerCase().includes(q))
    : connectors;

  /* -------- toggle source -------- */
  const handleToggleSource = async (id: string, enabled: boolean) => {
    await supabase
      .from('knowledge_sources')
      .update({ is_enabled: enabled })
      .eq('id', id);
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, is_enabled: enabled } : s))
    );
  };

  /* -------- toggle connector -------- */
  const handleToggleConnector = async (id: string, enabled: boolean) => {
    await supabase
      .from('api_connectors')
      .update({ is_enabled: enabled })
      .eq('id', id);
    setConnectors((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_enabled: enabled } : c))
    );
  };

  /* -------- delete source -------- */
  const handleDeleteSource = async (id: string) => {
    const { error: err } = await supabase
      .from('knowledge_sources')
      .delete()
      .eq('id', id);
    if (err) setError(err.message);
    else setSources((prev) => prev.filter((s) => s.id !== id));
  };

  /* -------- delete connector -------- */
  const handleDeleteConnector = async (id: string) => {
    const { error: err } = await supabase
      .from('api_connectors')
      .delete()
      .eq('id', id);
    if (err) setError(err.message);
    else setConnectors((prev) => prev.filter((c) => c.id !== id));
  };

  /* -------- add source -------- */
  const handleAddSource = async (data: {
    name: string;
    source_type: string;
  }) => {
    setSaving(true);
    const { error: err } = await supabase.from('knowledge_sources').insert({
      name: data.name,
      source_type: data.source_type,
      connection_config: {},
      is_enabled: true,
    });
    if (err) setError(err.message);
    else {
      setShowAddSource(false);
      await fetchAll();
    }
    setSaving(false);
  };

  /* -------- add connector -------- */
  const handleAddConnector = async (data: {
    name: string;
    endpoint_pattern: string;
    auth_type: string;
  }) => {
    setSaving(true);
    const { error: err } = await supabase.from('api_connectors').insert({
      name: data.name,
      endpoint_pattern: data.endpoint_pattern,
      auth_type: data.auth_type,
      is_enabled: true,
    });
    if (err) setError(err.message);
    else {
      setShowAddConnector(false);
      await fetchAll();
    }
    setSaving(false);
  };

  /* ---------------------------------------------------------------- */
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">
            Sources &amp; Connectors
          </h2>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sources & connectors…"
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-3 flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Loading sources…
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Knowledge Sources Section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-sky-600" />
                <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wider">
                  Knowledge Sources
                </h3>
                <span className="text-xs text-gray-400 font-medium">
                  ({filteredSources.length})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSource(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Source
              </button>
            </div>

            {filteredSources.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
                No knowledge sources configured
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredSources.map((src) => (
                  <SourceCard
                    key={src.id}
                    item={{
                      id: src.id,
                      name: src.name,
                      type: src.source_type,
                      is_enabled: src.is_enabled,
                    }}
                    icon={Database}
                    onToggle={(v) => handleToggleSource(src.id, v)}
                    onDelete={() => handleDeleteSource(src.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* API Connectors Section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Plug className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wider">
                  API Connectors
                </h3>
                <span className="text-xs text-gray-400 font-medium">
                  ({filteredConnectors.length})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddConnector(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Connector
              </button>
            </div>

            {filteredConnectors.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
                No API connectors configured
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredConnectors.map((con) => (
                  <SourceCard
                    key={con.id}
                    item={{
                      id: con.id,
                      name: con.name,
                      type: con.auth_type,
                      is_enabled: con.is_enabled,
                    }}
                    icon={Plug}
                    onToggle={(v) => handleToggleConnector(con.id, v)}
                    onDelete={() => handleDeleteConnector(con.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Modals */}
      {showAddSource && (
        <AddSourceModal
          onClose={() => setShowAddSource(false)}
          onSave={handleAddSource}
          saving={saving}
        />
      )}
      {showAddConnector && (
        <AddConnectorModal
          onClose={() => setShowAddConnector(false)}
          onSave={handleAddConnector}
          saving={saving}
        />
      )}
    </div>
  );
}
