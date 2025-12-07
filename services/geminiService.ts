
import { GoogleGenAI, Content, Part } from "@google/genai";
import { Faculty, ChatMessage } from "../types";
import { mcpTools, executeMcpTool } from "./mcpProcessor";

// Helper to get fresh AI instance
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Pro Analysis with MCP (Function Calling).
 * This function enables the "Agent" mode where Gemini can decide to fetch external data 
 * from OpenAlex via our embedded tools before answering.
 */
export const analyzeFacultyData = async (
  facultyList: Faculty[], 
  query: string, 
  history: ChatMessage[],
  lang: 'en' | 'ua'
): Promise<string> => {
  const ai = getAI();
  const langInstruction = lang === 'ua' ? 'Ukrainian' : 'English';

  // 1. Create a "Directory" of available faculty
  // This tells the LLM which ORCID IDs are available in the local context so it can call get_author_metrics correctly.
  const facultyDirectory = facultyList.map(f => `- ${f.name} (ORCID: ${f.orcidId}, Dept: ${f.department})`).join('\n');

  // 2. Initial Prompt with System Instruction
  const systemInstruction = `
    You are a Research Intelligence Agent powered by OpenAlex data.
    You have access to a specific list of local faculty members and a set of tools to fetch their deep metrics.
    
    LOCAL FACULTY DIRECTORY:
    ${facultyDirectory}

    RULES:
    1. If the user asks about a specific faculty member, ALWAYS check if you need to call 'get_author_metrics' to get their latest H-index or trends.
    2. If the user asks about general trends (e.g. "What is trending in AI?"), use 'search_scientific_works'.
    3. Provide the final response strictly in ${langInstruction}.
    4. Be professional, concise, and data-driven.
  `;

  // 3. Initialize Chat History
  // Convert existing chat history (excluding welcome message) to Gemini Content format
  const historyContents: Content[] = history
    .filter(msg => msg.id !== 'welcome') // Skip the static welcome message
    .map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

  // We use a manual content array to manage the function call loop, prepending history
  let contents: Content[] = [
    ...historyContents,
    { role: 'user', parts: [{ text: query }] }
  ];

  try {
    const model = ai.models;
    const modelId = 'gemini-2.5-flash'; // Using Flash for speed in tool loops, or 'gemini-3-pro-preview' for intelligence
    
    // --- Tool Loop ---
    // We allow up to 5 turns to prevent infinite loops
    for (let turn = 0; turn < 5; turn++) {
        
        // A. Generate content with tools
        const response = await model.generateContent({
            model: modelId,
            contents: contents,
            config: {
                tools: mcpTools,
                systemInstruction: systemInstruction
            }
        });

        const responseContent = response.candidates?.[0]?.content;
        if (!responseContent) throw new Error("No response content");

        // Append model's response to history
        contents.push(responseContent);

        // B. Check for Function Calls
        // FIX: Access as property, not function call
        const functionCalls = response.functionCalls;
        
        if (functionCalls && functionCalls.length > 0) {
            // C. Execute Tools
            const functionResponses: Part[] = [];
            
            for (const call of functionCalls) {
                const result = await executeMcpTool(call.name, call.args);
                
                functionResponses.push({
                    functionResponse: {
                        name: call.name,
                        id: call.id, // Important: match the ID
                        response: { result: result }
                    }
                });
            }

            // D. Append Tool Results to history
            contents.push({ role: 'tool', parts: functionResponses });
            // Continue loop -> Model sees tool output and decides what to do next
        } else {
            // No function calls -> This is the final answer
            return response.text || "";
        }
    }

    return lang === 'ua' ? "Перевищено ліміт запитів до інструментів." : "Tool execution limit exceeded.";

  } catch (error) {
    console.error("Gemini Agent Error:", error);
    return lang === 'ua' 
      ? "Виникла помилка під час роботи Агента. Спробуйте пізніше." 
      : "I encountered an error while running the analysis agent.";
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

  const prompt = `
    Generate a professional academic report in Markdown format.
    
    Report Type: ${type}
    Target Entity: ${targetName}
    Output Language: ${langInstruction}
    
    Data:
    ${JSON.stringify(dataToAnalyze.map(f => ({
      name: f.name,
      dept: f.department,
      metrics: f.metrics ? {
         hIndex: f.metrics.hIndex,
         citations: f.metrics.citationCount,
         topics: f.metrics.topics.map(t => t.name)
      } : null,
      // Provide full publication list for detailed reporting
      publications: f.publications.map(p => ({
        title: p.title,
        year: p.year,
        journal: p.journal,
        type: p.type,
        doi: p.doi,
        sources: p.sources
      }))
    })).slice(0, 15), null, 2)} 
    
    Note: The data list is limited to 15 entities to ensure context fit.
    
    Structure the report with:
    1. Executive Summary
    2. Key Statistics 
    3. Research Focus Areas 
    4. Notable Researchers (if applicable) or Notable Works (include bibliographic details if available)
    5. Recommendations
    
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
