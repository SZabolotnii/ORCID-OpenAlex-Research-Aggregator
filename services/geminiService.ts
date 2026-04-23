import { Faculty, ChatMessage } from "../types";

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
 * Report Generation — proxied to backend to keep Gemini API key server-side.
 */
export const generateReportContent = async (
  facultyList: Faculty[],
  type: string,
  department: string,
  facultyId: string,
  lang: 'en' | 'ua'
): Promise<string> => {
  try {
    const response = await fetch(`${API_BASE}/reports/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facultyList, type, department, facultyId, lang }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server error: ${response.status}`);
    }

    const data = await response.json();
    return data.content || "No content returned.";
  } catch (error: any) {
    console.error("[Report Error] generateReportContent failed:", error?.message || error);
    return lang === 'ua'
      ? `Помилка генерації звіту: ${error.message}`
      : `Report generation error: ${error.message}`;
  }
};

/**
 * Template filling — proxied to backend.
 */
export const fillReportTemplate = async (
  facultyList: Faculty[],
  templateContent: string,
  fileType: 'csv' | 'docx',
  lang: 'en' | 'ua',
  additionalInstructions: string = '',
  department: string = 'All',
  facultyId: string = 'All'
): Promise<string> => {
  try {
    const response = await fetch(`${API_BASE}/reports/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        facultyList, templateContent, fileType, lang,
        additionalInstructions, department, facultyId,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server error: ${response.status}`);
    }

    const data = await response.json();
    return data.content || "No content returned.";
  } catch (error: any) {
    console.error("[Report Error] fillReportTemplate failed:", error?.message || error);
    return lang === 'ua'
      ? `Помилка заповнення шаблону: ${error.message}`
      : `Template fill error: ${error.message}`;
  }
};
