import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ziarah Travel AI — Trip Search",
  description: "AI-powered flight and hotel trip planning for Ziarah.ai assessment",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
