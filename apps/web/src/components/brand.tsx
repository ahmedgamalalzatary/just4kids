import { cn } from "@/lib/utils";

/** The just4kids wordmark: lowercase Latin name with the "4" set on a sun-yellow block. */
export function Wordmark({ className, size = "default" }: { className?: string; size?: "default" | "lg" }) {
  return (
    <span dir="ltr" aria-label="just4kids" className={cn("inline-flex items-center font-semibold tracking-tight select-none", size === "lg" ? "text-3xl" : "text-xl", className)}>
      <span aria-hidden>just</span>
      <span
        aria-hidden
        className={cn(
          "mx-0.5 inline-grid place-items-center rounded-[0.4em] bg-sun font-bold text-sun-foreground",
          size === "lg" ? "size-10 -rotate-6 text-2xl" : "size-7 -rotate-6 text-base",
        )}
      >
        4
      </span>
      <span aria-hidden>kids</span>
    </span>
  );
}
