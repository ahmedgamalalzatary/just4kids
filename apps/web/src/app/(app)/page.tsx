"use client";

import { AdminHome, BarberHome } from "@/components/home";
import { useSession } from "@/lib/api/session";

export default function HomePage() {
  const session = useSession();
  return session.data?.account.role === "admin" ? <AdminHome /> : <BarberHome />;
}
