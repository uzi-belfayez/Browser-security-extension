import type { PlasmoCSConfig } from "plasmo"
import { settingsStore } from "../shared/storage"

export const config: PlasmoCSConfig = {
  matches: ["https://chatgpt.com/*"],
  run_at: "document_end"
}

const PLACEHOLDER_REGEX = /<(EMAIL|PHONE|CC|PASSWORD|CUSTOM)_\d+>/g

const mappingByPlaceholder = new Map<string, string>()
const mappingByOriginal = new Map<string, string>()
const counters = { EMAIL: 0, PHONE: 0, CC: 0, PASSWORD: 0, CUSTOM: 0 }
let badgeEl: HTMLDivElement | null = null
let assistantObserver: MutationObserver | null = null
let lastPromptEl: HTMLElement | null = null
let customPatterns: string[] = []
let customRegexPatterns: string[] = []
let customRegexes: RegExp[] = []
let lastRedaction:
  | {
      original: string
      redacted: string
      promptEl: HTMLElement
    }
  | null = null

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const PHONE_REGEX =
  /\b(?:\+?\d{1,3}[\s.-]*)?(?:\(?\d{1,4}\)?[\s.-]*)?(?:\d[\s.-]*){6,12}\d\b/g
const CC_REGEX = /\b(?:\d[\s-]*?){13,19}\b/g
const PASSWORD_VALUE_REGEX =
  /\b(password|passcode|passwd|pwd)(\s*(?:is|=|:)\s*)([^\s,;]+)/gi

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const rebuildCustomRegexes = () => {
  const textRegexes = customPatterns
    .map((pattern) => {
      const source = escapeRegExp(pattern.trim())
      if (!source) return null
      try {
        return new RegExp(source, "g")
      } catch {
        return null
      }
    })
    .filter((regex): regex is RegExp => Boolean(regex))

  const regexRegexes = customRegexPatterns
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .map((source) => {
      try {
        return new RegExp(source, "g")
      } catch {
        return null
      }
    })
    .filter((regex): regex is RegExp => Boolean(regex))

  customRegexes = [...textRegexes, ...regexRegexes]
}

const isValidLuhn = (digits: string) => {
  let sum = 0
  let shouldDouble = false
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = digits.charCodeAt(i) - 48
    if (value < 0 || value > 9) return false
    if (shouldDouble) {
      value *= 2
      if (value > 9) value -= 9
    }
    sum += value
    shouldDouble = !shouldDouble
  }
  return sum % 10 === 0
}

const makePlaceholder = (type: keyof typeof counters) => {
  counters[type] += 1
  return `<${type}_${counters[type]}>`
}

const replaceWithPlaceholders = (
  text: string,
  type: keyof typeof counters,
  regex: RegExp,
  created?: string[]
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
    if (created) {
      created.push(placeholder)
    }
    return placeholder
  })
}

const countMatches = (text: string, regex: RegExp) => {
  regex.lastIndex = 0
  return text.match(regex)?.length ?? 0
}

const redactPasswordValues = (text: string, created?: string[]) => {
  PASSWORD_VALUE_REGEX.lastIndex = 0
  return text.replace(PASSWORD_VALUE_REGEX, (match, label, separator, value) => {
    if (PLACEHOLDER_REGEX.test(value)) {
      return match
    }
    const existing = mappingByOriginal.get(value)
    if (existing) {
      return `${label}${separator}${existing}`
    }
    const placeholder = makePlaceholder("PASSWORD")
    mappingByOriginal.set(value, placeholder)
    mappingByPlaceholder.set(placeholder, value)
    if (created) {
      created.push(placeholder)
    }
    return `${label}${separator}${placeholder}`
  })
}

const redactCustomPatterns = (text: string, created?: string[]) => {
  if (!customRegexes.length) {
    return text
  }
  let redacted = text
  customRegexes.forEach((regex) => {
    regex.lastIndex = 0
    redacted = redacted.replace(regex, (match) => {
      if (!match) return match
      if (PLACEHOLDER_REGEX.test(match)) {
        return match
      }
      const existing = mappingByOriginal.get(match)
      if (existing) {
        return existing
      }
      const placeholder = makePlaceholder("CUSTOM")
      mappingByOriginal.set(match, placeholder)
      mappingByPlaceholder.set(placeholder, match)
      if (created) {
        created.push(placeholder)
      }
      return placeholder
    })
  })
  return redacted
}

const redactPhones = (text: string, created?: string[]) => {
  PHONE_REGEX.lastIndex = 0
  return text.replace(PHONE_REGEX, (match) => {
    if (PLACEHOLDER_REGEX.test(match)) {
      return match
    }
    const digits = match.replace(/\D/g, "")
    if (digits.length >= 13) {
      return match
    }
    const existing = mappingByOriginal.get(match)
    if (existing) {
      return existing
    }
    const placeholder = makePlaceholder("PHONE")
    mappingByOriginal.set(match, placeholder)
    mappingByPlaceholder.set(placeholder, match)
    if (created) {
      created.push(placeholder)
    }
    return placeholder
  })
}

const redactCreditCards = (text: string, created?: string[]) => {
  CC_REGEX.lastIndex = 0
  return text.replace(CC_REGEX, (match) => {
    if (PLACEHOLDER_REGEX.test(match)) {
      return match
    }
    const digits = match.replace(/\D/g, "")
    if (digits.length < 13 || digits.length > 19) {
      return match
    }
    if (!isValidLuhn(digits)) {
      return match
    }
    const existing = mappingByOriginal.get(match)
    if (existing) {
      return existing
    }
    const placeholder = makePlaceholder("CC")
    mappingByOriginal.set(match, placeholder)
    mappingByPlaceholder.set(placeholder, match)
    if (created) {
      created.push(placeholder)
    }
    return placeholder
  })
}

const redactTextWithReport = (text: string) => {
  const created: string[] = []
  const emailCount = countMatches(text, EMAIL_REGEX)
  const phoneCount = countMatches(text, PHONE_REGEX)
  const ccCount = countMatches(text, CC_REGEX)
  const passwordCount = countMatches(text, PASSWORD_VALUE_REGEX)
  const customCount = customRegexes.reduce((sum, regex) => sum + countMatches(text, regex), 0)

  let redacted = text
  redacted = redactPasswordValues(redacted, created)
  redacted = redactCustomPatterns(redacted, created)
  redacted = replaceWithPlaceholders(redacted, "EMAIL", EMAIL_REGEX, created)
  redacted = redactCreditCards(redacted, created)
  redacted = redactPhones(redacted, created)

  return {
    redacted,
    created,
    report: { emailCount, phoneCount, ccCount, passwordCount, customCount }
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

const CONTROLS_ID = "vamisec-controls"
const BUTTON_ID = "vamisec-redact-btn"
const RESTORE_ID = "vamisec-restore-btn"
const STATUS_ID = "vamisec-redact-status"
const LIST_ID = "vamisec-redact-list"
const STYLE_ID = "vamisec-style"

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
  el.textContent = nextValue
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

const getStoredOriginal = (el: HTMLElement) => el.getAttribute("data-vamisec-original")
const getStoredRedacted = (el: HTMLElement) => el.getAttribute("data-vamisec-redacted")
const getStoredState = (el: HTMLElement) => el.getAttribute("data-vamisec-state")
const normalizeText = (text: string) =>
  text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()

const canRestore = (currentText: string, storedRedacted: string | null) => {
  if (!storedRedacted) return true
  if (normalizeText(currentText) === normalizeText(storedRedacted)) {
    return true
  }
  const placeholders = storedRedacted.match(PLACEHOLDER_REGEX) || []
  if (!placeholders.length) return false
  return placeholders.every((placeholder) => currentText.includes(placeholder))
}

const setStoredState = (
  el: HTMLElement,
  data: { original: string; redacted: string; state: "redacted" | "original" }
) => {
  el.setAttribute("data-vamisec-original", data.original)
  el.setAttribute("data-vamisec-redacted", data.redacted)
  el.setAttribute("data-vamisec-state", data.state)
}

const clearStoredState = (el: HTMLElement) => {
  el.removeAttribute("data-vamisec-original")
  el.removeAttribute("data-vamisec-redacted")
  el.removeAttribute("data-vamisec-state")
}

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) {
    return
  }
  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = `
    .vamisec-flash {
      outline: 2px solid #f59e0b !important;
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2) !important;
    }
    #${LIST_ID} {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      max-width: 360px;
    }
    #${LIST_ID} .vamisec-chip {
      background: #1f2937;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 999px;
      padding: 2px 6px;
      font-size: 10px;
    }
  `
  document.head.appendChild(style)
}

const updateRedactionList = (placeholders: string[]) => {
  const listEl = document.getElementById(LIST_ID)
  if (!listEl) return
  listEl.textContent = ""
  const unique = Array.from(new Set(placeholders))
  unique.slice(0, 6).forEach((placeholder) => {
    const chip = document.createElement("span")
    chip.className = "vamisec-chip"
    chip.textContent = placeholder
    listEl.appendChild(chip)
  })
  if (unique.length > 6) {
    const more = document.createElement("span")
    more.className = "vamisec-chip"
    more.textContent = `+${unique.length - 6}`
    listEl.appendChild(more)
  }
}

const ensureControls = () => {
  if (document.getElementById(CONTROLS_ID)) {
    return
  }

  const controls = document.createElement("div")
  controls.id = CONTROLS_ID
  controls.style.position = "fixed"
  controls.style.zIndex = "99999"
  controls.style.display = "flex"
  controls.style.flexDirection = "column"
  controls.style.alignItems = "flex-start"
  controls.style.gap = "6px"
  controls.style.padding = "6px 8px"
  controls.style.background = "#0b1220"
  controls.style.border = "1px solid #1e293b"
  controls.style.borderRadius = "10px"
  controls.style.boxShadow = "0 6px 18px rgba(2, 6, 23, 0.35)"
  controls.style.fontFamily = "sans-serif"
  controls.style.color = "#e2e8f0"

  const row = document.createElement("div")
  row.style.display = "flex"
  row.style.alignItems = "center"
  row.style.gap = "8px"

  const button = document.createElement("button")
  button.id = BUTTON_ID
  button.textContent = "Redact PII"
  button.style.background = "#111827"
  button.style.color = "#fff"
  button.style.border = "1px solid #334155"
  button.style.borderRadius = "999px"
  button.style.padding = "6px 10px"
  button.style.fontSize = "12px"
  button.style.cursor = "pointer"

  const restore = document.createElement("button")
  restore.id = RESTORE_ID
  restore.textContent = "Restore"
  restore.style.background = "#0f172a"
  restore.style.color = "#e2e8f0"
  restore.style.border = "1px solid #334155"
  restore.style.borderRadius = "999px"
  restore.style.padding = "6px 10px"
  restore.style.fontSize = "12px"
  restore.style.cursor = "pointer"

  const status = document.createElement("span")
  status.id = STATUS_ID
  status.textContent = "Click to redact"
  status.style.fontSize = "11px"
  status.style.color = "#cbd5f5"

  const list = document.createElement("div")
  list.id = LIST_ID

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
    const storedState = getStoredState(promptEl)
    const storedRedacted = getStoredRedacted(promptEl)
    if (
      storedState === "redacted" &&
      storedRedacted &&
      normalizeText(original) === normalizeText(storedRedacted)
    ) {
      updateStatus("Already redacted")
      return
    }
    if (storedState && storedRedacted && normalizeText(original) !== normalizeText(storedRedacted)) {
      clearStoredState(promptEl)
    }
    const { redacted, created } = redactTextWithReport(original)
    setPromptText(promptEl, redacted)
    setStoredState(promptEl, { original, redacted, state: "redacted" })
    lastRedaction = { original, redacted, promptEl }
    updateRedactionList(created.length ? created : redacted.match(PLACEHOLDER_REGEX) || [])
    const total = created.length
    updateStatus(
      total
        ? `Redacted ${total} item${total === 1 ? "" : "s"}`
        : "No PII found"
    )
  })

  restore.addEventListener("click", (event) => {
    event.preventDefault()
    const promptEl = getPromptElement()
    const sourceEl =
      (promptEl && document.contains(promptEl) ? promptEl : null) ||
      (lastRedaction && document.contains(lastRedaction.promptEl) ? lastRedaction.promptEl : null)
    if (!sourceEl) {
      updateStatus("Nothing to restore")
      return
    }
    const storedOriginal = getStoredOriginal(sourceEl)
    const storedRedacted = getStoredRedacted(sourceEl)
    if (!storedOriginal) {
      updateStatus("Nothing to restore")
      return
    }
    const currentText = getPromptText(sourceEl)
    if (!canRestore(currentText, storedRedacted)) {
      updateStatus("Edited after redaction")
      return
    }
    setPromptText(sourceEl, storedOriginal)
    setStoredState(sourceEl, {
      original: storedOriginal,
      redacted: storedRedacted ?? "",
      state: "original"
    })
    updateRedactionList([])
    updateStatus("Restored original")
  })

  row.appendChild(button)
  row.appendChild(restore)
  row.appendChild(status)
  controls.appendChild(row)
  controls.appendChild(list)
  document.documentElement.appendChild(controls)
}

const updateStatus = (text: string) => {
  const statusEl = document.getElementById(STATUS_ID)
  if (!statusEl) return
  statusEl.textContent = text
}

const positionControls = () => {
  const controls = document.getElementById(CONTROLS_ID)
  if (!controls) return
  const promptEl = getPromptElement()
  if (!promptEl) return
  const rect = promptEl.getBoundingClientRect()
  if (!rect.width || !rect.height) return

  const margin = 8
  const preferredTop = rect.top - controls.offsetHeight - margin
  const top =
    preferredTop > margin
      ? preferredTop
      : Math.min(window.innerHeight - controls.offsetHeight - margin, rect.bottom + margin)
  const left = Math.min(
    window.innerWidth - controls.offsetWidth - margin,
    Math.max(margin, rect.right - controls.offsetWidth)
  )
  controls.style.top = `${top}px`
  controls.style.left = `${left}px`
}

const loadSettings = async () => {
  try {
    const settings = await settingsStore.get()
    customPatterns = settings.customPatterns || []
    customRegexPatterns = settings.customRegexPatterns || []
    rebuildCustomRegexes()
  } catch {
    customPatterns = []
    customRegexPatterns = []
    customRegexes = []
  }
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
  ensureStyles()
  ensureControls()
  positionControls()
  loadSettings()
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.settings) return
      const next = changes.settings.newValue
      if (!next) return
      customPatterns = Array.isArray(next.customPatterns) ? next.customPatterns : []
      customRegexPatterns = Array.isArray(next.customRegexPatterns)
        ? next.customRegexPatterns
        : []
      rebuildCustomRegexes()
    })
  }
  document.addEventListener("focusin", (event) => {
    if (isPromptCandidate(event.target as Element)) {
      lastPromptEl = event.target as HTMLElement
      positionControls()
    }
  })
  window.addEventListener("resize", positionControls)
  window.addEventListener("scroll", positionControls, true)

  if (!document.body) {
    document.addEventListener("DOMContentLoaded", () => {
      startAssistantObserver()
      ensureBadge()
      ensureControls()
      positionControls()
    })
  }
}

init()

const ChatGPTContent = () => null
export default ChatGPTContent
