import React, { useEffect, useState } from "react"
import { defaultSettings, settingsStore } from "../shared/storage"
import type { Settings } from "../shared/types"

export const Popup: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [rawTextPatterns, setRawTextPatterns] = useState("")
  const [rawRegexPatterns, setRawRegexPatterns] = useState("")

  useEffect(() => {
    settingsStore
      .get()
      .then((loaded) => {
        setSettings(loaded)
        setRawTextPatterns(loaded.customPatterns.join("\n"))
        setRawRegexPatterns(loaded.customRegexPatterns.join("\n"))
      })
      .catch(() => {
        setSettings(defaultSettings)
        setRawTextPatterns("")
        setRawRegexPatterns("")
      })
  }, [])

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
    link.download = "vamisec-patterns.json"
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

  return (
    <div style={{ padding: 12, fontFamily: "sans-serif" }}>
      <h3>VamiSec Settings</h3>
      <section style={{ marginTop: 12 }}>
        <h4>Custom Redaction Patterns</h4>
        <textarea
          rows={6}
          style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
          placeholder={`Plain text patterns (one per line or comma separated)\nExample:\nclient_secret\ninternal project`}
          value={rawTextPatterns}
          onChange={(event) => setRawTextPatterns(event.target.value)}
        />
        <div style={{ height: 8 }} />
        <textarea
          rows={6}
          style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
          placeholder={`Regex patterns (one per line or comma separated)\nExample:\nEMP-\\d{6}\nINV-\\d{4}-\\d{2}`}
          value={rawRegexPatterns}
          onChange={(event) => setRawRegexPatterns(event.target.value)}
        />
        <button
          type="button"
          style={{
            marginTop: 8,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #333",
            background: "#111",
            color: "#fff",
            fontSize: 12,
            cursor: "pointer"
          }}
          onClick={savePatterns}
        >
          Save patterns
        </button>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            type="button"
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #333",
              background: "#1f2937",
              color: "#fff",
              fontSize: 12,
              cursor: "pointer"
            }}
            onClick={onExport}
          >
            Export
          </button>
          <label
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #333",
              background: "#1f2937",
              color: "#fff",
              fontSize: 12,
              cursor: "pointer"
            }}
          >
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
        <p style={{ fontSize: 12, color: "#555" }}>
          These patterns will be replaced with {"<CUSTOM_#>"} before sending.
        </p>
      </section>
    </div>
  )
}

export default Popup
