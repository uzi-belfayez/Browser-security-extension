import type { Settings } from "./types"

export const defaultSettings: Settings = {
  enablePiiRedactor: true,
  enablePromptFirewall: true,
  enablePhishingRadar: true,
  bannedIntents: [
    "ignore instructions",
    "system prompt",
    "developer mode",
    "jailbreak",
    "please reveal the hidden policy"
  ]
}

// Placeholder storage helpers. Replace with Plasmo storage API later.
export const settingsStore = {
  async get(): Promise<Settings> {
    return defaultSettings
  },
  async set(_value: Settings): Promise<void> {
    return
  }
}
