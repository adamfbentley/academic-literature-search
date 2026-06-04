import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Literature Review Assistant",
  description: "AI-powered academic paper search and summarization across OpenAlex, Semantic Scholar, and arXiv",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="antialiased font-sans selection:bg-amber-300/50 selection:text-slate-900">
        {children}
      </body>
    </html>
  );
}
