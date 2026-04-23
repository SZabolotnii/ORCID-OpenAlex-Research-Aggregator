
import React, { useState, useMemo } from 'react';
import { Faculty, Publication, DataSource } from '../types';
import { X, Award, TrendingUp, FileBarChart, Tag, Building2, BookOpen, ExternalLink, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface ProfileModalProps {
  faculty: Faculty;
  facultyList: Faculty[];
  onClose: () => void;
  onSelectPublication: (pub: Publication) => void;
  onNavigate: (faculty: Faculty) => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ faculty, facultyList, onClose, onSelectPublication, onNavigate }) => {
  const { t } = useLanguage();

  // Publication filters
  const [pubYearFilter, setPubYearFilter] = useState<string>('');
  const [pubTypeFilter, setPubTypeFilter] = useState<string>('');
  const [pubSourceFilter, setPubSourceFilter] = useState<string>('');

  const pubYears = useMemo(() => {
    const years = new Set(faculty.publications.map(p => p.year));
    return Array.from(years).sort((a: number, b: number) => b - a);
  }, [faculty.publications]);

  const pubTypes = useMemo(() => {
    const types = new Set(faculty.publications.map(p => p.type).filter(Boolean));
    return Array.from(types).sort();
  }, [faculty.publications]);

  const pubSources = useMemo(() => {
    const sources = new Set<DataSource>();
    faculty.publications.forEach(p => p.sources.forEach(s => sources.add(s)));
    return Array.from(sources);
  }, [faculty.publications]);

  const filteredPubs = useMemo(() => {
    let pubs = [...faculty.publications];
    if (pubYearFilter) pubs = pubs.filter(p => p.year === parseInt(pubYearFilter));
    if (pubTypeFilter) pubs = pubs.filter(p => p.type === pubTypeFilter);
    if (pubSourceFilter) pubs = pubs.filter(p => p.sources.includes(pubSourceFilter as DataSource));
    return pubs;
  }, [faculty.publications, pubYearFilter, pubTypeFilter, pubSourceFilter]);

  // Navigation
  const currentIndex = facultyList.findIndex(f => f.orcidId === faculty.orcidId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < facultyList.length - 1;

  const navigatePrev = () => { if (hasPrev) onNavigate(facultyList[currentIndex - 1]); };
  const navigateNext = () => { if (hasNext) onNavigate(facultyList[currentIndex + 1]); };

  // PDF Export
  const handleExportPDF = () => {
    const jspdf = (window as any).jspdf;
    if (!jspdf) { alert('jsPDF not loaded'); return; }

    const { jsPDF } = jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 15;
    const pw = doc.internal.pageSize.getWidth();
    let y = 20;

    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(faculty.name, margin, y);
    y += 8;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`${faculty.position} · ${faculty.department}`, margin, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`ORCID: ${faculty.orcidId}`, margin, y);
    doc.setTextColor(0);
    y += 10;

    // Metrics
    if (faculty.metrics) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Scientometric Indicators', margin, y);
      y += 6;

      (doc as any).autoTable({
        startY: y,
        head: [['H-index', 'Citations', 'i10-Index', 'Publications', 'Citations (2y)']],
        body: [[
          faculty.metrics.hIndex,
          faculty.metrics.citationCount,
          faculty.metrics.i10Index,
          faculty.publications.length,
          faculty.metrics.citationCount2Year
        ]],
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [79, 70, 229] },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Top Works
    const topWorks = faculty.metrics?.topWorks;
    if (topWorks && topWorks.length > 0) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Top Cited Works', margin, y);
      y += 6;

      (doc as any).autoTable({
        startY: y,
        head: [['Title', 'Journal', 'Year', 'Citations']],
        body: topWorks.slice(0, 5).map(w => [w.title, w.journal, w.year, w.citations]),
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [79, 70, 229] },
        columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 40 } },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Publications
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Publications (${faculty.publications.length})`, margin, y);
    y += 6;

    (doc as any).autoTable({
      startY: y,
      head: [['#', 'Title', 'Year', 'Journal', 'Sources']],
      body: faculty.publications.map((p, i) => [
        i + 1,
        p.title.length > 80 ? p.title.slice(0, 77) + '...' : p.title,
        p.year,
        p.journal || '—',
        p.sources.join(', ')
      ]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 75 }, 2: { cellWidth: 12 }, 3: { cellWidth: 40 } },
    });

    // Page numbers
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`${p} / ${totalPages}`, pw - margin, 290, { align: 'right' });
    }

    doc.save(`${faculty.name.replace(/\s+/g, '_')}_profile.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
          <div className="flex gap-4">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-2xl shadow-inner">
              {faculty.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900">{faculty.name}</h3>
              <div className="flex items-center gap-2 text-sm text-slate-500 mt-1 flex-wrap">
                 <span className="font-medium text-indigo-600">
                   {t.positions?.find((p: any) => p.value === faculty.position)?.label || faculty.position}
                 </span>
                 {faculty.department && <><span>•</span><span>{faculty.department}</span></>}
                 {faculty.institution && <><span>•</span><span className="text-slate-400">{faculty.institution}</span></>}
              </div>
               <div className="flex gap-2 mt-2 items-center">
                   <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-500 flex items-center gap-1">
                     <span className="opacity-50">ORCID:</span> {faculty.orcidId}
                   </span>
                   {faculty.metrics && (
                       <span className="text-xs font-medium bg-green-50 text-green-700 px-2 py-0.5 rounded flex items-center gap-1 border border-green-100">
                           <Award size={12}/> Pro Data
                       </span>
                   )}
               </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Navigation */}
            <button onClick={navigatePrev} disabled={!hasPrev} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full disabled:opacity-30 transition-colors" title="Previous">
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs text-slate-400 min-w-[40px] text-center">{currentIndex + 1}/{facultyList.length}</span>
            <button onClick={navigateNext} disabled={!hasNext} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full disabled:opacity-30 transition-colors" title="Next">
              <ChevronRight size={18} />
            </button>
            {/* Export PDF */}
            <button onClick={handleExportPDF} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors ml-1" title="Export PDF">
              <Download size={18} />
            </button>
            {/* Close */}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors bg-white rounded-full p-2 hover:bg-slate-200 ml-1">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gradient-to-br from-indigo-50 to-white p-5 rounded-xl border border-indigo-100 text-center shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                      <TrendingUp size={40} className="text-indigo-600" />
                  </div>
                  <div className="text-4xl font-bold text-indigo-700">{faculty.metrics?.hIndex || '-'}</div>
                  <div className="text-xs text-indigo-500 font-bold uppercase tracking-wider mt-2">{t.hIndex}</div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 text-center shadow-sm">
                  <div className="text-4xl font-bold text-slate-700">{faculty.metrics?.citationCount || '-'}</div>
                  <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-2">{t.citations}</div>
                  {faculty.metrics?.citationCount2Year ? (
                      <div className="text-[10px] text-green-600 mt-1 font-medium">
                          +{faculty.metrics.citationCount2Year} last 2y
                      </div>
                  ) : null}
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 text-center shadow-sm">
                  <div className="text-4xl font-bold text-slate-700">{faculty.metrics?.i10Index || '-'}</div>
                  <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-2">i10-Index</div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 text-center shadow-sm">
                  <div className="text-4xl font-bold text-slate-700">{faculty.publications.length}</div>
                  <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-2">{t.publications}</div>
              </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Left Column */}
              <div className="md:col-span-2 space-y-8">
                  {/* Top Cited Works */}
                  {faculty.metrics?.topWorks && faculty.metrics.topWorks.length > 0 && (
                       <div>
                          <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                              <Award size={18} className="text-amber-500" /> {t.topWorks}
                          </h4>
                          <div className="space-y-3">
                              {faculty.metrics.topWorks.slice(0, 5).map((work, idx) => (
                                  <div key={idx} className="bg-white p-4 border border-slate-100 rounded-lg hover:border-indigo-100 hover:shadow-sm transition-all">
                                      <div className="flex justify-between items-start">
                                          <h5 className="font-medium text-indigo-900 leading-snug">{work.title}</h5>
                                          <span className="ml-2 flex-shrink-0 bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded">{work.year}</span>
                                      </div>
                                      <div className="flex items-center gap-4 mt-2 text-sm">
                                          <span className="text-slate-500 italic truncate max-w-[200px]">{work.journal}</span>
                                          <div className="flex items-center gap-1 text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full text-xs">
                                              <span className="font-bold">{work.citations}</span> cit.
                                          </div>
                                          {work.isOa && (
                                              <span className="text-xs font-medium bg-green-50 text-green-700 px-2 py-0.5 rounded flex items-center gap-1 border border-green-100">
                                                  <ExternalLink size={10} /> OA
                                              </span>
                                          )}
                                      </div>
                                  </div>
                              ))}
                          </div>
                       </div>
                  )}

                  {/* Publications with filters */}
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                      <FileBarChart size={18} className="text-slate-500" /> {t.publications} ({filteredPubs.length}/{faculty.publications.length})
                    </h4>

                    {/* Pub Filters */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <select value={pubYearFilter} onChange={e => setPubYearFilter(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500">
                        <option value="">{t.pubYear}: All</option>
                        {pubYears.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                      <select value={pubTypeFilter} onChange={e => setPubTypeFilter(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500">
                        <option value="">{t.pubType}: All</option>
                        {pubTypes.map(t => <option key={t} value={t}>{t.replace('-', ' ')}</option>)}
                      </select>
                      <select value={pubSourceFilter} onChange={e => setPubSourceFilter(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500">
                        <option value="">{t.sources}: All</option>
                        {pubSources.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                      </select>
                      {(pubYearFilter || pubTypeFilter || pubSourceFilter) && (
                        <button onClick={() => { setPubYearFilter(''); setPubTypeFilter(''); setPubSourceFilter(''); }} className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg">
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {filteredPubs.map((pub, idx) => (
                        <button
                          key={idx}
                          onClick={() => onSelectPublication(pub)}
                          className="w-full text-left p-3 bg-slate-50/50 hover:bg-slate-100 border border-slate-100 rounded-lg flex flex-col gap-1 text-sm transition-colors group"
                        >
                             <div className="flex justify-between items-start w-full">
                                <div className="font-medium text-slate-800 pr-4 group-hover:text-indigo-600 transition-colors">{pub.title}</div>
                                <span className="text-slate-400 font-mono text-xs whitespace-nowrap">{pub.year}</span>
                             </div>
                             <div className="flex items-center justify-between mt-1 w-full">
                                <div className="flex gap-1">
                                   {pub.sources.map(s => (
                                      <span key={s} className="text-[9px] uppercase px-1 rounded bg-slate-200 text-slate-600 font-bold tracking-wider">
                                        {s === 'openalex' ? 'OA' : s}
                                      </span>
                                   ))}
                                   {pub.isOa && (
                                     <span className="text-[9px] px-1 rounded bg-green-100 text-green-700 font-bold">OA</span>
                                   )}
                                </div>
                                {pub.citationCount !== undefined && pub.citationCount > 0 && (
                                   <span className="text-xs text-slate-500">{pub.citationCount} cit.</span>
                                )}
                             </div>
                        </button>
                      ))}
                    </div>
                  </div>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                   {faculty.metrics?.topics && faculty.metrics.topics.length > 0 && (
                      <div>
                          <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                              <Tag size={18} className="text-slate-500" /> {t.researchTopics}
                          </h4>
                          <div className="flex flex-wrap gap-2">
                              {faculty.metrics.topics.map((topic, i) => (
                                  <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full border border-indigo-100">
                                      {topic.name}
                                  </span>
                              ))}
                          </div>
                      </div>
                   )}

                   {faculty.metrics?.institutions && faculty.metrics.institutions.length > 0 && (
                      <div>
                          <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                              <Building2 size={18} className="text-slate-500" /> {t.institutions}
                          </h4>
                          <ul className="space-y-2">
                              {faculty.metrics.institutions.slice(0, 3).map((inst, i) => (
                                  <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                                      <span className="mt-1.5 w-1.5 h-1.5 bg-slate-300 rounded-full flex-shrink-0" />
                                      {inst}
                                  </li>
                              ))}
                          </ul>
                      </div>
                   )}

                   {faculty.biography && (
                      <div>
                          <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                              <BookOpen size={18} className="text-slate-500" /> {t.biography}
                          </h4>
                          <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 max-h-48 overflow-y-auto">
                              {faculty.biography}
                          </p>
                      </div>
                  )}

                  <div className="pt-4 border-t border-slate-100">
                     <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2 text-xs uppercase tracking-wide">
                         {t.mergedFrom}
                     </h4>
                     <div className="flex gap-2 flex-wrap">
                         {Array.from(new Set(faculty.publications.flatMap(p => p.sources))).map(s => (
                             <div key={s} className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-600 font-bold uppercase">
                                 {s}
                             </div>
                         ))}
                     </div>
                  </div>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
