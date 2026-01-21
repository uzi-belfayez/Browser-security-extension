import type { PlasmoCSConfig } from "plasmo"
import React from "react"
import { settingsStore } from "../shared/storage"
import type { PhishingRequest, PhishingResponse, RiskLevel } from "../shared/types"

export const config: PlasmoCSConfig = {
  matches: ["https://mail.google.com/*"]
}

const BANNER_ID = "vamisec-phish-banner"
const STYLE_ID = "vamisec-phish-style"
const HEADER_RESULT_KEY = "vamisec_header_result"
let lastFingerprint = ""
let radarEnabled = true
let analyzeTimer: number | null = null
let lastResult: PhishingResponse | null = null
let inFlight = false
let queuedFingerprint = ""
const dismissedFingerprints = new Set<string>()
let trustedSenders: string[] = []
let trustedDomains: string[] = []
let trustedNames: string[] = []
let headerResult: HeaderResult | null = null
let cachedIk = ""
let currentMessageKey = ""
let lastHeaderRequestKey = ""
let currentLegacyMessageId = ""

type HeaderResult = {
  messageKey: string
  timestamp: number
  spf?: string
  dkim?: string
  dmarc?: string
  legacyKey?: string
}

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

const isShowOriginalPage = () => {
  if (typeof window === "undefined") return false
  const url = new URL(window.location.href)
  return url.searchParams.get("view") === "om"
}

const getThreadIdFromUrl = () => {
  if (typeof window === "undefined") return ""
  const url = new URL(window.location.href)
  const queryThread = url.searchParams.get("th")
  if (queryThread) return queryThread
  const hash = window.location.hash || ""
  if (!hash) return ""
  const cleaned = hash.split("?")[0]
  const parts = cleaned.split("/")
  return parts.length ? parts[parts.length - 1] : ""
}

const getPermMsgIdFromUrl = () => {
  if (typeof window === "undefined") return ""
  const url = new URL(window.location.href)
  return url.searchParams.get("permmsgid") || ""
}

const getLegacyKeyFromUrl = () => {
  if (typeof window === "undefined") return ""
  const url = new URL(window.location.href)
  return url.searchParams.get("vmsKey") || ""
}

const toPermMsgId = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (trimmed.startsWith("msg-f:")) return trimmed
  if (/^[0-9]+$/.test(trimmed)) return `msg-f:${trimmed}`
  if (/^[0-9a-f]+$/i.test(trimmed)) {
    try {
      return `msg-f:${BigInt(`0x${trimmed}`).toString(10)}`
    } catch {
      return ""
    }
  }
  return ""
}

const normalizeMessageKey = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (trimmed.startsWith("msg-f:")) return trimmed
  const perm = toPermMsgId(trimmed)
  return perm || trimmed
}

const getMessageKeyFromUrl = (value: string) => {
  try {
    const url = new URL(value, window.location.origin)
    const perm = url.searchParams.get("permmsgid") || ""
    const thread = url.searchParams.get("th") || ""
    return normalizeMessageKey(perm || thread)
  } catch {
    return ""
  }
}

const getThreadIdFromMessage = (message: Element | null) => {
  if (!message) return ""
  let current: Element | null = message
  while (current) {
    const value =
      current.getAttribute("data-legacy-message-id") ||
      current.getAttribute("data-legacy-thread-id") ||
      current.getAttribute("data-thread-id")
    if (value) return value
    current = current.parentElement
  }
  return ""
}

const getCurrentMessageKey = () => {
  if (currentMessageKey) return currentMessageKey
  const fromActive = getThreadIdFromMessage(findActiveMessage())
  const normalizedActive = normalizeMessageKey(fromActive)
  if (normalizedActive) return normalizedActive
  const fromUrlPerm = getPermMsgIdFromUrl()
  if (fromUrlPerm) return fromUrlPerm
  const fromUrl = getThreadIdFromUrl()
  if (fromUrl) return fromUrl
  const fallback = document.querySelector(
    "[data-legacy-message-id],[data-legacy-thread-id],[data-thread-id]"
  ) as
    | Element
    | null
  const fallbackValue = getThreadIdFromMessage(fallback)
  return normalizeMessageKey(fallbackValue)
}

const getIkFromDom = () => {
  if (typeof document === "undefined") return ""
  const link = document.querySelector("[href*='ik=']") as HTMLAnchorElement | null
  if (link?.href) {
    try {
      const url = new URL(link.href, window.location.origin)
      return url.searchParams.get("ik") || ""
    } catch {
      return ""
    }
  }
  const html = document.documentElement?.innerHTML || ""
  const inlineMatch =
    html.match(/["']ik["']\s*[:=]\s*["']([a-z0-9]{8,12})["']/i) ||
    html.match(/["']IK["']\s*[:=]\s*["']([a-z0-9]{8,12})["']/i) ||
    html.match(/["']IK["']\s*[:=]\s*["']([a-z0-9]+)["']/i) ||
    html.match(/[?&]ik=([a-z0-9]+)/i)
  if (inlineMatch) return inlineMatch[1]
  return ""
}

const requestIkFromPage = () =>
  new Promise<string>((resolve) => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      resolve("")
      return
    }
    const channel = "vamisec-ik"
    let settled = false
    const finish = (value: string) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data as { type?: string; ik?: string } | null
      if (!data || data.type !== channel) return
      window.removeEventListener("message", onMessage)
      finish(typeof data.ik === "string" ? data.ik : "")
    }
    window.addEventListener("message", onMessage)
    const script = document.createElement("script")
    script.src = chrome.runtime.getURL("assets/gmail-ik.js")
    script.async = true
    script.onload = () => {
      script.remove()
    }
    script.onerror = () => {
      script.remove()
      finish("")
    }
    document.documentElement.appendChild(script)
    window.setTimeout(() => {
      window.removeEventListener("message", onMessage)
      finish("")
    }, 1200)
  })

const getIkFromPage = async () => {
  if (cachedIk) return cachedIk
  const fromDom = getIkFromDom()
  if (fromDom) {
    cachedIk = fromDom
    return fromDom
  }
  const fromPage = await requestIkFromPage()
  if (fromPage) {
    cachedIk = fromPage
  }
  return cachedIk
}

const buildShowOriginalUrl = async (): Promise<{
  url: string
  messageKey: string
  legacyKey: string
}> => {
  if (typeof document !== "undefined") {
    const existing = document.querySelector(
      "a[href*='view=om'][href*='permmsgid='], a[href*='view=om'][href*='th=']"
    ) as HTMLAnchorElement | null
    if (existing?.href) {
      try {
        const url = new URL(existing.href)
        if (currentLegacyMessageId) {
          url.searchParams.set("vmsKey", currentLegacyMessageId)
        }
        return { url: url.toString(), messageKey: getMessageKeyFromUrl(existing.href), legacyKey: currentLegacyMessageId }
      } catch {
        return { url: existing.href, messageKey: getMessageKeyFromUrl(existing.href), legacyKey: currentLegacyMessageId }
      }
    }
  }
  const messageKey = getCurrentMessageKey()
  if (!messageKey) return { url: "", messageKey: "", legacyKey: "" }
  const ik = await getIkFromPage()
  if (!ik) return { url: "", messageKey: "", legacyKey: "" }
  const origin = typeof window !== "undefined" ? window.location.origin : "https://mail.google.com"
  const path = typeof window !== "undefined" ? window.location.pathname : "/mail/u/0/"
  const accountBase = path.includes("/mail/u/")
    ? path.slice(0, path.indexOf("/mail/u/") + "/mail/u/".length) +
      path.split("/mail/u/")[1].split("/")[0] +
      "/"
    : "/mail/u/0/"
  const parts = ["ui=2", "view=om"]
  if (messageKey.startsWith("msg-f:")) {
    parts.push(`permmsgid=${messageKey}`)
  } else {
    parts.push(`th=${messageKey}`)
  }
  if (ik && /^[a-z0-9]+$/i.test(ik)) {
    parts.push(`ik=${ik}`)
  }
  if (currentLegacyMessageId) {
    parts.push(`vmsKey=${currentLegacyMessageId}`)
  }
  return { url: `${origin}${accountBase}?${parts.join("&")}`, messageKey, legacyKey: currentLegacyMessageId }
}

const parseHeaderResult = (text: string): HeaderResult | null => {
  const lower = text.toLowerCase()
  const authMatch = lower.match(/authentication-results:[\s\S]*?(?:\n\S|$)/i)
  const authText = authMatch ? authMatch[0] : ""
  const spf =
    authText.match(/spf=(pass|fail|softfail|neutral|none|temperror|permerror)/i)?.[1] ||
    lower.match(/received-spf:\s*(pass|fail|softfail|neutral|none|temperror|permerror)/i)?.[1] ||
    ""
  const dkim =
    authText.match(/dkim=(pass|fail|neutral|none|temperror|permerror)/i)?.[1] || ""
  const dmarc =
    authText.match(/dmarc=(pass|fail|bestguesspass|none|temperror|permerror)/i)?.[1] ||
    ""
  const messageKey = normalizeMessageKey(getPermMsgIdFromUrl() || getThreadIdFromUrl())
  const legacyKey = getLegacyKeyFromUrl()
  if (!messageKey) return null
  return {
    messageKey,
    timestamp: Date.now(),
    spf: spf ? spf.toLowerCase() : "unknown",
    dkim: dkim ? dkim.toLowerCase() : "unknown",
    dmarc: dmarc ? dmarc.toLowerCase() : "unknown",
    legacyKey: legacyKey || undefined
  }
}

const handleShowOriginalPage = async () => {
  if (typeof document === "undefined" || typeof chrome === "undefined") return
  const text = document.body?.innerText || ""
  const result = parseHeaderResult(text)
  if (!result?.messageKey) return
  try {
    await chrome.storage.local.set({ [HEADER_RESULT_KEY]: result })
  } catch {
    return
  }
  window.close()
}

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
    sender_email: normalizeEmail(getEmailValue(senderEl)),
    sender_name: normalizeText(senderEl?.textContent || ""),
    receiver_email: normalizeEmail(getEmailValue(receiverEl)),
    subject: normalizeText(subjectEl?.textContent || ""),
    body_text: bodyText.slice(0, 4000)
  }

  const messageIdRaw = getThreadIdFromMessage(message)
  const normalizedKey = normalizeMessageKey(messageIdRaw)
  if (normalizedKey) {
    currentMessageKey = normalizedKey
  }
  currentLegacyMessageId = messageIdRaw || ""

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
      box-shadow: 0 12px 24px rgba(2, 6, 23, 0.18);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      overflow: hidden;
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
    #${BANNER_ID} .vamisec-summary {
      color: inherit;
      opacity: 0.95;
      font-size: 13px;
      font-weight: 600;
    }
    #${BANNER_ID} .vamisec-rationale {
      font-size: 11px;
      opacity: 0.85;
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
    #${BANNER_ID} .vamisec-checks {
      display: grid;
      gap: 6px;
    }
    #${BANNER_ID} .vamisec-check {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      padding: 4px 6px;
      border-radius: 8px;
      border: 1px solid rgba(15, 23, 42, 0.1);
      background: rgba(15, 23, 42, 0.03);
    }
    #${BANNER_ID} .vamisec-check-status {
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.4px;
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid rgba(15, 23, 42, 0.18);
      background: rgba(15, 23, 42, 0.06);
    }
    #${BANNER_ID} .vamisec-dismiss {
      border: none;
      background: transparent;
      color: inherit;
      width: 22px;
      height: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      cursor: pointer;
      border-radius: 999px;
      border: 1px solid rgba(15, 23, 42, 0.2);
    }
    #${BANNER_ID} .vamisec-dismiss:hover {
      background: rgba(15, 23, 42, 0.08);
    }
    #${BANNER_ID} .vamisec-headers {
      border: 1px solid rgba(15, 23, 42, 0.22);
      background: rgba(15, 23, 42, 0.06);
      color: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 999px;
    }
    #${BANNER_ID} .vamisec-headers:hover {
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

const riskColorsLight: Record<
  RiskLevel,
  { bg: string; text: string; border: string; pillBg: string; pillText: string; chipBg: string }
> = {
  green: {
    bg: "#ecfdf3",
    text: "#166534",
    border: "#86efac",
    pillBg: "#bbf7d0",
    pillText: "#14532d",
    chipBg: "rgba(22, 101, 52, 0.08)"
  },
  yellow: {
    bg: "#fff7ed",
    text: "#92400e",
    border: "#fdba74",
    pillBg: "#fed7aa",
    pillText: "#7c2d12",
    chipBg: "rgba(146, 64, 14, 0.08)"
  },
  red: {
    bg: "#fef2f2",
    text: "#b91c1c",
    border: "#fecaca",
    pillBg: "#fecaca",
    pillText: "#7f1d1d",
    chipBg: "rgba(185, 28, 28, 0.08)"
  }
}

const riskColorsDark: Record<
  RiskLevel,
  { bg: string; text: string; border: string; pillBg: string; pillText: string; chipBg: string }
> = {
  green: {
    bg: "rgba(15, 23, 42, 0.86)",
    text: "#e2e8f0",
    border: "rgba(148, 163, 184, 0.2)",
    pillBg: "rgba(34, 197, 94, 0.25)",
    pillText: "#bbf7d0",
    chipBg: "rgba(34, 197, 94, 0.18)"
  },
  yellow: {
    bg: "rgba(15, 23, 42, 0.86)",
    text: "#e2e8f0",
    border: "rgba(148, 163, 184, 0.2)",
    pillBg: "rgba(251, 191, 36, 0.25)",
    pillText: "#fde68a",
    chipBg: "rgba(251, 191, 36, 0.18)"
  },
  red: {
    bg: "rgba(15, 23, 42, 0.86)",
    text: "#e2e8f0",
    border: "rgba(148, 163, 184, 0.2)",
    pillBg: "rgba(239, 68, 68, 0.25)",
    pillText: "#fecaca",
    chipBg: "rgba(239, 68, 68, 0.18)"
  }
}

const parseRgb = (value: string) => {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return null
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) }
}

const isDarkSurface = () => {
  if (typeof window === "undefined") return false
  const main = document.querySelector("div[role='main']")
  const target = main || document.body
  if (!target) return false
  const style = window.getComputedStyle(target)
  const bg = parseRgb(style.backgroundColor || "")
  if (!bg) return false
  const luminance = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b
  return luminance < 128
}

const keywordSignals: Array<{ pattern: RegExp; label: string; weight: number }> = [
  { pattern: /\b(urgent|asap|immediately|action required|today)\b/i, label: "urgent-tone", weight: 0.15 },
  { pattern: /\b(wire|transfer|bank|payment|invoice|gift card|crypto)\b/i, label: "financial-request", weight: 0.2 },
  { pattern: /\b(verify|login|password|reset|account|credentials)\b/i, label: "credential-harvest", weight: 0.2 },
  { pattern: /\b(click|open|download|attachment|link)\b/i, label: "link-request", weight: 0.1 },
  { pattern: /\b(ceo|cfo|president|director)\b/i, label: "exec-impersonation", weight: 0.2 },
  { pattern: /\bconfidential\b|\bdo not share\b/i, label: "secrecy-pressure", weight: 0.1 }
]

const analyzeLocally = (payload: PhishingRequest): PhishingResponse => {
  const text = `${payload.subject || ""} ${payload.body_text || ""}`.toLowerCase()
  const senderEmail = normalizeEmail(payload.sender_email || "")
  const senderDomain = extractDomain(senderEmail)
  const senderName = normalizeText(payload.sender_name || "").toLowerCase()

  const normalizedSenders = trustedSenders.map(normalizeEmail)
  const normalizedDomains = trustedDomains.map(normalizeDomain)
  const normalizedNames = trustedNames.map((name) => normalizeText(name).toLowerCase())
  const currentHeader =
    headerResult &&
    (headerResult.messageKey === lastHeaderRequestKey ||
      headerResult.messageKey === getCurrentMessageKey() ||
      (headerResult.legacyKey && headerResult.legacyKey === currentLegacyMessageId))
      ? headerResult
      : null

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

  const headerSignals: Array<{ value: string; label: string; weight: number }> = [
    { value: currentHeader?.spf || "", label: "spf", weight: 0.15 },
    { value: currentHeader?.dkim || "", label: "dkim", weight: 0.15 },
    { value: currentHeader?.dmarc || "", label: "dmarc", weight: 0.2 }
  ]
  headerSignals.forEach(({ value, label, weight }) => {
    if (!value || value === "unknown") return
    if (value === "pass") return
    signals.push(`${label}-${value}`)
    score += weight
  })

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
        label: "Headers",
        status: currentHeader ? "info" : "fail",
        detail: currentHeader
          ? `spf=${currentHeader.spf || "unknown"} | dkim=${
              currentHeader.dkim || "unknown"
            } | dmarc=${currentHeader.dmarc || "unknown"}`
          : "Not checked"
      },
      {
        label: "Content signals",
        status: signals.length ? "info" : "pass",
        detail: signals.length ? signals.slice(0, 5).join(", ") : "No suspicious signals"
      }
    ]
  }
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

  const dark = isDarkSurface()
  const loadingBg = dark ? "rgba(15, 23, 42, 0.82)" : "#f8fafc"
  const loadingText = dark ? "#e2e8f0" : "#0f172a"
  const loadingBorder = dark ? "rgba(148, 163, 184, 0.2)" : "rgba(15, 23, 42, 0.12)"

  if (state.status === "loading") {
    banner.style.background = loadingBg
    banner.style.color = loadingText
    banner.style.border = `1px solid ${loadingBorder}`
    banner.innerHTML = `<div class="vamisec-row"><div class="vamisec-title">VamiSec Phishing Radar</div><div class="vamisec-score">Analyzing...</div></div>`
    return
  }

  if (state.status === "error") {
    banner.style.background = loadingBg
    banner.style.color = loadingText
    banner.style.border = `1px solid ${loadingBorder}`
    banner.innerHTML = `<div class="vamisec-row"><div class="vamisec-title">VamiSec Phishing Radar</div><div class="vamisec-score">Error</div></div><div>${state.message || "Analysis failed."}</div>`
    return
  }

  if (state.status === "done" && state.data) {
    const palette = dark ? riskColorsDark : riskColorsLight
    const { bg, text, border, pillBg, pillText, chipBg } =
      palette[state.data.risk] || palette.green
    banner.style.background = bg
    banner.style.color = text
    banner.style.border = `1px solid ${border}`
    let scoreText = "Score --"
    if (typeof state.data.score === "number") {
      const scaled = state.data.score > 1 ? state.data.score : state.data.score * 100
      scoreText = `Score ${Math.round(scaled)}`
    }
    const rawSummary = state.data.summary ? state.data.summary.slice(0, 220) : ""
    const summary = rawSummary.replace(/^signals detected:\s*/i, "Summary: ")
    const signals = (state.data.signals || []).slice(0, 5)
    const checks = state.data.checks || []
    const currentHeader =
      headerResult &&
      (headerResult.messageKey === lastHeaderRequestKey ||
        headerResult.messageKey === getCurrentMessageKey() ||
        (headerResult.legacyKey && headerResult.legacyKey === currentLegacyMessageId))
        ? headerResult
        : null
    const rationale =
      signals.length > 0
        ? `Why it looks suspicious: ${signals.length} indicator${signals.length > 1 ? "s" : ""} flagged.`
        : "Why it looks safe: no indicators flagged."

    banner.innerHTML = `
      <div class="vamisec-row">
        <div class="vamisec-title">VamiSec Phishing Radar</div>
        <div class="vamisec-score" style="background:${pillBg};color:${pillText};border-color:${border}">${scoreText}</div>
        <button type="button" class="vamisec-headers" data-action="headers">Check headers</button>
        <button type="button" class="vamisec-dismiss" data-action="dismiss" aria-label="Dismiss">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <circle cx="12" cy="12" r="8"></circle>
            <line x1="8" y1="8" x2="16" y2="16"></line>
          </svg>
        </button>
      </div>
      <div class="vamisec-rationale">${rationale}</div>
      ${
        checks.length
          ? `<div class="vamisec-checks">${checks
              .map(
                (check) =>
                  `<div class="vamisec-check"><span>${check.label}${
                    check.detail ? `: ${check.detail}` : ""
                  }</span><span class="vamisec-check-status">${check.status}</span></div>`
              )
              .join("")}</div>`
          : ""
      }
      ${
        signals.length
          ? `<div class="vamisec-signals">${signals
              .map(
                (signal) =>
                  `<span class="vamisec-chip" style="background:${chipBg}">${signal}</span>`
              )
              .join("")}</div>`
          : ""
      }
      <div class="vamisec-summary">${summary}</div>
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
    const headerButton = banner.querySelector(
      "button[data-action='headers']"
    ) as HTMLButtonElement | null
    if (headerButton) {
      headerButton.onclick = async () => {
        const result = await buildShowOriginalUrl()
        if (!result.url) {
          renderBanner({ status: "error", message: "Unable to open full headers." })
          return
        }
        if (result.messageKey) {
          lastHeaderRequestKey = result.messageKey
        }
        if (result.legacyKey) {
          currentLegacyMessageId = result.legacyKey
        }
        window.open(result.url, "_blank", "noopener")
      }
    }
  }
}

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
    lastHeaderRequestKey = ""
    currentMessageKey = ""
    currentLegacyMessageId = ""
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
    const result = analyzeLocally(extracted.payload)
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

const loadHeaderResult = async () => {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    headerResult = null
    return
  }
  const data = await chrome.storage.local.get([HEADER_RESULT_KEY])
  const result = data?.[HEADER_RESULT_KEY] as HeaderResult | undefined
  headerResult = result && result.messageKey ? result : null
}

const init = () => {
  if (isShowOriginalPage()) {
    handleShowOriginalPage()
    return
  }
  ensureStyles()
  Promise.all([loadSettings(), loadHeaderResult()]).then(() => scheduleAnalysis())
  const observer = new MutationObserver(() => {
    ensureStyles()
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
        radarEnabled = next.enablePhishingRadar !== false
        trustedSenders = Array.isArray(next.trustedSenders) ? next.trustedSenders : []
        trustedDomains = Array.isArray(next.trustedDomains) ? next.trustedDomains : []
        trustedNames = Array.isArray(next.trustedNames) ? next.trustedNames : []
      }
      if (changes[HEADER_RESULT_KEY]) {
        const next = changes[HEADER_RESULT_KEY].newValue as HeaderResult | undefined
        headerResult = next && next.messageKey ? next : null
      }
      scheduleAnalysis()
    })
  }
}

init()

export const GmailContent: React.FC = () => null

export default GmailContent
