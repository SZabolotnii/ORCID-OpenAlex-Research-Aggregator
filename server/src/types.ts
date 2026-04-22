// Shared types matching frontend types.ts

export type DataSource = 'orcid' | 'openalex' | 'scopus' | 'wos';

export interface Publication {
  title: string;
  year: number;
  journal: string | null;
  type: string;
  doi: string | null;
  url: string | null;
  putCode: string;
  sources: DataSource[];
  citationCount?: number;
  authors?: string[];
  abstract?: string;
  isOa?: boolean;
}

export interface OpenAlexTopic {
  name: string;
  score: number;
}

export interface YearlyStat {
  year: number;
  citations: number;
  works: number;
}

export interface WorkMetric {
  title: string;
  year: number;
  citations: number;
  isOa: boolean;
  journal: string;
  doi: string;
}

export interface OpenAlexMetrics {
  hIndex: number;
  i10Index: number;
  citationCount: number;
  worksCount: number;
  citationCount2Year: number;
  lastUpdated: string;
  topics: OpenAlexTopic[];
  yearlyStats: YearlyStat[];
  institutions: string[];
  topWorks: WorkMetric[];
}

export interface Faculty {
  orcidId: string;
  name: string;
  position: string;
  department: string;
  institution?: string;
  country: string | null;
  biography: string | null;
  publications: Publication[];
  metrics?: OpenAlexMetrics;
  lastUpdated: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface ChatRequest {
  query: string;
  facultyList: Faculty[];
  history: ChatMessage[];
  lang: 'en' | 'ua';
}

export interface TenantConfig {
  id: string;
  subdomain: string;
  name: string;
  public: boolean;
  adminPasswordHash: string;
  viewPasswordHash?: string;
}
