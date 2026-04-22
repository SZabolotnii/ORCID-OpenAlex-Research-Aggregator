
import { GoogleGenAI } from "@google/genai";
import { Faculty, ChatMessage } from "../types";

// Helper to get fresh AI instance (used for reports only)
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// API base URL — proxied in dev via vite, direct in production
const API_BASE = '/api';

/**
 * AI Chat via pi-agent backend.
 * Sends faculty data and query to the server-side agent which has
 * full access to local data tools + external OpenAlex tools.
 */
export const analyzeFacultyData = async (
  facultyList: Faculty[],
  query: string,
  history: ChatMessage[],
  lang: 'en' | 'ua'
): Promise<string> => {
  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, facultyList, history, lang }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    const data = await response.json();
    return data.response || '';
  } catch (error: any) {
    console.error("Agent API Error:", error);
    return lang === 'ua'
      ? `Помилка з'єднання з AI-агентом: ${error.message}`
      : `Agent connection error: ${error.message}`;
  }
};

/**
 * Report Generation (Standard - using Context Stuffing for reliability in large document generation)
 */
export const generateReportContent = async (
    facultyList: Faculty[], 
    type: string, 
    department: string, 
    facultyId: string,
    lang: 'en' | 'ua'
) => {
  const ai = getAI();
  
  let dataToAnalyze = facultyList;
  let targetName = 'Entire Faculty';

  // Filter by Department
  if (department && department !== 'All') {
    dataToAnalyze = dataToAnalyze.filter(f => f.department === department);
    targetName = `Department of ${department}`;
  }

  // Filter by Faculty (Overrides/Narrows department filter)
  if (facultyId && facultyId !== 'All') {
      const targetFaculty = facultyList.find(f => f.orcidId === facultyId);
      if (targetFaculty) {
          dataToAnalyze = [targetFaculty];
          targetName = targetFaculty.name;
      }
  }

  const langInstruction = lang === 'ua' ? 'Ukrainian' : 'English';

  // Build type-specific prompt structure
  let reportStructure = '';
  switch (type) {
    case 'scopus_wos':
      reportStructure = `
    Structure:
    1. Summary (total Scopus/WoS publications count, by year)
    2. Full Bibliographic List — a Markdown table with columns: #, Author(s), Title, Journal, Year, DOI, Database (Scopus/WoS)
       - Include ONLY publications that have 'scopus' or 'wos' in their sources array
       - Sort by year descending
    3. Statistics summary table by department

    IMPORTANT: Filter to show only indexed publications (sources contain 'scopus' or 'wos').`;
      break;
    case 'faculty_card':
      reportStructure = `
    This is an individual faculty attestation card. Structure:
    1. Personal Info (Name, Position, Department, ORCID)
    2. Scientometric Indicators — table with: H-index, Total Citations, i10-Index, Publications Count, Scopus Count, WoS Count
    3. Research Topics / Scientific Interests
    4. Top 5 Most Cited Works — table with: Title, Journal, Year, Citations, DOI
    5. Publication List (last 5 years) — numbered list with full bibliographic details
    6. Citation Dynamics — yearly breakdown table

    IMPORTANT: This is for a single researcher. If multiple faculty provided, generate a card for each.`;
      break;
    case 'accreditation':
      reportStructure = `
    This is a research output report for institutional accreditation. Structure:
    1. Executive Summary (institution-level totals)
    2. Department Summary Table — columns: Department, Faculty Count, Total Publications, Scopus Pubs, WoS Pubs, Avg H-index, Total Citations
    3. Per-Department Details — for each department:
       a. Faculty list with individual metrics (table)
       b. Key research areas
    4. Indexed Publications — combined Scopus/WoS list (table)
    5. Recommendations for Improvement
    6. Data Quality Notes — flag any faculty members with missing metrics or zero publications

    Use formal academic language suitable for ministry/accreditation commission.`;
      break;
    default:
      reportStructure = `
    Structure the report with:
    1. Executive Summary
    2. Key Statistics
    3. Research Focus Areas
    4. Notable Researchers (if applicable) or Notable Works (include bibliographic details if available)
    5. Recommendations`;
      break;
  }

  const prompt = `
    Generate a professional academic report in Markdown format.

    Report Type: ${type}
    Target Entity: ${targetName}
    Output Language: ${langInstruction}

    Data:
    ${JSON.stringify(dataToAnalyze.map(f => ({
      name: f.name,
      position: f.position,
      dept: f.department,
      metrics: f.metrics ? {
         hIndex: f.metrics.hIndex,
         i10Index: f.metrics.i10Index,
         citations: f.metrics.citationCount,
         citations2Year: f.metrics.citationCount2Year,
         topics: f.metrics.topics.map(t => t.name),
         yearlyStats: f.metrics.yearlyStats
      } : null,
      publications: f.publications.map(p => ({
        title: p.title,
        year: p.year,
        journal: p.journal,
        type: p.type,
        doi: p.doi,
        sources: p.sources,
        citations: p.citationCount
      }))
    })).slice(0, 15), null, 2)}

    Note: The data list is limited to 15 entities to ensure context fit.

    ${reportStructure}

    Keep it formal. Use Markdown tables for statistics.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Report Gen Error:", error);
    return "Failed to generate report.";
  }
};

export const fillReportTemplate = async (
  facultyList: Faculty[], 
  templateContent: string, 
  fileType: 'csv' | 'docx', 
  lang: 'en' | 'ua',
  additionalInstructions: string = '',
  department: string = 'All',
  facultyId: string = 'All'
) => {
  const ai = getAI();
  const langInstruction = lang === 'ua' ? 'Ukrainian' : 'English';

  // 1. Filter Data BEFORE sending to LLM to save tokens and improve accuracy
  let dataToProcess = facultyList;

  if (department && department !== 'All') {
    dataToProcess = dataToProcess.filter(f => f.department === department);
  }

  if (facultyId && facultyId !== 'All') {
    const specificFaculty = facultyList.find(f => f.orcidId === facultyId);
    if (specificFaculty) {
        dataToProcess = [specificFaculty];
    }
  }

  const detailedContext = dataToProcess.map(f => ({
    name: f.name,
    position: f.position,
    department: f.department,
    metrics: f.metrics,
    // CRITICAL UPDATE: Pass the full publication list so Gemini can fill specific bibliography rows
    publications: f.publications.map(p => ({
        title: p.title,
        year: p.year,
        journal: p.journal,
        type: p.type,
        doi: p.doi,
        citations: p.citationCount
    }))
  }));

  const prompt = `
    Task: Fill the provided ${fileType} template with the faculty data provided.
    
    Additional Instructions: ${additionalInstructions}
    
    If the template asks for a list, generate rows for the provided faculty.
    If the template asks for specific publications (e.g. "for 2024"), use the provided 'publications' array to find matches.
    If the template is for a specific person, use the data of the single faculty member provided.

    Data:
    ${JSON.stringify(detailedContext).slice(0, 60000)}

    Template:
    ${templateContent}

    Output ONLY the filled content. Language: ${langInstruction}.
    For Excel/CSV inputs, return strictly CSV format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 2048 } }
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Template Fill Error:", error);
    return "Failed to fill template.";
  }
};
