
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, MessageSquareText, FileBarChart, Plus, GraduationCap, Globe, Settings, Search, Upload, Save, FolderDown, FileSpreadsheet, Lock, LogOut, Shield, Eye } from 'lucide-react';
import { Faculty, ApiKeys, Publication, TenantRole } from './types';
import PublicationDetailsModal from './components/PublicationDetailsModal';
import ProfileModal from './components/ProfileModal';
import AppRoutes from './components/AppRoutes';
import AppModals from './components/AppModals';
import { useLanguage } from './contexts/LanguageContext';
import { buildFacultyRecord } from './services/facultyDataService';
import { updateTenantPasswords, verifyTenantPassword } from './services/tenantApi';
import { useTenantSession } from './hooks/useTenantSession';

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
  const [isAdding, setIsAdding] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const {
    tenantName,
    tenantPublic,
    tenantHasAdmin,
    tenantAuthorized,
    authToken,
    isAdmin,
    facultyList,
    facultyListRef,
    loadTenantDataFromServer,
    persistFacultyList,
    setFacultyList,
    setTenantHasAdmin,
    setTenantAuthorized,
    storeAuthSession,
    clearAuthSession,
    saveApiKeys: saveApiKeysToStorage,
    loadApiKeys,
  } = useTenantSession(TENANT_ID);
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

  const handleTenantLoginSuccess = async (role: TenantRole, token: string) => {
    storeAuthSession(role, token);
    setShowLoginModal(false);
    setShowViewPasswordModal(false);
    setLoginPassword('');
    setLoginError('');
    setViewPassword('');
    setViewPasswordError('');
    const data = await loadTenantDataFromServer(token);
    setFacultyList(data);
  };

  const handleAdminLogin = async () => {
    if (!tenantHasAdmin) {
      setShowSetPassword(true);
      setShowLoginModal(false);
      return;
    }
    try {
      const data = await verifyTenantPassword(TENANT_ID, loginPassword);
      if (data.role === 'admin' && data.token) {
        await handleTenantLoginSuccess('admin', data.token);
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
      await updateTenantPasswords(
        TENANT_ID,
        {
          adminPassword: newPass,
          currentAdminPassword: tenantHasAdmin ? loginPassword || viewPassword || undefined : undefined,
        },
        authToken
      );
      setTenantHasAdmin(true);
      setShowSetPassword(false);
      setNewPass('');
      setConfirmPass('');
      setSetPassError('');
      const data = await verifyTenantPassword(TENANT_ID, newPass);
      if (data.role === 'admin' && data.token) {
        await handleTenantLoginSuccess('admin', data.token);
      }
    } catch (error: any) {
      setSetPassError(error?.message || 'Connection error');
    }
  };

  const handleViewPasswordSubmit = async () => {
    try {
      const data = await verifyTenantPassword(TENANT_ID, viewPassword);
      if ((data.role === 'admin' || data.role === 'viewer') && data.token) {
        await handleTenantLoginSuccess(data.role, data.token);
      } else {
        setViewPasswordError(t.wrongPassword);
      }
    } catch {
      setViewPasswordError('Connection error');
    }
  };

  const handleAdminLogout = () => {
    clearAuthSession();
    if (tenantPublic) {
      setTenantAuthorized(true);
    } else {
      setTenantAuthorized(false);
      setFacultyList([]);
      setShowViewPasswordModal(true);
    }
  };
  const [selectedFaculty, setSelectedFaculty] = useState<Faculty | null>(null);
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ wos: '' });
  
  // Add Faculty Form State
  const [newOrcid, setNewOrcid] = useState('');
  const [newPosition, setNewPosition] = useState('Associate Professor');
  const [newInstitution, setNewInstitution] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newScopusAuthorId, setNewScopusAuthorId] = useState('');
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [addStage, setAddStage] = useState(''); // '' | 'ORCID' | 'OPENALEX' | 'SCOPUS' | 'WOS'
  const [errorAdd, setErrorAdd] = useState('');

  // Edit Faculty State
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);
  const [editPosition, setEditPosition] = useState('');
  const [editInstitution, setEditInstitution] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editScopusAuthorId, setEditScopusAuthorId] = useState('');

  // Batch Import State
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchDefaultInstitution, setBatchDefaultInstitution] = useState('');
  const [batchDefaultDept, setBatchDefaultDept] = useState('');
  const [batchDefaultPosition, setBatchDefaultPosition] = useState('Associate Professor');
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; name: string; errors: string[] } | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  useEffect(() => {
    if (!tenantPublic && !tenantAuthorized) {
      setShowViewPasswordModal(true);
    }
  }, [tenantAuthorized, tenantPublic]);

  useEffect(() => {
    try {
      const savedKeys = loadApiKeys();
      if (savedKeys) {
        setApiKeys(JSON.parse(savedKeys));
      }
    } catch (e) {
      console.error("Failed to parse API keys", e);
    }
  }, [loadApiKeys]);

  const saveApiKeys = () => {
    saveApiKeysToStorage(JSON.stringify(apiKeys));
    setIsSettingsOpen(false);
  };

  const processAndAddFaculty = async (
    orcid: string,
    position: string,
    dept: string,
    institution?: string,
    scopusAuthorId?: string,
  ) => {
    const facultyData = await buildFacultyRecord(
      orcid,
      position,
      dept,
      { tenantId: TENANT_ID, authToken, wosApiKey: apiKeys.wos, scopusAuthorId },
      institution,
    );
    const nextFacultyList = [...facultyListRef.current, facultyData];
    setFacultyList(nextFacultyList);
    await persistFacultyList(nextFacultyList);
  };

  const handleAddFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrcid.trim()) return;
    
    if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(newOrcid)) {
       setErrorAdd("Invalid ORCID format (e.g., 0000-0000-0000-0000)");
       return;
    }

    if (facultyListRef.current.find(f => f.orcidId === newOrcid)) {
        setErrorAdd("Faculty member already exists.");
        return;
    }

    const trimmedScopusAuthorId = newScopusAuthorId.trim();
    if (trimmedScopusAuthorId && !/^\d{6,15}$/.test(trimmedScopusAuthorId)) {
      setErrorAdd("Scopus Author ID must be 6–15 digits.");
      return;
    }

    setLoadingAdd(true);
    setAddStage('ORCID');
    setErrorAdd('');
    try {
      await processAndAddFaculty(
        newOrcid,
        newPosition,
        newDept,
        newInstitution,
        trimmedScopusAuthorId || undefined,
      );
      setNewOrcid('');
      setNewDept('');
      setNewScopusAuthorId('');
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
        const nextFacultyList = facultyListRef.current.filter(f => f.orcidId !== id);
        setFacultyList(nextFacultyList);
        persistFacultyList(nextFacultyList).catch((error) => {
          console.error(error);
          alert(error.message || 'Failed to save data');
        });
        if (selectedFaculty?.orcidId === id) setSelectedFaculty(null);
    }
  };

  const handleRefreshFaculty = async (orcidId: string) => {
    const existing = facultyListRef.current.find(f => f.orcidId === orcidId);
    if (!existing) return;
    const refreshedFaculty = await buildFacultyRecord(
      orcidId,
      existing.position,
      existing.department,
      {
        tenantId: TENANT_ID,
        authToken,
        wosApiKey: apiKeys.wos,
        scopusAuthorId: existing.scopusAuthorId,
      },
      existing.institution,
    );
    const nextFacultyList = facultyListRef.current.map(f =>
      f.orcidId === orcidId
        ? {
            ...refreshedFaculty,
            position: existing.position,
            department: existing.department,
            institution: existing.institution,
            scopusAuthorId: existing.scopusAuthorId,
          }
        : f
    );
    setFacultyList(nextFacultyList);
    await persistFacultyList(nextFacultyList);
  };

  const handleEditFaculty = (faculty: Faculty) => {
    setEditingFaculty(faculty);
    setEditPosition(faculty.position);
    setEditInstitution(faculty.institution || '');
    setEditDept(faculty.department);
    setEditScopusAuthorId(faculty.scopusAuthorId || '');
  };

  const handleBulkDelete = (ids: string[]) => {
    const nextFacultyList = facultyListRef.current.filter(f => !ids.includes(f.orcidId));
    setFacultyList(nextFacultyList);
    persistFacultyList(nextFacultyList).catch((error) => {
      console.error(error);
      alert(error.message || 'Failed to save data');
    });
    if (selectedFaculty && ids.includes(selectedFaculty.orcidId)) setSelectedFaculty(null);
  };

  const handleBulkUpdate = (ids: string[], field: 'department' | 'position' | 'institution', value: string) => {
    const nextFacultyList = facultyListRef.current.map(f =>
      ids.includes(f.orcidId) ? { ...f, [field]: value } : f
    );
    setFacultyList(nextFacultyList);
    persistFacultyList(nextFacultyList).catch((error) => {
      console.error(error);
      alert(error.message || 'Failed to save data');
    });
  };

  const handleSaveEdit = async () => {
    if (!editingFaculty) return;
    const trimmedScopusAuthorId = editScopusAuthorId.trim();
    if (trimmedScopusAuthorId && !/^\d{6,15}$/.test(trimmedScopusAuthorId)) {
      alert('Scopus Author ID must be 6–15 digits.');
      return;
    }
    const nextFacultyList = facultyListRef.current.map(f =>
      f.orcidId === editingFaculty.orcidId
        ? {
            ...f,
            position: editPosition,
            institution: editInstitution,
            department: editDept,
            scopusAuthorId: trimmedScopusAuthorId || undefined,
          }
        : f
    );
    setFacultyList(nextFacultyList);
    await persistFacultyList(nextFacultyList);
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
      if (facultyListRef.current.find(f => f.orcidId === orcid)) {
        setBatchProgress({ current: i + 1, total, name: `${orcid} (skip)`, errors: [...errors] });
        continue;
      }

      setBatchProgress({ current: i + 1, total, name: orcid, errors: [...errors] });

      try {
        await processAndAddFaculty(orcid, position, dept, batchDefaultInstitution);
      } catch {
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
          await persistFacultyList(data);
          alert(t.dataLoaded + ` (${data.length})`);
        } else {
          alert('Invalid JSON format');
        }
      } catch {
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
                 <p className="text-xs text-slate-500">Server-backed tenant data</p>
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
            <AppRoutes
              facultyList={facultyList}
              isAdmin={isAdmin}
              tenantId={TENANT_ID}
              authToken={authToken}
              onSelectFaculty={setSelectedFaculty}
              onDelete={handleDelete}
              onRefresh={handleRefreshFaculty}
              onEdit={handleEditFaculty}
              onBulkDelete={handleBulkDelete}
              onBulkUpdate={handleBulkUpdate}
              onAddFaculty={processAndAddFaculty}
            />
          </div>
        </main>

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

        {/* Publication Details Modal */}
        {selectedPublication && (
            <PublicationDetailsModal
                publication={selectedPublication}
                onClose={() => setSelectedPublication(null)}
            />
        )}

        <AppModals
          t={t}
          tenantName={tenantName}
          apiKeys={apiKeys}
          setApiKeys={setApiKeys}
          saveApiKeys={saveApiKeys}
          isSettingsOpen={isSettingsOpen}
          setIsSettingsOpen={setIsSettingsOpen}
          isAdding={isAdding}
          setIsAdding={setIsAdding}
          newOrcid={newOrcid}
          setNewOrcid={setNewOrcid}
          newInstitution={newInstitution}
          setNewInstitution={setNewInstitution}
          newDept={newDept}
          setNewDept={setNewDept}
          newPosition={newPosition}
          setNewPosition={setNewPosition}
          newScopusAuthorId={newScopusAuthorId}
          setNewScopusAuthorId={setNewScopusAuthorId}
          loadingAdd={loadingAdd}
          addStage={addStage}
          errorAdd={errorAdd}
          handleAddFaculty={handleAddFaculty}
          editingFaculty={editingFaculty}
          setEditingFaculty={setEditingFaculty}
          editInstitution={editInstitution}
          setEditInstitution={setEditInstitution}
          editDept={editDept}
          setEditDept={setEditDept}
          editPosition={editPosition}
          setEditPosition={setEditPosition}
          editScopusAuthorId={editScopusAuthorId}
          setEditScopusAuthorId={setEditScopusAuthorId}
          handleSaveEdit={handleSaveEdit}
          isBatchImporting={isBatchImporting}
          setIsBatchImporting={setIsBatchImporting}
          batchFile={batchFile}
          setBatchFile={setBatchFile}
          batchDefaultInstitution={batchDefaultInstitution}
          setBatchDefaultInstitution={setBatchDefaultInstitution}
          batchDefaultDept={batchDefaultDept}
          setBatchDefaultDept={setBatchDefaultDept}
          batchDefaultPosition={batchDefaultPosition}
          setBatchDefaultPosition={setBatchDefaultPosition}
          batchProgress={batchProgress}
          setBatchProgress={setBatchProgress}
          batchRunning={batchRunning}
          handleBatchImport={handleBatchImport}
          showLoginModal={showLoginModal}
          setShowLoginModal={setShowLoginModal}
          loginPassword={loginPassword}
          setLoginPassword={setLoginPassword}
          loginError={loginError}
          setLoginError={setLoginError}
          handleAdminLogin={handleAdminLogin}
          showSetPassword={showSetPassword}
          setShowSetPassword={setShowSetPassword}
          newPass={newPass}
          setNewPass={setNewPass}
          confirmPass={confirmPass}
          setConfirmPass={setConfirmPass}
          setPassError={setPassError}
          setSetPassError={setSetPassError}
          handleSetPassword={handleSetPassword}
          showViewPasswordModal={showViewPasswordModal}
          viewPassword={viewPassword}
          setViewPassword={setViewPassword}
          viewPasswordError={viewPasswordError}
          setViewPasswordError={setViewPasswordError}
          handleViewPasswordSubmit={handleViewPasswordSubmit}
        />
      </div>
    </Router>
  );
}

export default App;
