"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// Native date/time pickers open only from a ~20px icon when used with a mouse, so a click
// on the empty-looking field appeared to do nothing. These types open their picker from anywhere in the field.
const pickerTypes = new Set(["date", "time", "datetime-local", "month", "week"])

function Input({ className, type, onClick, ...props }: React.ComponentProps<"input">) {
  const hasPicker = type !== undefined && pickerTypes.has(type)
  return (
    <input
      type={type}
      data-slot="input"
      onClick={event => {
        onClick?.(event)
        if (!hasPicker || event.defaultPrevented || props.readOnly || props.disabled) return
        try {
          event.currentTarget.showPicker()
        } catch {
          // Browsers without showPicker, or that refuse it, keep their default behaviour.
        }
      }}
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-base transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        hasPicker && "cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
