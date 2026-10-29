import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/providers";
import { PwaSetup } from "@/components/pwa";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "GPA — Grocery Planner & Money Manager", template: "%s · GPA" },
  description: "Plan groceries, track every account, debt and investment in AED and INR, and import bank statements.",
  appleWebApp: { capable: true, title: "GPA", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1112" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body>
        <PwaSetup />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
