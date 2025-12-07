
import React from 'react';
import { Faculty, DataSource } from '../types';
import { User, BookOpen, Trash2, ExternalLink, BarChart2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface FacultyListProps {
  facultyList: Faculty[];
  onSelect: (faculty: Faculty) => void;
  onDelete: (orcidId: string) => void;
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

const FacultyList: React.FC<FacultyListProps> = ({ facultyList, onSelect, onDelete }) => {
  const { t } = useLanguage();

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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">{t.name}</th>
              <th className="px-6 py-4">{t.department}</th>
              <th className="px-6 py-4">{t.position}</th>
              <th className="px-6 py-4 text-center">{t.hIndex}</th>
              <th className="px-6 py-4 text-center">{t.citations}</th>
              <th className="px-6 py-4 text-center">{t.publications}</th>
              <th className="px-6 py-4 text-center">{t.sources}</th>
              <th className="px-6 py-4 text-right">{t.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {facultyList.map((faculty) => {
              // Collect all unique sources from all publications + metrics
              const uniqueSources = new Set<DataSource>(['orcid']);
              if (faculty.metrics) uniqueSources.add('openalex');
              faculty.publications.forEach(p => p.sources.forEach(s => uniqueSources.add(s)));

              return (
                <tr key={faculty.orcidId} className="hover:bg-slate-50 transition-colors group">
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
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                      {faculty.department}
                    </span>
                  </td>
                  <td className="px-6 py-4">{faculty.position}</td>
                  
                  {/* H-Index */}
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

                  {/* Citations */}
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

                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => onSelect(faculty)}
                        className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-md"
                        title={t.viewProfile}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => onDelete(faculty.orcidId)}
                        className="p-1.5 hover:bg-red-50 text-red-600 rounded-md"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FacultyList;
