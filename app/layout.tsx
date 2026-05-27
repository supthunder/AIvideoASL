import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "livesignlanguage",
  description: "Live transcription to ASL signer video",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
