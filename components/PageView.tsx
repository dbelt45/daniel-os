"use client";

import { useEffect } from "react";

// Fires one page_view into the events table per mount. Deliberately
// fire-and-forget: analytics must never break the page it is measuring.
export function PageView({ name }: { name: string }) {
  useEffect(() => {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "page_view", name, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [name]);
  return null;
}
