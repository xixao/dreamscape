"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="flow-review-theme"
      disableTransitionOnChange
    >
      {children}
      <Toaster position="bottom-right" />
    </ThemeProvider>
  );
}
