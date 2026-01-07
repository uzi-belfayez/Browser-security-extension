import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://chatgpt.com/*"],
  run_at: "document_end"
}

const PLACEHOLDER_REGEX = /<(EMAIL|PHONE|CC)_\d+>/g

const mappingByPlaceholder = new Map<string, string>()
const mappingByOriginal = new Map<string, string>()
const counters = { EMAIL: 0, PHONE: 0, CC: 0 }
let badgeEl: HTMLDivElement | null = null
let assistantObserver: MutationObserver | null = null
let lastPromptEl: HTMLElement | null = null

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const PHONE_REGEX =
  /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g
const CC_REGEX = /\b(?:\d[ -]*?){13,16}\b/g

const makePlaceholder = (type: keyof typeof counters) => {
  counters[type] += 1
  return `<${type}_${counters[type]}>`
}

const replaceWithPlaceholders = (
  text: string,
  type: keyof typeof counters,
  regex: RegExp
) => {
  regex.lastIndex = 0
  return text.replace(regex, (match) => {
    if (PLACEHOLDER_REGEX.test(match)) {
      return match
    }
    const existing = mappingByOriginal.get(match)
    if (existing) {
      return existing
    }
    const placeholder = makePlaceholder(type)
    mappingByOriginal.set(match, placeholder)
    mappingByPlaceholder.set(placeholder, match)
    return placeholder
  })
}

const countMatches = (text: string, regex: RegExp) => {
  regex.lastIndex = 0
  return text.match(regex)?.length ?? 0
}

const redactTextWithReport = (text: string) => {
  const emailCount = countMatches(text, EMAIL_REGEX)
  const phoneCount = countMatches(text, PHONE_REGEX)
  const ccCount = countMatches(text, CC_REGEX)

  let redacted = text
  redacted = replaceWithPlaceholders(redacted, "EMAIL", EMAIL_REGEX)
  redacted = replaceWithPlaceholders(redacted, "PHONE", PHONE_REGEX)
  redacted = replaceWithPlaceholders(redacted, "CC", CC_REGEX)

  return {
    redacted,
    report: { emailCount, phoneCount, ccCount }
  }
}

const restoreText = (text: string) => {
  return text.replace(PLACEHOLDER_REGEX, (placeholder) => {
    return mappingByPlaceholder.get(placeholder) ?? placeholder
  })
}

const restorePlaceholdersInAssistantMessage = (root: Element) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const textNode = node as Text
    if (PLACEHOLDER_REGEX.test(textNode.nodeValue || "")) {
      textNode.nodeValue = restoreText(textNode.nodeValue || "")
    }
    node = walker.nextNode()
  }
}

const observeAssistantMessages = () => {
  if (!document.body) {
    return null
  }
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof Element)) {
          continue
        }

        if (node.matches("[data-message-author-role='assistant']")) {
          restorePlaceholdersInAssistantMessage(node)
          continue
        }

        const assistantNodes = node.querySelectorAll(
          "[data-message-author-role='assistant']"
        )
        assistantNodes.forEach((el) => restorePlaceholdersInAssistantMessage(el))
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })

  return observer
}

const ensureBadge = () => {
  if (badgeEl || !document.documentElement) {
    return
  }
  const badge = document.createElement("div")
  badge.textContent = "VamiSec ready"
  badge.style.position = "fixed"
  badge.style.bottom = "16px"
  badge.style.right = "16px"
  badge.style.zIndex = "99999"
  badge.style.background = "#0f172a"
  badge.style.color = "#fff"
  badge.style.fontSize = "12px"
  badge.style.fontFamily = "sans-serif"
  badge.style.padding = "6px 8px"
  badge.style.borderRadius = "8px"
  badge.style.opacity = "0.9"
  document.documentElement.appendChild(badge)
  badgeEl = badge
}

const BUTTON_ID = "vamisec-redact-btn"
const STATUS_ID = "vamisec-redact-status"

const isPromptCandidate = (el: Element | null) => {
  if (!el || !(el instanceof HTMLElement)) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el.getAttribute("contenteditable") === "true") return true
  if (el.getAttribute("role") === "textbox") return true
  if (el.id === "prompt-textarea") return true
  return false
}

const getPromptElement = (): HTMLElement | null => {
  if (lastPromptEl && document.contains(lastPromptEl)) {
    return lastPromptEl
  }
  const active = document.activeElement
  if (isPromptCandidate(active)) {
    return active as HTMLElement
  }

  const root = document.querySelector("main") ?? document
  const textarea =
    root.querySelector("textarea[data-testid='prompt-textarea']") ||
    root.querySelector("textarea")
  if (textarea) return textarea as HTMLElement

  const editable =
    root.querySelector("#prompt-textarea.ProseMirror") ||
    root.querySelector("#prompt-textarea") ||
    root.querySelector(".ProseMirror[contenteditable='true']") ||
    root.querySelector("[contenteditable='true'][data-testid='prompt-textarea']") ||
    root.querySelector("[role='textbox'][contenteditable='true']") ||
    root.querySelector("[contenteditable='true']") ||
    root.querySelector("[role='textbox']")
  if (editable) return editable as HTMLElement

  return null
}

const getPromptText = (el: HTMLElement) => {
  if (el instanceof HTMLTextAreaElement) {
    return el.value
  }
  const text = el.innerText || el.textContent || ""
  if (text.trim()) return text
  const childText = Array.from(el.querySelectorAll("p,span,div"))
    .map((node) => (node as HTMLElement).innerText || node.textContent || "")
    .join(" ")
  return childText
}

const setPromptText = (el: HTMLElement, nextValue: string) => {
  if (el instanceof HTMLTextAreaElement) {
    el.value = nextValue
    el.dispatchEvent(new Event("input", { bubbles: true }))
    return
  }
  el.focus()
  lastPromptEl = el
  const selection = window.getSelection()
  if (selection) {
    selection.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(el)
    selection.addRange(range)
  }
  const usedCommand = document.execCommand("insertText", false, nextValue)
  if (!usedCommand) {
    el.innerText = nextValue
  }
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }))
}

const ensureRedactButton = () => {
  if (document.getElementById(BUTTON_ID)) {
    return
  }
  const button = document.createElement("button")
  button.id = BUTTON_ID
  button.textContent = "Redact PII"
  button.style.position = "fixed"
  button.style.bottom = "52px"
  button.style.right = "16px"
  button.style.zIndex = "99999"
  button.style.background = "#111827"
  button.style.color = "#fff"
  button.style.border = "1px solid #334155"
  button.style.borderRadius = "999px"
  button.style.padding = "8px 12px"
  button.style.fontSize = "12px"
  button.style.fontFamily = "sans-serif"
  button.style.cursor = "pointer"

  button.addEventListener("click", (event) => {
    event.preventDefault()
    const promptEl = getPromptElement()
    if (!promptEl) {
      updateStatus("No prompt box found")
      return
    }
    const original = getPromptText(promptEl)
    if (!original.trim()) {
      updateStatus("Prompt is empty")
      return
    }
    const { redacted, report } = redactTextWithReport(original)
    setPromptText(promptEl, redacted)
    const total = report.emailCount + report.phoneCount + report.ccCount
    updateStatus(
      total
        ? `Redacted ${total} item${total === 1 ? "" : "s"}`
        : "No PII found"
    )
  })

  const status = document.createElement("div")
  status.id = STATUS_ID
  status.textContent = "Click to redact before sending"
  status.style.position = "fixed"
  status.style.bottom = "30px"
  status.style.right = "16px"
  status.style.zIndex = "99999"
  status.style.background = "#0b1220"
  status.style.color = "#cbd5f5"
  status.style.border = "1px solid #1e293b"
  status.style.borderRadius = "8px"
  status.style.padding = "6px 8px"
  status.style.fontSize = "11px"
  status.style.fontFamily = "sans-serif"
  status.style.opacity = "0.9"

  document.documentElement.appendChild(button)
  document.documentElement.appendChild(status)
}

const updateStatus = (text: string) => {
  const statusEl = document.getElementById(STATUS_ID)
  if (!statusEl) return
  statusEl.textContent = text
}

const startAssistantObserver = () => {
  if (assistantObserver || !document.body) {
    return
  }
  assistantObserver = observeAssistantMessages()
}

const init = () => {
  startAssistantObserver()
  ensureBadge()
  ensureRedactButton()
  document.addEventListener("focusin", (event) => {
    if (isPromptCandidate(event.target as Element)) {
      lastPromptEl = event.target as HTMLElement
    }
  })

  if (!document.body) {
    document.addEventListener("DOMContentLoaded", () => {
      startAssistantObserver()
      ensureBadge()
      ensureRedactButton()
    })
  }
}

init()

const ChatGPTContent = () => null
export default ChatGPTContent
