import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AHAU Photo Archive · 校园影像档案",
    template: "%s · AHAU Photo Archive",
  },
  description: "留存校园的建筑、风景、四季与日常，让每一段校园记忆有迹可循。",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          <a
            href="#main-content"
            className="bg-background sr-only z-50 rounded p-3 focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
          >
            跳转到主要内容
          </a>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
