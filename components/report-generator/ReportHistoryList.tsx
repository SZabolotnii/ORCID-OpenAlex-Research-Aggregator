import React from 'react';
import { History, Trash2 } from 'lucide-react';
import { SavedReport } from '../../types';

type ReportHistoryListProps = {
  t: Record<string, any>;
  savedReports: SavedReport[];
  loadReport: (report: SavedReport) => void;
  deleteReport: (id: string) => void;
};

export default function ReportHistoryList({
  t,
  savedReports,
  loadReport,
  deleteReport,
}: ReportHistoryListProps) {
  if (savedReports.length === 0) {
    return (
      <div className="py-8 text-center text-slate-400">
        <History className="mx-auto mb-2 h-10 w-10 opacity-50" />
        <p>{t.noSavedReports}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {savedReports.map((report) => (
        <div
          key={report.id}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4 transition-colors hover:border-indigo-200"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-800">{report.title}</div>
            <div className="mt-1 text-xs text-slate-400">
              {new Date(report.createdAt).toLocaleString()} · {report.content.length} chars
            </div>
          </div>
          <div className="ml-4 flex items-center gap-2">
            <button
              onClick={() => loadReport(report)}
              className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-100"
            >
              {t.loadReport}
            </button>
            <button
              onClick={() => deleteReport(report.id)}
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
