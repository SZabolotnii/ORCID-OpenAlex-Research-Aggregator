import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Faculty, SavedReport } from '../types';
import { generateReportContent, fillReportTemplate } from '../services/geminiService';
import { FileText, Download, Loader2, CheckCircle, UploadCloud, FileSpreadsheet, FileType, Eye, Code, File, Filter, History, Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

declare global {
  interface Window {
    mammoth: any;
    Papa: any;
    XLSX: any;
    pdfjsLib: any;
    marked: any;
    jspdf: any;
  }
}

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
  const [parsedFileType, setParsedFileType] = useState<'csv' | 'docx' | 'xlsx' | 'pdf' | 'text' | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download format state
  const [downloadFormat, setDownloadFormat] = useState<'docx' | 'md' | 'txt' | 'xlsx' | 'pdf'>('docx');

  // Extract unique departments
  const departments = ['All', ...Array.from(new Set(facultyList.map(f => f.department)))];

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

    const extension = file.name.split('.').pop()?.toLowerCase();

    try {
      if (extension === 'csv') {
        setParsedFileType('csv');
        if (window.Papa) {
          window.Papa.parse(file, {
            complete: (results: any) => {
              const reader = new FileReader();
              reader.onload = (evt) => {
                setTemplateContent(evt.target?.result as string);
                setIsProcessingFile(false);
              };
              reader.onerror = () => setIsProcessingFile(false);
              reader.readAsText(file);
            },
            error: () => setIsProcessingFile(false)
          });
        } else setIsProcessingFile(false);

      } else if (extension === 'docx') {
        setParsedFileType('docx');
        if (window.mammoth) {
          const reader = new FileReader();
          reader.onload = async (event) => {
            const arrayBuffer = event.target?.result;
            try {
              const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
              setTemplateContent(result.value);
            } catch (err) {
              console.error(err);
              setTemplateContent("Error reading DOCX");
            } finally {
              setIsProcessingFile(false);
            }
          };
          reader.onerror = () => setIsProcessingFile(false);
          reader.readAsArrayBuffer(file);
        } else setIsProcessingFile(false);

      } else if (extension === 'xlsx') {
        setParsedFileType('xlsx');
        if (window.XLSX) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = window.XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const csvText = window.XLSX.utils.sheet_to_csv(firstSheet);
                setTemplateContent(csvText);
                setIsProcessingFile(false);
            };
            reader.readAsArrayBuffer(file);
        } else {
            console.error("SheetJS not loaded");
            setIsProcessingFile(false);
        }

      } else if (extension === 'pdf') {
        setParsedFileType('pdf');
        if (window.pdfjsLib) {
             const reader = new FileReader();
             reader.onload = async (e) => {
                 const typedarray = new Uint8Array(e.target?.result as ArrayBuffer);
                 try {
                     const pdf = await window.pdfjsLib.getDocument(typedarray).promise;
                     let fullText = '';
                     for (let i = 1; i <= pdf.numPages; i++) {
                         const page = await pdf.getPage(i);
                         const textContent = await page.getTextContent();
                         const strings = textContent.items.map((item: any) => item.str);
                         fullText += strings.join(' ') + '\n';
                     }
                     setTemplateContent(fullText);
                 } catch (err) {
                     console.error("PDF Parse Error", err);
                 } finally {
                     setIsProcessingFile(false);
                 }
             };
             reader.readAsArrayBuffer(file);
        } else {
             console.error("PDF.js not loaded");
             setIsProcessingFile(false);
        }

      } else if (extension === 'txt' || extension === 'md') {
        setParsedFileType('text');
        const reader = new FileReader();
        reader.onload = (e) => {
             setTemplateContent(e.target?.result as string);
             setIsProcessingFile(false);
        };
        reader.readAsText(file);

      } else {
        alert("Unsupported file type.");
        setTemplateFile(null);
        setIsProcessingFile(false);
      }
    } catch (err) {
      console.error(err);
      setIsProcessingFile(false);
    }
  };

  // Parse Markdown tables into 2D arrays for structured XLSX export
  const parseMarkdownTables = (md: string): { headers: string[]; rows: string[][] }[] => {
    const tables: { headers: string[]; rows: string[][] }[] = [];
    const lines = md.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      // Detect table header row (has | delimiters)
      if (line.startsWith('|') && line.endsWith('|') && i + 1 < lines.length) {
        const nextLine = lines[i + 1]?.trim() || '';
        // Check separator row (|---|---|)
        if (/^\|[\s\-:|]+\|$/.test(nextLine)) {
          const headers = line.split('|').filter(c => c.trim()).map(c => c.trim());
          const tableRows: string[][] = [];
          i += 2; // Skip header + separator
          while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
            const cells = lines[i].split('|').filter(c => c.trim() !== '' || lines[i].indexOf(c) > 0).map(c => c.trim()).filter((_, idx, arr) => idx > 0 || arr.length === headers.length);
            const cleaned = lines[i].split('|').slice(1, -1).map(c => c.trim());
            tableRows.push(cleaned);
            i++;
          }
          if (headers.length > 0) {
            tables.push({ headers, rows: tableRows });
          }
          continue;
        }
      }
      i++;
    }
    return tables;
  };

  const handleDownload = () => {
    if (!lastReport) return;

    let content = lastReport;
    let mimeType = '';
    let extension = '';
    const fileName = `Report_${activeTab}_${new Date().toISOString().split('T')[0]}`;

    if (downloadFormat === 'md') {
        mimeType = 'text/markdown';
        extension = 'md';
    } else if (downloadFormat === 'txt') {
        mimeType = 'text/plain';
        extension = 'txt';
    } else if (downloadFormat === 'pdf') {
        // PDF Export via jsPDF
        if (window.jspdf) {
          const { jsPDF } = window.jspdf;
          const doc = new jsPDF({ unit: 'mm', format: 'a4' });

          // Parse markdown to structured content
          const lines = lastReport.split('\n');
          let y = 20;
          const pageWidth = doc.internal.pageSize.getWidth();
          const margin = 15;
          const maxWidth = pageWidth - margin * 2;

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) { y += 4; continue; }

            // Check if we need a new page
            if (y > 270) {
              doc.addPage();
              y = 20;
            }

            if (trimmed.startsWith('# ')) {
              doc.setFontSize(18);
              doc.setFont('helvetica', 'bold');
              doc.text(trimmed.replace(/^#+\s*/, ''), margin, y);
              y += 10;
            } else if (trimmed.startsWith('## ')) {
              doc.setFontSize(14);
              doc.setFont('helvetica', 'bold');
              doc.text(trimmed.replace(/^#+\s*/, ''), margin, y);
              y += 8;
            } else if (trimmed.startsWith('### ')) {
              doc.setFontSize(12);
              doc.setFont('helvetica', 'bold');
              doc.text(trimmed.replace(/^#+\s*/, ''), margin, y);
              y += 7;
            } else if (trimmed.startsWith('|') && trimmed.endsWith('|') && /^\|[\s\-:|]+\|$/.test(trimmed)) {
              // Skip separator rows in tables — handled by autoTable
              continue;
            } else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
              // Table row — collect full table and render with autoTable
              const tableStart = lines.indexOf(line);
              const tables = parseMarkdownTables(lines.slice(Math.max(0, tableStart - 1)).join('\n'));
              if (tables.length > 0) {
                const table = tables[0];
                (doc as any).autoTable({
                  startY: y,
                  head: [table.headers],
                  body: table.rows,
                  margin: { left: margin, right: margin },
                  styles: { fontSize: 8, cellPadding: 2 },
                  headStyles: { fillColor: [79, 70, 229] },
                });
                y = (doc as any).lastAutoTable.finalY + 6;
                // Skip remaining table rows in the loop
                continue;
              }
            } else {
              doc.setFontSize(10);
              doc.setFont('helvetica', 'normal');
              const cleanText = trimmed.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
              const splitLines = doc.splitTextToSize(cleanText, maxWidth);
              doc.text(splitLines, margin, y);
              y += splitLines.length * 5;
            }
          }

          // Page numbers
          const totalPages = doc.getNumberOfPages();
          for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`${p} / ${totalPages}`, pageWidth - margin, 290, { align: 'right' });
          }

          doc.save(`${fileName}.pdf`);
          return;
        } else {
          alert('jsPDF not loaded. Downloading as Markdown.');
          mimeType = 'text/markdown';
          extension = 'md';
        }
    } else if (downloadFormat === 'xlsx') {
        if (window.XLSX) {
             const wb = window.XLSX.utils.book_new();

             // Try to parse Markdown tables into structured sheets
             const tables = parseMarkdownTables(content);

             if (tables.length > 0) {
               tables.forEach((table, idx) => {
                 const sheetData = [table.headers, ...table.rows];
                 const ws = window.XLSX.utils.aoa_to_sheet(sheetData);
                 // Auto-size columns
                 ws['!cols'] = table.headers.map((h: string) => ({ wch: Math.max(h.length, 15) }));
                 window.XLSX.utils.book_append_sheet(wb, ws, `Table ${idx + 1}`);
               });
             } else {
               // Fallback: split content by lines instead of one cell
               const rows = content.split('\n').map(line => [line.replace(/\*\*/g, '').replace(/\|/g, '').trim()]);
               const ws = window.XLSX.utils.aoa_to_sheet(rows);
               ws['!cols'] = [{ wch: 100 }];
               window.XLSX.utils.book_append_sheet(wb, ws, "Report");
             }

             window.XLSX.writeFile(wb, `${fileName}.xlsx`);
             return;
        } else {
            alert("XLSX library not loaded. Downloading as CSV.");
            mimeType = 'text/csv';
            extension = 'csv';
        }
    } else {
        // DOCX default
        mimeType = 'application/msword';
        extension = 'doc';
        content = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><title>Report</title></head>
        <body>
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            ${lastReport.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}
            </div>
        </body>
        </html>`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const renderMarkdown = (text: string) => (
    <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 font-sans">{text}</pre>
  );

  const getFileIcon = (type: string | null) => {
      switch(type) {
          case 'csv': return <FileSpreadsheet className="w-10 h-10 text-emerald-600 mb-2" />;
          case 'xlsx': return <FileSpreadsheet className="w-10 h-10 text-emerald-600 mb-2" />;
          case 'pdf': return <FileType className="w-10 h-10 text-red-600 mb-2" />;
          case 'docx': return <FileType className="w-10 h-10 text-blue-600 mb-2" />;
          default: return <File className="w-10 h-10 text-slate-400 mb-2" />;
      }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('standard')}
          className={`flex-1 py-4 px-6 text-sm font-medium transition-colors ${
            activeTab === 'standard'
              ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
              : 'bg-slate-50 text-slate-500 hover:text-slate-700'
          }`}
        >
          {t.standardReports}
        </button>
        <button
           onClick={() => setActiveTab('custom')}
           className={`flex-1 py-4 px-6 text-sm font-medium transition-colors ${
            activeTab === 'custom'
              ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
              : 'bg-slate-50 text-slate-500 hover:text-slate-700'
          }`}
        >
          {t.customTemplates}
        </button>
        <button
           onClick={() => setActiveTab('history')}
           className={`flex-1 py-4 px-6 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'history'
              ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
              : 'bg-slate-50 text-slate-500 hover:text-slate-700'
          }`}
        >
          <History size={16} />
          {t.reportHistory} {savedReports.length > 0 && `(${savedReports.length})`}
        </button>
      </div>

      <div className="p-6">
        {activeTab === 'standard' ? (
          /* Standard Mode */
          <>
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <FileText size={24} />
                </div>
                <div>
                <h3 className="text-lg font-bold text-slate-800">{t.smartReport}</h3>
                <p className="text-sm text-slate-500">{t.smartReportDesc}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t.reportType}</label>
                  <select 
                      value={type} 
                      onChange={(e) => setType(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                      <option value="annual">Annual Activity Report</option>
                      <option value="department">Department Overview</option>
                      <option value="individual">Individual Performance Summary</option>
                      <option value="scopus_wos">Scopus/WoS Publication List</option>
                      <option value="faculty_card">Faculty Activity Card</option>
                      <option value="accreditation">Accreditation Report</option>
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.targetDept}</label>
                    <select 
                        value={department} 
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.targetFaculty}</label>
                    <select 
                        value={facultyId} 
                        onChange={(e) => setFacultyId(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="All">{t.allFaculty}</option>
                        {filteredFaculty.map(f => (
                           <option key={f.orcidId} value={f.orcidId}>{f.name}</option>
                        ))}
                    </select>
                  </div>
                </div>
            </div>

            <button 
                onClick={handleGenerateStandard} 
                disabled={isGenerating || facultyList.length === 0}
                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
                {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
                {isGenerating ? t.generating : t.generateBtn}
            </button>
          </>
        ) : (
          /* Custom Template Mode */
          <div className="space-y-6">
             <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <UploadCloud size={24} />
                </div>
                <div>
                <h3 className="text-lg font-bold text-slate-800">{t.uploadTemplate}</h3>
                <p className="text-sm text-slate-500">{t.uploadDesc}</p>
                </div>
            </div>

             {/* Filters for Custom Mode */}
             <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 mb-2 text-slate-600 font-medium text-sm">
                    <Filter size={16} />
                    <span>{t.filterByDept} / {t.filterByFaculty}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t.targetDept}</label>
                    <select 
                        value={department} 
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{t.targetFaculty}</label>
                    <select 
                        value={facultyId} 
                        onChange={(e) => setFacultyId(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="All">{t.allFaculty}</option>
                        {filteredFaculty.map(f => (
                           <option key={f.orcidId} value={f.orcidId}>{f.name}</option>
                        ))}
                    </select>
                  </div>
                </div>
             </div>

            <div 
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    templateFile ? 'border-purple-200 bg-purple-50' : 'border-slate-300 hover:border-purple-400 hover:bg-slate-50'
                }`}
            >
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".csv,.docx,.xlsx,.pdf,.txt,.md" 
                    onChange={handleFileUpload}
                />
                
                {isProcessingFile ? (
                     <div className="flex flex-col items-center text-slate-500">
                        <Loader2 className="animate-spin w-8 h-8 mb-2 text-purple-600" />
                        <span>{t.analyzingTemplate}</span>
                     </div>
                ) : templateFile ? (
                     <div className="flex flex-col items-center">
                        {getFileIcon(parsedFileType)}
                        <span className="font-medium text-slate-800">{templateFile.name}</span>
                        <span className="text-xs text-slate-500 mt-1">{t.fileParsed}</span>
                     </div>
                ) : (
                    <div className="flex flex-col items-center text-slate-500">
                        <UploadCloud className="w-10 h-10 mb-2 text-slate-300" />
                        <span className="font-medium">{t.dragDrop}</span>
                        <span className="text-xs mt-1">{t.supportsFiles}</span>
                    </div>
                )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t.additionalInstructions}
              </label>
              <textarea
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
                placeholder={t.instructionsPlaceholder}
                className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none min-h-[100px]"
              />
            </div>

            <button 
                onClick={handleGenerateFromTemplate} 
                disabled={isGenerating || !templateContent || isProcessingFile || facultyList.length === 0}
                className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
                {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
                {isGenerating ? t.generating : t.fillTemplate}
            </button>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {savedReports.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <History className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>{t.noSavedReports}</p>
              </div>
            ) : (
              savedReports.map(report => (
                <div key={report.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-indigo-200 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 text-sm truncate">{report.title}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {new Date(report.createdAt).toLocaleString()} · {report.content.length} chars
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => loadReport(report)}
                      className="px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                    >
                      {t.loadReport}
                    </button>
                    <button
                      onClick={() => deleteReport(report.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Output Section */}
        {lastReport && (
            <div className="mt-8 pt-6 border-t border-slate-100">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2 text-emerald-600 font-medium">
                        <CheckCircle size={18} /> {t.reportGenerated}
                    </div>
                    <div className="flex gap-2">
                         <div className="bg-slate-100 p-1 rounded-lg flex gap-1">
                             <button 
                                onClick={() => setViewMode('preview')}
                                className={`p-1.5 rounded transition-colors ${viewMode === 'preview' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                title={t.visualizeReport}
                             >
                                <Eye size={16} />
                             </button>
                             <button 
                                onClick={() => setViewMode('raw')}
                                className={`p-1.5 rounded transition-colors ${viewMode === 'raw' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                title={t.rawView}
                             >
                                <Code size={16} />
                             </button>
                         </div>
                       
                       {/* Format Selector */}
                       <div className="flex items-center gap-2">
                           <select 
                               value={downloadFormat}
                               onChange={(e) => setDownloadFormat(e.target.value as any)}
                               className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 px-2 rounded-lg text-sm font-medium border-none outline-none cursor-pointer"
                           >
                               <option value="docx">Word (.doc)</option>
                               <option value="pdf">PDF (.pdf)</option>
                               <option value="md">Markdown (.md)</option>
                               <option value="txt">Text (.txt)</option>
                               <option value="xlsx">Excel (.xlsx)</option>
                           </select>

                           <button 
                               onClick={handleDownload}
                               className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 px-3 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                           >
                               <Download size={16} />
                               {t.download}
                           </button>
                       </div>
                    </div>
                </div>
                
                <div className="p-6 bg-white border border-slate-200 rounded-lg shadow-inner">
                    {viewMode === 'raw' ? (
                        <pre className="whitespace-pre-wrap text-xs text-slate-600 font-mono overflow-auto max-h-[70vh]">
                            {lastReport}
                        </pre>
                    ) : (
                        renderMarkdown(lastReport)
                    )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default ReportGenerator;
