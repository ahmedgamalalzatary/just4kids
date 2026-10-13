"use client";

import { AdminOnly } from "@/components/app-shell";
import { AreasScreen } from "@/components/areas-screen";

export default function AreasPage() { return <AdminOnly><AreasScreen /></AdminOnly>; }
