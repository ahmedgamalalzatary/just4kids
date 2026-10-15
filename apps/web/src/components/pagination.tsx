import { ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Pagination({ total, limit, offset, onChange, className }: { total: number; limit: number; offset: number; onChange: (offset: number) => void; className?: string }) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm", className)}>
      <span className="text-muted-foreground">Page <span data-numeric>{page}</span> of <span data-numeric>{pages}</span></span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))}>
          <ChevronLeft aria-hidden />Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(offset + limit)}>
          Next<ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
