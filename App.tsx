

import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, MessageSquareText, FileBarChart, Plus, GraduationCap, X, BookOpen, MapPin, Globe, TrendingUp, Award, Tag, Building2, ExternalLink, Settings, Database, MousePointerClick, Search } from 'lucide-react';
import { Faculty, ApiKeys, DataSource, Publication } from './types';
import { fetchOrcidData } from './services/orcidService';
import { fetchOpenAlexMetrics } from './services/openAlexService';
import { fetchScopusData } from './services/scopusService';
import { fetchWosData } from './services/wosService';
import { mergePublications } from './services/dataMergeService';
import Dashboard from './components/Dashboard';
import FacultyList from './components/FacultyList';
import ChatInterface from './components/ChatInterface';
import ReportGenerator from './components/ReportGenerator';
import PublicationDetailsModal from './components/PublicationDetailsModal';
import OrcidSearch from './components/OrcidSearch';
import { useLanguage } from './contexts/LanguageContext';

const NavLink = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link 
      to={to} 
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
        isActive 
          ? 'bg-indigo-600 text-white shadow-md' 
          : 'text-slate-500 hover:bg-slate-100 hover:text-indigo-600'
      }`}
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </Link>
  );
};

function App() {
  const { t, language, setLanguage } = useLanguage();
  const [facultyList, setFacultyList] = useState<Faculty[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ scopus: '', wos: '' });
  
  // Add Faculty Form State
  const [newOrcid, setNewOrcid] = useState('');
  const [newPosition, setNewPosition] = useState('Associate Professor');
  const [newDept, setNewDept] = useState('');
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [addStage, setAddStage] = useState(''); // '' | 'ORCID' | 'OPENALEX' | 'SCOPUS' | 'WOS'
  const [errorAdd, setErrorAdd] = useState('');

  // Persist data with safe parsing
  useEffect(() => {
    try {
      const saved = localStorage.getItem('faculty_data');
      if (saved) {
        setFacultyList(JSON.parse(saved));
      }
      const savedKeys = localStorage.getItem('api_keys');
      if (savedKeys) {
        setApiKeys(JSON.parse(savedKeys));
      }
    } catch (e) {
      console.error("Failed to parse saved data", e);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('faculty_data', JSON.stringify(facultyList));
  }, [facultyList]);

  const saveApiKeys = () => {
    localStorage.setItem('api_keys', JSON.stringify(apiKeys));
    setIsSettingsOpen(false);
  };

  // Logic extracted to function for reuse in Search component
  const processAndAddFaculty = async (orcid: string, position: string, dept: string) => {
    // 1. Fetch ORCID
    let facultyData = await fetchOrcidData(orcid, position, dept);
    
    // 2. Fetch OpenAlex Metrics & Merge
    const metrics = await fetchOpenAlexMetrics(orcid);
    if (metrics) {
        facultyData.metrics = metrics;
    }

    // 3. Fetch & Merge Scopus (Simulated or Real)
    const scopusPubs = await fetchScopusData(orcid, apiKeys.scopus);
    if (scopusPubs.length > 0) {
      facultyData.publications = mergePublications(facultyData.publications, scopusPubs, 'scopus');
    }

    // 4. Fetch & Merge WoS (Simulated or Real)
    const wosPubs = await fetchWosData(orcid, apiKeys.wos);
    if (wosPubs.length > 0) {
      facultyData.publications = mergePublications(facultyData.publications, wosPubs, 'wos');
    }

    setFacultyList(prev => [...prev, facultyData]);
  };

  const handleAddFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrcid.trim()) return;
    
    if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(newOrcid)) {
       setErrorAdd("Invalid ORCID format (e.g., 0000-0000-0000-0000)");
       return;
    }

    if (facultyList.find(f => f.orcidId === newOrcid)) {
        setErrorAdd("Faculty member already exists.");
        return;
    }

    setLoadingAdd(true);
    setAddStage('ORCID');
    setErrorAdd('');
    try {
      await processAndAddFaculty(newOrcid, newPosition, newDept);
      setNewOrcid('');
      setNewDept('');
      setIsAdding(false);
    } catch (err) {
      console.error(err);
      setErrorAdd('Failed to fetch data. Check ORCID ID or connection.');
    } finally {
      setLoadingAdd(false);
      setAddStage('');
    }
  };

  const handleDelete = (id: string) => {
    if(confirm('Are you sure you want to remove this faculty member?')) {
        setFacultyList(prev => prev.filter(f => f.orcidId !== id));
        if (selectedFaculty?.orcidId === id) setSelectedFaculty(null);
    }
  };

  return (
    <Router>
      <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-indigo-200 shadow-lg">
                <GraduationCap size={24} />
              </div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">Research<span className="text-indigo-600">Tracker</span></h1>
            </div>
          </div>
          
          <nav className="flex-1 p-4 space-y-2">
            <NavLink to="/" icon={LayoutDashboard} label={t.dashboard} />
            <NavLink to="/faculty" icon={Users} label={t.facultyList} />
            <NavLink to="/search" icon={Search} label={t.searchMenu} />
            <NavLink to="/chat" icon={MessageSquareText} label={t.aiAssistant} />
            <NavLink to="/reports" icon={FileBarChart} label={t.reports} />
          </nav>

          <div className="p-4 border-t border-slate-100 space-y-4">
             {/* Language Toggle */}
             <div className="bg-slate-50 p-2 rounded-lg flex gap-1 border border-slate-200">
                <button 
                  onClick={() => setLanguage('en')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                    language === 'en' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  English
                </button>
                <button 
                  onClick={() => setLanguage('ua')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                    language === 'ua' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Українська
                </button>
             </div>

             <button 
                onClick={() => setIsSettingsOpen(true)}
                className="w-full text-left flex items-center gap-2 p-2 rounded-lg text-slate-600 hover:bg-slate-100 text-sm transition-colors"
             >
                <Settings size={16} />
                {t.settings}
             </button>

             <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                 <h4 className="font-semibold text-slate-800 text-sm mb-1">{t.mvpVersion}</h4>
                 <p className="text-xs text-slate-500">{t.localData}</p>
             </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto flex flex-col">
          <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-700">{t.systemName}</h2>
            <div className="flex items-center gap-4">
              {/* Mobile Lang Toggle */}
              <button 
                onClick={() => setLanguage(language === 'en' ? 'ua' : 'en')}
                className="md:hidden p-2 text-slate-500 hover:text-indigo-600"
              >
                <Globe size={20} />
              </button>

              <button 
                onClick={() => setIsAdding(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-all"
              >
                <Plus size={18} />
                {t.addFaculty}
              </button>
            </div>
          </header>

          <div className="p-8 max-w-7xl mx-auto w-full">
            <Routes>
              <Route path="/" element={<Dashboard facultyList={facultyList} />} />
              <Route 
                path="/faculty" 
                element={
                  <FacultyList 
                    facultyList={facultyList} 
                    onSelect={setSelectedFaculty} 
                    onDelete={handleDelete} 
                  />
                } 
              />
              <Route 
                path="/search" 
                element={
                  <OrcidSearch 
                    existingFaculty={facultyList} 
                    onAddFaculty={processAndAddFaculty} 
                  />
                } 
              />
              <Route path="/chat" element={<ChatInterface facultyList={facultyList} />} />
              <Route path="/reports" element={<ReportGenerator facultyList={facultyList} />} />
            </Routes>
          </div>
        </main>

        {/* Settings Modal */}
        {isSettingsOpen && (
           <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Database size={18} className="text-indigo-600"/> {t.configureApis}</h3>
                <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-500 bg-blue-50 p-3 rounded-lg border border-blue-100">
                  {t.enterKeys}
                </p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Scopus API Key</label>
                  <input 
                    type="password" 
                    value={apiKeys.scopus}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, scopus: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Enter Elsevier Key..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Web of Science API Key</label>
                  <input 
                    type="password" 
                    value={apiKeys.wos}
                    onChange={(e) => setApiKeys(prev => ({ ...prev, wos: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Enter WoS Key..."
                  />
                </div>
                <button 
                    onClick={saveApiKeys}
                    className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors mt-2"
                >
                    {t.saveSettings}
                </button>
              </div>
            </div>
           </div>
        )}

        {/* Add Faculty Modal */}
        {isAdding && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-800">{t.trackNew}</h3>
                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleAddFaculty} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.orcidId}</label>
                  <input 
                    type="text" 
                    value={newOrcid}
                    onChange={(e) => setNewOrcid(e.target.value)}
                    placeholder="0000-0000-0000-0000"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">{t.mustBePublic}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
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
                </div>

                {errorAdd && (
                  <div className="text-red-600 text-sm bg-red-50 p-2 rounded border border-red-100">
                    {errorAdd}
                  </div>
                )}

                <div className="pt-2">
                  <button 
                    type="submit" 
                    disabled={loadingAdd}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium shadow-sm transition-colors flex justify-center items-center gap-2"
                  >
                    {loadingAdd ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : t.fetchAdd}
                    {loadingAdd && addStage && (
                        <span className="text-xs font-normal opacity-90 ml-1 capitalize">
                           ({addStage === 'OPENALEX' ? t.fetchingOpenAlex : addStage === 'SCOPUS' ? t.fetchingScopus : addStage === 'WOS' ? t.fetchingWos : 'ORCID...'})
                        </span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View Faculty Profile Modal - Pro Version */}
        {selectedFaculty && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
                <div className="flex gap-4">
                  <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-2xl shadow-inner">
                    {selectedFaculty.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">{selectedFaculty.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                       <span className="font-medium text-indigo-600">{selectedFaculty.position}</span>
                       <span>•</span>
                       <span>{selectedFaculty.department}</span>
                    </div>
                     <div className="flex gap-2 mt-2 items-center">
                         <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-500 flex items-center gap-1">
                           <span className="opacity-50">ORCID:</span> {selectedFaculty.orcidId}
                         </span>
                         {selectedFaculty.metrics && (
                             <span className="text-xs font-medium bg-green-50 text-green-700 px-2 py-0.5 rounded flex items-center gap-1 border border-green-100">
                                 <Award size={12}/> Pro Data
                             </span>
                         )}
                     </div>
                  </div>
                </div>
                <button onClick={() => setSelectedFaculty(null)} className="text-slate-400 hover:text-slate-600 transition-colors bg-white rounded-full p-2 hover:bg-slate-200">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto">
                {/* 1. Pro Metrics Row */}
                <div className="grid grid-cols-4 gap-4 mb-8">
                    <div className="bg-gradient-to-br from-indigo-50 to-white p-5 rounded-xl border border-indigo-100 text-center shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                            <TrendingUp size={40} className="text-indigo-600" />
                        </div>
                        <div className="text-4xl font-bold text-indigo-700">{selectedFaculty.metrics?.hIndex || '-'}</div>
                        <div className="text-xs text-indigo-500 font-bold uppercase tracking-wider mt-2">{t.hIndex}</div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 text-center shadow-sm">
                        <div className="text-4xl font-bold text-slate-700">{selectedFaculty.metrics?.citationCount || '-'}</div>
                        <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-2">{t.citations}</div>
                        {selectedFaculty.metrics?.citationCount2Year ? (
                            <div className="text-[10px] text-green-600 mt-1 font-medium">
                                +{selectedFaculty.metrics.citationCount2Year} last 2y
                            </div>
                        ) : null}
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 text-center shadow-sm">
                        <div className="text-4xl font-bold text-slate-700">{selectedFaculty.metrics?.i10Index || '-'}</div>
                        <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-2">i10-Index</div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 text-center shadow-sm">
                        <div className="text-4xl font-bold text-slate-700">{selectedFaculty.publications.length}</div>
                        <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-2">{t.publications}</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Left Column: Details */}
                    <div className="md:col-span-2 space-y-8">
                        {/* Top Cited Works (OpenAlex) */}
                        {selectedFaculty.metrics?.topWorks && selectedFaculty.metrics.topWorks.length > 0 && (
                             <div>
                                <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                    <Award size={18} className="text-amber-500" /> {t.topWorks}
                                </h4>
                                <div className="space-y-3">
                                    {selectedFaculty.metrics.topWorks.map((work, idx) => (
                                        <div key={idx} className="bg-white p-4 border border-slate-100 rounded-lg hover:border-indigo-100 hover:shadow-sm transition-all group">
                                            <div className="flex justify-between items-start">
                                                <h5 className="font-medium text-indigo-900 leading-snug">{work.title}</h5>
                                                <span className="ml-2 flex-shrink-0 bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded">
                                                    {work.year}
                                                </span>
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

                        {/* Recent Pubs (Merged List) */}
                        <div>
                          <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                            <FileBarChart size={18} className="text-slate-500" /> {t.publications} ({selectedFaculty.publications.length})
                            <span className="text-xs text-slate-400 font-normal ml-2 flex items-center gap-1">
                                <MousePointerClick size={12} /> Click on a row to view details
                            </span>
                          </h4>
                          <div className="space-y-2">
                            {selectedFaculty.publications.map((pub, idx) => (
                              <button 
                                key={idx} 
                                onClick={() => setSelectedPublication(pub)}
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

                    {/* Right Column: Sidebar info */}
                    <div className="space-y-6">
                         {/* Research Topics */}
                         {selectedFaculty.metrics?.topics && selectedFaculty.metrics.topics.length > 0 && (
                            <div>
                                <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                    <Tag size={18} className="text-slate-500" /> {t.researchTopics}
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    {selectedFaculty.metrics.topics.map((topic, i) => (
                                        <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full border border-indigo-100">
                                            {topic.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                         )}

                         {/* Institutions */}
                         {selectedFaculty.metrics?.institutions && selectedFaculty.metrics.institutions.length > 0 && (
                            <div>
                                <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                    <Building2 size={18} className="text-slate-500" /> {t.institutions}
                                </h4>
                                <ul className="space-y-2">
                                    {selectedFaculty.metrics.institutions.slice(0, 3).map((inst, i) => (
                                        <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                                            <span className="mt-1.5 w-1.5 h-1.5 bg-slate-300 rounded-full flex-shrink-0" />
                                            {inst}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                         )}

                         {selectedFaculty.biography && (
                            <div>
                                <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                                    <BookOpen size={18} className="text-slate-500" /> {t.biography}
                                </h4>
                                <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 max-h-48 overflow-y-auto">
                                    {selectedFaculty.biography}
                                </p>
                            </div>
                        )}

                        <div className="pt-4 border-t border-slate-100">
                           <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2 text-xs uppercase tracking-wide">
                               {t.mergedFrom}
                           </h4>
                           <div className="flex gap-2 flex-wrap">
                               {/* Unique Sources Badges for the whole profile */}
                               {Array.from(new Set(selectedFaculty.publications.flatMap(p => p.sources))).map(s => (
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
        )}

        {/* Publication Details Modal */}
        {selectedPublication && (
            <PublicationDetailsModal 
                publication={selectedPublication} 
                onClose={() => setSelectedPublication(null)} 
            />
        )}
      </div>
    </Router>
  );
}

export default App;