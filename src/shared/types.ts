export type RiskLevel = "green" | "yellow" | "red"

export interface PhishingRequest {
  sender_email: string
  sender_name?: string
  receiver_email?: string
  subject?: string
  body_text: string
}

export interface PhishingResponse {
  risk: RiskLevel
  score: number
  summary: string
  signals?: string[]
  checks?: Array<{
    label: string
    status: "pass" | "fail" | "info"
    detail?: string
  }>
}

export interface Settings {
  enablePiiRedactor: boolean
  enablePhishingRadar: boolean
  enableOutlookRadar: boolean
  customPatterns: string[]
  customRegexPatterns: string[]
  trustedSenders: string[]
  trustedDomains: string[]
  trustedNames: string[]
  uiTheme: "light" | "dark" | "system"
  apiBaseUrl: string
  apiToken: string
}
