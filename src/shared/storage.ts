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
  ],
  customPatterns: [],
  customRegexPatterns: []
}

export const settingsStore = {
  async get(): Promise<Settings> {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const data = await chrome.storage.local.get(["settings"])
      if (data?.settings) {
        return { ...defaultSettings, ...data.settings }
      }
    }
    return defaultSettings
  },
  async set(_value: Settings): Promise<void> {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ settings: _value })
    }
  }
}
