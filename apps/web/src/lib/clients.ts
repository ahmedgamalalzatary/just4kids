export type ClientStatusFilter = "all" | "active" | "stopped";

export const clientStatusOptions: { value: ClientStatusFilter; label: string }[] = [
  { value: "all", label: "كل العملاء" },
  { value: "active", label: "النشطون" },
  { value: "stopped", label: "الموقوفون" },
];

export function clientStatusLabel(enabled: boolean): string {
  return enabled ? "نشط" : "موقوف";
}
