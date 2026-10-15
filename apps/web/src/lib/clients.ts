export type ClientStatusFilter = "all" | "active" | "stopped";

export const clientStatusOptions: { value: ClientStatusFilter; label: string }[] = [
  { value: "all", label: "All clients" },
  { value: "active", label: "Active" },
  { value: "stopped", label: "Stopped" },
];

export function clientStatusLabel(enabled: boolean): string {
  return enabled ? "Active" : "Stopped";
}
