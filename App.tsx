

import React, { useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, MessageSquareText, FileBarChart, Plus, GraduationCap, X, BookOpen, MapPin, Globe, TrendingUp, Award, Tag, Building2, ExternalLink, Settings, Database, MousePointerClick, Search, Upload, Loader2, Save, FolderDown, FileSpreadsheet, Lock, LogOut, Shield, Eye } from 'lucide-react';
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
import ProfileModal from './components/ProfileModal';
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

// Tenant detection from subdomain
// orcid-csbc.szabolotnii.site → "csbc" (strip "orcid-" prefix)
// orcid-tracker.szabolotnii.site → "default" (legacy)
function getTenantId(): string {
  const host = window.location.hostname;
  const parts = host.split('.');
  if (parts.length >= 3) {
    const sub = parts[0];
    if (sub === 'www' || sub === 'orcid-tracker') return 'default';
    if (sub.startsWith('orcid-')) return sub.slice(6); // orcid-csbc → csbc
    return sub;
  }
  return 'default';
}

const TENANT_ID = getTenantId();

function App() {
  const { t, language, setLanguage } = useLanguage();
  const [facultyList, setFacultyList] = useState<Faculty[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Tenant config
  const [tenantName, setTenantName] = useState('');
  const [tenantPublic, setTenantPublic] = useState(true);
  const [tenantHasAdmin, setTenantHasAdmin] = useState(false);
  const [tenantAuthorized, setTenantAuthorized] = useState(true); // true until proven private

  // Admin mode
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [setPassError, setSetPassError] = useState('');
  const [showViewPasswordModal, setShowViewPasswordModal] = useState(false);
  const [viewPassword, setViewPassword] = useState('');
  const [viewPasswordError, setViewPasswordError] = useState('');

  const handleAdminLogin = async () => {
    if (!tenantHasAdmin) {
      setShowSetPassword(true);
      setShowLoginModal(false);
      return;
    }
    try {
      const res = await fetch(`/api/tenant/${TENANT_ID}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword }),
      });
      const data = await res.json();
      if (data.role === 'admin') {
        setIsAdmin(true);
        setShowLoginModal(false);
        setLoginPassword('');
        setLoginError('');
      } else {
        setLoginError(t.wrongPassword);
      }
    } catch {
      setLoginError('Connection error');
    }
  };

  const handleSetPassword = async () => {
    if (newPass.length < 4) { setSetPassError(t.passwordTooShort); return; }
    if (newPass !== confirmPass) { setSetPassError(t.passwordMismatch); return; }
    try {
      await fetch(`/api/tenant/${TENANT_ID}/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: newPass }),
      });
      setIsAdmin(true);
      setTenantHasAdmin(true);
      setShowSetPassword(false);
      setNewPass('');
      setConfirmPass('');
      setSetPassError('');
    } catch {
      setSetPassError('Connection error');
    }
  };

  const handleViewPasswordSubmit = async () => {
    try {
      const res = await fetch(`/api/tenant/${TENANT_ID}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: viewPassword }),
      });
      const data = await res.json();
      if (data.role === 'admin' || data.role === 'viewer') {
        setTenantAuthorized(true);
        setShowViewPasswordModal(false);
        if (data.role === 'admin') setIsAdmin(true);
        setViewPassword('');
        setViewPasswordError('');
      } else {
        setViewPasswordError(t.wrongPassword);
      }
    } catch {
      setViewPasswordError('Connection error');
    }
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
  };
  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ scopus: '', wos: '' });
  
  // Add Faculty Form State
  const [newOrcid, setNewOrcid] = useState('');
  const [newPosition, setNewPosition] = useState('Associate Professor');
  const [newInstitution, setNewInstitution] = useState('');
  const [newDept, setNewDept] = useState('');
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [addStage, setAddStage] = useState(''); // '' | 'ORCID' | 'OPENALEX' | 'SCOPUS' | 'WOS'
  const [errorAdd, setErrorAdd] = useState('');

  // Edit Faculty State
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);
  const [editPosition, setEditPosition] = useState('');
  const [editInstitution, setEditInstitution] = useState('');
  const [editDept, setEditDept] = useState('');

  // Batch Import State
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchDefaultInstitution, setBatchDefaultInstitution] = useState('');
  const [batchDefaultDept, setBatchDefaultDept] = useState('');
  const [batchDefaultPosition, setBatchDefaultPosition] = useState('Associate Professor');
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; name: string; errors: string[] } | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  // Persist data with safe parsing
  const isInitialMount = useRef(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // 1. Load tenant config
        const cfgRes = await fetch(`/api/tenant/${TENANT_ID}/config`);
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          setTenantName(cfg.name);
          setTenantPublic(cfg.public);
          setTenantHasAdmin(cfg.hasAdminPassword);
          if (!cfg.public) {
            // Private tenant — need password before showing data
            setTenantAuthorized(false);
            setShowViewPasswordModal(true);
            return;
          }
        }

        // 2. Try localStorage first (per-tenant key)
        const storageKey = `faculty_data_${TENANT_ID}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFacultyList(parsed);
            return;
          }
        }
        // 3. Fallback: load from server
        const res = await fetch(`/api/data/${TENANT_ID}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setFacultyList(data);
          }
        }
      } catch (e) {
        console.error("Failed to load data", e);
      }
    };
    loadData();
    try {
      const savedKeys = localStorage.getItem('api_keys');
      if (savedKeys) {
        setApiKeys(JSON.parse(savedKeys));
      }
    } catch (e) {
      console.error("Failed to parse API keys", e);
    }
  }, []);

  // Load data after private tenant authorization
  useEffect(() => {
    if (!tenantAuthorized || tenantPublic) return;
    const loadAfterAuth = async () => {
      try {
        const res = await fetch(`/api/data/${TENANT_ID}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) setFacultyList(data);
        }
      } catch (e) {
        console.error("Failed to load tenant data", e);
      }
    };
    loadAfterAuth();
  }, [tenantAuthorized, tenantPublic]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    localStorage.setItem(`faculty_data_${TENANT_ID}`, JSON.stringify(facultyList));
  }, [facultyList]);

  const saveApiKeys = () => {
    localStorage.setItem('api_keys', JSON.stringify(apiKeys));
    setIsSettingsOpen(false);
  };

  // Logic extracted to function for reuse in Search component
  const processAndAddFaculty = async (orcid: string, position: string, dept: string, institution?: string) => {
    // 1. Fetch ORCID
    let facultyData = await fetchOrcidData(orcid, position, dept);
    
    // 2. Fetch OpenAlex Metrics & Merge + OA enrichment
    const metrics = await fetchOpenAlexMetrics(orcid);
    if (metrics) {
        facultyData.metrics = metrics;
        // Enrich publications with OA status from OpenAlex topWorks (matched by DOI)
        if (metrics.topWorks && metrics.topWorks.length > 0) {
          const oaByDoi = new Map(metrics.topWorks.filter(w => w.doi).map(w => [w.doi.toLowerCase(), w.isOa]));
          facultyData.publications = facultyData.publications.map(pub => {
            if (pub.doi) {
              const normalizedDoi = pub.doi.replace('https://doi.org/', '').toLowerCase();
              const isOa = oaByDoi.get(normalizedDoi);
              if (isOa !== undefined) return { ...pub, isOa };
            }
            return pub;
          });
        }
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

    if (institution) facultyData.institution = institution;
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
      await processAndAddFaculty(newOrcid, newPosition, newDept, newInstitution);
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
    if(confirm(t.confirmDelete)) {
        setFacultyList(prev => prev.filter(f => f.orcidId !== id));
        if (selectedFaculty?.orcidId === id) setSelectedFaculty(null);
    }
  };

  const handleRefreshFaculty = async (orcidId: string) => {
    const existing = facultyList.find(f => f.orcidId === orcidId);
    if (!existing) return;

    let facultyData = await fetchOrcidData(orcidId, existing.position, existing.department);
    const metrics = await fetchOpenAlexMetrics(orcidId);
    if (metrics) {
      facultyData.metrics = metrics;
      if (metrics.topWorks && metrics.topWorks.length > 0) {
        const oaByDoi = new Map(metrics.topWorks.filter(w => w.doi).map(w => [w.doi.toLowerCase(), w.isOa]));
        facultyData.publications = facultyData.publications.map(pub => {
          if (pub.doi) {
            const normalizedDoi = pub.doi.replace('https://doi.org/', '').toLowerCase();
            const isOa = oaByDoi.get(normalizedDoi);
            if (isOa !== undefined) return { ...pub, isOa };
          }
          return pub;
        });
      }
    }

    const scopusPubs = await fetchScopusData(orcidId, apiKeys.scopus);
    if (scopusPubs.length > 0) {
      facultyData.publications = mergePublications(facultyData.publications, scopusPubs, 'scopus');
    }
    const wosPubs = await fetchWosData(orcidId, apiKeys.wos);
    if (wosPubs.length > 0) {
      facultyData.publications = mergePublications(facultyData.publications, wosPubs, 'wos');
    }

    setFacultyList(prev => prev.map(f => f.orcidId === orcidId ? { ...facultyData, position: existing.position, department: existing.department } : f));
  };

  const handleEditFaculty = (faculty: Faculty) => {
    setEditingFaculty(faculty);
    setEditPosition(faculty.position);
    setEditInstitution(faculty.institution || '');
    setEditDept(faculty.department);
  };

  const handleBulkDelete = (ids: string[]) => {
    setFacultyList(prev => prev.filter(f => !ids.includes(f.orcidId)));
    if (selectedFaculty && ids.includes(selectedFaculty.orcidId)) setSelectedFaculty(null);
  };

  const handleBulkUpdate = (ids: string[], field: 'department' | 'position' | 'institution', value: string) => {
    setFacultyList(prev => prev.map(f =>
      ids.includes(f.orcidId) ? { ...f, [field]: value } : f
    ));
  };

  const handleSaveEdit = () => {
    if (!editingFaculty) return;
    setFacultyList(prev => prev.map(f =>
      f.orcidId === editingFaculty.orcidId
        ? { ...f, position: editPosition, institution: editInstitution, department: editDept }
        : f
    ));
    setEditingFaculty(null);
  };

  const handleBatchImport = async () => {
    if (!batchFile) return;
    setBatchRunning(true);
    const text = await batchFile.text();
    const Papa = (window as any).Papa;
    const parsed = Papa.parse(text, { header: false, skipEmptyLines: true });
    const rows: string[][] = parsed.data;

    const errors: string[] = [];
    const total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const orcid = (row[0] || '').trim();
      const dept = (row[1] || '').trim() || batchDefaultDept;
      const position = (row[2] || '').trim() || batchDefaultPosition;

      if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid)) {
        errors.push(`Row ${i + 1}: invalid ORCID "${orcid}"`);
        setBatchProgress({ current: i + 1, total, name: orcid, errors: [...errors] });
        continue;
      }
      if (facultyList.find(f => f.orcidId === orcid)) {
        setBatchProgress({ current: i + 1, total, name: `${orcid} (skip)`, errors: [...errors] });
        continue;
      }

      setBatchProgress({ current: i + 1, total, name: orcid, errors: [...errors] });

      try {
        await processAndAddFaculty(orcid, position, dept, batchDefaultInstitution);
      } catch (e) {
        errors.push(`Row ${i + 1}: failed to fetch ${orcid}`);
      }

      if (i < rows.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    setBatchProgress({ current: total, total, name: t.importComplete, errors });
    setBatchRunning(false);
  };

  // Save all data as JSON backup
  const handleSaveJSON = () => {
    const data = JSON.stringify(facultyList, null, 2);
    const blob = new Blob([data], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const deptName = facultyList[0]?.department?.replace(/\s+/g, '_') || 'faculty';
    a.download = `${deptName}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Load data from JSON backup
  const handleLoadJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (Array.isArray(data) && data.length > 0 && data[0].orcidId) {
          setFacultyList(data);
          alert(t.dataLoaded + ` (${data.length})`);
        } else {
          alert('Invalid JSON format');
        }
      } catch (err) {
        alert('Failed to parse JSON file');
      }
    };
    input.click();
  };

  // Export full CSV with publications
  const handleExportFullCSV = () => {
    const headers = ['Name', 'ORCID', 'Institution', 'Department', 'Position', 'H-Index', 'Citations', 'i10-Index', 'Pub Title', 'Pub Year', 'Journal', 'Type', 'DOI', 'Sources', 'Pub Citations', 'Open Access'];
    const rows: string[] = [];

    facultyList.forEach(f => {
      if (f.publications.length === 0) {
        rows.push([
          f.name, f.orcidId, f.institution || '', f.department, f.position,
          f.metrics?.hIndex ?? '', f.metrics?.citationCount ?? '', f.metrics?.i10Index ?? '',
          '', '', '', '', '', '', '', ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      } else {
        f.publications.forEach(pub => {
          rows.push([
            f.name, f.orcidId, f.institution || '', f.department, f.position,
            f.metrics?.hIndex ?? '', f.metrics?.citationCount ?? '', f.metrics?.i10Index ?? '',
            pub.title, pub.year, pub.journal || '', pub.type, pub.doi || '',
            pub.sources.join('; '), pub.citationCount ?? '', pub.isOa ? 'Yes' : ''
          ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        });
      }
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const deptName = facultyList[0]?.department?.replace(/\s+/g, '_') || 'faculty';
    a.download = `${deptName}_full_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
            {isAdmin && <NavLink to="/search" icon={Search} label={t.searchMenu} />}
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

             {/* Admin/User mode toggle */}
             {isAdmin ? (
               <button
                 onClick={handleAdminLogout}
                 className="w-full flex items-center gap-2 p-2 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 text-sm font-medium transition-colors border border-amber-200"
               >
                 <Shield size={16} />
                 {t.adminMode}
                 <LogOut size={14} className="ml-auto" />
               </button>
             ) : (
               <button
                 onClick={() => {
                   if (!tenantHasAdmin) {
                     setShowSetPassword(true);
                   } else {
                     setShowLoginModal(true);
                   }
                 }}
                 className="w-full flex items-center gap-2 p-2 rounded-lg text-slate-500 hover:bg-slate-100 text-sm transition-colors"
               >
                 <Eye size={16} />
                 {t.userMode}
                 <Lock size={14} className="ml-auto" />
               </button>
             )}

             {/* Data Management — admin only */}
             {isAdmin && (
               <>
                 {facultyList.length > 0 && (
                   <div className="space-y-1">
                     <button
                       onClick={handleSaveJSON}
                       className="w-full text-left flex items-center gap-2 p-2 rounded-lg text-slate-600 hover:bg-slate-100 text-sm transition-colors"
                     >
                       <Save size={16} />
                       {t.saveData}
                     </button>
                     <button
                       onClick={handleExportFullCSV}
                       className="w-full text-left flex items-center gap-2 p-2 rounded-lg text-slate-600 hover:bg-slate-100 text-sm transition-colors"
                     >
                       <FileSpreadsheet size={16} />
                       {t.exportFullCSV}
                     </button>
                   </div>
                 )}
                 <button
                   onClick={handleLoadJSON}
                   className="w-full text-left flex items-center gap-2 p-2 rounded-lg text-slate-600 hover:bg-slate-100 text-sm transition-colors"
                 >
                   <FolderDown size={16} />
                   {t.loadData}
                 </button>

                 <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="w-full text-left flex items-center gap-2 p-2 rounded-lg text-slate-600 hover:bg-slate-100 text-sm transition-colors"
                 >
                    <Settings size={16} />
                    {t.settings}
                 </button>
               </>
             )}

             <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                 <h4 className="font-semibold text-slate-800 text-sm mb-1">{t.mvpVersion}</h4>
                 <p className="text-xs text-slate-500">{t.localData}</p>
             </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto flex flex-col">
          <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-700">{tenantName || t.systemName}</h2>
            <div className="flex items-center gap-4">
              {/* Mobile Lang Toggle */}
              <button 
                onClick={() => setLanguage(language === 'en' ? 'ua' : 'en')}
                className="md:hidden p-2 text-slate-500 hover:text-indigo-600"
              >
                <Globe size={20} />
              </button>

              {isAdmin && (
                <>
                  <button
                    onClick={() => setIsBatchImporting(true)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                  >
                    <Upload size={18} />
                    {t.batchImport}
                  </button>
                  <button
                    onClick={() => setIsAdding(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-all"
                  >
                    <Plus size={18} />
                    {t.addFaculty}
                  </button>
                </>
              )}
            </div>
          </header>

          <div className="p-8 max-w-7xl mx-auto w-full">
            <Routes>
              <Route path="/" element={<Dashboard facultyList={facultyList} onSelectFaculty={setSelectedFaculty} />} />
              <Route
                path="/faculty"
                element={
                  <FacultyList
                    facultyList={facultyList}
                    onSelect={setSelectedFaculty}
                    onDelete={handleDelete}
                    onRefresh={handleRefreshFaculty}
                    onEdit={handleEditFaculty}
                    onBulkDelete={handleBulkDelete}
                    onBulkUpdate={handleBulkUpdate}
                    isAdmin={isAdmin}
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
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.institution}</label>
                    <input
                        type="text"
                        value={newInstitution}
                        onChange={(e) => setNewInstitution(e.target.value)}
                        placeholder={t.enterInstitutionPlaceholder}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
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
                            {t.positions.map((p: any) => (
                              <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
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

        {/* Faculty Profile Modal */}
        {selectedFaculty && (
          <ProfileModal
            faculty={selectedFaculty}
            facultyList={facultyList}
            onClose={() => setSelectedFaculty(null)}
            onSelectPublication={setSelectedPublication}
            onNavigate={setSelectedFaculty}
          />
        )}

        {/* Edit Faculty Modal */}
        {editingFaculty && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-800">{t.editFacultyTitle}</h3>
                <button onClick={() => setEditingFaculty(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <div className="font-semibold text-blue-900">{editingFaculty.name}</div>
                  <div className="text-xs text-blue-600 font-mono">{editingFaculty.orcidId}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.institution}</label>
                  <input
                    type="text"
                    value={editInstitution}
                    onChange={(e) => setEditInstitution(e.target.value)}
                    placeholder={t.enterInstitutionPlaceholder}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.dept}</label>
                  <input
                    type="text"
                    value={editDept}
                    onChange={(e) => setEditDept(e.target.value)}
                    placeholder={t.enterDeptPlaceholder}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.position}</label>
                  <select
                    value={editPosition}
                    onChange={(e) => setEditPosition(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {t.positions.map((p: any) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleSaveEdit}
                  className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors mt-2"
                >
                  {t.saveChanges}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Batch Import Modal */}
        {isBatchImporting && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Upload size={18} className="text-indigo-600" /> {t.batchImportTitle}</h3>
                <button onClick={() => { setIsBatchImporting(false); setBatchFile(null); setBatchProgress(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-500 bg-blue-50 p-3 rounded-lg border border-blue-100">
                  {t.batchImportDesc}
                </p>
                <p className="text-xs text-slate-400">{t.csvFormat}</p>

                {/* File Upload */}
                <div>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setBatchFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.defaultInstitution}</label>
                  <input
                    type="text"
                    value={batchDefaultInstitution}
                    onChange={(e) => setBatchDefaultInstitution(e.target.value)}
                    placeholder={t.enterInstitutionPlaceholder}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.defaultDept}</label>
                    <input
                      type="text"
                      value={batchDefaultDept}
                      onChange={(e) => setBatchDefaultDept(e.target.value)}
                      placeholder={t.enterDeptPlaceholder}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.defaultPosition}</label>
                    <select
                      value={batchDefaultPosition}
                      onChange={(e) => setBatchDefaultPosition(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {t.positions.map((p: any) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Progress */}
                {batchProgress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>{t.processing} {batchProgress.current} {t.ofTotal} {batchProgress.total}</span>
                      <span className="text-xs text-slate-400 font-mono truncate max-w-[150px]">{batchProgress.name}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                      />
                    </div>
                    {batchProgress.errors.length > 0 && (
                      <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100 max-h-20 overflow-y-auto">
                        {batchProgress.errors.map((e, i) => <div key={i}>{e}</div>)}
                      </div>
                    )}
                    {!batchRunning && batchProgress.current === batchProgress.total && (
                      <div className="text-sm text-green-700 bg-green-50 p-2 rounded border border-green-100 font-medium">
                        {t.importComplete}! {batchProgress.errors.length > 0 && `(${batchProgress.errors.length} ${t.importErrors})`}
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleBatchImport}
                  disabled={!batchFile || batchRunning}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium shadow-sm transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                >
                  {batchRunning ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                  {batchRunning ? t.processing + '...' : t.startImport}
                </button>
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

        {/* Admin Login Modal */}
        {showLoginModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Lock size={18} className="text-indigo-600" /> {t.loginAdmin}</h3>
                <button onClick={() => { setShowLoginModal(false); setLoginPassword(''); setLoginError(''); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.password}</label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                    placeholder={t.enterPassword}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    autoFocus
                  />
                </div>
                {loginError && (
                  <div className="text-red-600 text-sm bg-red-50 p-2 rounded border border-red-100">{loginError}</div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowLoginModal(false); setLoginPassword(''); setLoginError(''); }}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={handleAdminLogin}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
                  >
                    {t.login}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Set Password Modal */}
        {showSetPassword && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Shield size={18} className="text-indigo-600" /> {t.setPassword}</h3>
                <button onClick={() => { setShowSetPassword(false); setNewPass(''); setConfirmPass(''); setSetPassError(''); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-500 bg-blue-50 p-3 rounded-lg border border-blue-100">
                  {t.readOnlyMode}
                </p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.newPassword}</label>
                  <input
                    type="password"
                    value={newPass}
                    onChange={(e) => { setNewPass(e.target.value); setSetPassError(''); }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.confirmPassword}</label>
                  <input
                    type="password"
                    value={confirmPass}
                    onChange={(e) => { setConfirmPass(e.target.value); setSetPassError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                {setPassError && (
                  <div className="text-red-600 text-sm bg-red-50 p-2 rounded border border-red-100">{setPassError}</div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowSetPassword(false); setNewPass(''); setConfirmPass(''); setSetPassError(''); }}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={handleSetPassword}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
                  >
                    {t.setPassword}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* View Password Modal (private tenants) */}
        {showViewPasswordModal && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Lock size={18} className="text-indigo-600" /> {tenantName || t.loginAdmin}</h3>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-500 bg-amber-50 p-3 rounded-lg border border-amber-100">
                  {t.readOnlyMode}
                </p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.password}</label>
                  <input
                    type="password"
                    value={viewPassword}
                    onChange={(e) => { setViewPassword(e.target.value); setViewPasswordError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleViewPasswordSubmit()}
                    placeholder={t.enterPassword}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    autoFocus
                  />
                </div>
                {viewPasswordError && (
                  <div className="text-red-600 text-sm bg-red-50 p-2 rounded border border-red-100">{viewPasswordError}</div>
                )}
                <button
                  onClick={handleViewPasswordSubmit}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium shadow-sm transition-colors"
                >
                  {t.login}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Router>
  );
}

export default App;