import type { Settings } from "./types"

export const defaultSettings: Settings = {
  enablePiiRedactor: true,
  enablePhishingRadar: true,
  enableOutlookRadar: true,
  redactEmails: true,
  redactPhones: true,
  redactCreditCards: true,
  redactPasswords: true,
  redactTokens: true,
  redactCustomPatterns: true,
  customPatterns: [],
  customRegexPatterns: [],
  trustedSenders: [],
  trustedDomains: [],
  trustedNames: [],
  uiTheme: "system",
  apiBaseUrl: "",
  apiToken: ""
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
