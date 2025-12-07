
import { Publication } from '../types';

// NOTE: Web of Science API requires strict authentication.
// Simulation Mode used for demonstration.

export const fetchWosData = async (orcidId: string, apiKey?: string): Promise<Publication[]> => {
  if (!apiKey) {
    console.log("Simulating WoS Data (No API Key provided)");
    await new Promise(resolve => setTimeout(resolve, 800));

    return [
      {
        title: "Simulation: AI Ethics in 2024",
        year: 2024,
        journal: "Ethics and Info Tech",
        type: "journal-article",
        doi: "10.1007/s10676-024-fake",
        url: null,
        putCode: "wos-1",
        sources: ['wos'],
        citationCount: 8
      }
    ];
  }

  return [];
};
