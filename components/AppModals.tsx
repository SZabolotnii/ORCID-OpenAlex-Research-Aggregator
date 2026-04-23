import React from 'react';
import { Database, Loader2, Lock, Shield, Upload, X } from 'lucide-react';
import { ApiKeys, Faculty } from '../types';

type TranslationBag = Record<string, any>;

type BatchProgress = {
  current: number;
  total: number;
  name: string;
  errors: string[];
} | null;

type AppModalsProps = {
  t: TranslationBag;
  tenantName: string;
  apiKeys: ApiKeys;
  setApiKeys: React.Dispatch<React.SetStateAction<ApiKeys>>;
  saveApiKeys: () => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isAdding: boolean;
  setIsAdding: (open: boolean) => void;
  newOrcid: string;
  setNewOrcid: (value: string) => void;
  newInstitution: string;
  setNewInstitution: (value: string) => void;
  newDept: string;
  setNewDept: (value: string) => void;
  newPosition: string;
  setNewPosition: (value: string) => void;
  loadingAdd: boolean;
  addStage: string;
  errorAdd: string;
  handleAddFaculty: (event: React.FormEvent) => Promise<void>;
  editingFaculty: Faculty | null;
  setEditingFaculty: (faculty: Faculty | null) => void;
  editInstitution: string;
  setEditInstitution: (value: string) => void;
  editDept: string;
  setEditDept: (value: string) => void;
  editPosition: string;
  setEditPosition: (value: string) => void;
  handleSaveEdit: () => Promise<void>;
  isBatchImporting: boolean;
  setIsBatchImporting: (open: boolean) => void;
  batchFile: File | null;
  setBatchFile: (file: File | null) => void;
  batchDefaultInstitution: string;
  setBatchDefaultInstitution: (value: string) => void;
  batchDefaultDept: string;
  setBatchDefaultDept: (value: string) => void;
  batchDefaultPosition: string;
  setBatchDefaultPosition: (value: string) => void;
  batchProgress: BatchProgress;
  setBatchProgress: (progress: BatchProgress) => void;
  batchRunning: boolean;
  handleBatchImport: () => Promise<void>;
  showLoginModal: boolean;
  setShowLoginModal: (open: boolean) => void;
  loginPassword: string;
  setLoginPassword: (value: string) => void;
  loginError: string;
  setLoginError: (value: string) => void;
  handleAdminLogin: () => Promise<void>;
  showSetPassword: boolean;
  setShowSetPassword: (open: boolean) => void;
  newPass: string;
  setNewPass: (value: string) => void;
  confirmPass: string;
  setConfirmPass: (value: string) => void;
  setPassError: string;
  setSetPassError: (value: string) => void;
  handleSetPassword: () => Promise<void>;
  showViewPasswordModal: boolean;
  viewPassword: string;
  setViewPassword: (value: string) => void;
  viewPasswordError: string;
  setViewPasswordError: (value: string) => void;
  handleViewPasswordSubmit: () => Promise<void>;
};

export default function AppModals({
  t,
  tenantName,
  apiKeys,
  setApiKeys,
  saveApiKeys,
  isSettingsOpen,
  setIsSettingsOpen,
  isAdding,
  setIsAdding,
  newOrcid,
  setNewOrcid,
  newInstitution,
  setNewInstitution,
  newDept,
  setNewDept,
  newPosition,
  setNewPosition,
  loadingAdd,
  addStage,
  errorAdd,
  handleAddFaculty,
  editingFaculty,
  setEditingFaculty,
  editInstitution,
  setEditInstitution,
  editDept,
  setEditDept,
  editPosition,
  setEditPosition,
  handleSaveEdit,
  isBatchImporting,
  setIsBatchImporting,
  batchFile,
  setBatchFile,
  batchDefaultInstitution,
  setBatchDefaultInstitution,
  batchDefaultDept,
  setBatchDefaultDept,
  batchDefaultPosition,
  setBatchDefaultPosition,
  batchProgress,
  setBatchProgress,
  batchRunning,
  handleBatchImport,
  showLoginModal,
  setShowLoginModal,
  loginPassword,
  setLoginPassword,
  loginError,
  setLoginError,
  handleAdminLogin,
  showSetPassword,
  setShowSetPassword,
  newPass,
  setNewPass,
  confirmPass,
  setConfirmPass,
  setPassError,
  setSetPassError,
  handleSetPassword,
  showViewPasswordModal,
  viewPassword,
  setViewPassword,
  viewPasswordError,
  setViewPasswordError,
  handleViewPasswordSubmit,
}: AppModalsProps) {
  return (
    <>
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="flex items-center gap-2 font-bold text-slate-800">
                <Database size={18} className="text-indigo-600" /> {t.configureApis}
              </h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 transition-colors hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-500">
                {t.enterKeys}
              </p>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Scopus API Key</label>
                <input
                  type="password"
                  value={apiKeys.scopus}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, scopus: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter Elsevier Key..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Web of Science API Key
                </label>
                <input
                  type="password"
                  value={apiKeys.wos}
                  onChange={(e) => setApiKeys((prev) => ({ ...prev, wos: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter WoS Key..."
                />
              </div>
              <button
                onClick={saveApiKeys}
                className="mt-2 w-full rounded-lg bg-indigo-600 py-2 font-medium text-white transition-colors hover:bg-indigo-700"
              >
                {t.saveSettings}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="font-bold text-slate-800">{t.trackNew}</h3>
              <button
                onClick={() => setIsAdding(false)}
                className="text-slate-400 transition-colors hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddFaculty} className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t.orcidId}</label>
                <input
                  type="text"
                  value={newOrcid}
                  onChange={(e) => setNewOrcid(e.target.value)}
                  placeholder="0000-0000-0000-0000"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <p className="mt-1 text-xs text-slate-500">{t.mustBePublic}</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t.institution}</label>
                <input
                  type="text"
                  value={newInstitution}
                  onChange={(e) => setNewInstitution(e.target.value)}
                  placeholder={t.enterInstitutionPlaceholder}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t.dept}</label>
                  <input
                    type="text"
                    value={newDept}
                    onChange={(e) => setNewDept(e.target.value)}
                    placeholder={t.enterDeptPlaceholder}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t.position}</label>
                  <select
                    value={newPosition}
                    onChange={(e) => setNewPosition(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {t.positions.map((p: any) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {errorAdd && (
                <div className="rounded border border-red-100 bg-red-50 p-2 text-sm text-red-600">
                  {errorAdd}
                </div>
              )}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loadingAdd}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
                >
                  {loadingAdd ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    t.fetchAdd
                  )}
                  {loadingAdd && addStage && (
                    <span className="ml-1 text-xs font-normal capitalize opacity-90">
                      (
                      {addStage === 'OPENALEX'
                        ? t.fetchingOpenAlex
                        : addStage === 'SCOPUS'
                          ? t.fetchingScopus
                          : addStage === 'WOS'
                            ? t.fetchingWos
                            : 'ORCID...'}
                      )
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingFaculty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="font-bold text-slate-800">{t.editFacultyTitle}</h3>
              <button
                onClick={() => setEditingFaculty(null)}
                className="text-slate-400 transition-colors hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                <div className="font-semibold text-blue-900">{editingFaculty.name}</div>
                <div className="font-mono text-xs text-blue-600">{editingFaculty.orcidId}</div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t.institution}</label>
                <input
                  type="text"
                  value={editInstitution}
                  onChange={(e) => setEditInstitution(e.target.value)}
                  placeholder={t.enterInstitutionPlaceholder}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t.dept}</label>
                <input
                  type="text"
                  value={editDept}
                  onChange={(e) => setEditDept(e.target.value)}
                  placeholder={t.enterDeptPlaceholder}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t.position}</label>
                <select
                  value={editPosition}
                  onChange={(e) => setEditPosition(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {t.positions.map((p: any) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleSaveEdit}
                className="mt-2 w-full rounded-lg bg-indigo-600 py-2 font-medium text-white transition-colors hover:bg-indigo-700"
              >
                {t.saveChanges}
              </button>
            </div>
          </div>
        </div>
      )}

      {isBatchImporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="flex items-center gap-2 font-bold text-slate-800">
                <Upload size={18} className="text-indigo-600" /> {t.batchImportTitle}
              </h3>
              <button
                onClick={() => {
                  setIsBatchImporting(false);
                  setBatchFile(null);
                  setBatchProgress(null);
                }}
                className="text-slate-400 transition-colors hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-500">
                {t.batchImportDesc}
              </p>
              <p className="text-xs text-slate-400">{t.csvFormat}</p>
              <div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setBatchFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t.defaultInstitution}
                </label>
                <input
                  type="text"
                  value={batchDefaultInstitution}
                  onChange={(e) => setBatchDefaultInstitution(e.target.value)}
                  placeholder={t.enterInstitutionPlaceholder}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{t.defaultDept}</label>
                  <input
                    type="text"
                    value={batchDefaultDept}
                    onChange={(e) => setBatchDefaultDept(e.target.value)}
                    placeholder={t.enterDeptPlaceholder}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {t.defaultPosition}
                  </label>
                  <select
                    value={batchDefaultPosition}
                    onChange={(e) => setBatchDefaultPosition(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {t.positions.map((p: any) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {batchProgress && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>
                      {t.processing} {batchProgress.current} {t.ofTotal} {batchProgress.total}
                    </span>
                    <span className="max-w-[150px] truncate font-mono text-xs text-slate-400">
                      {batchProgress.name}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                    />
                  </div>
                  {batchProgress.errors.length > 0 && (
                    <div className="max-h-20 overflow-y-auto rounded border border-red-100 bg-red-50 p-2 text-xs text-red-600">
                      {batchProgress.errors.map((error, index) => (
                        <div key={index}>{error}</div>
                      ))}
                    </div>
                  )}
                  {!batchRunning && batchProgress.current === batchProgress.total && (
                    <div className="rounded border border-green-100 bg-green-50 p-2 text-sm font-medium text-green-700">
                      {t.importComplete}!{' '}
                      {batchProgress.errors.length > 0 &&
                        `(${batchProgress.errors.length} ${t.importErrors})`}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={handleBatchImport}
                disabled={!batchFile || batchRunning}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                {batchRunning ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                {batchRunning ? `${t.processing}...` : t.startImport}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="flex items-center gap-2 font-bold text-slate-800">
                <Lock size={18} className="text-indigo-600" /> {t.loginAdmin}
              </h3>
              <button
                onClick={() => {
                  setShowLoginModal(false);
                  setLoginPassword('');
                  setLoginError('');
                }}
                className="text-slate-400 transition-colors hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t.password}</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value);
                    setLoginError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                  placeholder={t.enterPassword}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
              {loginError && (
                <div className="rounded border border-red-100 bg-red-50 p-2 text-sm text-red-600">
                  {loginError}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowLoginModal(false);
                    setLoginPassword('');
                    setLoginError('');
                  }}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleAdminLogin}
                  className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
                >
                  {t.login}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSetPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="flex items-center gap-2 font-bold text-slate-800">
                <Shield size={18} className="text-indigo-600" /> {t.setPassword}
              </h3>
              <button
                onClick={() => {
                  setShowSetPassword(false);
                  setNewPass('');
                  setConfirmPass('');
                  setSetPassError('');
                }}
                className="text-slate-400 transition-colors hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-500">
                {t.readOnlyMode}
              </p>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t.newPassword}
                </label>
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => {
                    setNewPass(e.target.value);
                    setSetPassError('');
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {t.confirmPassword}
                </label>
                <input
                  type="password"
                  value={confirmPass}
                  onChange={(e) => {
                    setConfirmPass(e.target.value);
                    setSetPassError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {setPassError && (
                <div className="rounded border border-red-100 bg-red-50 p-2 text-sm text-red-600">
                  {setPassError}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSetPassword(false);
                    setNewPass('');
                    setConfirmPass('');
                    setSetPassError('');
                  }}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleSetPassword}
                  className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
                >
                  {t.setPassword}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showViewPasswordModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h3 className="flex items-center gap-2 font-bold text-slate-800">
                <Lock size={18} className="text-indigo-600" /> {tenantName || t.loginAdmin}
              </h3>
            </div>
            <div className="space-y-4 p-6">
              <p className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-slate-500">
                {t.readOnlyMode}
              </p>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t.password}</label>
                <input
                  type="password"
                  value={viewPassword}
                  onChange={(e) => {
                    setViewPassword(e.target.value);
                    setViewPasswordError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleViewPasswordSubmit()}
                  placeholder={t.enterPassword}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
              {viewPasswordError && (
                <div className="rounded border border-red-100 bg-red-50 p-2 text-sm text-red-600">
                  {viewPasswordError}
                </div>
              )}
              <button
                onClick={handleViewPasswordSubmit}
                className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
              >
                {t.login}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
