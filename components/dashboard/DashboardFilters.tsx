import React from 'react';
import { Filter } from 'lucide-react';
import { Faculty } from '../../types';

type DashboardFiltersProps = {
  t: Record<string, any>;
  departments: string[];
  availableFaculty: Faculty[];
  selectedDept: string;
  selectedFacId: string;
  startYear: number;
  endYear: number;
  currentYear: number;
  setSelectedDept: (value: string) => void;
  setSelectedFacId: (value: string) => void;
  setStartYear: (value: number) => void;
  setEndYear: (value: number) => void;
};

export default function DashboardFilters({
  t,
  departments,
  availableFaculty,
  selectedDept,
  selectedFacId,
  startYear,
  endYear,
  currentYear,
  setSelectedDept,
  setSelectedFacId,
  setStartYear,
  setEndYear,
}: DashboardFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mr-2 flex items-center gap-2 font-medium text-slate-500">
        <Filter size={20} />
        <span>Filters:</span>
      </div>

      <div className="min-w-[180px] flex-1">
        <label className="ml-1 mb-1 block text-xs font-semibold text-slate-500">{t.filterByDept}</label>
        <select
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
          className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="All">{t.allDepartments}</option>
          {departments
            .filter((department) => department !== 'All')
            .map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
        </select>
      </div>

      <div className="min-w-[180px] flex-1">
        <label className="ml-1 mb-1 block text-xs font-semibold text-slate-500">
          {t.filterByFaculty}
        </label>
        <select
          value={selectedFacId}
          onChange={(e) => setSelectedFacId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="All">{t.allFaculty}</option>
          {availableFaculty.map((faculty) => (
            <option key={faculty.orcidId} value={faculty.orcidId}>
              {faculty.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-end gap-2">
        <div className="w-24">
          <label className="ml-1 mb-1 block text-xs font-semibold text-slate-500">{t.fromYear}</label>
          <input
            type="number"
            value={startYear}
            onChange={(e) => setStartYear(parseInt(e.target.value) || 2000)}
            min="1990"
            max={currentYear}
            className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="w-24">
          <label className="ml-1 mb-1 block text-xs font-semibold text-slate-500">{t.toYear}</label>
          <input
            type="number"
            value={endYear}
            onChange={(e) => setEndYear(parseInt(e.target.value) || currentYear)}
            min="1990"
            max={currentYear + 1}
            className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
    </div>
  );
}
