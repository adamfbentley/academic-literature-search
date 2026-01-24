import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Academic Literature Search",
  description: "AI-powered academic paper search and summarization",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
