import type { Metadata } from "next";
import { Archivo_Black, Space_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const archivo = Archivo_Black({
  weight: "400",
  variable: "--font-archivo",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SKILL FOUNDRY™ — AI Skill Generator",
  description:
    "Prompt in. Skill out. Forge production-grade agent skills as SKILL.MD, JSON, ZIP packs or code. Maximalist, zero-slop, agent-ready.",
  keywords: [
    "AI skill generator",
    "SKILL.md",
    "agent skills",
    "prompt to skill",
    "Claude skills",
    "Rob Namoc",
  ],
  authors: [{ name: "ROBERTH NAMOC" }],
  creator: "ROBERTH NAMOC",
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "SKILL FOUNDRY™ — AI Skill Generator",
    description: "Prompt in. Skill out. MD / JSON / ZIP / CODE. Zero slop.",
    siteName: "SKILL FOUNDRY™",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${archivo.variable} ${spaceGrotesk.variable} ${geistMono.variable} antialiased bg-forge-paper text-forge-ink font-body`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
