import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "choxi",
  description: "roshan choxi's dev blog",
};

// Zodiak (titles) and Satoshi (body) come from Fontshare as variable fonts.
// Fontshare's API returns only the first family in a request, so each family
// gets its own stylesheet. `@1` is the upright variable file, `@2` the italic.
const FONTS = [
  "https://api.fontshare.com/v2/css?f[]=zodiak@1&display=swap",
  "https://api.fontshare.com/v2/css?f[]=satoshi@1,2&display=swap",
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        {FONTS.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
