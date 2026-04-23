import React from 'react';
import { CheckCircle, Code, Download, Eye } from 'lucide-react';

type ReportOutputProps = {
  t: Record<string, any>;
  lastReport: string;
  viewMode: 'raw' | 'preview';
  setViewMode: (mode: 'raw' | 'preview') => void;
  downloadFormat: 'docx' | 'md' | 'txt' | 'xlsx' | 'pdf';
  setDownloadFormat: (format: 'docx' | 'md' | 'txt' | 'xlsx' | 'pdf') => void;
  handleDownload: () => void;
  renderMarkdown: (text: string) => React.ReactNode;
};

export default function ReportOutput({
  t,
  lastReport,
  viewMode,
  setViewMode,
  downloadFormat,
  setDownloadFormat,
  handleDownload,
  renderMarkdown,
}: ReportOutputProps) {
  return (
    <div className="mt-8 border-t border-slate-100 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium text-emerald-600">
          <CheckCircle size={18} /> {t.reportGenerated}
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setViewMode('preview')}
              className={`rounded p-1.5 transition-colors ${
                viewMode === 'preview'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              title={t.visualizeReport}
            >
              <Eye size={16} />
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`rounded p-1.5 transition-colors ${
                viewMode === 'raw'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              title={t.rawView}
            >
              <Code size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={downloadFormat}
              onChange={(e) =>
                setDownloadFormat(e.target.value as 'docx' | 'md' | 'txt' | 'xlsx' | 'pdf')
              }
              className="cursor-pointer rounded-lg border-none bg-slate-100 px-2 py-1.5 text-sm font-medium text-slate-700 outline-none hover:bg-slate-200"
            >
              <option value="docx">Word (.doc)</option>
              <option value="pdf">PDF (.pdf)</option>
              <option value="md">Markdown (.md)</option>
              <option value="txt">Text (.txt)</option>
              <option value="xlsx">Excel (.xlsx)</option>
            </select>

            <button
              onClick={handleDownload}
              className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
            >
              <Download size={16} />
              {t.download}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-inner">
        {viewMode === 'raw' ? (
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-600">
            {lastReport}
          </pre>
        ) : (
          renderMarkdown(lastReport)
        )}
      </div>
    </div>
  );
}
