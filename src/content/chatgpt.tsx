import type { PlasmoCSConfig } from "plasmo"
import React from "react"

export const config: PlasmoCSConfig = {
  matches: ["https://chatgpt.com/*"]
}

export const ChatGPTContent: React.FC = () => {
  return null
}

// TODO: Add observers for prompt input and send interception.
