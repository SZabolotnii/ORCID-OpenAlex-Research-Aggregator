import React from 'react';
import { Faculty } from '../../types';
import { FileText, Loader2 } from 'lucide-react';

type StandardReportFormProps = {
  t: Record<string, any>;
  type: string;
  department: string;
  facultyId: string;
  departments: string[];
  filteredFaculty: Faculty[];
  isGenerating: boolean;
  hasFaculty: boolean;
  setType: (value: string) => void;
  setDepartment: (value: string) => void;
  setFacultyId: (value: string) => void;
  handleGenerateStandard: () => Promise<void>;
};

export default function StandardReportForm({
  t,
  type,
  department,
  facultyId,
  departments,
  filteredFaculty,
  isGenerating,
  hasFaculty,
  setType,
  setDepartment,
  setFacultyId,
  handleGenerateStandard,
}: StandardReportFormProps) {
  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
          <FileText size={24} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-800">{t.smartReport}</h3>
          <p className="text-sm text-slate-500">{t.smartReportDesc}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t.reportType}</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="annual">Annual Activity Report</option>
            <option value="department">Department Overview</option>
            <option value="individual">Individual Performance Summary</option>
            <option value="scopus_wos">Scopus/WoS Publication List</option>
            <option value="faculty_card">Faculty Activity Card</option>
            <option value="accreditation">Accreditation Report</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t.targetDept}</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {departments.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t.targetFaculty}
            </label>
            <select
              value={facultyId}
              onChange={(e) => setFacultyId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="All">{t.allFaculty}</option>
              {filteredFaculty.map((faculty) => (
                <option key={faculty.orcidId} value={faculty.orcidId}>
                  {faculty.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <button
        onClick={handleGenerateStandard}
        disabled={isGenerating || !hasFaculty}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
      >
        {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
        {isGenerating ? t.generating : t.generateBtn}
      </button>
    </>
  );
}
