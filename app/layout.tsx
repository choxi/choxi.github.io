import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

export const metadata: Metadata = {
  title: "choxi",
  description: "roshan choxi's dev blog",
};

// Zodiak (titles) and Satoshi (body), self-hosted variable fonts from
// Fontshare (fontshare.com, ITF Free Font License). next/font serves them from
// this site and sizes a fallback font to match, so the swap doesn't shift text.
const zodiak = localFont({
  src: "./fonts/Zodiak-Variable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-zodiak",
  display: "swap",
});

const satoshi = localFont({
  src: [
    {
      path: "./fonts/Satoshi-Variable.woff2",
      weight: "300 900",
      style: "normal",
    },
    {
      path: "./fonts/Satoshi-VariableItalic.woff2",
      weight: "300 900",
      style: "italic",
    },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

// Code. next/font downloads it at build time and serves it from this site too.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// Restores the reader's theme (night or day, see globals.css) before the first
// paint, so the page doesn't flash the default theme first.
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="day"||t==="night")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="night"
      className={`${zodiak.variable} ${satoshi.variable} ${jetbrainsMono.variable}`}
      // The theme script changes data-theme before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
