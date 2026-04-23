import React from 'react';
import { History } from 'lucide-react';

type ReportTabsProps = {
  t: Record<string, any>;
  activeTab: 'standard' | 'custom' | 'history';
  savedReportsCount: number;
  setActiveTab: (tab: 'standard' | 'custom' | 'history') => void;
};

export default function ReportTabs({
  t,
  activeTab,
  savedReportsCount,
  setActiveTab,
}: ReportTabsProps) {
  return (
    <div className="flex border-b border-slate-200">
      <button
        onClick={() => setActiveTab('standard')}
        className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
          activeTab === 'standard'
            ? 'border-b-2 border-indigo-600 bg-white text-indigo-600'
            : 'bg-slate-50 text-slate-500 hover:text-slate-700'
        }`}
      >
        {t.standardReports}
      </button>
      <button
        onClick={() => setActiveTab('custom')}
        className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
          activeTab === 'custom'
            ? 'border-b-2 border-indigo-600 bg-white text-indigo-600'
            : 'bg-slate-50 text-slate-500 hover:text-slate-700'
        }`}
      >
        {t.customTemplates}
      </button>
      <button
        onClick={() => setActiveTab('history')}
        className={`flex flex-1 items-center justify-center gap-2 px-6 py-4 text-sm font-medium transition-colors ${
          activeTab === 'history'
            ? 'border-b-2 border-indigo-600 bg-white text-indigo-600'
            : 'bg-slate-50 text-slate-500 hover:text-slate-700'
        }`}
      >
        <History size={16} />
        {t.reportHistory} {savedReportsCount > 0 && `(${savedReportsCount})`}
      </button>
    </div>
  );
}
