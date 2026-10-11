"use client";

import Image from "next/image";
import { useState } from "react";
import { employeePhotoUrl } from "@/lib/employee";
import { cn } from "@/lib/utils";

/**
 * Shows a barber's current photo, falling back to the first letter of their name when
 * no photo has been uploaded (the API returns 404). Decorative: the name is shown separately.
 */
export function EmployeeAvatar({ employeeId, name, version, className }: { employeeId: string; name: string; version?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const base = cn("size-10 shrink-0 rounded-full", className);
  if (failed) {
    return <span className={cn(base, "grid place-items-center bg-secondary font-semibold text-secondary-foreground")} aria-hidden>{name.trim().charAt(0)}</span>;
  }
  return (
    <Image
      src={employeePhotoUrl(employeeId, version)}
      alt=""
      width={128}
      height={128}
      unoptimized
      onError={() => setFailed(true)}
      className={cn(base, "bg-secondary object-cover")}
    />
  );
}
