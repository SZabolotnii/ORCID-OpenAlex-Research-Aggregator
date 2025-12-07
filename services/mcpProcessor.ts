
import { FunctionDeclaration, Type } from "@google/genai";
import { searchWorksByTopic, getAuthorStatsRaw } from "./openAlexService";

// --- Tool Definitions (Schema) ---

export const mcpTools: { functionDeclarations: FunctionDeclaration[] }[] = [
  {
    functionDeclarations: [
      {
        name: "get_author_metrics",
        description: "Get detailed OpenAlex metrics (H-index, Citations, Trends) for a specific researcher using their ORCID ID. Use this when you need deep analysis of a person.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            orcid: { 
                type: Type.STRING, 
                description: "The ORCID ID of the researcher (e.g., 0000-0003-0242-2234)" 
            }
          },
          required: ["orcid"]
        }
      },
      {
        name: "search_scientific_works",
        description: "Search for scientific papers in the OpenAlex database by topic or keyword. Use this to analyze global trends or find relevant literature.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: { 
                    type: Type.STRING, 
                    description: "Keywords to search for (e.g. 'Machine Learning', 'Pedagogy')" 
                },
                year: { 
                    type: Type.NUMBER, 
                    description: "Optional specific publication year to filter by." 
                }
            },
            required: ["query"]
        }
      },
      {
        name: "get_current_date",
        description: "Get the current date to perform date-sensitive calculations.",
        parameters: {
            type: Type.OBJECT,
            properties: {},
        }
      }
    ]
  }
];

// --- Tool Execution Logic (Dispatcher) ---

export const executeMcpTool = async (name: string, args: any): Promise<any> => {
    console.log(`[MCP] Executing tool: ${name}`, args);

    try {
        switch (name) {
            case "get_author_metrics":
                return await getAuthorStatsRaw(args.orcid);
            
            case "search_scientific_works":
                return await searchWorksByTopic(args.query, args.year);

            case "get_current_date":
                return { date: new Date().toISOString().split('T')[0] };

            default:
                return { error: `Unknown tool: ${name}` };
        }
    } catch (error: any) {
        console.error(`[MCP] Error executing ${name}:`, error);
        return { error: error.message };
    }
};
