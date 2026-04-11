

import React, { useMemo, useState } from 'react';
import { Faculty } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { Users, FileText, TrendingUp, Award, BarChart2, Filter, Database, Globe, Calendar, Download } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface DashboardProps {
  facultyList: Faculty[];
  onSelectFaculty?: (faculty: Faculty) => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

function exportCSV(data: Record<string, any>[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const ExportBtn: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Export CSV">
    <Download size={14} />
  </button>
);

const Dashboard: React.FC<DashboardProps> = ({ facultyList, onSelectFaculty }) => {
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();
  
  // State for filters
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedFacId, setSelectedFacId] = useState('All');
  const [startYear, setStartYear] = useState<number>(currentYear - 4);
  const [endYear, setEndYear] = useState<number>(currentYear);

  // Derive unique departments
  const departments = useMemo(() => {
    const depts = new Set(facultyList.map(f => f.department).filter(Boolean));
    return ['All', ...Array.from(depts)];
  }, [facultyList]);

  // Derive available faculty based on selected department
  const availableFaculty = useMemo(() => {
    if (selectedDept === 'All') return facultyList;
    return facultyList.filter(f => f.department === selectedDept);
  }, [facultyList, selectedDept]);

  // Filtered Faculty List (By Dept & Person only, Time filter applies to stats)
  const filteredFaculty = useMemo(() => {
    return availableFaculty.filter(f => {
      const matchFac = selectedFacId === 'All' || f.orcidId === selectedFacId;
      return matchFac;
    });
  }, [availableFaculty, selectedFacId]);

  // Reset faculty filter when department changes
  React.useEffect(() => {
    setSelectedFacId('All');
  }, [selectedDept]);

  // Stats Calculation based on Faculty AND Time Range
  const stats = useMemo(() => {
    const totalFaculty = filteredFaculty.length;
    
    // Filter publications by year range
    const totalPubs = filteredFaculty.reduce((acc, curr) => 
      acc + curr.publications.filter(p => p.year >= startYear && p.year <= endYear).length, 0);

    const pubsThisYear = filteredFaculty.reduce((acc, curr) => 
      acc + curr.publications.filter(p => p.year === currentYear).length, 0);
    
    // Filter citations by year range (using OpenAlex yearlyStats if available)
    const totalCitations = filteredFaculty.reduce((acc, curr) => {
      if (curr.metrics?.yearlyStats) {
        // Sum yearly stats within range
        const rangeCitations = curr.metrics.yearlyStats
          .filter(y => y.year >= startYear && y.year <= endYear)
          .reduce((sum, y) => sum + y.citations, 0);
        return acc + rangeCitations;
      } else {
        // Fallback: If no yearly stats, return 0 (or total if we assume it matches range, but safer to be 0 for accuracy in range)
        // Or we could return curr.metrics.citationCount if range covers "All Time" but that's complex.
        // Let's rely on yearlyStats for time-filtered data.
        return acc; 
      }
    }, 0);

    const avgHIndex = totalFaculty > 0 
        ? (filteredFaculty.reduce((acc, curr) => acc + (curr.metrics?.hIndex || 0), 0) / totalFaculty).toFixed(1)
        : "0";
    
    // Scopus & WoS stats (filtered by year)
    const scopusPubs = filteredFaculty.reduce((acc, curr) => 
        acc + curr.publications.filter(p => p.sources.includes('scopus') && p.year >= startYear && p.year <= endYear).length, 0);
    
    const wosPubs = filteredFaculty.reduce((acc, curr) => 
        acc + curr.publications.filter(p => p.sources.includes('wos') && p.year >= startYear && p.year <= endYear).length, 0);

    // Pubs per faculty per year
    const yearRange = Math.max(1, endYear - startYear + 1);
    const pubsPerFacultyYear = totalFaculty > 0
      ? (totalPubs / totalFaculty / yearRange).toFixed(1)
      : "0";

    // OA ratio from topWorks
    let oaTotal = 0;
    let oaOpen = 0;
    filteredFaculty.forEach(f => {
      if (f.metrics?.topWorks) {
        f.metrics.topWorks.forEach(w => {
          oaTotal++;
          if (w.isOa) oaOpen++;
        });
      }
    });
    const oaRatio = oaTotal > 0 ? Math.round((oaOpen / oaTotal) * 100) : 0;

    return { totalFaculty, totalPubs, pubsThisYear, totalCitations, avgHIndex, scopusPubs, wosPubs, pubsPerFacultyYear, oaRatio };
  }, [filteredFaculty, startYear, endYear, currentYear]);

  // Chart Data: H-Index Distribution (Independent of time range usually, as it's a current metric)
  const hIndexData = useMemo(() => {
     const bins = { '0-2': 0, '3-5': 0, '6-10': 0, '11-20': 0, '20+': 0 };
     filteredFaculty.forEach(f => {
         const h = f.metrics?.hIndex || 0;
         if (h <= 2) bins['0-2']++;
         else if (h <= 5) bins['3-5']++;
         else if (h <= 10) bins['6-10']++;
         else if (h <= 20) bins['11-20']++;
         else bins['20+']++;
     });
     return Object.entries(bins).map(([range, count]) => ({ range, count }));
  }, [filteredFaculty]);

  // Chart Data: Combined Citation History (Filtered by Range)
  const trendData = useMemo(() => {
     const citationMap: Record<number, number> = {};
     const pubMap: Record<number, number> = {};
     const yearsSet = new Set<number>();

     // Populate years in range
     for (let y = startYear; y <= endYear; y++) {
       yearsSet.add(y);
       citationMap[y] = 0;
       pubMap[y] = 0;
     }

     filteredFaculty.forEach(f => {
         // OpenAlex Citations
         if (f.metrics?.yearlyStats) {
             f.metrics.yearlyStats.forEach(stat => {
                 if (stat.year >= startYear && stat.year <= endYear) {
                    citationMap[stat.year] = (citationMap[stat.year] || 0) + stat.citations;
                 }
             });
         }
         // ORCID Pubs
         f.publications.forEach(p => {
             if (p.year && p.year >= startYear && p.year <= endYear) {
                 pubMap[p.year] = (pubMap[p.year] || 0) + 1;
             }
         });
     });

     const years = Array.from(yearsSet).sort((a,b) => a - b);
     return years.map(y => ({
         year: y,
         citations: citationMap[y] || 0,
         publications: pubMap[y] || 0
     }));
  }, [filteredFaculty, startYear, endYear]);

  const typeData = useMemo(() => {
    const types: Record<string, number> = {};
    filteredFaculty.forEach(f => {
      f.publications.filter(p => p.year >= startYear && p.year <= endYear).forEach(p => {
        const t = p.type || 'other';
        types[t] = (types[t] || 0) + 1;
      });
    });
    
    // Top 4 types + others
    const sorted = Object.entries(types).sort((a,b) => b[1] - a[1]);
    const top4 = sorted.slice(0, 4);
    const others = sorted.slice(4).reduce((acc, curr) => acc + curr[1], 0);
    
    const final = top4.map(([name, value]) => ({ name: name.replace('-', ' '), value }));
    if (others > 0) final.push({ name: 'others', value: others });
    
    return final;
  }, [filteredFaculty, startYear, endYear]);

  // Department comparison data
  const [deptCompMetric, setDeptCompMetric] = useState<'publications' | 'citations' | 'hIndex'>('publications');

  const deptComparisonData = useMemo(() => {
    const deptMap: Record<string, { name: string; pubs: number; citations: number; hIndex: number; count: number }> = {};
    filteredFaculty.forEach(f => {
      const dept = f.department || 'Unknown';
      if (!deptMap[dept]) {
        deptMap[dept] = { name: dept, pubs: 0, citations: 0, hIndex: 0, count: 0 };
      }
      deptMap[dept].pubs += f.publications.filter(p => p.year >= startYear && p.year <= endYear).length;
      deptMap[dept].citations += f.metrics?.yearlyStats
        ? f.metrics.yearlyStats.filter(y => y.year >= startYear && y.year <= endYear).reduce((s, y) => s + y.citations, 0)
        : 0;
      deptMap[dept].hIndex += f.metrics?.hIndex || 0;
      deptMap[dept].count++;
    });

    return Object.values(deptMap)
      .map(d => ({
        name: d.name.length > 20 ? d.name.slice(0, 18) + '...' : d.name,
        publications: d.pubs,
        citations: d.citations,
        hIndex: d.count > 0 ? parseFloat((d.hIndex / d.count).toFixed(1)) : 0,
      }))
      .sort((a, b) => b[deptCompMetric] - a[deptCompMetric])
      .slice(0, 8);
  }, [filteredFaculty, startYear, endYear, deptCompMetric]);

  // Radar comparison: two departments
  const deptNames = useMemo(() => departments.filter(d => d !== 'All'), [departments]);
  const [radarDeptA, setRadarDeptA] = useState('');
  const [radarDeptB, setRadarDeptB] = useState('');

  // Set defaults when departments change
  React.useEffect(() => {
    if (deptNames.length >= 2) {
      if (!radarDeptA || !deptNames.includes(radarDeptA)) setRadarDeptA(deptNames[0]);
      if (!radarDeptB || !deptNames.includes(radarDeptB)) setRadarDeptB(deptNames[1]);
    }
  }, [deptNames]);

  const radarData = useMemo(() => {
    if (!radarDeptA || !radarDeptB || radarDeptA === radarDeptB) return [];

    const calcDeptMetrics = (deptName: string) => {
      const members = facultyList.filter(f => f.department === deptName);
      if (members.length === 0) return { pubs: 0, citations: 0, hIndex: 0, scopus: 0, count: 0 };
      const pubs = members.reduce((s, f) => s + f.publications.filter(p => p.year >= startYear && p.year <= endYear).length, 0);
      const citations = members.reduce((s, f) => {
        if (!f.metrics?.yearlyStats) return s;
        return s + f.metrics.yearlyStats.filter(y => y.year >= startYear && y.year <= endYear).reduce((a, y) => a + y.citations, 0);
      }, 0);
      const hIndex = members.reduce((s, f) => s + (f.metrics?.hIndex || 0), 0) / members.length;
      const scopus = members.reduce((s, f) => s + f.publications.filter(p => p.sources.includes('scopus')).length, 0);
      return { pubs, citations, hIndex: parseFloat(hIndex.toFixed(1)), scopus, count: members.length };
    };

    const a = calcDeptMetrics(radarDeptA);
    const b = calcDeptMetrics(radarDeptB);

    // Normalize to 0-100 scale for radar visibility
    const maxVal = (va: number, vb: number) => Math.max(va, vb, 1);

    return [
      { metric: t.publications, A: Math.round(a.pubs / maxVal(a.pubs, b.pubs) * 100), B: Math.round(b.pubs / maxVal(a.pubs, b.pubs) * 100) },
      { metric: t.citations, A: Math.round(a.citations / maxVal(a.citations, b.citations) * 100), B: Math.round(b.citations / maxVal(a.citations, b.citations) * 100) },
      { metric: t.hIndex, A: Math.round(a.hIndex / maxVal(a.hIndex, b.hIndex) * 100), B: Math.round(b.hIndex / maxVal(a.hIndex, b.hIndex) * 100) },
      { metric: 'Scopus', A: Math.round(a.scopus / maxVal(a.scopus, b.scopus) * 100), B: Math.round(b.scopus / maxVal(a.scopus, b.scopus) * 100) },
      { metric: t.totalFaculty, A: Math.round(a.count / maxVal(a.count, b.count) * 100), B: Math.round(b.count / maxVal(a.count, b.count) * 100) },
    ];
  }, [facultyList, radarDeptA, radarDeptB, startYear, endYear, t]);

  // OA distribution pie data
  const oaDistData = useMemo(() => {
    let oaCount = 0;
    let closedCount = 0;
    filteredFaculty.forEach(f => {
      if (f.metrics?.topWorks) {
        f.metrics.topWorks.forEach(w => {
          if (w.isOa) oaCount++;
          else closedCount++;
        });
      }
    });
    if (oaCount === 0 && closedCount === 0) return [];
    return [
      { name: t.oaOpen, value: oaCount },
      { name: t.oaClosed, value: closedCount },
    ];
  }, [filteredFaculty, t]);

  const topAuthors = useMemo(() => {
    // Check if we have meaningful citation data across the filtered set
    const hasCitations = filteredFaculty.some(f => (f.metrics?.citationCount || 0) > 0);

    // If showing stats by range, we should ideally use range-specific citations/pubs for "Top" as well
    const getDataInRange = (f: Faculty) => {
       const rangePubs = f.publications.filter(p => p.year >= startYear && p.year <= endYear).length;
       const rangeCitations = f.metrics?.yearlyStats 
          ? f.metrics.yearlyStats.filter(y => y.year >= startYear && y.year <= endYear).reduce((sum, y) => sum + y.citations, 0)
          : 0; // Fallback if no yearly stats

       return { rangePubs, rangeCitations };
    };

    return {
        data: [...filteredFaculty]
            .map(f => {
                const { rangePubs, rangeCitations } = getDataInRange(f);
                return {
                    name: f.name.split(' ').length > 1
                        ? `${f.name.split(' ')[0]} ${f.name.split(' ')[1]?.[0] || ''}.`
                        : f.name,
                    value: hasCitations ? rangeCitations : rangePubs,
                    orcidId: f.orcidId,
                };
            })
            .sort((a, b) => b.value - a.value)
            .slice(0, 5),
        label: hasCitations ? t.citations : t.publications,
        isCitations: hasCitations
    };
  }, [filteredFaculty, t.citations, t.publications, startYear, endYear]);

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2 text-slate-500 font-medium mr-2">
            <Filter size={20} />
            <span>Filters:</span>
        </div>

        <div className="flex-1 min-w-[180px]">
             <label className="block text-xs font-semibold text-slate-500 mb-1 ml-1">{t.filterByDept}</label>
             <select 
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
             >
                <option value="All">{t.allDepartments}</option>
                {departments.filter(d => d !== 'All').map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                ))}
             </select>
        </div>

        <div className="flex-1 min-w-[180px]">
             <label className="block text-xs font-semibold text-slate-500 mb-1 ml-1">{t.filterByFaculty}</label>
             <select 
                value={selectedFacId}
                onChange={(e) => setSelectedFacId(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
             >
                <option value="All">{t.allFaculty}</option>
                {availableFaculty.map(f => (
                    <option key={f.orcidId} value={f.orcidId}>{f.name}</option>
                ))}
             </select>
        </div>

        <div className="flex gap-2 items-end">
             <div className="w-24">
                <label className="block text-xs font-semibold text-slate-500 mb-1 ml-1">{t.fromYear}</label>
                <input 
                    type="number"
                    value={startYear}
                    onChange={(e) => setStartYear(parseInt(e.target.value) || 2000)}
                    min="1990"
                    max={currentYear}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
             </div>
             <div className="w-24">
                <label className="block text-xs font-semibold text-slate-500 mb-1 ml-1">{t.toYear}</label>
                <input 
                    type="number"
                    value={endYear}
                    onChange={(e) => setEndYear(parseInt(e.target.value) || currentYear)}
                    min="1990"
                    max={currentYear + 1}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
             </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        ].map((stat, idx) => (
          <div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-3">
            <div className={`p-3 rounded-lg ${stat.bg} ${stat.color} shrink-0`}>
              <stat.icon size={22} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium whitespace-nowrap uppercase tracking-wide">{stat.label}</p>
              <h4 className="text-xl font-bold text-slate-900">{stat.value}</h4>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
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
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="citations" stroke="#8884d8" strokeWidth={3} dot={{ r: 4 }} name="Citations (OA)" />
                <Line yAxisId="right" type="monotone" dataKey="publications" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} name="Pubs (ORCID)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800">{t.hIndexDist}</h3>
            <ExportBtn onClick={() => exportCSV(hIndexData, 'hindex_distribution')} />
          </div>
          <div className="h-64 w-full">
             <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hIndexData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="range" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false}/>
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800">
               {t.topFaculty} <span className="text-sm font-normal text-slate-500">({topAuthors.label})</span>
            </h3>
            <ExportBtn onClick={() => exportCSV(topAuthors.data, 'top_faculty')} />
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={topAuthors.data} 
                layout="vertical" 
                margin={{ left: 10, right: 30 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                <XAxis type="number" hide />
                <YAxis 
                    dataKey="name" 
                    type="category" 
                    stroke="#64748b" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    width={130} 
                />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Bar
                    dataKey="value"
                    fill={topAuthors.isCitations ? "#8b5cf6" : "#3b82f6"}
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                    name={topAuthors.label}
                    cursor={onSelectFaculty ? 'pointer' : undefined}
                    onClick={(data: any) => {
                      if (onSelectFaculty && data?.orcidId) {
                        const faculty = facultyList.find(f => f.orcidId === data.orcidId);
                        if (faculty) onSelectFaculty(faculty);
                      }
                    }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
         <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
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
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      {/* Radar + OA Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Comparison */}
        {deptNames.length >= 2 && radarData.length > 0 && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-3">{t.radarComparison}</h3>
            <div className="flex gap-2 mb-4">
              <select
                value={radarDeptA}
                onChange={e => setRadarDeptA(e.target.value)}
                className="flex-1 p-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {deptNames.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <span className="text-slate-400 self-center text-xs">vs</span>
              <select
                value={radarDeptB}
                onChange={e => setRadarDeptB(e.target.value)}
                className="flex-1 p-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {deptNames.map(d => <option key={d} value={d}>{d}</option>)}
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

        {/* OA Distribution */}
        {oaDistData.length > 0 && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">{t.oaDistribution}</h3>
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

      {/* Department Comparison */}
      {deptComparisonData.length > 1 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800">{t.deptComparison}</h3>
            <div className="bg-slate-100 p-1 rounded-lg flex gap-1">
              {(['publications', 'citations', 'hIndex'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setDeptCompMetric(m)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    deptCompMetric === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {m === 'publications' ? t.publications : m === 'citations' ? t.citations : t.hIndex}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptComparisonData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={140} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey={deptCompMetric} fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} name={deptCompMetric === 'hIndex' ? t.avgHIndex : deptCompMetric === 'citations' ? t.citations : t.publications} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;