import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
const geistSans = localFont({ src: "../public/fonts/geist.woff2", variable: "--font-geist-sans", display: "swap" });
const geistMono = localFont({ src: "../public/fonts/geist-mono.woff2", variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Exa x FieldQuote",
  description:
    "An Exa-powered parts-intelligence layer for field-service businesses. Technician inspection notes become verified replacement parts, live supplier options and quote-ready line items.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
