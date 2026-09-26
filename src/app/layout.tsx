import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaRegister } from "@/components/app/pwa-register";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const description =
  "Crie abas de estudo personalizadas, transforme PDFs, links, vídeos e listas de palavras em flashcards com a IA que preferir e envie direto para o Anki.";

export const metadata: Metadata = {
  // Endereço público, usado nas prévias de link (LinkedIn, WhatsApp). Na Vercel, o Next usa o domínio do deploy.
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: "Anki Studio · flashcards com IA do seu jeito",
  description,
  openGraph: {
    title: "Anki Studio · flashcards com IA do seu jeito",
    description,
    type: "website",
    locale: "pt_BR",
  },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "Anki Studio", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <Providers>{children}</Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
