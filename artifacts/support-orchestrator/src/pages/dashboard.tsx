import { DashboardTab } from '@/pages/admin';

export default function Dashboard() {
  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-16 px-6 md:px-8 border-b border-border flex items-center justify-between bg-card shrink-0">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
      </div>

      <div className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <DashboardTab />
        </div>
      </div>
    </div>
  );
}
