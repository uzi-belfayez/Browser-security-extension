import React from "react"
import { defaultSettings } from "../shared/storage"

export const Popup: React.FC = () => {
  return (
    <div style={{ padding: 12, fontFamily: "sans-serif" }}>
      <h3>Cyber Extension (MVP)</h3>
      <p>Settings preview:</p>
      <pre>{JSON.stringify(defaultSettings, null, 2)}</pre>
    </div>
  )
}

export default Popup
