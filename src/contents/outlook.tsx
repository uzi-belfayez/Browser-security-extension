import type { PlasmoCSConfig } from "plasmo"
import React from "react"

export const config: PlasmoCSConfig = {
  matches: [
    "https://outlook.office.com/*",
    "https://outlook.office.com/owa/*",
    "https://outlook.office.com/mail/*"
  ],
  run_at: "document_end",
  all_frames: true
}

const BANNER_ID = "vamisec-outlook-banner"
const STYLE_ID = "vamisec-outlook-banner-style"
const DEBUG_ID = "vamisec-outlook-debug"
const DEBUG_TICK_KEY = "__vamisecOutlookTick"

const getBodyContainer = () => {
  return document.querySelector(
    "div[data-test-id='mailMessageBodyContainer']"
  ) as HTMLElement | null
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
      background: #f8fafc;
      color: #0f172a;
      box-shadow: 0 12px 24px rgba(2, 6, 23, 0.18);
    }
  `
  document.head.appendChild(style)
}

const ensureDebugBadge = () => {
  const host = document.body || document.documentElement
  if (!host) return
  let badge = document.getElementById(DEBUG_ID)
  if (!badge) {
    badge = document.createElement("div")
    badge.id = DEBUG_ID
    badge.textContent = "VamiGuard Outlook script active"
    badge.style.position = "fixed"
    badge.style.bottom = "16px"
    badge.style.right = "16px"
    badge.style.zIndex = "2147483647"
    badge.style.background = "#0f172a"
    badge.style.color = "#fff"
    badge.style.fontSize = "12px"
    badge.style.fontFamily = "sans-serif"
    badge.style.padding = "6px 8px"
    badge.style.borderRadius = "8px"
    badge.style.opacity = "0.9"
    badge.style.pointerEvents = "none"
  }
  if (!badge.isConnected) {
    host.appendChild(badge)
  }
  try {
    ;(window as unknown as Record<string, number>)[DEBUG_TICK_KEY] =
      ((window as unknown as Record<string, number>)[DEBUG_TICK_KEY] || 0) + 1
  } catch {
    // ignore
  }
}

const ensureBanner = () => {
  const container = getBodyContainer()
  if (!container) return
  let banner = container.querySelector(`#${BANNER_ID}`) as HTMLDivElement | null
  if (!banner) {
    banner = document.createElement("div")
    banner.id = BANNER_ID
    banner.textContent = "VamiGuard Phishing Radar (Outlook)"
    container.insertBefore(banner, container.firstChild)
  }
}

const init = () => {
  ensureStyles()
  ensureDebugBadge()
  ensureBanner()
  const observer = new MutationObserver(() => {
    ensureBanner()
  })
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true })
  }
  window.setInterval(() => {
    ensureDebugBadge()
    ensureBanner()
  }, 1000)
}

init()

export const OutlookContent: React.FC = () => null

export default OutlookContent
