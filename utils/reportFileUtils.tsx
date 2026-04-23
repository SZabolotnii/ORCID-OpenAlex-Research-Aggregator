import React from 'react';

declare global {
  interface Window {
    mammoth: any;
    Papa: any;
    XLSX: any;
    pdfjsLib: any;
    jspdf: any;
  }
}

export type ParsedTemplateFileType = 'csv' | 'docx' | 'xlsx' | 'pdf' | 'text' | null;
export type ReportDownloadFormat = 'docx' | 'md' | 'txt' | 'xlsx' | 'pdf';

export function renderReportMarkdown(text: string) {
  return (
    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">
      {text}
    </pre>
  );
}

export function parseMarkdownTables(md: string): { headers: string[]; rows: string[][] }[] {
  const tables: { headers: string[]; rows: string[][] }[] = [];
  const lines = md.split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (line.startsWith('|') && line.endsWith('|') && index + 1 < lines.length) {
      const nextLine = lines[index + 1]?.trim() || '';
      if (/^\|[\s\-:|]+\|$/.test(nextLine)) {
        const headers = line
          .split('|')
          .filter((cell) => cell.trim())
          .map((cell) => cell.trim());
        const rows: string[][] = [];

        index += 2;
        while (
          index < lines.length &&
          lines[index].trim().startsWith('|') &&
          lines[index].trim().endsWith('|')
        ) {
          rows.push(lines[index].split('|').slice(1, -1).map((cell) => cell.trim()));
          index++;
        }

        if (headers.length > 0) {
          tables.push({ headers, rows });
        }
        continue;
      }
    }
    index++;
  }

  return tables;
}

export async function parseTemplateFile(file: File): Promise<{
  parsedFileType: ParsedTemplateFileType;
  templateContent: string;
}> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'csv') {
    return {
      parsedFileType: 'csv',
      templateContent: await file.text(),
    };
  }

  if (extension === 'docx') {
    if (!window.mammoth) throw new Error('Mammoth is not loaded');
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return {
      parsedFileType: 'docx',
      templateContent: result.value,
    };
  }

  if (extension === 'xlsx') {
    if (!window.XLSX) throw new Error('SheetJS is not loaded');
    const arrayBuffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    return {
      parsedFileType: 'xlsx',
      templateContent: window.XLSX.utils.sheet_to_csv(firstSheet),
    };
  }

  if (extension === 'pdf') {
    if (!window.pdfjsLib) throw new Error('PDF.js is not loaded');
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument(new Uint8Array(arrayBuffer)).promise;
    let fullText = '';

    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
      const page = await pdf.getPage(pageIndex);
      const textContent = await page.getTextContent();
      const strings = textContent.items.map((item: any) => item.str);
      fullText += strings.join(' ') + '\n';
    }

    return {
      parsedFileType: 'pdf',
      templateContent: fullText,
    };
  }

  if (extension === 'txt' || extension === 'md') {
    return {
      parsedFileType: 'text',
      templateContent: await file.text(),
    };
  }

  throw new Error('Unsupported file type');
}

export function downloadGeneratedReport(params: {
  activeTab: 'standard' | 'custom' | 'history';
  downloadFormat: ReportDownloadFormat;
  lastReport: string;
}) {
  const { activeTab, downloadFormat, lastReport } = params;
  let content = lastReport;
  const fileName = `Report_${activeTab}_${new Date().toISOString().split('T')[0]}`;

  if (downloadFormat === 'md') {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return;
  } else if (downloadFormat === 'txt') {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return;
  } else if (downloadFormat === 'pdf') {
    if (!window.jspdf) {
      throw new Error('jsPDF not loaded');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const lines = lastReport.split('\n');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const maxWidth = pageWidth - margin * 2;
    let y = 20;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        y += 4;
        continue;
      }

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
        continue;
      } else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
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

    const totalPages = doc.getNumberOfPages();
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      doc.setPage(pageNumber);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`${pageNumber} / ${totalPages}`, pageWidth - margin, 290, { align: 'right' });
    }

    doc.save(`${fileName}.pdf`);
    return;
  } else if (downloadFormat === 'xlsx') {
    if (!window.XLSX) {
      throw new Error('XLSX library not loaded');
    }

    const workbook = window.XLSX.utils.book_new();
    const tables = parseMarkdownTables(content);

    if (tables.length > 0) {
      tables.forEach((table, index) => {
        const sheetData = [table.headers, ...table.rows];
        const worksheet = window.XLSX.utils.aoa_to_sheet(sheetData);
        worksheet['!cols'] = table.headers.map((header: string) => ({
          wch: Math.max(header.length, 15),
        }));
        window.XLSX.utils.book_append_sheet(workbook, worksheet, `Table ${index + 1}`);
      });
    } else {
      const rows = content
        .split('\n')
        .map((line) => [line.replace(/\*\*/g, '').replace(/\|/g, '').trim()]);
      const worksheet = window.XLSX.utils.aoa_to_sheet(rows);
      worksheet['!cols'] = [{ wch: 100 }];
      window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    }

    window.XLSX.writeFile(workbook, `${fileName}.xlsx`);
    return;
  } else {
    content = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><title>Report</title></head>
    <body>
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        ${lastReport
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br/>')}
        </div>
    </body>
    </html>`;
    const blob = new Blob([content], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName}.doc`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }
}
