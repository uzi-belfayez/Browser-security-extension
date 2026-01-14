import type { PhishingRequest, PhishingResponse } from "./shared/types"

const ANALYZE_ACTION = "PHISHING_ANALYZE"

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "")
const envApiBaseUrl =
  typeof process !== "undefined"
    ? process.env.PLASMO_PUBLIC_PHISHING_API_BASE_URL ||
      process.env.PLASMO_PUBLIC_API_BASE_URL ||
      process.env.PHISHING_API_BASE_URL ||
      process.env.API_BASE_URL ||
      ""
    : ""

export async function analyzeEmail(payload: PhishingRequest): Promise<PhishingResponse> {
  const apiBaseUrl = envApiBaseUrl || "http://localhost:8000"

  const response = await fetch(`${normalizeBaseUrl(apiBaseUrl)}/phishing/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Analysis failed")
  }

  return (await response.json()) as PhishingResponse
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== ANALYZE_ACTION) {
      return undefined
    }
    analyzeEmail(message.payload as PhishingRequest)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error: Error) =>
        sendResponse({ ok: false, error: error?.message || "Analysis failed" })
      )
    return true
  })
}
