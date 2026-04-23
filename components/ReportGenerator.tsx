import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Faculty, SavedReport } from '../types';
import { generateReportContent, fillReportTemplate } from '../services/geminiService';
import { useLanguage } from '../contexts/LanguageContext';
import ReportTabs from './report-generator/ReportTabs';
import ReportHistoryList from './report-generator/ReportHistoryList';
import ReportOutput from './report-generator/ReportOutput';
import StandardReportForm from './report-generator/StandardReportForm';
import CustomTemplateForm from './report-generator/CustomTemplateForm';
import {
  downloadGeneratedReport,
  parseTemplateFile,
  renderReportMarkdown,
  type ParsedTemplateFileType,
  type ReportDownloadFormat,
} from '../utils/reportFileUtils';

interface ReportGeneratorProps {
  facultyList: Faculty[];
  tenantId: string;
  authToken?: string | null;
}

const ReportGenerator: React.FC<ReportGeneratorProps> = ({ facultyList, tenantId, authToken }) => {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'standard' | 'custom' | 'history'>('standard');
  const storageKey = `saved_reports_${tenantId}`;

  // Report History
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setSavedReports(JSON.parse(saved));
    } catch (e) {
      console.error("Failed to parse saved reports", e);
    }
  }, [storageKey]);

  const saveReport = (content: string) => {
    const report: SavedReport = {
      id: Date.now().toString(),
      title: `${type} — ${department}`,
      type,
      department,
      content,
      createdAt: new Date().toISOString(),
    };
    const updated = [report, ...savedReports].slice(0, 10);
    setSavedReports(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const deleteReport = (id: string) => {
    const updated = savedReports.filter(r => r.id !== id);
    setSavedReports(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const loadReport = (report: SavedReport) => {
    setLastReport(report.content);
    setActiveTab('standard');
    setViewMode('preview');
  };
  
  // Standard Report State
  const [department, setDepartment] = useState('All');
  const [facultyId, setFacultyId] = useState('All');
  const [type, setType] = useState('annual');
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastReport, setLastReport] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'raw' | 'preview'>('preview');

  // Custom Template State
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateContent, setTemplateContent] = useState<string>('');
  const [parsedFileType, setParsedFileType] = useState<ParsedTemplateFileType>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download format state
  const [downloadFormat, setDownloadFormat] = useState<ReportDownloadFormat>('docx');

  // Extract unique departments
  const departments: string[] = [
    'All',
    ...Array.from<string>(new Set(facultyList.map((faculty): string => faculty.department))),
  ];

  // Filter faculty based on selected department
  const filteredFaculty = useMemo(() => {
    if (department === 'All') return facultyList;
    return facultyList.filter(f => f.department === department);
  }, [facultyList, department]);

  // Reset faculty filter when department changes
  useEffect(() => {
    setFacultyId('All');
  }, [department]);

  // Set smart default download format based on input file type
  useEffect(() => {
      if (activeTab === 'custom') {
        if (parsedFileType === 'text' || parsedFileType === 'pdf') {
            setDownloadFormat('md');
        } else if (parsedFileType === 'xlsx' || parsedFileType === 'csv') {
            setDownloadFormat('xlsx');
        } else {
            setDownloadFormat('docx');
        }
      } else {
          setDownloadFormat('docx'); // Standard reports default to DOCX
      }
  }, [parsedFileType, activeTab]);

  const handleGenerateStandard = async () => {
    setIsGenerating(true);
    setLastReport(null);
    try {
      const content = await generateReportContent(tenantId, type, department, facultyId, language, authToken || undefined);
      setLastReport(content);
      if (content) saveReport(content);
      setViewMode('preview');
    } catch (e) {
      console.error("Error generating standard report", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateFromTemplate = async () => {
    if (!templateContent || !parsedFileType) return;
    
    setIsGenerating(true);
    setLastReport(null);
    try {
      const content = await fillReportTemplate(
        tenantId,
        templateContent, 
        parsedFileType as 'csv' | 'docx', // reusing type alias loosely here as 'text' content
        language,
        additionalInstructions,
        department,
        facultyId,
        authToken || undefined
      );
      setLastReport(content);
      if (content) saveReport(content);
      setViewMode('preview');
    } catch (e) {
      console.error("Error generating from template", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTemplateFile(file);
    setIsProcessingFile(true);
    setTemplateContent('');
    setLastReport(null);

    try {
      const parsed = await parseTemplateFile(file);
      setParsedFileType(parsed.parsedFileType);
      setTemplateContent(parsed.templateContent);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to process file');
      setTemplateFile(null);
      setParsedFileType(null);
      setIsProcessingFile(false);
      return;
    }
    setIsProcessingFile(false);
  };

  const handleDownload = () => {
    if (!lastReport) return;
    try {
      downloadGeneratedReport({ activeTab, downloadFormat, lastReport });
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Failed to download report');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <ReportTabs
        t={t}
        activeTab={activeTab}
        savedReportsCount={savedReports.length}
        setActiveTab={setActiveTab}
      />

      <div className="p-6">
        {activeTab === 'standard' ? (
          <StandardReportForm
            t={t}
            type={type}
            department={department}
            facultyId={facultyId}
            departments={departments}
            filteredFaculty={filteredFaculty}
            isGenerating={isGenerating}
            hasFaculty={facultyList.length > 0}
            setType={setType}
            setDepartment={setDepartment}
            setFacultyId={setFacultyId}
            handleGenerateStandard={handleGenerateStandard}
          />
        ) : (
          <CustomTemplateForm
            t={t}
            department={department}
            facultyId={facultyId}
            departments={departments}
            filteredFaculty={filteredFaculty}
            templateFile={templateFile}
            parsedFileType={parsedFileType}
            isProcessingFile={isProcessingFile}
            additionalInstructions={additionalInstructions}
            templateContent={templateContent}
            isGenerating={isGenerating}
            hasFaculty={facultyList.length > 0}
            fileInputRef={fileInputRef}
            setDepartment={setDepartment}
            setFacultyId={setFacultyId}
            setAdditionalInstructions={setAdditionalInstructions}
            handleFileUpload={handleFileUpload}
            handleGenerateFromTemplate={handleGenerateFromTemplate}
          />
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <ReportHistoryList
            t={t}
            savedReports={savedReports}
            loadReport={loadReport}
            deleteReport={deleteReport}
          />
        )}

        {/* Output Section */}
        {lastReport && (
          <ReportOutput
            t={t}
            lastReport={lastReport}
            viewMode={viewMode}
            setViewMode={setViewMode}
            downloadFormat={downloadFormat}
            setDownloadFormat={setDownloadFormat}
            handleDownload={handleDownload}
            renderMarkdown={renderReportMarkdown}
          />
        )}
      </div>
    </div>
  );
};

export default ReportGenerator;
