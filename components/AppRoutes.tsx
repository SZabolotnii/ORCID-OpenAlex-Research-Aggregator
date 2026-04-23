import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Faculty } from '../types';

const Dashboard = lazy(() => import('./Dashboard'));
const FacultyList = lazy(() => import('./FacultyList'));
const ChatInterface = lazy(() => import('./ChatInterface'));
const ReportGenerator = lazy(() => import('./ReportGenerator'));
const OrcidSearch = lazy(() => import('./OrcidSearch'));

type AppRoutesProps = {
  facultyList: Faculty[];
  isAdmin: boolean;
  tenantId: string;
  authToken?: string;
  onSelectFaculty: (faculty: Faculty | null) => void;
  onDelete: (id: string) => void;
  onRefresh: (orcidId: string) => Promise<void>;
  onEdit: (faculty: Faculty) => void;
  onBulkDelete: (ids: string[]) => void;
  onBulkUpdate: (
    ids: string[],
    field: 'department' | 'position' | 'institution',
    value: string
  ) => void;
  onAddFaculty: (
    orcid: string,
    position: string,
    dept: string,
    institution?: string
  ) => Promise<void>;
};

function RouteFallback() {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
        Loading...
      </div>
    </div>
  );
}

export default function AppRoutes({
  facultyList,
  isAdmin,
  tenantId,
  authToken,
  onSelectFaculty,
  onDelete,
  onRefresh,
  onEdit,
  onBulkDelete,
  onBulkUpdate,
  onAddFaculty,
}: AppRoutesProps) {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route
          path="/"
          element={<Dashboard facultyList={facultyList} onSelectFaculty={onSelectFaculty} />}
        />
        <Route
          path="/faculty"
          element={
            <FacultyList
              facultyList={facultyList}
              onSelect={onSelectFaculty}
              onDelete={onDelete}
              onRefresh={onRefresh}
              onEdit={onEdit}
              onBulkDelete={onBulkDelete}
              onBulkUpdate={onBulkUpdate}
              isAdmin={isAdmin}
            />
          }
        />
        <Route
          path="/search"
          element={
            isAdmin ? (
              <OrcidSearch existingFaculty={facultyList} onAddFaculty={onAddFaculty} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="/chat" element={<ChatInterface tenantId={tenantId} authToken={authToken} />} />
        <Route
          path="/reports"
          element={
            <ReportGenerator facultyList={facultyList} tenantId={tenantId} authToken={authToken} />
          }
        />
      </Routes>
    </Suspense>
  );
}
