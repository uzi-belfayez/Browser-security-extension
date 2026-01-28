import React, { useEffect, useState } from "react"
import { defaultSettings, settingsStore } from "../shared/storage"
import type { Settings } from "../shared/types"

export const Popup: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [rawTextPatterns, setRawTextPatterns] = useState("")
  const [rawRegexPatterns, setRawRegexPatterns] = useState("")
  const [rawTrustedSenders, setRawTrustedSenders] = useState("")
  const [rawTrustedDomains, setRawTrustedDomains] = useState("")
  const [rawTrustedNames, setRawTrustedNames] = useState("")

  useEffect(() => {
    settingsStore
      .get()
      .then((loaded) => {
        setSettings(loaded)
        setRawTextPatterns(loaded.customPatterns.join("\n"))
        setRawRegexPatterns(loaded.customRegexPatterns.join("\n"))
        setRawTrustedSenders(loaded.trustedSenders.join("\n"))
        setRawTrustedDomains(loaded.trustedDomains.join("\n"))
        setRawTrustedNames(loaded.trustedNames.join("\n"))
      })
      .catch(() => {
        setSettings(defaultSettings)
        setRawTextPatterns("")
        setRawRegexPatterns("")
        setRawTrustedSenders("")
        setRawTrustedDomains("")
        setRawTrustedNames("")
      })
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return
    const prefersDark =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    const dark = settings.uiTheme === "dark" || (settings.uiTheme === "system" && prefersDark)
    const background = dark
      ? "radial-gradient(120% 90% at 0% 0%, #1e293b 0%, #0b1220 50%, #0a0f1a 100%)"
      : "radial-gradient(120% 90% at 0% 0%, #f8fafc 0%, #eef2f7 50%, #e2e8f0 100%)"
    document.documentElement.style.background = background
    document.body.style.background = background
    document.body.style.margin = "0"
  }, [settings.uiTheme])

  const updateSettings = (next: Settings) => {
    setSettings(next)
    settingsStore.set(next).catch(() => null)
  }

  const splitPatterns = (value: string) =>
    value
      .split(/[\n,;]+/)
      .map((line) => line.trim())
      .filter(Boolean)

  const savePatterns = () => {
    const patterns = splitPatterns(rawTextPatterns)
    const regexPatterns = splitPatterns(rawRegexPatterns)
    updateSettings({
      ...settings,
      customPatterns: patterns,
      customRegexPatterns: regexPatterns
    })
  }

  const saveTrustedLists = () => {
    updateSettings({
      ...settings,
      trustedSenders: splitPatterns(rawTrustedSenders),
      trustedDomains: splitPatterns(rawTrustedDomains),
      trustedNames: splitPatterns(rawTrustedNames)
    })
  }

  const importTrustedSenders = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const content = String(reader.result || "")
      const nextSenders = splitPatterns(content)
      updateSettings({
        ...settings,
        trustedSenders: nextSenders
      })
      setRawTrustedSenders(nextSenders.join("\n"))
    }
    reader.readAsText(file)
  }


  const onExport = () => {
    const payload = {
      customPatterns: settings.customPatterns,
      customRegexPatterns: settings.customRegexPatterns
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "vamiguard-patterns.json"
    link.click()
    URL.revokeObjectURL(url)
  }

  const onImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"))
        const next = {
          ...settings,
          customPatterns: Array.isArray(data.customPatterns) ? data.customPatterns : [],
          customRegexPatterns: Array.isArray(data.customRegexPatterns)
            ? data.customRegexPatterns
            : []
        }
        updateSettings(next)
        setRawTextPatterns(next.customPatterns.join("\n"))
        setRawRegexPatterns(next.customRegexPatterns.join("\n"))
      } catch {
        return
      }
    }
    reader.readAsText(file)
  }

  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  const isDark =
    settings.uiTheme === "dark" || (settings.uiTheme === "system" && prefersDark)
  const styles = {
    root: {
      width: 360,
      padding: 16,
      fontFamily: '"Space Grotesk", "Sora", "Segoe UI", sans-serif',
      color: isDark ? "#e2e8f0" : "#0f172a",
      background: isDark
        ? "radial-gradient(120% 90% at 0% 0%, #1e293b 0%, #0b1220 50%, #0a0f1a 100%)"
        : "radial-gradient(120% 90% at 0% 0%, #f8fafc 0%, #eef2f7 50%, #e2e8f0 100%)",
      borderRadius: 12
    },
    header: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 12,
      gap: 8
    },
    title: {
      fontSize: 18,
      margin: 0,
      letterSpacing: "0.4px"
    },
    badge: {
      fontSize: 10,
      padding: "4px 8px",
      borderRadius: 999,
      border: isDark ? "1px solid #334155" : "1px solid #cbd5f5",
      background: isDark ? "#111827" : "#e2e8f0",
      color: isDark ? "#cbd5f5" : "#0f172a",
      textTransform: "uppercase"
    },
    cardStack: {
      display: "flex",
      flexDirection: "column" as const,
      gap: 12
    },
    headerMeta: {
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "flex-end",
      gap: 6
    },
    card: {
      background: isDark
        ? "linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(11, 18, 32, 0.95) 100%)"
        : "linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)",
      border: isDark ? "1px solid rgba(148, 163, 184, 0.18)" : "1px solid #d8e1ec",
      borderRadius: 12,
      padding: 12,
      boxShadow: isDark
        ? "0 12px 24px rgba(2, 6, 23, 0.35)"
        : "0 12px 24px rgba(148, 163, 184, 0.35)"
    },
    sectionTitle: {
      margin: "0 0 8px 0",
      fontSize: 13,
      color: isDark ? "#e2e8f0" : "#0f172a",
      letterSpacing: "0.3px",
      textTransform: "uppercase"
    },
    label: {
      fontSize: 12,
      color: isDark ? "#cbd5f5" : "#475569",
      marginBottom: 6
    },
    textarea: {
      width: "100%",
      minHeight: 88,
      resize: "vertical" as const,
      borderRadius: 8,
      border: isDark ? "1px solid #293548" : "1px solid #cbd5f5",
      background: isDark ? "#0b1220" : "#ffffff",
      color: isDark ? "#e2e8f0" : "#0f172a",
      padding: "8px 10px",
      fontFamily: '"JetBrains Mono", "Fira Code", "SFMono-Regular", monospace',
      fontSize: 12,
      lineHeight: 1.4
    },
    input: {
      width: "100%",
      borderRadius: 8,
      border: isDark ? "1px solid #293548" : "1px solid #cbd5f5",
      background: isDark ? "#0b1220" : "#ffffff",
      color: isDark ? "#e2e8f0" : "#0f172a",
      padding: "8px 10px",
      fontFamily: '"JetBrains Mono", "Fira Code", "SFMono-Regular", monospace',
      fontSize: 12
    },
    buttonPrimary: {
      padding: "8px 12px",
      borderRadius: 8,
      border: isDark ? "1px solid #1f2a44" : "1px solid #38bdf8",
      background: "#0ea5e9",
      color: "#08101b",
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer"
    },
    buttonGhost: {
      padding: "8px 12px",
      borderRadius: 8,
      border: isDark ? "1px solid #293548" : "1px solid #cbd5f5",
      background: "transparent",
      color: isDark ? "#e2e8f0" : "#0f172a",
      fontSize: 12,
      cursor: "pointer"
    },
    helper: {
      fontSize: 11,
      color: isDark ? "#94a3b8" : "#64748b",
      marginTop: 8
    },
    row: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap" as const
    },
    toggleRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 10px",
      borderRadius: 8,
      border: isDark ? "1px solid #1f2a44" : "1px solid #d8e1ec",
      background: isDark ? "#0b1220" : "#f8fafc",
      marginBottom: 10
    },
    toggleLabel: {
      fontSize: 12,
      color: isDark ? "#e2e8f0" : "#0f172a"
    }
  }

  const switchStyles = {
    track: {
      width: 38,
      height: 20,
      borderRadius: 999,
      background: isDark ? "#1f2937" : "#cbd5f5",
      border: isDark ? "1px solid #334155" : "1px solid #94a3b8",
      position: "relative" as const,
      cursor: "pointer"
    },
    thumb: (on: boolean) => ({
      width: 16,
      height: 16,
      borderRadius: 999,
      background: on ? "#38bdf8" : "#e2e8f0",
      position: "absolute" as const,
      top: 1,
      left: on ? 19 : 1,
      transition: "left 160ms ease"
    })
  }

  const Switch = ({
    checked,
    onChange,
    label
  }: {
    checked: boolean
    onChange: (next: boolean) => void
    label: string
  }) => (
    <div style={styles.toggleRow}>
      <span style={styles.toggleLabel}>{label}</span>
      <div
        role="switch"
        aria-checked={checked}
        style={switchStyles.track}
        onClick={() => onChange(!checked)}
      >
        <div style={switchStyles.thumb(checked)} />
      </div>
    </div>
  )

  const ThemeSelector = () => {
    return (
      <div style={styles.toggleRow}>
        <span style={styles.toggleLabel} title="Theme" aria-label="Theme">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="2.8" />
            <path d="M7 1.8v1.6M7 10.6v1.6M1.8 7h1.6M10.6 7h1.6M3.4 3.4l1.2 1.2M9.4 9.4l1.2 1.2M3.4 10.6l1.2-1.2M9.4 4.6l1.2-1.2" />
            <path d="M18.5 6.2a5.6 5.6 0 1 0 0 11.2 6.8 6.8 0 0 1 0-11.2z" />
          </svg>
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {["system", "light", "dark"].map((value) => {
            const active = settings.uiTheme === value
            return (
              <button
                key={value}
                type="button"
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: active
                    ? "1px solid #38bdf8"
                    : isDark
                      ? "1px solid #334155"
                      : "1px solid #cbd5f5",
                  background: active
                    ? "#38bdf8"
                    : isDark
                      ? "transparent"
                      : "#ffffff",
                  color: active ? "#0b1220" : isDark ? "#e2e8f0" : "#0f172a",
                  fontSize: 11,
                  textTransform: "capitalize",
                  cursor: "pointer"
                }}
                onClick={() =>
                  updateSettings({
                    ...settings,
                    uiTheme: value as "system" | "light" | "dark"
                  })
                }
              >
                {value}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <h3 style={styles.title}>VamiGuard</h3>
        <div style={styles.headerMeta}>
          <ThemeSelector />
        </div>
      </div>

      <div style={styles.cardStack}>
        <div style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h4 style={styles.sectionTitle}>PII Redactor</h4>
            <span style={styles.badge}>PII Redactor</span>
          </div>
          <p
            style={{
              margin: "0 0 10px 0",
              fontSize: 12,
              color: isDark ? "#cbd5f5" : "#475569"
            }}
          >
            Redact sensitive data before sending prompts.
          </p>

          <Switch
            label="Enable PII Redactor"
            checked={settings.enablePiiRedactor}
            onChange={(next) =>
              updateSettings({
                ...settings,
                enablePiiRedactor: next
              })
            }
          />

          <div style={{ marginTop: 12 }}>
            <h4 style={styles.sectionTitle}>Custom Patterns</h4>
            <div style={styles.label}>Plain text patterns</div>
            <textarea
              rows={5}
              style={styles.textarea}
              placeholder={`client_secret\ninternal project`}
              value={rawTextPatterns}
              onChange={(event) => setRawTextPatterns(event.target.value)}
            />
            <div style={{ height: 8 }} />
            <div style={styles.label}>Regex patterns</div>
            <textarea
              rows={5}
              style={styles.textarea}
              placeholder={`EMP-\\d{6}\nINV-\\d{4}-\\d{2}`}
              value={rawRegexPatterns}
              onChange={(event) => setRawRegexPatterns(event.target.value)}
            />

            <div style={{ ...styles.row, marginTop: 10 }}>
              <button type="button" style={styles.buttonPrimary} onClick={savePatterns}>
                Save patterns
              </button>
              <button type="button" style={styles.buttonGhost} onClick={onExport}>
                Export
              </button>
              <label style={{ ...styles.buttonGhost, cursor: "pointer" }}>
                Import
                <input
                  type="file"
                  accept="application/json"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) onImport(file)
                    event.currentTarget.value = ""
                  }}
                />
              </label>
            </div>
            <p style={styles.helper}>
              Matches replace with {"<CUSTOM_#>"} and appear as chips in the prompt UI.
            </p>
          </div>
        </div>

        <div style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h4 style={styles.sectionTitle}>Phishing Radar</h4>
            <span style={styles.badge}>Phishing Radar</span>
          </div>
          <Switch
            label="Enable Gmail Radar"
            checked={settings.enablePhishingRadar}
            onChange={(next) =>
              updateSettings({
                ...settings,
                enablePhishingRadar: next
              })
            }
          />
          <Switch
            label="Enable Outlook Radar"
            checked={settings.enableOutlookRadar}
            onChange={(next) =>
              updateSettings({
                ...settings,
                enableOutlookRadar: next
              })
            }
          />
          <div style={{ marginTop: 12 }}>
            <h4 style={styles.sectionTitle}>Trusted List</h4>
            <div style={styles.label}>Trusted sender emails</div>
            <textarea
              rows={4}
              style={styles.textarea}
              placeholder={`ceo@company.com\nfinance@company.com`}
              value={rawTrustedSenders}
              onChange={(event) => setRawTrustedSenders(event.target.value)}
            />
            <div style={{ height: 8 }} />
            <div style={styles.label}>Trusted domains</div>
            <textarea
              rows={3}
              style={styles.textarea}
              placeholder={`company.com\npartner.org`}
              value={rawTrustedDomains}
              onChange={(event) => setRawTrustedDomains(event.target.value)}
            />
            <div style={{ height: 8 }} />
            <div style={styles.label}>Employee display names</div>
            <textarea
              rows={3}
              style={styles.textarea}
              placeholder={`Jane Doe\nJohn Smith`}
              value={rawTrustedNames}
              onChange={(event) => setRawTrustedNames(event.target.value)}
            />
            <div style={{ ...styles.row, marginTop: 10 }}>
              <button type="button" style={styles.buttonPrimary} onClick={saveTrustedLists}>
                Save trusted list
              </button>
              <label style={{ ...styles.buttonGhost, cursor: "pointer" }}>
                Import emails
                <input
                  type="file"
                  accept="text/plain,.csv"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) importTrustedSenders(file)
                    event.currentTarget.value = ""
                  }}
                />
              </label>
            </div>
            <p style={styles.helper}>
              Used for allowlist checks and display-name spoof detection.
            </p>
            <p style={styles.helper}>
              Import expects one email per line (CSV also supported).
            </p>
          </div>
          <p style={styles.helper}>
            Radar runs locally in the extension using rule-based signals.
          </p>
        </div>
      </div>
    </div>
  )
}

export default Popup
