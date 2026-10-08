"use client";

import { useId, type ReactNode } from "react";
import { Slot } from "radix-ui";
import { AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * Labels one form control and links its hint and error for screen readers.
 * The single child control receives `id`, `aria-invalid`, and `aria-describedby`.
 */
export function Field({ label, error, hint, optional, className, children }: {
  label: string; error?: string | undefined; hint?: ReactNode; optional?: boolean; className?: string; children: ReactNode;
}) {
  const id = useId();
  const described = [hint && !error ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="text-xs font-normal text-muted-foreground">(اختياري)</span> : null}
      </Label>
      <Slot.Root id={id} aria-invalid={error ? true : undefined} aria-describedby={described}>{children}</Slot.Root>
      {hint && !error ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Shows a failed request's message above a form's actions. */
export function FormAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{errorMessage(error)}</span>
    </div>
  );
}
