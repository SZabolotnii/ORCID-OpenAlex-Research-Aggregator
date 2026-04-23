import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import {
  Users,
  FileText,
  TrendingUp,
  Award,
  BarChart2,
  Database,
  Globe,
  Calendar,
  Download,
} from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

function exportCSV(data: Record<string, any>[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((header) => `"${String(row[header]).replace(/"/g, '""')}"`).join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

const ExportBtn: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="rounded p-1 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
    title="Export CSV"
  >
    <Download size={14} />
  </button>
);

type DashboardInsightsProps = {
  t: Record<string, any>;
  stats: {
    totalFaculty: number;
    totalPubs: number;
    pubsThisYear: number;
    totalCitations: number;
    avgHIndex: string;
    scopusPubs: number;
    wosPubs: number;
    pubsPerFacultyYear: string;
    oaRatio: number;
  };
  trendData: Array<{ year: number; citations: number; publications: number }>;
  hIndexData: Array<{ range: string; count: number }>;
  topAuthors: {
    data: Array<{ name: string; value: number; orcidId: string }>;
    label: string;
    isCitations: boolean;
  };
  typeData: Array<{ name: string; value: number }>;
  oaDistData: Array<{ name: string; value: number }>;
  deptComparisonData: Array<{ name: string; publications: number; citations: number; hIndex: number }>;
  deptCompMetric: 'publications' | 'citations' | 'hIndex';
  setDeptCompMetric: (value: 'publications' | 'citations' | 'hIndex') => void;
  deptNames: string[];
  radarDeptA: string;
  radarDeptB: string;
  setRadarDeptA: (value: string) => void;
  setRadarDeptB: (value: string) => void;
  radarData: Array<{ metric: string; A: number; B: number }>;
  facultyList: Array<{ orcidId: string } & Record<string, any>>;
  onSelectFaculty?: (faculty: any) => void;
};

export default function DashboardInsights({
  t,
  stats,
  trendData,
  hIndexData,
  topAuthors,
  typeData,
  oaDistData,
  deptComparisonData,
  deptCompMetric,
  setDeptCompMetric,
  deptNames,
  radarDeptA,
  radarDeptB,
  setRadarDeptA,
  setRadarDeptB,
  radarData,
  facultyList,
  onSelectFaculty,
}: DashboardInsightsProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t.totalFaculty, value: stats.totalFaculty, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: t.totalPubs, value: stats.totalPubs, icon: FileText, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: t.totalCitations, value: stats.totalCitations, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: t.avgHIndex, value: stats.avgHIndex, icon: Award, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: t.pubsThisYear, value: stats.pubsThisYear, icon: BarChart2, color: 'text-cyan-600', bg: 'bg-cyan-50' },
          { label: t.scopusPubs, value: stats.scopusPubs, icon: Database, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: t.wosPubs, value: stats.wosPubs, icon: Globe, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: t.pubsPerFaculty, value: stats.pubsPerFacultyYear, icon: Calendar, color: 'text-rose-600', bg: 'bg-rose-50' },
          { label: t.oaRatio, value: `${stats.oaRatio}%`, icon: Globe, color: 'text-teal-600', bg: 'bg-teal-50' },
        ].map((stat, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className={`shrink-0 rounded-lg p-3 ${stat.bg} ${stat.color}`}>
              <stat.icon size={22} />
            </div>
            <div>
              <p className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-slate-500">
                {stat.label}
              </p>
              <h4 className="text-xl font-bold text-slate-900">{stat.value}</h4>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">{t.citationHistory} vs Pubs</h3>
            <ExportBtn onClick={() => exportCSV(trendData, 'citation_trends')} />
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="year" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="#8884d8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="citations" stroke="#8884d8" strokeWidth={3} dot={{ r: 4 }} name="Citations (OA)" />
                <Line yAxisId="right" type="monotone" dataKey="publications" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} name="Pubs (ORCID)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">{t.hIndexDist}</h3>
            <ExportBtn onClick={() => exportCSV(hIndexData, 'hindex_distribution')} />
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hIndexData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="range" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">
              {t.topFaculty} <span className="text-sm font-normal text-slate-500">({topAuthors.label})</span>
            </h3>
            <ExportBtn onClick={() => exportCSV(topAuthors.data, 'top_faculty')} />
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topAuthors.data} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#e2e8f0" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} width={130} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Bar
                  dataKey="value"
                  fill={topAuthors.isCitations ? '#8b5cf6' : '#3b82f6'}
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                  name={topAuthors.label}
                  cursor={onSelectFaculty ? 'pointer' : undefined}
                  onClick={(data: any) => {
                    if (onSelectFaculty && data?.orcidId) {
                      const faculty = facultyList.find((item) => item.orcidId === data.orcidId);
                      if (faculty) onSelectFaculty(faculty);
                    }
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">{t.pubTypes}</h3>
            <ExportBtn onClick={() => exportCSV(typeData, 'publication_types')} />
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {typeData.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {deptNames.length >= 2 && radarData.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-3 text-lg font-bold text-slate-800">{t.radarComparison}</h3>
            <div className="mb-4 flex gap-2">
              <select
                value={radarDeptA}
                onChange={(e) => setRadarDeptA(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 p-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {deptNames.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
              <span className="self-center text-xs text-slate-400">vs</span>
              <select
                value={radarDeptB}
                onChange={(e) => setRadarDeptB(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 p-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {deptNames.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="metric" fontSize={10} stroke="#64748b" />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name={radarDeptA} dataKey="A" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                  <Radar name={radarDeptB} dataKey="B" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
                  <Legend iconType="circle" />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {oaDistData.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold text-slate-800">{t.oaDistribution}</h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={oaDistData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                    <Cell fill="#10b981" />
                    <Cell fill="#94a3b8" />
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {deptComparisonData.length > 1 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">{t.deptComparison}</h3>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {(['publications', 'citations', 'hIndex'] as const).map((metric) => (
                <button
                  key={metric}
                  onClick={() => setDeptCompMetric(metric)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    deptCompMetric === metric
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {metric === 'publications'
                    ? t.publications
                    : metric === 'citations'
                      ? t.citations
                      : t.hIndex}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptComparisonData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#e2e8f0" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={140} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Bar
                  dataKey={deptCompMetric}
                  fill="#6366f1"
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                  name={
                    deptCompMetric === 'hIndex'
                      ? t.avgHIndex
                      : deptCompMetric === 'citations'
                        ? t.citations
                        : t.publications
                  }
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}
