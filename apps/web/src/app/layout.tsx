import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/readex-pro";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "just4kids", template: "%s · just4kids" },
  description: "إدارة حجوزات الحلاقة المنزلية",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1120" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
