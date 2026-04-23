import React from 'react';
import { Faculty } from '../../types';
import {
  File,
  FileSpreadsheet,
  FileText,
  FileType,
  Filter,
  Loader2,
  UploadCloud,
} from 'lucide-react';

type ParsedFileType = 'csv' | 'docx' | 'xlsx' | 'pdf' | 'text' | null;

type CustomTemplateFormProps = {
  t: Record<string, any>;
  department: string;
  facultyId: string;
  departments: string[];
  filteredFaculty: Faculty[];
  templateFile: File | null;
  parsedFileType: ParsedFileType;
  isProcessingFile: boolean;
  additionalInstructions: string;
  templateContent: string;
  isGenerating: boolean;
  hasFaculty: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  setDepartment: (value: string) => void;
  setFacultyId: (value: string) => void;
  setAdditionalInstructions: (value: string) => void;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleGenerateFromTemplate: () => Promise<void>;
};

function getFileIcon(type: ParsedFileType) {
  switch (type) {
    case 'csv':
    case 'xlsx':
      return <FileSpreadsheet className="mb-2 h-10 w-10 text-emerald-600" />;
    case 'pdf':
      return <FileType className="mb-2 h-10 w-10 text-red-600" />;
    case 'docx':
      return <FileType className="mb-2 h-10 w-10 text-blue-600" />;
    default:
      return <File className="mb-2 h-10 w-10 text-slate-400" />;
  }
}

export default function CustomTemplateForm({
  t,
  department,
  facultyId,
  departments,
  filteredFaculty,
  templateFile,
  parsedFileType,
  isProcessingFile,
  additionalInstructions,
  templateContent,
  isGenerating,
  hasFaculty,
  fileInputRef,
  setDepartment,
  setFacultyId,
  setAdditionalInstructions,
  handleFileUpload,
  handleGenerateFromTemplate,
}: CustomTemplateFormProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
          <UploadCloud size={24} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-800">{t.uploadTemplate}</h3>
          <p className="text-sm text-slate-500">{t.uploadDesc}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-600">
          <Filter size={16} />
          <span>
            {t.filterByDept} / {t.filterByFaculty}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t.targetDept}</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {departments.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">{t.targetFaculty}</label>
            <select
              value={facultyId}
              onChange={(e) => setFacultyId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="All">{t.allFaculty}</option>
              {filteredFaculty.map((faculty) => (
                <option key={faculty.orcidId} value={faculty.orcidId}>
                  {faculty.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          templateFile
            ? 'border-purple-200 bg-purple-50'
            : 'border-slate-300 hover:border-purple-400 hover:bg-slate-50'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".csv,.docx,.xlsx,.pdf,.txt,.md"
          onChange={(e) => {
            void handleFileUpload(e);
          }}
        />

        {isProcessingFile ? (
          <div className="flex flex-col items-center text-slate-500">
            <Loader2 className="mb-2 h-8 w-8 animate-spin text-purple-600" />
            <span>{t.analyzingTemplate}</span>
          </div>
        ) : templateFile ? (
          <div className="flex flex-col items-center">
            {getFileIcon(parsedFileType)}
            <span className="font-medium text-slate-800">{templateFile.name}</span>
            <span className="mt-1 text-xs text-slate-500">{t.fileParsed}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center text-slate-500">
            <UploadCloud className="mb-2 h-10 w-10 text-slate-300" />
            <span className="font-medium">{t.dragDrop}</span>
            <span className="mt-1 text-xs">{t.supportsFiles}</span>
          </div>
        )}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {t.additionalInstructions}
        </label>
        <textarea
          value={additionalInstructions}
          onChange={(e) => setAdditionalInstructions(e.target.value)}
          placeholder={t.instructionsPlaceholder}
          className="min-h-[100px] w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <button
        onClick={handleGenerateFromTemplate}
        disabled={isGenerating || !templateContent || isProcessingFile || !hasFaculty}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3 font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
      >
        {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
        {isGenerating ? t.generating : t.fillTemplate}
      </button>
    </div>
  );
}
