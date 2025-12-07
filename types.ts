
export type DataSource = 'orcid' | 'openalex' | 'scopus' | 'wos';

export interface Publication {
  title: string;
  year: number;
  journal: string | null;
  type: string;
  doi: string | null;
  url: string | null;
  putCode: string;
  sources: DataSource[]; // Track where this record came from
  citationCount?: number; // Highest found citation count
  authors?: string[]; // List of author names
  abstract?: string; // Paper abstract
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

export interface ReportConfig {
  type: 'department' | 'individual' | 'annual';
  department?: string;
  periodStart: number;
  periodEnd: number;
}

export interface ApiKeys {
  scopus?: string;
  wos?: string;
}
