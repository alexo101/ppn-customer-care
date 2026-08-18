import { useState } from 'react';
import AnalyticsDashboard from '@/pages/admin/AnalyticsDashboard';
import ConversationsPanel from '@/pages/admin/ConversationsPanel';
import CategoriesManager from '@/pages/admin/CategoriesManager';
import RulesManager from '@/pages/admin/RulesManager';
import SourcesManager from '@/pages/admin/SourcesManager';
import { BarChart3, MessagesSquare, Layers, GitBranch, Database, Settings } from 'lucide-react';

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, description: 'Performance & insights' },
  { id: 'conversations', label: 'Conversations', icon: MessagesSquare, description: 'All saved conversations' },
  { id: 'categories', label: 'Categories', icon: Layers, description: 'Intent classification catalog' },
  { id: 'rules', label: 'Rules', icon: GitBranch, description: 'Orchestration rule engine' },
  { id: 'sources', label: 'Sources', icon: Database, description: 'Knowledge sources & API connectors' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-sky-50/20 flex">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-slate-200/80 bg-white/60 backdrop-blur-sm">
        <div className="p-5">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center">
              <Settings className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-none">Admin Panel</h2>
              <p className="text-[11px] text-slate-400 mt-1">Configuration center</p>
            </div>
          </div>

          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                    isActive
                      ? 'bg-gradient-to-r from-sky-50 to-blue-50/50 ring-1 ring-sky-200/60'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-sky-500 text-white shadow-md shadow-sky-500/25'
                      : 'bg-slate-100 text-slate-400 group-hover:text-slate-600 group-hover:bg-slate-200'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className={`text-sm font-semibold leading-tight ${
                      isActive ? 'text-slate-900' : 'text-slate-600'
                    }`}>
                      {tab.label}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                      {tab.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="absolute bottom-0 left-0 w-64 p-4 border-t border-slate-200/80">
          <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl p-3 border border-slate-200/60">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-semibold text-slate-600">System Active</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Changes take effect immediately. No deployment needed.
            </p>
          </div>
        </div>
      </aside>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'categories' || activeTab === 'conversations' ? (
          <div className="px-8 py-8">
            {activeTab === 'categories' && <CategoriesManager />}
            {activeTab === 'conversations' && <ConversationsPanel />}
          </div>
        ) : (
          <div className="max-w-6xl mx-auto px-8 py-8">
            {activeTab === 'dashboard' && <AnalyticsDashboard />}
            {activeTab === 'rules' && <RulesManager />}
            {activeTab === 'sources' && <SourcesManager />}
          </div>
        )}
      </div>
    </div>
  );
}
