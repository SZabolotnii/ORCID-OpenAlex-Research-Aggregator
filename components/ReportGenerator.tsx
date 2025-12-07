import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Faculty } from '../types';
import { generateReportContent, fillReportTemplate } from '../services/geminiService';
import { FileText, Download, Loader2, CheckCircle, UploadCloud, FileSpreadsheet, FileType, Eye, Code, File, Filter } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

declare global {
  interface Window {
    mammoth: any;
    Papa: any;
    XLSX: any;
    pdfjsLib: any;
    marked: any;
  }
}

interface ReportGeneratorProps {
  facultyList: Faculty[];
}

const ReportGenerator: React.FC<ReportGeneratorProps> = ({ facultyList }) => {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'standard' | 'custom'>('standard');
  
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
  const [downloadFormat, setDownloadFormat] = useState<'docx' | 'md' | 'txt' | 'xlsx'>('docx');

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
      const content = await generateReportContent(facultyList, type, department, facultyId, language);
      setLastReport(content);
      setViewMode('preview'); // Default to preview
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
        facultyList, 
        templateContent, 
        parsedFileType as 'csv' | 'docx', // reusing type alias loosely here as 'text' content
        language,
        additionalInstructions,
        department,
        facultyId
      );
      setLastReport(content);
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

  const handleDownload = () => {
    if (!lastReport) return;
    
    let content = lastReport;
    let mimeType = '';
    let extension = '';

    if (downloadFormat === 'md') {
        mimeType = 'text/markdown';
        extension = 'md';
    } else if (downloadFormat === 'txt') {
        mimeType = 'text/plain';
        extension = 'txt';
    } else if (downloadFormat === 'xlsx') {
        if (window.XLSX) {
             const wb = window.XLSX.utils.book_new();
             const ws = window.XLSX.utils.aoa_to_sheet([[content]]); // Fallback
             try {
                if (content.includes(',')) {
                    const wsCsv = window.XLSX.utils.csv_to_sheet(content);
                    window.XLSX.utils.book_append_sheet(wb, wsCsv, "Report");
                } else {
                    window.XLSX.utils.book_append_sheet(wb, ws, "Report");
                }
             } catch {
                 window.XLSX.utils.book_append_sheet(wb, ws, "Report");
             }
             window.XLSX.writeFile(wb, `Report_${activeTab}_${new Date().toISOString().split('T')[0]}.xlsx`);
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
        // Basic HTML wrapper for DOCX
        content = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><title>Report</title></head>
        <body>
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            ${window.marked ? window.marked.parse(lastReport) : lastReport.replace(/\n/g, '<br/>')}
            </div>
        </body>
        </html>`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Report_${activeTab}_${new Date().toISOString().split('T')[0]}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Robust Markdown Renderer using Marked.js
  const renderMarkdown = (text: string) => {
    if (window.marked) {
      const html = window.marked.parse(text);
      return (
        <div 
          className="
            prose prose-sm max-w-none text-slate-700 
            prose-headings:font-bold prose-headings:text-slate-900 
            prose-h1:text-2xl prose-h2:text-xl prose-h2:text-indigo-700 prose-h2:border-b prose-h2:border-slate-200 prose-h2:pb-2
            prose-a:text-indigo-600 
            prose-strong:text-slate-900
            [&>table]:w-full [&>table]:border-collapse [&>table]:my-4
            [&>table>thead>tr>th]:border [&>table>thead>tr>th]:border-slate-300 [&>table>thead>tr>th]:bg-slate-50 [&>table>thead>tr>th]:p-2 [&>table>thead>tr>th]:text-left
            [&>table>tbody>tr>td]:border [&>table>tbody>tr>td]:border-slate-200 [&>table>tbody>tr>td]:p-2
          "
          dangerouslySetInnerHTML={{ __html: html }} 
        />
      );
    }
    return <pre className="whitespace-pre-wrap">{text}</pre>;
  };

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