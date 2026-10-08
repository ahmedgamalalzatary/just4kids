"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const options = [
  { value: "light", label: "فاتح", icon: Sun },
  { value: "dark", label: "داكن", icon: Moon },
  { value: "system", label: "حسب الجهاز", icon: Monitor },
] as const;

const subscribe = () => () => {};

/** Three-way theme switch. Renders neutral until mounted because the stored theme is only known in the browser. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <div role="radiogroup" aria-label="مظهر الواجهة" className={cn("inline-flex rounded-md border border-border bg-muted p-0.5", className)}>
      {options.map(option => {
        const selected = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.label}
            onClick={() => setTheme(option.value)}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-[calc(var(--radius)-6px)] text-muted-foreground transition-colors hover:text-foreground",
              selected && "bg-card text-foreground shadow-xs",
            )}
          >
            <option.icon className="size-4" aria-hidden />
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
