export type RiskLevel = "green" | "yellow" | "red"

export interface PhishingRequest {
  sender_email: string
  sender_name?: string
  subject?: string
  body_text: string
}

export interface PhishingResponse {
  risk: RiskLevel
  score: number
  summary: string
  signals?: string[]
}

export interface Settings {
  enablePiiRedactor: boolean
  enablePromptFirewall: boolean
  enablePhishingRadar: boolean
  bannedIntents: string[]
}
