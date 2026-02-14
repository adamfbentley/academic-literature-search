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
    <html lang="en" className="dark scroll-smooth">
      <body className="antialiased font-sans bg-surface-950 text-slate-200 selection:bg-primary-900/50 selection:text-primary-100">
        {children}
      </body>
    </html>
  );
}
