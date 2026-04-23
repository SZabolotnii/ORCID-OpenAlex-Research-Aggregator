import { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Faculty, TenantRole } from '../types';
import { fetchTenantConfig, fetchTenantData, saveTenantData } from '../services/tenantApi';

type UseTenantSessionResult = {
  tenantName: string;
  tenantPublic: boolean;
  tenantHasAdmin: boolean;
  tenantAuthorized: boolean;
  authToken: string | null;
  authRole: TenantRole | null;
  isAdmin: boolean;
  facultyList: Faculty[];
  facultyListRef: MutableRefObject<Faculty[]>;
  loadTenantDataFromServer: (tokenOverride?: string | null) => Promise<Faculty[]>;
  persistFacultyList: (nextFacultyList: Faculty[]) => Promise<void>;
  setFacultyList: Dispatch<SetStateAction<Faculty[]>>;
  setTenantHasAdmin: Dispatch<SetStateAction<boolean>>;
  setTenantAuthorized: Dispatch<SetStateAction<boolean>>;
  storeAuthSession: (role: TenantRole, token: string) => void;
  clearAuthSession: () => void;
  saveApiKeys: (value: string) => void;
  loadApiKeys: () => string | null;
};

export function useTenantSession(tenantId: string): UseTenantSessionResult {
  const authTokenKey = useMemo(() => `tenant_auth_token_${tenantId}`, [tenantId]);
  const authRoleKey = useMemo(() => `tenant_auth_role_${tenantId}`, [tenantId]);
  const apiKeysKey = useMemo(() => `api_keys_${tenantId}`, [tenantId]);

  const [facultyList, setFacultyList] = useState<Faculty[]>([]);
  const facultyListRef = useRef<Faculty[]>([]);
  const [tenantName, setTenantName] = useState('');
  const [tenantPublic, setTenantPublic] = useState(true);
  const [tenantHasAdmin, setTenantHasAdmin] = useState(false);
  const [tenantAuthorized, setTenantAuthorized] = useState(true);
  const [authToken, setAuthToken] = useState<string | null>(() => sessionStorage.getItem(authTokenKey));
  const [authRole, setAuthRole] = useState<TenantRole | null>(() => {
    const savedRole = sessionStorage.getItem(authRoleKey);
    return savedRole === 'admin' || savedRole === 'viewer' ? savedRole : null;
  });
  const [isAdmin, setIsAdmin] = useState(authRole === 'admin');

  useEffect(() => {
    facultyListRef.current = facultyList;
  }, [facultyList]);

  const storeAuthSession = useCallback((role: TenantRole, token: string) => {
    sessionStorage.setItem(authTokenKey, token);
    sessionStorage.setItem(authRoleKey, role);
    setAuthToken(token);
    setAuthRole(role);
    setIsAdmin(role === 'admin');
    setTenantAuthorized(true);
  }, [authRoleKey, authTokenKey]);

  const clearAuthSession = useCallback(() => {
    sessionStorage.removeItem(authTokenKey);
    sessionStorage.removeItem(authRoleKey);
    setAuthToken(null);
    setAuthRole(null);
    setIsAdmin(false);
  }, [authRoleKey, authTokenKey]);

  const loadTenantDataFromServer = useCallback(async (tokenOverride?: string | null): Promise<Faculty[]> => {
    return fetchTenantData(tenantId, tokenOverride);
  }, [tenantId]);

  const persistFacultyList = useCallback(async (nextFacultyList: Faculty[]) => {
    if (!authToken) {
      throw new Error('Admin authentication required');
    }
    await saveTenantData(tenantId, nextFacultyList, authToken);
  }, [authToken, tenantId]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const cfg = await fetchTenantConfig(tenantId);
        setTenantName(cfg.name);
        setTenantPublic(cfg.public);
        setTenantHasAdmin(cfg.hasAdminPassword);
        const hasStoredAccess = !!authToken;

        if (!cfg.public && !hasStoredAccess) {
          setTenantAuthorized(false);
        } else {
          try {
            const data = await loadTenantDataFromServer(authToken);
            setFacultyList(data);
            setTenantAuthorized(true);
          } catch (error) {
            console.error('Failed to load tenant data', error);
            if (!cfg.public) {
              clearAuthSession();
              setTenantAuthorized(false);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load data', error);
      }
    };

    loadData();
  }, [tenantId, authToken, clearAuthSession, loadTenantDataFromServer]);

  const saveApiKeys = useCallback((value: string) => {
    localStorage.setItem(apiKeysKey, value);
  }, [apiKeysKey]);

  const loadApiKeys = useCallback(() => {
    return localStorage.getItem(apiKeysKey);
  }, [apiKeysKey]);

  return {
    tenantName,
    tenantPublic,
    tenantHasAdmin,
    tenantAuthorized,
    authToken,
    authRole,
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
    saveApiKeys,
    loadApiKeys,
  };
}
