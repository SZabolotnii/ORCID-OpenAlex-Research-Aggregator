

import React, { useMemo, useState } from 'react';
import { Faculty } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { Users, FileText, TrendingUp, Award, BarChart2, Filter, Database, Globe, Calendar } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface DashboardProps {
  facultyList: Faculty[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const Dashboard: React.FC<DashboardProps> = ({ facultyList }) => {
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

    return { totalFaculty, totalPubs, pubsThisYear, totalCitations, avgHIndex, scopusPubs, wosPubs };
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
                    // Keep full name for tooltip if needed, or simple name
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
          <h3 className="text-lg font-bold text-slate-800 mb-4">{t.citationHistory} vs Pubs</h3>
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
          <h3 className="text-lg font-bold text-slate-800 mb-4">{t.hIndexDist}</h3>
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
          <h3 className="text-lg font-bold text-slate-800 mb-4">
             {t.topFaculty} <span className="text-sm font-normal text-slate-500">({topAuthors.label})</span>
          </h3>
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
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
         <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-4">{t.pubTypes}</h3>
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
    </div>
  );
};

export default Dashboard;