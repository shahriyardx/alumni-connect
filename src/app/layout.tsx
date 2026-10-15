import type { Metadata } from "next";
import { Google_Sans_Flex } from "next/font/google";
import "material-symbols/rounded.css";
import "./globals.css";
import { Providers } from "@/components/providers";

// next/font has no fallback metrics for Google Sans Flex yet; use system sans.
const sans = Google_Sans_Flex({
  subsets: ["latin"],
  variable: "--font-google-sans",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: { template: "%s · Alumni Connect", default: "Alumni Connect" },
  description: "Verified forum for students and alumni",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} h-full`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
