import type { Metadata } from "next";
import { Roboto_Flex } from "next/font/google";
import "material-symbols/rounded.css";
import "./globals.css";
import { Providers } from "@/components/providers";

const robotoFlex = Roboto_Flex({
  subsets: ["latin"],
  variable: "--font-roboto-flex",
  display: "swap",
  axes: ["wdth", "opsz"],
});

export const metadata: Metadata = {
  title: { template: "%s · Alumni Connect", default: "Alumni Connect" },
  description: "Verified forum for students and alumni",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${robotoFlex.variable} h-full`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
