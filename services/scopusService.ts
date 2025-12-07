
import { Publication } from '../types';

// NOTE: Real Scopus API requires an API Key and often CORS proxy.
// This service supports a "Simulation Mode" if no key is provided to demonstrate the merging UI.

export const fetchScopusData = async (orcidId: string, apiKey?: string): Promise<Publication[]> => {
  if (!apiKey) {
    // Simulation Mode: Return some mock data that overlaps with existing ORCID data but adds citations
    console.log("Simulating Scopus Data (No API Key provided)");
    await new Promise(resolve => setTimeout(resolve, 800)); // Fake delay
    
    // Generate simulated data based on typical Scopus results
    // We intentionally create some that might match ORCID ones to test merging
    return [
      {
        title: "Simulation: Machine Learning in Education",
        year: 2023,
        journal: "Computers & Education",
        type: "journal-article",
        doi: "10.1016/j.compedu.2023.100", // Fake DOI
        url: null,
        putCode: "scopus-1",
        sources: ['scopus'],
        citationCount: 15
      },
      {
        title: "High Performance Computing Trends",
        year: 2024,
        journal: "IEEE Transactions",
        type: "conference-paper",
        doi: null,
        url: null,
        putCode: "scopus-2",
        sources: ['scopus'],
        citationCount: 4
      }
    ];
  }

  // Real Implementation Logic (would run if key provided)
  // Note: This often fails in browsers due to CORS unless a proxy is used.
  try {
    const url = `https://api.elsevier.com/content/search/scopus?query=AU-ID(${orcidId})&apiKey=${apiKey}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error("Scopus API Error");
    const data = await res.json();
    
    // Mapping logic would go here
    return []; 
  } catch (e) {
    console.error("Scopus Fetch Error", e);
    return [];
  }
};
