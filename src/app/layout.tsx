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
      <body className="antialiased font-sans selection:bg-primary-200 selection:text-primary-900 dark:selection:bg-primary-800 dark:selection:text-primary-100">
        {children}
      </body>
    </html>
  );
}
