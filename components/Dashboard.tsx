
import React, { useEffect, useMemo, useState } from 'react';
import { Faculty } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import DashboardFilters from './dashboard/DashboardFilters';
import DashboardInsights from './dashboard/DashboardInsights';

interface DashboardProps {
  facultyList: Faculty[];
  onSelectFaculty?: (faculty: Faculty) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ facultyList, onSelectFaculty }) => {
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();
  
  // State for filters
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedFacId, setSelectedFacId] = useState('All');
  const [startYear, setStartYear] = useState<number>(currentYear - 4);
  const [startYearInitialized, setStartYearInitialized] = useState(false);

  useEffect(() => {
    if (!startYearInitialized && facultyList.length > 0) {
      const years = facultyList.flatMap(f => f.publications.map(p => p.year).filter(Boolean));
      if (years.length > 0) {
        setStartYear(Math.min(...years));
        setStartYearInitialized(true);
      }
    }
  }, [facultyList, startYearInitialized]);
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

    // Avg H-Index: only count faculty who have metrics (not all faculty)
    const facultyWithMetrics = filteredFaculty.filter(f => f.metrics);
    const avgHIndex = facultyWithMetrics.length > 0
        ? (facultyWithMetrics.reduce((acc, curr) => acc + (curr.metrics?.hIndex || 0), 0) / facultyWithMetrics.length).toFixed(1)
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
  }, [deptNames, radarDeptA, radarDeptB]);

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
      <DashboardFilters
        t={t}
        departments={departments}
        availableFaculty={availableFaculty}
        selectedDept={selectedDept}
        selectedFacId={selectedFacId}
        startYear={startYear}
        endYear={endYear}
        currentYear={currentYear}
        setSelectedDept={setSelectedDept}
        setSelectedFacId={setSelectedFacId}
        setStartYear={setStartYear}
        setEndYear={setEndYear}
      />

      <DashboardInsights
        t={t}
        stats={stats}
        trendData={trendData}
        hIndexData={hIndexData}
        topAuthors={topAuthors}
        typeData={typeData}
        oaDistData={oaDistData}
        deptComparisonData={deptComparisonData}
        deptCompMetric={deptCompMetric}
        setDeptCompMetric={setDeptCompMetric}
        deptNames={deptNames}
        radarDeptA={radarDeptA}
        radarDeptB={radarDeptB}
        setRadarDeptA={setRadarDeptA}
        setRadarDeptB={setRadarDeptB}
        radarData={radarData}
        facultyList={facultyList}
        onSelectFaculty={onSelectFaculty}
      />
    </div>
  );
};

export default Dashboard;
