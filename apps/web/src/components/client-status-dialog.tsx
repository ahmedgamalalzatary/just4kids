"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Field, FormAlert } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useSetClientStatus } from "@/lib/api/hooks";
import type { Client } from "@/lib/api/types";

/** Stops or reactivates a client. A reason is required and recorded in the client's status history. */
export function ClientStatusDialog({ client, open, onOpenChange }: { client: Client; open: boolean; onOpenChange: (open: boolean) => void }) {
  const setStatus = useSetClientStatus();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const target = !client.enabled; // reactivate when currently stopped

  const submit = () => {
    if (!reason.trim()) { setError("اكتب السبب"); return; }
    setError(null);
    setStatus.mutate({ id: client.id, enabled: target, reason: reason.trim() }, {
      onSuccess: () => { toast.success(target ? "تمت إعادة تفعيل العميل" : "تم إيقاف العميل"); setReason(""); onOpenChange(false); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) { setStatus.reset(); setReason(""); setError(null); } onOpenChange(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{target ? "إعادة تفعيل العميل" : "إيقاف العميل"}</DialogTitle>
          <DialogDescription>{target ? "سيعود العميل لاستقبال الحجوزات الجديدة." : "العميل الموقوف لا يستقبل حجوزات جديدة؛ الحجوزات السابقة لا تتأثر."}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field label="السبب" error={error ?? undefined}>
            <Textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} />
          </Field>
          <FormAlert error={setStatus.error} />
        </div>
        <DialogFooter><Button onClick={submit} disabled={setStatus.isPending}>تأكيد</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
