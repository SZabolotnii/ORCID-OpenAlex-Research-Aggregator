
import React from 'react';
import { Publication, DataSource } from '../types';
import { X, ExternalLink, Calendar, BookOpen, Tag, Users, FileText, Database } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface PublicationDetailsModalProps {
  publication: Publication;
  onClose: () => void;
}

const SourceBadge: React.FC<{ source: DataSource }> = ({ source }) => {
  const styles = {
    orcid: 'bg-[#A6CE39]/20 text-[#8aa933] border-[#A6CE39]/30',
    openalex: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    scopus: 'bg-orange-50 text-orange-600 border-orange-200',
    wos: 'bg-blue-50 text-blue-800 border-blue-200'
  };

  const labels = {
    orcid: 'ORCID',
    openalex: 'OpenAlex',
    scopus: 'Scopus',
    wos: 'Web of Science'
  };

  return (
    <span className={`text-xs font-bold px-2 py-1 rounded border flex items-center gap-1 ${styles[source] || 'bg-gray-100'}`}>
       <Database size={10} />
       {labels[source] || source}
    </span>
  );
};

const PublicationDetailsModal: React.FC<PublicationDetailsModalProps> = ({ publication, onClose }) => {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
          <h3 className="text-lg font-bold text-slate-800 pr-8 leading-snug">
            {publication.title}
          </h3>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 bg-white p-1.5 rounded-full hover:bg-slate-200 transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Metrics Row */}
          <div className="flex flex-wrap gap-4">
             <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700">
                <Calendar size={16} className="text-slate-400" />
                <span className="font-semibold">{t.pubYear}:</span>
                <span>{publication.year || 'N/A'}</span>
             </div>
             <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700">
                <BookOpen size={16} className="text-slate-400" />
                <span className="font-semibold">{t.journal}:</span>
                <span className="truncate max-w-[200px]" title={publication.journal || ''}>{publication.journal || 'N/A'}</span>
             </div>
             <div className="flex items-center gap-2 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100 text-sm text-amber-800">
                <Tag size={16} className="text-amber-500" />
                <span className="font-semibold">{t.citations}:</span>
                <span className="font-bold">{publication.citationCount || 0}</span>
             </div>
          </div>

          {/* Sources */}
          <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t.sources}</h4>
              <div className="flex flex-wrap gap-2">
                  {publication.sources.map(s => <SourceBadge key={s} source={s} />)}
              </div>
          </div>

          {/* Authors */}
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-2">
                <Users size={16} className="text-indigo-600" /> {t.authors}
            </h4>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm text-slate-600">
                {publication.authors && publication.authors.length > 0 
                    ? publication.authors.join(', ') 
                    : <span className="text-slate-400 italic">Author list not explicitly available in summary data.</span>}
            </div>
          </div>

          {/* Abstract */}
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-2">
                <FileText size={16} className="text-indigo-600" /> {t.abstract}
            </h4>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-sm text-slate-600 leading-relaxed max-h-48 overflow-y-auto">
                {publication.abstract 
                    ? publication.abstract 
                    : <span className="text-slate-400 italic">{t.noAbstract}</span>}
            </div>
          </div>

          {/* External Links */}
          {(publication.url || publication.doi) && (
            <div className="pt-4 border-t border-slate-100 flex gap-3">
                 {publication.url && (
                     <a 
                        href={publication.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                     >
                        <ExternalLink size={16} /> {t.viewOriginal}
                     </a>
                 )}
                 {publication.doi && !publication.url?.includes(publication.doi) && (
                     <a 
                        href={`https://doi.org/${publication.doi}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
                     >
                        <ExternalLink size={16} /> DOI Link
                     </a>
                 )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default PublicationDetailsModal;
