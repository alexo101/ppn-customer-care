import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  OrchestratorRule,
  IntentCategory,
  RuleCategoryLink,
} from '@/lib/types';
import {
  Plus,
  Save,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronRight,
  X,
  AlertCircle,
  Check,
  GitBranch,
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
/*  Priority Badge                                                     */
/* ------------------------------------------------------------------ */
function PriorityBadge({ priority }: { priority: number }) {
  let color = 'bg-gray-100 text-gray-600';
  if (priority >= 8) color = 'bg-red-50 text-red-700 border-red-200';
  else if (priority >= 5) color = 'bg-amber-50 text-amber-700 border-amber-200';
  else color = 'bg-sky-50 text-sky-700 border-sky-200';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full border ${color}`}
    >
      P{priority}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Rule Form                                                          */
/* ------------------------------------------------------------------ */
interface RuleForm {
  name: string;
  description: string;
  prompt_template: string;
  priority: number;
  requires_clarification_prompt: string;
  escalation_trigger: boolean;
  is_enabled: boolean;
}

function emptyForm(): RuleForm {
  return {
    name: '',
    description: '',
    prompt_template: '',
    priority: 5,
    requires_clarification_prompt: '',
    escalation_trigger: false,
    is_enabled: true,
  };
}

function formFromRule(rule: OrchestratorRule): RuleForm {
  return {
    name: rule.name,
    description: rule.description,
    prompt_template: rule.prompt_template,
    priority: rule.priority,
    requires_clarification_prompt: rule.requires_clarification_prompt,
    escalation_trigger: rule.escalation_trigger,
    is_enabled: rule.is_enabled,
  };
}

/* ------------------------------------------------------------------ */
/*  Edit Panel                                                         */
/* ------------------------------------------------------------------ */
function RuleEditPanel({
  rule,
  form,
  onChange,
  onSave,
  onDelete,
  onClose,
  saving,
  isNew,
  allCategories,
  linkedCategoryIds,
  onLinkCategory,
  onUnlinkCategory,
}: {
  rule: OrchestratorRule | null;
  form: RuleForm;
  onChange: (f: RuleForm) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
  saving: boolean;
  isNew: boolean;
  allCategories: IntentCategory[];
  linkedCategoryIds: string[];
  onLinkCategory: (categoryId: string) => void;
  onUnlinkCategory: (categoryId: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const linkedCategories = allCategories.filter((c) =>
    linkedCategoryIds.includes(c.id)
  );
  const unlinkedCategories = allCategories.filter(
    (c) => !linkedCategoryIds.includes(c.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div
        className="flex-1 bg-black/20"
        onClick={onClose}
        onKeyDown={() => {}}
        role="presentation"
      />

      {/* Panel */}
      <div className="w-full max-w-lg bg-white shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">
            {isNew ? 'New Rule' : 'Edit Rule'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                onChange({ ...form, description: e.target.value })
              }
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
            />
          </div>

          {/* Prompt Template */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prompt Template
            </label>
            <textarea
              value={form.prompt_template}
              onChange={(e) =>
                onChange({ ...form, prompt_template: e.target.value })
              }
              rows={6}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-y"
              placeholder="Use {{variables}} for dynamic content"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={10}
                value={form.priority}
                onChange={(e) =>
                  onChange({
                    ...form,
                    priority: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)),
                  })
                }
                className="w-20 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <PriorityBadge priority={form.priority} />
              <span className="text-xs text-gray-400">1 (low) – 10 (high)</span>
            </div>
          </div>

          {/* Clarification Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Clarification Prompt
            </label>
            <textarea
              value={form.requires_clarification_prompt}
              onChange={(e) =>
                onChange({
                  ...form,
                  requires_clarification_prompt: e.target.value,
                })
              }
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
              placeholder="Follow-up to ask when input is ambiguous"
            />
          </div>

          {/* Escalation Trigger */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Escalation Trigger
              </p>
              <p className="text-xs text-gray-400">
                Flag conversations for human review
              </p>
            </div>
            <Toggle
              checked={form.escalation_trigger}
              onChange={(v) =>
                onChange({ ...form, escalation_trigger: v })
              }
            />
          </div>

          {/* Enabled */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Enabled</p>
            <Toggle
              checked={form.is_enabled}
              onChange={(v) => onChange({ ...form, is_enabled: v })}
            />
          </div>

          {/* Linked Categories */}
          {!isNew && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Linked Categories
                </label>
                <button
                  type="button"
                  onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                  className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium"
                >
                  <Plus className="h-3 w-3" />
                  Link Category
                </button>
              </div>

              {linkedCategories.length === 0 && (
                <p className="text-xs text-gray-400 italic">
                  No categories linked
                </p>
              )}

              <div className="flex flex-wrap gap-1.5">
                {linkedCategories.map((cat) => (
                  <span
                    key={cat.id}
                    className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 border border-sky-200"
                  >
                    {cat.name}
                    <button
                      type="button"
                      onClick={() => onUnlinkCategory(cat.id)}
                      className="hover:text-sky-900"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>

              {showCategoryPicker && unlinkedCategories.length > 0 && (
                <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2 max-h-40 overflow-y-auto">
                  {unlinkedCategories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        onLinkCategory(cat.id);
                        if (unlinkedCategories.length <= 1)
                          setShowCategoryPicker(false);
                      }}
                      className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-white transition-colors text-gray-700"
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !form.name.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isNew ? 'Create Rule' : 'Save Changes'}
          </button>

          {!isNew && (
            <>
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onDelete}
                    className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                  >
                    <Check className="h-4 w-4" />
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rule Card                                                          */
/* ------------------------------------------------------------------ */
function RuleCard({
  rule,
  linkedCategories,
  onSelect,
  onToggleEnabled,
}: {
  rule: OrchestratorRule;
  linkedCategories: IntentCategory[];
  onSelect: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors">
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Expand arrow */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-0.5 p-0.5 rounded hover:bg-gray-100 transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h4 className="text-sm font-semibold text-gray-900 truncate">
              {rule.name}
            </h4>
            <PriorityBadge priority={rule.priority} />
            {rule.escalation_trigger && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Escalates
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 line-clamp-1">
            {rule.description || 'No description'}
          </p>

          {/* Category tags */}
          {linkedCategories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {linkedCategories.map((cat) => (
                <span
                  key={cat.id}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600"
                >
                  {cat.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Toggle checked={rule.is_enabled} onChange={onToggleEnabled} />
          <button
            type="button"
            onClick={onSelect}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Edit3 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 pt-0 ml-8 border-t border-gray-100 mt-1 pt-3 space-y-2">
          {rule.prompt_template && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Prompt Template
              </p>
              <pre className="text-xs text-gray-600 bg-gray-50 rounded-md p-2 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
                {rule.prompt_template}
              </pre>
            </div>
          )}
          {rule.requires_clarification_prompt && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Clarification Prompt
              </p>
              <p className="text-xs text-gray-600 bg-gray-50 rounded-md p-2">
                {rule.requires_clarification_prompt}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function RulesManager() {
  const [rules, setRules] = useState<OrchestratorRule[]>([]);
  const [categories, setCategories] = useState<IntentCategory[]>([]);
  const [links, setLinks] = useState<RuleCategoryLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [selectedRule, setSelectedRule] = useState<OrchestratorRule | null>(
    null
  );
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<RuleForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const panelOpen = selectedRule !== null || isNew;

  /* -------- fetch -------- */
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [rulesRes, catsRes, linksRes] = await Promise.all([
      supabase
        .from('orchestrator_rules')
        .select('*')
        .order('priority', { ascending: false }),
      supabase
        .from('intent_categories')
        .select('*')
        .order('name', { ascending: true }),
      supabase.from('rule_category_links').select('*'),
    ]);

    if (rulesRes.error) {
      setError(rulesRes.error.message);
    } else {
      setRules(rulesRes.data ?? []);
    }
    setCategories(catsRes.data ?? []);
    setLinks(linksRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* -------- helpers -------- */
  const linksForRule = (ruleId: string) =>
    links.filter((l) => l.rule_id === ruleId);
  const linkedCats = (ruleId: string) => {
    const ids = linksForRule(ruleId).map((l) => l.category_id);
    return categories.filter((c) => ids.includes(c.id));
  };

  const filtered = search
    ? rules.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.description.toLowerCase().includes(search.toLowerCase())
      )
    : rules;

  /* -------- toggle enabled -------- */
  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    await supabase
      .from('orchestrator_rules')
      .update({ is_enabled: enabled })
      .eq('id', id);
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_enabled: enabled } : r))
    );
  };

  /* -------- select -------- */
  const handleSelect = (rule: OrchestratorRule) => {
    setSelectedRule(rule);
    setIsNew(false);
    setForm(formFromRule(rule));
  };

  /* -------- add new -------- */
  const handleAdd = () => {
    setSelectedRule(null);
    setIsNew(true);
    setForm(emptyForm());
  };

  /* -------- save -------- */
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      prompt_template: form.prompt_template,
      priority: form.priority,
      requires_clarification_prompt: form.requires_clarification_prompt,
      escalation_trigger: form.escalation_trigger,
      is_enabled: form.is_enabled,
    };

    if (isNew) {
      const { error: err } = await supabase
        .from('orchestrator_rules')
        .insert(payload);
      if (err) setError(err.message);
    } else if (selectedRule) {
      const { error: err } = await supabase
        .from('orchestrator_rules')
        .update(payload)
        .eq('id', selectedRule.id);
      if (err) setError(err.message);
    }

    await fetchAll();
    if (!error) {
      setIsNew(false);
      setSelectedRule(null);
    }
    setSaving(false);
  };

  /* -------- delete -------- */
  const handleDelete = async () => {
    if (!selectedRule) return;
    setSaving(true);
    // remove links first
    await supabase
      .from('rule_category_links')
      .delete()
      .eq('rule_id', selectedRule.id);
    const { error: err } = await supabase
      .from('orchestrator_rules')
      .delete()
      .eq('id', selectedRule.id);
    if (err) setError(err.message);
    else {
      setSelectedRule(null);
      setIsNew(false);
    }
    await fetchAll();
    setSaving(false);
  };

  /* -------- link / unlink categories -------- */
  const handleLinkCategory = async (categoryId: string) => {
    if (!selectedRule) return;
    await supabase
      .from('rule_category_links')
      .insert({ rule_id: selectedRule.id, category_id: categoryId });
    await fetchAll();
  };

  const handleUnlinkCategory = async (categoryId: string) => {
    if (!selectedRule) return;
    await supabase
      .from('rule_category_links')
      .delete()
      .eq('rule_id', selectedRule.id)
      .eq('category_id', categoryId);
    await fetchAll();
  };

  /* -------- close panel -------- */
  const handleClose = () => {
    setSelectedRule(null);
    setIsNew(false);
  };

  /* ---------------------------------------------------------------- */
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">
            Orchestrator Rules
          </h2>
          <span className="ml-1 text-xs text-gray-400 font-medium">
            {rules.length} rule{rules.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Rule
        </button>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules…"
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
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            Loading rules…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
            <GitBranch className="h-8 w-8" />
            {search ? 'No rules match your search' : 'No rules yet'}
          </div>
        ) : (
          filtered.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              linkedCategories={linkedCats(rule.id)}
              onSelect={() => handleSelect(rule)}
              onToggleEnabled={(v) => handleToggleEnabled(rule.id, v)}
            />
          ))
        )}
      </div>

      {/* Edit Panel (slide-over) */}
      {panelOpen && (
        <RuleEditPanel
          rule={selectedRule}
          form={form}
          onChange={setForm}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={handleClose}
          saving={saving}
          isNew={isNew}
          allCategories={categories}
          linkedCategoryIds={
            selectedRule
              ? linksForRule(selectedRule.id).map((l) => l.category_id)
              : []
          }
          onLinkCategory={handleLinkCategory}
          onUnlinkCategory={handleUnlinkCategory}
        />
      )}
    </div>
  );
}
