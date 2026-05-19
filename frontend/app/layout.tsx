import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppProviders } from "./providers";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Apex",
  description: "Spec-Anchored Human-AI Collaboration Framework for the SDLC",
};

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
