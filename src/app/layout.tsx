import type { Metadata } from "next";
import { Google_Sans_Flex } from "next/font/google";
import "material-symbols/rounded.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { themeInitScript } from "@/lib/theme";

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
    <html
      lang="en"
      className={`${sans.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        {/* Applies a stored theme choice before paint, so there's no flash
            of the wrong theme. "system" (no stored choice) sets nothing and
            falls back to globals.css's prefers-color-scheme media query. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static constant from src/lib/theme.ts, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
