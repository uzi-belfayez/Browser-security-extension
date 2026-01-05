import type { PhishingRequest, PhishingResponse } from "./shared/types"

// Placeholder background handler. Wire this to FastAPI in Phase 4.
export async function analyzeEmail(_payload: PhishingRequest): Promise<PhishingResponse> {
  return {
    risk: "green",
    score: 0.01,
    summary: "Placeholder response.",
    signals: []
  }
}
