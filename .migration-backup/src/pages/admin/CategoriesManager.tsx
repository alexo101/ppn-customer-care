import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { IntentCategory } from '@/lib/types';
import {
  Plus,
  Save,
  Trash2,
  X,
  AlertCircle,
  Check,
  Layers,
  Search,
  FolderTree,
  FolderOpen,
  FolderClosed,
  ArrowRightLeft,
  Pencil,
  Dot,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Toggle                                                              */
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
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
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
/*  Tag Input                                                          */
/* ------------------------------------------------------------------ */
function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const addTags = () => {
    const newTags = input
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && !value.includes(t));
    if (newTags.length) onChange([...value, ...newTags]);
    setInput('');
  };

  const removeTag = (tag: string) => onChange(value.filter((t) => t !== tag));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 border border-sky-200"
          >
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="hover:text-sky-900">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTags();
            }
          }}
          placeholder={placeholder ?? 'Add comma-separated tags, press Enter'}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <button
          type="button"
          onClick={addTags}
          className="rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Form types                                                         */
/* ------------------------------------------------------------------ */
interface CategoryForm {
  name: string;
  description: string;
  examples: string[];
  confidence_threshold: number;
  keywords: string[];
  is_enabled: boolean;
  parent_id: string | null;
}

type ModalMode = 'create-category' | 'create-subcategory' | 'edit';

function emptyForm(parentId: string | null = null): CategoryForm {
  return {
    name: '',
    description: '',
    examples: [],
    confidence_threshold: 0.7,
    keywords: [],
    is_enabled: true,
    parent_id: parentId,
  };
}

/* ------------------------------------------------------------------ */
/*  Category / Subcategory Modal                                       */
/* ------------------------------------------------------------------ */
function CategoryModal({
  mode,
  form,
  onChange,
  onSave,
  onDelete,
  onClose,
  saving,
  parentName,
  childCount,
}: {
  mode: ModalMode;
  form: CategoryForm;
  onChange: (f: CategoryForm) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
  saving: boolean;
  parentName: string | null;
  childCount: number;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isCreate = mode.startsWith('create');
  const isSub = mode === 'create-subcategory' || (mode === 'edit' && form.parent_id !== null);

  const title = isCreate
    ? isSub ? 'New Subcategory' : 'New Category'
    : isSub ? 'Edit Subcategory' : 'Edit Category';

  const accentBg = isSub ? 'from-emerald-500 to-green-600' : 'from-sky-500 to-blue-600';
  const accentBtn = isSub
    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
    : 'bg-sky-600 hover:bg-sky-700 shadow-sky-500/20';
  const accentText = isSub ? 'text-emerald-600' : 'text-sky-600';
  const accentFocus = isSub
    ? 'focus:border-emerald-500 focus:ring-emerald-100'
    : 'focus:border-sky-500 focus:ring-sky-100';
  const accentRange = isSub ? 'accent-emerald-500' : 'accent-sky-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${accentBg} flex items-center justify-center`}>
              {isCreate ? <Plus className="h-4 w-4 text-white" /> : <Save className="h-4 w-4 text-white" />}
            </div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {parentName && (
              <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                in {parentName}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              autoFocus
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              placeholder={isSub ? 'e.g. Refund Request' : 'e.g. Billing Support'}
              className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm ${accentFocus} focus:outline-none focus:ring-2 transition-all`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Brief description..."
              className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm ${accentFocus} focus:outline-none focus:ring-2 transition-all resize-y`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Examples</label>
            <TagInput value={form.examples} onChange={(v) => onChange({ ...form, examples: v })} placeholder="e.g. billing issue, refund request" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
            <TagInput value={form.keywords} onChange={(v) => onChange({ ...form, keywords: v })} placeholder="e.g. invoice, payment, charge" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confidence Threshold:{' '}
              <span className={`font-semibold ${accentText}`}>{Math.round(form.confidence_threshold * 100)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={form.confidence_threshold}
              onChange={(e) => onChange({ ...form, confidence_threshold: parseFloat(e.target.value) })}
              className={`w-full ${accentRange}`}
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Enabled</label>
            <Toggle checked={form.is_enabled} onChange={(v) => onChange({ ...form, is_enabled: v })} />
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3 bg-gray-50/50">
          <div>
            {!isCreate && (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors">
                    <Check className="h-4 w-4" />Confirm
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors">
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 className="h-4 w-4" />
                  Delete{!isSub && childCount > 0 ? ` (+ ${childCount} sub${childCount === 1 ? '' : 's'})` : ''}
                </button>
              )
            )}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !form.name.trim()}
              className={`inline-flex items-center justify-center gap-2 rounded-lg ${accentBtn} px-5 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md`}
            >
              {saving ? <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="h-4 w-4" />}
              {isCreate ? (isSub ? 'Create Subcategory' : 'Create Category') : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Move Modal                                                         */
/* ------------------------------------------------------------------ */
function MoveModal({
  sub,
  categories,
  onMove,
  onClose,
  moving,
}: {
  sub: IntentCategory;
  categories: IntentCategory[];
  onMove: (targetId: string) => void;
  onClose: () => void;
  moving: boolean;
}) {
  const [targetId, setTargetId] = useState('');
  const currentParent = categories.find((c) => c.id === sub.parent_id);
  const availableTargets = categories.filter(
    (c) => c.parent_id === null && c.id !== sub.parent_id
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <ArrowRightLeft className="h-4 w-4 text-white" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">Move Subcategory</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Moving</p>
            <p className="text-sm font-semibold text-gray-900">{sub.name}</p>
            {currentParent && (
              <p className="text-xs text-gray-400 mt-0.5">
                Currently in: <span className="font-medium text-gray-600">{currentParent.name}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Move to category</label>
            {availableTargets.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No other categories available</p>
            ) : (
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100 transition-all bg-white"
              >
                <option value="">Select a category...</option>
                {availableTargets.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 bg-gray-50/50">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => targetId && onMove(targetId)}
            disabled={!targetId || moving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-700 px-5 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-amber-500/20"
          >
            {moving ? <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
            Move
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function CategoriesManager() {
  const [categories, setCategories] = useState<IntentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [selectedCategory, setSelectedCategory] = useState<IntentCategory | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [activeParentId, setActiveParentId] = useState<string | null>(null);
  const [movingSub, setMovingSub] = useState<IntentCategory | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);

  const modalOpen = modalMode !== null;
  const activeParent = categories.find((c) => c.id === activeParentId) ?? null;
  const subcategories = activeParentId ? categories.filter((c) => c.parent_id === activeParentId) : [];

  /* -------- fetch -------- */
  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('intent_categories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (err) {
      setError(err.message);
    } else {
      setCategories(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  /* -------- tree helpers -------- */
  const topLevel = categories.filter((c) => c.parent_id === null);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);

  const filtered = search
    ? topLevel.filter((c) => {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || childrenOf(c.id).some((ch) => ch.name.toLowerCase().includes(q));
      })
    : topLevel;

  /* -------- modal parent name -------- */
  const modalParentName =
    modalMode === 'create-subcategory'
      ? activeParent?.name ?? null
      : modalMode === 'edit' && form.parent_id
        ? categories.find((c) => c.id === form.parent_id)?.name ?? null
        : null;

  const editingChildCount =
    modalMode === 'edit' && selectedCategory && !selectedCategory.parent_id
      ? childrenOf(selectedCategory.id).length
      : 0;

  /* -------- select / deselect parent folder -------- */
  const handleSelectParent = (cat: IntentCategory) => {
    setActiveParentId((prev) => (prev === cat.id ? null : cat.id));
  };

  /* -------- edit (open modal) -------- */
  const handleEdit = (cat: IntentCategory) => {
    setSelectedCategory(cat);
    setModalMode('edit');
    setForm({
      name: cat.name,
      description: cat.description,
      examples: cat.examples ?? [],
      confidence_threshold: cat.confidence_threshold,
      keywords: cat.keywords ?? [],
      is_enabled: cat.is_enabled,
      parent_id: cat.parent_id,
    });
  };

  /* -------- toggle enabled inline -------- */
  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    await supabase.from('intent_categories').update({ is_enabled: enabled }).eq('id', id);
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, is_enabled: enabled } : c)));
  };

  /* -------- add new category -------- */
  const handleAddCategory = () => {
    setSelectedCategory(null);
    setModalMode('create-category');
    setForm(emptyForm());
  };

  /* -------- add new subcategory (always inside current folder) -------- */
  const handleAddSubcategory = () => {
    if (!activeParentId) return;
    setSelectedCategory(null);
    setModalMode('create-subcategory');
    setForm(emptyForm(activeParentId));
  };

  /* -------- save -------- */
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      examples: form.examples,
      confidence_threshold: form.confidence_threshold,
      keywords: form.keywords,
      is_enabled: form.is_enabled,
      parent_id: form.parent_id,
    };

    if (modalMode?.startsWith('create')) {
      const { error: err } = await supabase.from('intent_categories').insert(payload);
      if (err) setError(err.message);
    } else if (selectedCategory) {
      const { error: err } = await supabase.from('intent_categories').update(payload).eq('id', selectedCategory.id);
      if (err) setError(err.message);
    }

    await fetchCategories();
    setModalMode(null);
    setSelectedCategory(null);
    setSaving(false);
  };

  /* -------- delete -------- */
  const handleDelete = async () => {
    if (!selectedCategory) return;
    setSaving(true);
    const { error: err } = await supabase.from('intent_categories').delete().eq('id', selectedCategory.id);
    if (err) {
      setError(err.message);
    } else {
      if (activeParentId === selectedCategory.id) setActiveParentId(null);
      setSelectedCategory(null);
      setModalMode(null);
    }
    await fetchCategories();
    setSaving(false);
  };

  /* -------- close modal -------- */
  const handleClose = () => {
    setSelectedCategory(null);
    setModalMode(null);
  };

  /* -------- move subcategory -------- */
  const handleMove = async (targetId: string) => {
    if (!movingSub) return;
    setMoveLoading(true);
    const { error: err } = await supabase
      .from('intent_categories')
      .update({ parent_id: targetId })
      .eq('id', movingSub.id);
    if (err) {
      setError(err.message);
    }
    await fetchCategories();
    setMovingSub(null);
    setMoveLoading(false);
  };

  /* ---------------------------------------------------------------- */
  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[500px] gap-4">
      {/* Left: Categories (folders) */}
      <div className="flex-1 flex flex-col min-w-0 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-sky-500" />
            <h2 className="text-lg font-semibold text-gray-900">Categories</h2>
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {topLevel.length}
            </span>
          </div>
          <button
            type="button"
            onClick={handleAddCategory}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Category
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories..."
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

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading categories...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
              <Layers className="h-8 w-8" />
              {search ? 'No categories match your search' : 'No categories yet'}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((cat) => {
                const isOpen = activeParentId === cat.id;
                return (
                  <div
                    key={cat.id}
                    className={`flex items-center rounded-lg transition-all duration-150 ${
                      isOpen
                        ? 'bg-sky-50 border border-sky-200 shadow-sm'
                        : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    {/* Clickable row body: opens / closes folder */}
                    <button
                      type="button"
                      className="flex-1 flex items-center gap-2 px-3 py-2.5 min-w-0 text-left"
                      onClick={() => handleSelectParent(cat)}
                      title={isOpen ? 'Close folder' : 'Open folder'}
                    >
                      {isOpen ? (
                        <FolderOpen className="h-4 w-4 text-sky-500 shrink-0" />
                      ) : (
                        <FolderClosed className="h-4 w-4 text-gray-400 shrink-0" />
                      )}
                      <span className={`flex-1 text-sm font-medium truncate ${isOpen ? 'text-sky-700' : 'text-gray-800'}`}>
                        {cat.name}
                      </span>
                    </button>

                    {/* Actions: always visible, right-aligned, visually separated */}
                    <div className="flex items-center gap-1.5 px-2 py-1 border-l border-gray-200/60 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEdit(cat)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 hover:text-sky-700 hover:bg-sky-50 transition-colors"
                        title="Edit category"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <Toggle checked={cat.is_enabled} onChange={(v) => handleToggleEnabled(cat.id, v)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Subcategories inside selected folder */}
      <div className="flex-1 flex flex-col min-w-0 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-emerald-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              {activeParent ? activeParent.name : 'Subcategories'}
            </h2>
            {activeParent && (
              <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {subcategories.length}
              </span>
            )}
          </div>
          {activeParent && (
            <button
              type="button"
              onClick={handleAddSubcategory}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Subcategory
            </button>
          )}
        </div>

        {/* Body */}
        {!activeParent ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 py-16">
            <FolderTree className="h-12 w-12 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">Select a category</p>
            <p className="text-xs text-gray-400 max-w-[240px] text-center leading-relaxed">
              Click a category on the left to open its folder and view the subcategories inside it
            </p>
          </div>
        ) : subcategories.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 py-16">
            <Layers className="h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">This folder is empty</p>
            <button
              type="button"
              onClick={handleAddSubcategory}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add the first subcategory
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-1">
              {subcategories.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all duration-150"
                >
                  {/* Row body: name display */}
                  <div className="flex-1 flex items-center gap-2 px-3 py-2.5 min-w-0">
                    <Dot className="h-4 w-4 text-gray-300 shrink-0" />
                    <span className="flex-1 text-sm font-medium text-gray-800 truncate">{sub.name}</span>
                  </div>

                  {/* Actions: always visible, right-aligned, visually separated */}
                  <div className="flex items-center gap-1.5 px-2 py-1 border-l border-gray-200/60 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEdit(sub)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 hover:text-sky-700 hover:bg-sky-50 transition-colors"
                      title="Edit subcategory"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovingSub(sub)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                      title="Move to another category"
                    >
                      <ArrowRightLeft className="h-3 w-3" />
                      Move
                    </button>
                    <Toggle checked={sub.is_enabled} onChange={(v) => handleToggleEnabled(sub.id, v)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && modalMode && (
        <CategoryModal
          mode={modalMode}
          form={form}
          onChange={setForm}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={handleClose}
          saving={saving}
          parentName={modalParentName}
          childCount={editingChildCount}
        />
      )}

      {/* Move Modal */}
      {movingSub && (
        <MoveModal
          sub={movingSub}
          categories={categories}
          onMove={handleMove}
          onClose={() => setMovingSub(null)}
          moving={moveLoading}
        />
      )}
    </div>
  );
}
