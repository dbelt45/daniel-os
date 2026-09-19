import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daniel OS",
  description: "Personal operating system. Tasks, projects, blockers, calendar, metrics.",
};

// Mobile responsive from the first commit: Ricky's Day 1 ship gate is that
// Daniel logs in ON HIS PHONE and sees his own tasks.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
