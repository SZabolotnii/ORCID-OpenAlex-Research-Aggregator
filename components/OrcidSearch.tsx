

import React, { useState } from 'react';
import { Search, UserPlus, Check, Loader2, Building, X } from 'lucide-react';
import { searchByAffiliation } from '../services/orcidService';
import { useLanguage } from '../contexts/LanguageContext';
import { Faculty } from '../types';

interface OrcidSearchProps {
  existingFaculty: Faculty[];
  onAddFaculty: (orcid: string, position: string, department: string) => Promise<void>;
}

const OrcidSearch: React.FC<OrcidSearchProps> = ({ existingFaculty, onAddFaculty }) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ orcidId: string, name: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  // State for the "Add" modal
  const [selectedResult, setSelectedResult] = useState<{ orcidId: string, name: string } | null>(null);
  const [newPosition, setNewPosition] = useState('Associate Professor');
  const [newDept, setNewDept] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setIsSearching(true);
    setResults([]);
    setHasSearched(false);
    
    try {
      const data = await searchByAffiliation(query);
      setResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
      setHasSearched(true);
    }
  };

  const handleOpenAddModal = (result: { orcidId: string, name: string }) => {
    setSelectedResult(result);
  };

  const handleConfirmAdd = async () => {
    if (!selectedResult) return;
    setIsAdding(true);
    try {
      await onAddFaculty(selectedResult.orcidId, newPosition, newDept);
      setSelectedResult(null); // Close modal
    } catch (error) {
      console.error("Failed to add", error);
    } finally {
      setIsAdding(false);
    }
  };

  const isTracked = (orcid: string) => existingFaculty.some(f => f.orcidId === orcid);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-2">{t.searchPageTitle}</h2>
        <p className="text-slate-500 text-sm mb-6">{t.searchDesc}</p>
        
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1 relative">
            <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <button 
            type="submit" 
            disabled={isSearching || !query.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isSearching ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
            {t.searchBtn}
          </button>
        </form>
      </div>

      {/* Results */}
      {hasSearched && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <h3 className="font-semibold text-slate-700">
              {results.length > 0 ? `${t.resultsFound}: ${results.length}` : t.noResults}
            </h3>
          </div>
          
          {results.length > 0 && (
            <div className="divide-y divide-slate-100">
              {results.map((result) => {
                const alreadyTracked = isTracked(result.orcidId);
                return (
                  <div key={result.orcidId} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold">
                        {result.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="font-medium text-slate-900">{result.name}</div>
                        <div className="text-sm text-slate-500 font-mono">{result.orcidId}</div>
                      </div>
                    </div>
                    
                    {alreadyTracked ? (
                      <span className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg text-sm font-medium">
                        <Check size={16} /> {t.tracked}
                      </span>
                    ) : (
                      <button 
                        onClick={() => handleOpenAddModal(result)}
                        className="flex items-center gap-2 text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-transparent hover:border-indigo-100"
                      >
                        <UserPlus size={16} /> {t.addToTracker}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Modal */}
      {selectedResult && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">{t.assignInfo}</h3>
              <button onClick={() => setSelectedResult(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-2">
                 <div className="font-semibold text-blue-900">{selectedResult.name}</div>
                 <div className="text-xs text-blue-600 font-mono">{selectedResult.orcidId}</div>
              </div>
              
              <p className="text-sm text-slate-500">{t.assignInfoDesc}</p>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.dept}</label>
                <input 
                    type="text"
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                    placeholder={t.enterDeptPlaceholder}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.position}</label>
                <select 
                    value={newPosition}
                    onChange={(e) => setNewPosition(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <option value="Professor">{t.prof}</option>
                    <option value="Associate Professor">{t.assocProf}</option>
                    <option value="Assistant Professor">{t.assistProf}</option>
                    <option value="Lecturer">{t.lecturer}</option>
                    <option value="Researcher">{t.researcher}</option>
                </select>
              </div>

              <button 
                onClick={handleConfirmAdd}
                disabled={isAdding}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex justify-center items-center gap-2 mt-2"
              >
                {isAdding ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />}
                {t.confirmAdd}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrcidSearch;