
import React, { useState, useMemo } from 'react';
import { Faculty, DataSource } from '../types';
import { User, BookOpen, Trash2, ExternalLink, ChevronUp, ChevronDown, Search, Download, RefreshCw, Pencil, CheckSquare, Square } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

type SortField = 'name' | 'department' | 'position' | 'hIndex' | 'citations' | 'publications';
type SortDirection = 'asc' | 'desc';

interface FacultyListProps {
  facultyList: Faculty[];
  onSelect: (faculty: Faculty) => void;
  onDelete: (orcidId: string) => void;
  onRefresh?: (orcidId: string) => Promise<void>;
  onEdit?: (faculty: Faculty) => void;
  onBulkDelete?: (ids: string[]) => void;
  onBulkUpdate?: (ids: string[], field: 'department' | 'position', value: string) => void;
  isAdmin?: boolean;
}

const SourceBadge: React.FC<{ source: DataSource }> = ({ source }) => {
  const styles = {
    orcid: 'bg-[#A6CE39]/20 text-[#8aa933] border-[#A6CE39]/30',
    openalex: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    scopus: 'bg-orange-50 text-orange-600 border-orange-200',
    wos: 'bg-blue-50 text-blue-800 border-blue-200'
  };

  const labels = {
    orcid: 'ID',
    openalex: 'OA',
    scopus: 'Sc',
    wos: 'WoS'
  };

  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${styles[source] || 'bg-gray-100'}`} title={source}>
      {labels[source] || source}
    </span>
  );
};

function formatRelativeDate(isoString: string, t: any): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t.today;
  if (diffDays === 1) return t.yesterday;
  return `${diffDays} ${t.daysAgo}`;
}

const FacultyList: React.FC<FacultyListProps> = ({ facultyList, onSelect, onDelete, onRefresh, onEdit, onBulkDelete, onBulkUpdate, isAdmin = false }) => {
  const { t } = useLanguage();

  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [searchText, setSearchText] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkField, setBulkField] = useState<'department' | 'position'>('department');
  const [bulkValue, setBulkValue] = useState('');

  const departments = useMemo(() => {
    const depts = new Set(facultyList.map(f => f.department).filter(Boolean));
    return Array.from(depts).sort();
  }, [facultyList]);

  const filteredAndSorted = useMemo(() => {
    let list = [...facultyList];

    // Filter by search
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.orcidId.includes(q)
      );
    }

    // Filter by department
    if (filterDept) {
      list = list.filter(f => f.department === filterDept);
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'department':
          cmp = (a.department || '').localeCompare(b.department || '');
          break;
        case 'position':
          cmp = (a.position || '').localeCompare(b.position || '');
          break;
        case 'hIndex':
          cmp = (a.metrics?.hIndex || 0) - (b.metrics?.hIndex || 0);
          break;
        case 'citations':
          cmp = (a.metrics?.citationCount || 0) - (b.metrics?.citationCount || 0);
          break;
        case 'publications':
          cmp = a.publications.length - b.publications.length;
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [facultyList, searchText, filterDept, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'name' || field === 'department' || field === 'position' ? 'asc' : 'desc');
    }
  };

  const handleRefresh = async (orcidId: string) => {
    if (!onRefresh || refreshingId) return;
    setRefreshingId(orcidId);
    try {
      await onRefresh(orcidId);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleRefreshAll = async () => {
    if (!onRefresh || refreshingAll) return;
    setRefreshingAll(true);
    for (const f of facultyList) {
      setRefreshingId(f.orcidId);
      try {
        await onRefresh(f.orcidId);
      } catch (e) {
        console.error(`Failed to refresh ${f.name}`, e);
      }
      // Small delay to respect API rate limits
      await new Promise(r => setTimeout(r, 500));
    }
    setRefreshingId(null);
    setRefreshingAll(false);
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'ORCID', 'Institution', 'Department', 'Position', 'H-Index', 'Citations', 'i10-Index', 'Publications', 'Scopus', 'WoS', 'Last Updated'];
    const rows = filteredAndSorted.map(f => {
      const scopusCount = f.publications.filter(p => p.sources.includes('scopus')).length;
      const wosCount = f.publications.filter(p => p.sources.includes('wos')).length;
      return [
        f.name,
        f.orcidId,
        f.institution || '',
        f.department,
        f.position,
        f.metrics?.hIndex ?? '',
        f.metrics?.citationCount ?? '',
        f.metrics?.i10Index ?? '',
        f.publications.length,
        scopusCount,
        wosCount,
        f.lastUpdated || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `faculty_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAndSorted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSorted.map(f => f.orcidId)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(t.confirmBulkDelete)) return;
    if (onBulkDelete) {
      onBulkDelete(Array.from(selectedIds));
    } else {
      selectedIds.forEach(id => onDelete(id));
    }
    setSelectedIds(new Set());
  };

  const handleBulkApply = () => {
    if (selectedIds.size === 0 || !bulkValue.trim()) return;
    if (onBulkUpdate) {
      onBulkUpdate(Array.from(selectedIds), bulkField, bulkValue);
    }
    setBulkValue('');
    setSelectedIds(new Set());
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 opacity-0 group-hover/th:opacity-30" />;
    return sortDirection === 'asc'
      ? <ChevronUp className="w-3 h-3 text-indigo-600" />
      : <ChevronDown className="w-3 h-3 text-indigo-600" />;
  };

  if (facultyList.length === 0) {
    return (
      <div className="p-8 text-center bg-white rounded-xl shadow-sm border border-slate-200">
        <User className="w-12 h-12 mx-auto text-slate-300 mb-3" />
        <h3 className="text-lg font-medium text-slate-700">{t.noFaculty}</h3>
        <p className="text-slate-500">{t.addFacultyPrompt}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t.searchByName}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          {/* Department Filter */}
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="">{t.allDepartments}</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              title={t.exportCSV}
            >
              <Download size={14} />
              {t.exportCSV}
            </button>

            {isAdmin && onRefresh && (
              <button
                onClick={handleRefreshAll}
                disabled={refreshingAll}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50"
                title={t.refreshAll}
              >
                <RefreshCw size={14} className={refreshingAll ? 'animate-spin' : ''} />
                {refreshingAll ? t.refreshing : t.refreshAll}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bulk Actions Toolbar — admin only */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-indigo-700">
            {selectedIds.size} {t.selected}
          </span>
          <div className="flex items-center gap-2 flex-1">
            <select
              value={bulkField}
              onChange={e => setBulkField(e.target.value as any)}
              className="px-2 py-1.5 border border-indigo-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="department">{t.changeDeptSelected}</option>
              <option value="position">{t.changePositionSelected}</option>
            </select>
            {bulkField === 'position' ? (
              <select
                value={bulkValue}
                onChange={e => setBulkValue(e.target.value)}
                className="px-2 py-1.5 border border-indigo-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">—</option>
                {t.positions.map((p: any) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={bulkValue}
                onChange={e => setBulkValue(e.target.value)}
                placeholder={t.dept}
                className="px-2 py-1.5 border border-indigo-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 min-w-[120px]"
              />
            )}
            <button
              onClick={handleBulkApply}
              disabled={!bulkValue.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {t.applyToSelected}
            </button>
          </div>
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
          >
            {t.deleteSelected}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                {isAdmin && (
                  <th className="px-3 py-4 w-10">
                    <button onClick={toggleSelectAll} className="text-slate-400 hover:text-indigo-600">
                      {selectedIds.size === filteredAndSorted.length && filteredAndSorted.length > 0
                        ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                        : <Square className="w-4 h-4" />
                      }
                    </button>
                  </th>
                )}
                <th className="px-6 py-4 cursor-pointer select-none group/th" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">{t.name} <SortIcon field="name" /></div>
                </th>
                <th className="px-6 py-4 cursor-pointer select-none group/th" onClick={() => handleSort('department')}>
                  <div className="flex items-center gap-1">{t.department} <SortIcon field="department" /></div>
                </th>
                <th className="px-6 py-4 cursor-pointer select-none group/th" onClick={() => handleSort('position')}>
                  <div className="flex items-center gap-1">{t.position} <SortIcon field="position" /></div>
                </th>
                <th className="px-6 py-4 text-center cursor-pointer select-none group/th" onClick={() => handleSort('hIndex')}>
                  <div className="flex items-center justify-center gap-1">{t.hIndex} <SortIcon field="hIndex" /></div>
                </th>
                <th className="px-6 py-4 text-center cursor-pointer select-none group/th" onClick={() => handleSort('citations')}>
                  <div className="flex items-center justify-center gap-1">{t.citations} <SortIcon field="citations" /></div>
                </th>
                <th className="px-6 py-4 text-center cursor-pointer select-none group/th" onClick={() => handleSort('publications')}>
                  <div className="flex items-center justify-center gap-1">{t.publications} <SortIcon field="publications" /></div>
                </th>
                <th className="px-6 py-4 text-center">{t.sources}</th>
                {isAdmin && <th className="px-6 py-4 text-right">{t.actions}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSorted.map((faculty) => {
                const uniqueSources = new Set<DataSource>(['orcid']);
                if (faculty.metrics) uniqueSources.add('openalex');
                faculty.publications.forEach(p => p.sources.forEach(s => uniqueSources.add(s)));
                const isRefreshing = refreshingId === faculty.orcidId;

                return (
                  <tr key={faculty.orcidId} className={`hover:bg-slate-50 transition-colors group ${selectedIds.has(faculty.orcidId) ? 'bg-indigo-50/50' : ''}`}>
                    {isAdmin && (
                      <td className="px-3 py-4 w-10">
                        <button onClick={() => toggleSelect(faculty.orcidId)} className="text-slate-400 hover:text-indigo-600">
                          {selectedIds.has(faculty.orcidId)
                            ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                            : <Square className="w-4 h-4" />
                          }
                        </button>
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                          {faculty.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <button onClick={() => onSelect(faculty)} className="font-medium text-slate-900 hover:text-blue-600">
                            {faculty.name}
                          </button>
                          <div className="text-xs text-slate-400 font-mono">{faculty.orcidId}</div>
                          {faculty.lastUpdated && (
                            <div className="text-[10px] text-slate-400">{formatRelativeDate(faculty.lastUpdated, t)}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        {faculty.institution && (
                          <div className="text-xs text-slate-400 mb-0.5">{faculty.institution}</div>
                        )}
                        <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                          {faculty.department || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {/* Show translated position label */}
                      {t.positions?.find((p: any) => p.value === faculty.position)?.label || faculty.position}
                    </td>

                    <td className="px-6 py-4 text-center">
                      {faculty.metrics ? (
                         <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                             faculty.metrics.hIndex >= 10 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                         }`}>
                             {faculty.metrics.hIndex}
                         </span>
                      ) : (
                          <span className="text-slate-400">-</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-center font-mono text-xs">
                      {faculty.metrics ? faculty.metrics.citationCount : '-'}
                    </td>

                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <BookOpen className="w-4 h-4 text-slate-400" />
                        <span>{faculty.publications.length}</span>
                      </div>
                    </td>

                     <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap max-w-[100px]">
                        {Array.from(uniqueSources).map(s => <SourceBadge key={s} source={s} />)}
                      </div>
                    </td>

                    {isAdmin && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onSelect(faculty)}
                            className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-md"
                            title={t.viewProfile}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                          {onEdit && (
                            <button
                              onClick={() => onEdit(faculty)}
                              className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-md"
                              title={t.editFaculty}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {onRefresh && (
                            <button
                              onClick={() => handleRefresh(faculty.orcidId)}
                              disabled={isRefreshing}
                              className="p-1.5 hover:bg-green-50 text-green-600 rounded-md disabled:opacity-50"
                              title={t.refreshData}
                            >
                              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            </button>
                          )}
                          <button
                            onClick={() => onDelete(faculty.orcidId)}
                            className="p-1.5 hover:bg-red-50 text-red-600 rounded-md"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FacultyList;
