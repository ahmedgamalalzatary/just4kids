import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "جست فور كيدز",
  description: "إدارة حجوزات الحلاقة المنزلية",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
