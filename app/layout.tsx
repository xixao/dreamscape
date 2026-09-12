import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flow Review | Document upload",
  description: "An interactive design review studio with a scripted assistant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
