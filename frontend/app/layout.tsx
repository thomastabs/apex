import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppProviders } from "./providers";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Apex",
  description: "Spec-Anchored Human-AI Collaboration Framework for the SDLC",
};

// Render every route dynamically so the per-request CSP nonce (set in
// middleware.ts) is injected into Next's own <script> tags. Static prerendering
// bakes scripts at build time with no nonce, which breaks the enforced
// nonce-based CSP. This is an auth-gated SPA — no static-caching/SEO loss.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
