import type { PlasmoCSConfig } from "plasmo"
import React from "react"
import { settingsStore } from "../shared/storage"
import type { PhishingRequest, PhishingResponse, RiskLevel } from "../shared/types"

export const config: PlasmoCSConfig = {
  matches: [
    "https://outlook.office.com/*",
    "https://outlook.office.com/owa/*",
    "https://outlook.office.com/mail/*"
  ],
  run_at: "document_end",
  all_frames: true
}

const WIDGET_ID = "vamisec-outlook-widget"
const STYLE_ID = "vamisec-outlook-widget-style"
const STORAGE_POS_KEY = "vamisec_outlook_widget_pos"
const STORAGE_HIDE_KEY = "vamisec_outlook_widget_hidden"

let radarEnabled = true
let trustedSenders: string[] = []
let trustedDomains: string[] = []
let trustedNames: string[] = []
let lastFingerprint = ""
let analyzeTimer: number | null = null
let lastResult: PhishingResponse | null = null
let inFlight = false
let lastMessageSignature = ""

type WidgetPos = { x: number; y: number }

const normalizeText = (value: string) =>
  value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()

const normalizeEmail = (value: string) => normalizeText(value).toLowerCase()

const extractDomain = (email: string) => {
  const parts = email.split("@")
  if (parts.length < 2) return ""
  return parts[parts.length - 1].toLowerCase()
}

const normalizeDomain = (value: string) => value.toLowerCase().replace(/^www\./, "")

const editDistance = (a: string, b: string) => {
  const aLen = a.length
  const bLen = b.length
  const matrix = Array.from({ length: aLen + 1 }, () => new Array(bLen + 1).fill(0))
  for (let i = 0; i <= aLen; i += 1) matrix[i][0] = i
  for (let j = 0; j <= bLen; j += 1) matrix[0][j] = j
  for (let i = 1; i <= aLen; i += 1) {
    for (let j = 1; j <= bLen; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[aLen][bLen]
}

const isLookalikeDomain = (domain: string, domains: string[]) => {
  if (!domain) return false
  const normalized = normalizeDomain(domain)
  return domains.some((trusted) => {
    const trustedNorm = normalizeDomain(trusted)
    if (!trustedNorm || trustedNorm === normalized) return false
    const distance = editDistance(normalized, trustedNorm)
    const maxDistance = Math.min(2, Math.floor(trustedNorm.length / 4) + 1)
    return distance <= maxDistance
  })
}

const getBodyContainer = () =>
  document.querySelector("div[data-test-id='mailMessageBodyContainer']") as HTMLElement | null

const getBodyText = () => {
  const container = getBodyContainer()
  if (!container) return ""
  const bodyEl =
    (container.querySelector("[role='document']") as HTMLElement | null) ||
    (container.querySelector("[id^='UniqueMessageBody_']") as HTMLElement | null) ||
    container
  const clone = bodyEl.cloneNode(true) as HTMLElement
  clone.querySelectorAll("blockquote,.gmail_quote").forEach((el) => el.remove())
  return normalizeText(clone.innerText || clone.textContent || "")
}

const getSenderRaw = () => {
  const el = document.querySelector("span.OZZZK") as HTMLElement | null
  if (el?.textContent) return normalizeText(el.textContent)
  const header = document.querySelector("[data-test-id='messageHeader']") as HTMLElement | null
  if (!header) return ""
  const spans = Array.from(header.querySelectorAll("span"))
  const emailSpan = spans.find((span) =>
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(span.textContent || "")
  )
  return normalizeText(emailSpan?.textContent || header.textContent || "")
}

const getSubject = () => {
  const el = document.querySelector("span.JdFsz") as HTMLElement | null
  if (el?.textContent) return normalizeText(el.textContent)
  const header = document.querySelector("[data-test-id='messageHeader']") as HTMLElement | null
  const heading = header?.querySelector("[role='heading']") as HTMLElement | null
  if (heading?.textContent) return normalizeText(heading.textContent)
  const fallback = document.querySelector("[role='heading']") as HTMLElement | null
  return normalizeText(fallback?.textContent || "")
}

const parseSender = (raw: string) => {
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  const email = emailMatch ? emailMatch[0].toLowerCase() : ""
  const name = raw.replace(/<[^>]+>/g, "").trim()
  return { email, name }
}

const getMessageSignature = () => {
  const senderRaw = getSenderRaw()
  const subject = getSubject()
  const location = typeof window !== "undefined" ? window.location.href : ""
  const signature = [senderRaw, subject, location].map(normalizeText).filter(Boolean).join("|")
  return signature
}

const extractPhishingPayload = (): { payload: PhishingRequest; fingerprint: string } | null => {
  const bodyText = getBodyText()
  if (!bodyText) return null
  const senderRaw = getSenderRaw()
  const subject = getSubject()
  const { email, name } = parseSender(senderRaw)

  const payload: PhishingRequest = {
    sender_email: normalizeEmail(email),
    sender_name: normalizeText(name),
    receiver_email: "",
    subject,
    body_text: bodyText.slice(0, 4000)
  }

  const fingerprint = [payload.sender_email, payload.subject, payload.body_text.slice(0, 120)]
    .filter(Boolean)
    .join("|")

  return { payload, fingerprint }
}

const keywordSignals: Array<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /\b(urgent|asap|immediately|action required|today)\b/i, label: "urgent-tone", weight: 0.15 },
  { pattern: /\b(wire|transfer|bank|payment|invoice|gift card|crypto)\b/i, label: "financial-request", weight: 0.2 },
  { pattern: /\b(verify|login|password|reset|account|credentials)\b/i, label: "credential-harvest", weight: 0.2 },
  { pattern: /\b(click|open|download|attachment|link)\b/i, label: "link-request", weight: 0.1 },
  { pattern: /\b(ceo|cfo|president|director)\b/i, label: "exec-impersonation", weight: 0.2 },
  { pattern: /\bconfidential\b|\bdo not share\b/i, label: "secrecy-pressure", weight: 0.1 }
]

const getHostDocument = () => {
  try {
    if (window.top && window.top.document) {
      return window.top.document
    }
  } catch {
    // ignore
  }
  return document
}

const analyzeLocally = (payload: PhishingRequest): PhishingResponse => {
  const text = `${payload.subject || ""} ${payload.body_text || ""}`.toLowerCase()
  const senderEmail = normalizeEmail(payload.sender_email || "")
  const senderDomain = extractDomain(senderEmail)
  const senderName = normalizeText(payload.sender_name || "").toLowerCase()

  const normalizedSenders = trustedSenders.map(normalizeEmail)
  const normalizedDomains = trustedDomains.map(normalizeDomain)
  const normalizedNames = trustedNames.map((name) => normalizeText(name).toLowerCase())

  const isTrustedSender = senderEmail ? normalizedSenders.includes(senderEmail) : false
  const isTrustedDomain = senderDomain ? normalizedDomains.includes(normalizeDomain(senderDomain)) : false

  const signals: string[] = []
  let score = 0.1

  keywordSignals.forEach(({ pattern, label, weight }) => {
    if (pattern.test(text)) {
      signals.push(label)
      score += weight
    }
  })

  const lookalike = senderDomain && isLookalikeDomain(senderDomain, normalizedDomains)
  if (lookalike) {
    signals.push("lookalike-domain")
    score += 0.25
  }

  const nameSpoof =
    senderName &&
    normalizedNames.some((name) => name && senderName.includes(name)) &&
    !isTrustedSender &&
    !isTrustedDomain
  if (nameSpoof) {
    signals.push("display-name-spoof")
    score += 0.25
  }

  if (isTrustedSender) {
    score -= 0.2
  } else if (isTrustedDomain) {
    score -= 0.1
  }

  score = Math.min(0.95, Math.max(0, score))

  let summary = "No obvious phishing indicators detected."
  if (signals.length) {
    summary = `Signals detected: ${signals.slice(0, 5).join(", ")}.`
  } else if (isTrustedSender || isTrustedDomain) {
    summary = "Sender matches a trusted list."
  }

  let risk: RiskLevel = "green"
  if (score >= 0.7) risk = "red"
  else if (score >= 0.35) risk = "yellow"

  return {
    risk,
    score,
    summary,
    signals,
    checks: [
      {
        label: "Trusted sender",
        status: isTrustedSender ? "pass" : "fail",
        detail: isTrustedSender ? senderEmail : "Not on list"
      },
      {
        label: "Trusted domain",
        status: isTrustedDomain ? "pass" : "fail",
        detail: isTrustedDomain ? senderDomain : "Not on list"
      },
      {
        label: "Look-alike domain",
        status: lookalike ? "fail" : "pass",
        detail: lookalike ? senderDomain : "No similarity risk"
      },
      {
        label: "Display-name spoof",
        status: nameSpoof ? "fail" : "pass",
        detail: nameSpoof ? senderName : "No spoof detected"
      },
      {
        label: "Content signals",
        status: signals.length ? "info" : "pass",
        detail: signals.length ? signals.slice(0, 5).join(", ") : "No suspicious signals"
      }
    ]
  }
}

const ensureStyles = () => {
  const doc = getHostDocument()
  if (!doc || doc.getElementById(STYLE_ID)) return
  const style = doc.createElement("style")
  style.id = STYLE_ID
  style.textContent = `
    #${WIDGET_ID} {
      position: fixed;
      top: 24px;
      right: 24px;
      width: 320px;
      z-index: 2147483647;
      background: rgba(15, 23, 42, 0.92);
      color: #e2e8f0;
      border: 1px solid rgba(148, 163, 184, 0.26);
      border-radius: 12px;
      box-shadow: 0 16px 36px rgba(2, 6, 23, 0.35);
      font-family: "Space Grotesk", "Sora", "Segoe UI", sans-serif;
      font-size: 12px;
      overflow: hidden;
    }
    #${WIDGET_ID} .vamisec-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      cursor: move;
      background: rgba(15, 23, 42, 0.95);
    }
    #${WIDGET_ID} .vamisec-title {
      font-weight: 600;
      letter-spacing: 0.3px;
    }
    #${WIDGET_ID} .vamisec-actions {
      display: flex;
      gap: 6px;
    }
    #${WIDGET_ID} button {
      border: 1px solid rgba(148, 163, 184, 0.35);
      background: rgba(15, 23, 42, 0.8);
      color: inherit;
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
    }
    #${WIDGET_ID} .vamisec-body {
      padding: 10px 12px 12px 12px;
      display: grid;
      gap: 8px;
    }
    #${WIDGET_ID} .vamisec-score {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
    }
    #${WIDGET_ID} .vamisec-chip {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 999px;
      font-size: 10px;
      border: 1px solid rgba(148, 163, 184, 0.3);
      background: rgba(15, 23, 42, 0.5);
    }
    #${WIDGET_ID} .vamisec-summary {
      font-size: 12px;
      font-weight: 600;
    }
    #${WIDGET_ID} .vamisec-muted {
      color: #94a3b8;
    }
  `
  doc.head.appendChild(style)
}

const getRiskColors = (risk: RiskLevel) => {
  switch (risk) {
    case "red":
      return { bg: "rgba(239, 68, 68, 0.2)", text: "#fecaca", border: "rgba(239, 68, 68, 0.5)" }
    case "yellow":
      return { bg: "rgba(251, 191, 36, 0.2)", text: "#fde68a", border: "rgba(251, 191, 36, 0.5)" }
    default:
      return { bg: "rgba(34, 197, 94, 0.2)", text: "#bbf7d0", border: "rgba(34, 197, 94, 0.5)" }
  }
}

const clearChildren = (el: HTMLElement) => {
  while (el.firstChild) {
    el.removeChild(el.firstChild)
  }
}

const ensureWidget = async () => {
  const doc = getHostDocument()
  if (!doc || doc.getElementById(WIDGET_ID)) return
  const widget = doc.createElement("div")
  widget.id = WIDGET_ID

  const header = doc.createElement("div")
  header.className = "vamisec-header"

  const title = doc.createElement("div")
  title.className = "vamisec-title"
  title.textContent = "VamiGuard Phishing Radar"

  const actions = doc.createElement("div")
  actions.className = "vamisec-actions"

  const hideButton = doc.createElement("button")
  hideButton.type = "button"
  hideButton.setAttribute("data-action", "hide")
  hideButton.textContent = "Hide"

  actions.appendChild(hideButton)
  header.appendChild(title)
  header.appendChild(actions)

  const body = doc.createElement("div")
  body.className = "vamisec-body"
  const status = doc.createElement("div")
  status.className = "vamisec-status vamisec-muted"
  status.textContent = "Waiting for a message…"
  body.appendChild(status)

  widget.appendChild(header)
  widget.appendChild(body)

  doc.documentElement.appendChild(widget)

  const stored = await chrome.storage.local.get([STORAGE_POS_KEY, STORAGE_HIDE_KEY])
  const pos = stored?.[STORAGE_POS_KEY] as WidgetPos | undefined
  const hidden = stored?.[STORAGE_HIDE_KEY] === true
  if (hidden) {
    widget.style.display = "none"
  }
  if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
    widget.style.right = "auto"
    widget.style.bottom = "auto"
    widget.style.left = `${pos.x}px`
    widget.style.top = `${pos.y}px`
  }

  const dragHeader = widget.querySelector(".vamisec-header") as HTMLElement | null
  if (dragHeader) {
    let dragging = false
    let startX = 0
    let startY = 0
    let originX = 0
    let originY = 0
    dragHeader.addEventListener("mousedown", (event) => {
      dragging = true
      startX = event.clientX
      startY = event.clientY
      const rect = widget.getBoundingClientRect()
      originX = rect.left
      originY = rect.top
      widget.style.right = "auto"
      widget.style.bottom = "auto"
      event.preventDefault()
    })
    window.addEventListener("mousemove", (event) => {
      if (!dragging) return
      const nextX = Math.max(8, originX + (event.clientX - startX))
      const nextY = Math.max(8, originY + (event.clientY - startY))
      widget.style.left = `${nextX}px`
      widget.style.top = `${nextY}px`
    })
    window.addEventListener("mouseup", async () => {
      if (!dragging) return
      dragging = false
      const rect = widget.getBoundingClientRect()
      try {
        await chrome.storage.local.set({
          [STORAGE_POS_KEY]: { x: Math.round(rect.left), y: Math.round(rect.top) }
        })
      } catch {
        // ignore
      }
    })
  }

  widget.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement | null
    const action = target?.getAttribute("data-action")
    if (!action) return
    if (action === "hide") {
      widget.style.display = "none"
      try {
        await chrome.storage.local.set({ [STORAGE_HIDE_KEY]: true })
      } catch {
        // ignore
      }
    }
  })
}

const renderWidget = (state: { status: "idle" | "loading" | "error" | "done"; data?: PhishingResponse }) => {
  const doc = getHostDocument()
  if (!doc) return
  const widget = doc.getElementById(WIDGET_ID)
  if (!widget) return
  const body = widget.querySelector(".vamisec-body") as HTMLElement | null
  if (!body) return
  clearChildren(body)

  if (!radarEnabled) {
    const status = doc.createElement("div")
    status.className = "vamisec-status vamisec-muted"
    status.textContent = "Phishing Radar is disabled for Outlook."
    body.appendChild(status)
    return
  }

  if (state.status === "loading") {
    const status = doc.createElement("div")
    status.className = "vamisec-status"
    status.textContent = "Analyzing…"
    body.appendChild(status)
    return
  }

  if (state.status === "error") {
    const status = doc.createElement("div")
    status.className = "vamisec-status"
    status.textContent = "Analysis failed."
    body.appendChild(status)
    return
  }

  if (state.status === "done" && state.data) {
    const colors = getRiskColors(state.data.risk)
    const score = Math.round((state.data.score > 1 ? state.data.score : state.data.score * 100) || 0)
    const signals = (state.data.signals || []).slice(0, 5)
    const scoreRow = doc.createElement("div")
    scoreRow.className = "vamisec-score"

    const scoreChip = doc.createElement("span")
    scoreChip.className = "vamisec-chip"
    scoreChip.style.background = colors.bg
    scoreChip.style.color = colors.text
    scoreChip.style.borderColor = colors.border
    scoreChip.textContent = `${state.data.risk.toUpperCase()} ${score}`

    const scoreLabel = doc.createElement("span")
    scoreLabel.className = "vamisec-muted"
    scoreLabel.textContent = "Risk score"

    scoreRow.appendChild(scoreChip)
    scoreRow.appendChild(scoreLabel)

    const summary = doc.createElement("div")
    summary.className = "vamisec-summary"
    summary.textContent = state.data.summary || "No summary."

    body.appendChild(scoreRow)
    body.appendChild(summary)

    if (signals.length) {
      const signalRow = doc.createElement("div")
      signals.forEach((signal) => {
        const chip = doc.createElement("span")
        chip.className = "vamisec-chip"
        chip.textContent = signal
        signalRow.appendChild(chip)
        signalRow.appendChild(doc.createTextNode(" "))
      })
      body.appendChild(signalRow)
    } else {
      const muted = doc.createElement("div")
      muted.className = "vamisec-muted"
      muted.textContent = "No suspicious signals."
      body.appendChild(muted)
    }
    return
  }

  const status = doc.createElement("div")
  status.className = "vamisec-status vamisec-muted"
  status.textContent = "Waiting for a message…"
  body.appendChild(status)
}

const loadSettings = async () => {
  try {
    const settings = await settingsStore.get()
    radarEnabled = settings.enablePhishingRadar !== false && settings.enableOutlookRadar !== false
    trustedSenders = Array.isArray(settings.trustedSenders) ? settings.trustedSenders : []
    trustedDomains = Array.isArray(settings.trustedDomains) ? settings.trustedDomains : []
    trustedNames = Array.isArray(settings.trustedNames) ? settings.trustedNames : []
  } catch {
    radarEnabled = true
    trustedSenders = []
    trustedDomains = []
    trustedNames = []
  }
}

const analyzeMessage = async (force = false) => {
  const extracted = extractPhishingPayload()
  if (!extracted || !radarEnabled) {
    if (radarEnabled) {
      renderWidget({ status: "idle" })
    }
    return
  }
  if (extracted.fingerprint === lastFingerprint && lastResult && !force) {
    renderWidget({ status: "done", data: lastResult })
    return
  }
  if (inFlight) return

  lastFingerprint = extracted.fingerprint
  renderWidget({ status: "loading" })
  inFlight = true
  try {
    const result = analyzeLocally(extracted.payload)
    lastResult = result
    renderWidget({ status: "done", data: result })
  } catch {
    renderWidget({ status: "error" })
  } finally {
    inFlight = false
  }
}

const scheduleAnalysis = (force = false) => {
  const signature = getMessageSignature()
  if (signature && signature !== lastMessageSignature) {
    lastMessageSignature = signature
    lastFingerprint = ""
    lastResult = null
    renderWidget({ status: "loading" })
  }
  if (analyzeTimer) {
    window.clearTimeout(analyzeTimer)
  }
  analyzeTimer = window.setTimeout(() => {
    analyzeMessage(force)
  }, 600)
}

const init = () => {
  ensureStyles()
  ensureWidget().then(() => {
    renderWidget({ status: "idle" })
  })
  Promise.all([loadSettings()]).then(() => scheduleAnalysis())

  const observer = new MutationObserver(() => {
    scheduleAnalysis()
  })
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true })
  }

  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return
      if (changes.settings) {
        const next = changes.settings.newValue
        if (!next) return
        radarEnabled = next.enablePhishingRadar !== false && next.enableOutlookRadar !== false
        trustedSenders = Array.isArray(next.trustedSenders) ? next.trustedSenders : []
        trustedDomains = Array.isArray(next.trustedDomains) ? next.trustedDomains : []
        trustedNames = Array.isArray(next.trustedNames) ? next.trustedNames : []
      }
      scheduleAnalysis(true)
    })
  }
}

init()

export const OutlookContent: React.FC = () => null

export default OutlookContent
