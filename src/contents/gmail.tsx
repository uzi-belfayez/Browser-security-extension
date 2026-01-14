import type { PlasmoCSConfig } from "plasmo"
import React from "react"
import { settingsStore } from "../shared/storage"
import type { PhishingRequest, PhishingResponse, RiskLevel } from "../shared/types"

export const config: PlasmoCSConfig = {
  matches: ["https://mail.google.com/*"]
}

const BANNER_ID = "vamisec-phish-banner"
const STYLE_ID = "vamisec-phish-style"
const ANALYZE_ACTION = "PHISHING_ANALYZE"

let lastFingerprint = ""
let radarEnabled = true
let analyzeTimer: number | null = null
let lastResult: PhishingResponse | null = null
let inFlight = false
let queuedFingerprint = ""
const dismissedFingerprints = new Set<string>()

const normalizeText = (value: string) =>
  value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()

const stripQuotedText = (node: HTMLElement) => {
  const clone = node.cloneNode(true) as HTMLElement
  clone.querySelectorAll(".gmail_quote, blockquote").forEach((el) => el.remove())
  return normalizeText(clone.innerText || clone.textContent || "")
}

const getEmailValue = (el: Element | null) => {
  if (!el) return ""
  return (
    el.getAttribute("email") ||
    el.getAttribute("data-hovercard-id") ||
    normalizeText(el.textContent || "")
  )
}

const findActiveMessage = () => {
  const main = document.querySelector("div[role='main']")
  if (!main) return null
  const containers = Array.from(main.querySelectorAll("div.gs"))
  for (let i = containers.length - 1; i >= 0; i -= 1) {
    const el = containers[i]
    if (el.querySelector("div.a3s") && el.getClientRects().length) {
      return el
    }
  }
  return null
}

const extractPhishingPayload = (): { payload: PhishingRequest; fingerprint: string } | null => {
  const message = findActiveMessage()
  if (!message) return null

  const bodyEl = message.querySelector("div.a3s") as HTMLElement | null
  if (!bodyEl) return null

  const senderEl = message.querySelector("span.gD")
  const receiverEl = message.querySelector("span.g2")
  const subjectEl = document.querySelector("h2.hP")

  const bodyText = stripQuotedText(bodyEl)
  if (!bodyText) return null

  const payload: PhishingRequest = {
    sender_email: getEmailValue(senderEl),
    sender_name: normalizeText(senderEl?.textContent || ""),
    receiver_email: getEmailValue(receiverEl),
    subject: normalizeText(subjectEl?.textContent || ""),
    body_text: bodyText.slice(0, 4000)
  }

  const fingerprint = [
    payload.sender_email,
    payload.receiver_email,
    payload.subject,
    payload.body_text.slice(0, 120)
  ]
    .filter(Boolean)
    .join("|")

  return { payload, fingerprint }
}

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = `
    #${BANNER_ID} {
      margin: 8px 0 12px 0;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(15, 23, 42, 0.12);
      font-family: "Space Grotesk", "Sora", "Segoe UI", sans-serif;
      font-size: 12px;
      line-height: 1.4;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    #${BANNER_ID} .vamisec-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    #${BANNER_ID} .vamisec-title {
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    #${BANNER_ID} .vamisec-score {
      font-weight: 600;
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid rgba(15, 23, 42, 0.2);
    }
    #${BANNER_ID} .vamisec-signals {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    #${BANNER_ID} .vamisec-chip {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid rgba(15, 23, 42, 0.2);
      background: rgba(15, 23, 42, 0.05);
    }
    #${BANNER_ID} .vamisec-dismiss {
      border: none;
      background: transparent;
      color: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 6px;
    }
    #${BANNER_ID} .vamisec-dismiss:hover {
      background: rgba(15, 23, 42, 0.08);
    }
  `
  document.head.appendChild(style)
}

const ensureBanner = () => {
  const message = findActiveMessage()
  if (!message) return null
  let banner = message.querySelector(`#${BANNER_ID}`) as HTMLDivElement | null
  if (!banner) {
    banner = document.createElement("div")
    banner.id = BANNER_ID
    message.insertBefore(banner, message.firstChild)
  }
  return banner
}

const riskColors: Record<RiskLevel, { bg: string; text: string; border: string }> = {
  green: { bg: "#ecfdf3", text: "#166534", border: "#86efac" },
  yellow: { bg: "#fff7ed", text: "#92400e", border: "#fdba74" },
  red: { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" }
}

const renderBanner = (state: {
  status: "idle" | "loading" | "error" | "done"
  message?: string
  data?: PhishingResponse
}) => {
  const banner = ensureBanner()
  if (!banner) return

  if (!radarEnabled) {
    banner.remove()
    return
  }

  if (state.status === "loading") {
    banner.style.background = "#f8fafc"
    banner.style.color = "#0f172a"
    banner.innerHTML = `<div class="vamisec-row"><div class="vamisec-title">VamiSec Phishing Radar</div><div class="vamisec-score">Analyzing...</div></div>`
    return
  }

  if (state.status === "error") {
    banner.style.background = "#f8fafc"
    banner.style.color = "#0f172a"
    banner.innerHTML = `<div class="vamisec-row"><div class="vamisec-title">VamiSec Phishing Radar</div><div class="vamisec-score">Error</div></div><div>${state.message || "Analysis failed."}</div>`
    return
  }

  if (state.status === "done" && state.data) {
    const { bg, text, border } = riskColors[state.data.risk] || riskColors.green
    banner.style.background = bg
    banner.style.color = text
    banner.style.border = `1px solid ${border}`
    let scoreText = "Score --"
    if (typeof state.data.score === "number") {
      const scaled = state.data.score > 1 ? state.data.score : state.data.score * 100
      scoreText = `Score ${Math.round(scaled)}`
    }
    const summary = state.data.summary ? state.data.summary.slice(0, 220) : ""
    const signals = (state.data.signals || []).slice(0, 5)

    banner.innerHTML = `
      <div class="vamisec-row">
        <div class="vamisec-title">VamiSec Phishing Radar</div>
        <div class="vamisec-score">${scoreText}</div>
        <button type="button" class="vamisec-dismiss" data-action="dismiss">Dismiss</button>
      </div>
      <div>${summary}</div>
      ${
        signals.length
          ? `<div class="vamisec-signals">${signals
              .map((signal) => `<span class="vamisec-chip">${signal}</span>`)
              .join("")}</div>`
          : ""
      }
    `
    const dismissButton = banner.querySelector(
      "button[data-action='dismiss']"
    ) as HTMLButtonElement | null
    if (dismissButton) {
      dismissButton.onclick = () => {
        if (lastFingerprint) {
          dismissedFingerprints.add(lastFingerprint)
        }
        banner.remove()
      }
    }
  }
}

const sendForAnalysis = (payload: PhishingRequest) =>
  new Promise<PhishingResponse>((resolve, reject) => {
    chrome.runtime.sendMessage({ type: ANALYZE_ACTION, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Analysis failed"))
        return
      }
      resolve(response.data as PhishingResponse)
    })
  })

const prepareForNewMessage = () => {
  const extracted = extractPhishingPayload()
  if (!extracted || !radarEnabled) return
  if (dismissedFingerprints.has(extracted.fingerprint)) {
    const banner = ensureBanner()
    if (banner) banner.remove()
    return
  }
  if (extracted.fingerprint !== lastFingerprint) {
    lastFingerprint = extracted.fingerprint
    queuedFingerprint = extracted.fingerprint
    lastResult = null
    renderBanner({ status: "loading" })
  }
}

const analyzeMessage = async () => {
  const extracted = extractPhishingPayload()
  if (!extracted || !radarEnabled) return
  if (dismissedFingerprints.has(extracted.fingerprint)) {
    const banner = ensureBanner()
    if (banner) banner.remove()
    return
  }
  if (extracted.fingerprint === lastFingerprint && lastResult) {
    renderBanner({ status: "done", data: lastResult })
    return
  }
  if (inFlight) {
    queuedFingerprint = extracted.fingerprint
    return
  }

  lastFingerprint = extracted.fingerprint
  const requestFingerprint = extracted.fingerprint
  renderBanner({ status: "loading" })
  inFlight = true
  try {
    const result = await sendForAnalysis(extracted.payload)
    if (requestFingerprint !== lastFingerprint) {
      return
    }
    lastResult = result
    renderBanner({ status: "done", data: result })
  } catch (error) {
    if (requestFingerprint !== lastFingerprint) {
      return
    }
    renderBanner({
      status: "error",
      message: error instanceof Error ? error.message : "Analysis failed"
    })
  } finally {
    inFlight = false
    if (queuedFingerprint && queuedFingerprint !== lastFingerprint) {
      queuedFingerprint = ""
      scheduleAnalysis()
    }
  }
}

const scheduleAnalysis = () => {
  prepareForNewMessage()
  if (analyzeTimer) {
    window.clearTimeout(analyzeTimer)
  }
  analyzeTimer = window.setTimeout(() => {
    analyzeMessage()
  }, 600)
}

const loadSettings = async () => {
  try {
    const settings = await settingsStore.get()
    radarEnabled = settings.enablePhishingRadar !== false
  } catch {
    radarEnabled = true
  }
}

const init = () => {
  ensureStyles()
  loadSettings().then(() => scheduleAnalysis())
  const observer = new MutationObserver(() => {
    ensureStyles()
    scheduleAnalysis()
  })
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true })
  }

  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.settings) return
      const next = changes.settings.newValue
      if (!next) return
      radarEnabled = next.enablePhishingRadar !== false
      scheduleAnalysis()
    })
  }
}

init()

export const GmailContent: React.FC = () => null

export default GmailContent
