import type { PlasmoCSConfig } from "plasmo"
import React from "react"

export const config: PlasmoCSConfig = {
  matches: ["https://mail.google.com/*"]
}

export const GmailContent: React.FC = () => {
  return null
}

// TODO: Add DOM extraction for sender/body and banner injection.
