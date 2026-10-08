"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarOff, CalendarPlus, Plus, Trash2, X } from "lucide-react";
import { Field, FormAlert } from "@/components/field";
import { EmptyState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useDeleteException, useReplaceException, useReplaceWeekly } from "@/lib/api/hooks";
import type { Schedule } from "@/lib/api/types";
import { formatDate, formatWindow, kuwaitNow, minuteOfDay, WEEKDAYS } from "@/lib/kuwait-time";
import { cn } from "@/lib/utils";

type Interval = { startTime: string; endTime: string };

/** Returns an Arabic problem description, or null when the shifts are valid for the API. */
export function intervalsProblem(intervals: Interval[]): string | null {
  if (intervals.some(interval => !interval.startTime || !interval.endTime)) return "اكتب وقت البداية والنهاية لكل فترة";
  if (intervals.some(interval => minuteOfDay(interval.endTime) <= minuteOfDay(interval.startTime))) return "يجب أن تنتهي كل فترة بعد بدايتها في اليوم نفسه";
  const sorted = [...intervals].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let index = 1; index < sorted.length; index++) if (sorted[index]!.startTime < sorted[index - 1]!.endTime) return "الفترات متداخلة";
  return null;
}

function IntervalsEditor({ intervals, onChange, label }: { intervals: Interval[]; onChange: (intervals: Interval[]) => void; label: string }) {
  const set = (index: number, patch: Partial<Interval>) => onChange(intervals.map((interval, current) => (current === index ? { ...interval, ...patch } : interval)));
  return (
    <div className="flex flex-col gap-2">
      {intervals.map((interval, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input type="time" aria-label={`${label}: بداية الفترة ${index + 1}`} value={interval.startTime} onChange={event => set(index, { startTime: event.target.value })} className="w-32" dir="ltr" />
          <span className="text-xs text-muted-foreground">إلى</span>
          <Input type="time" aria-label={`${label}: نهاية الفترة ${index + 1}`} value={interval.endTime} onChange={event => set(index, { endTime: event.target.value })} className="w-32" dir="ltr" />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`حذف الفترة ${index + 1}`} onClick={() => onChange(intervals.filter((_, current) => current !== index))}><X /></Button>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="w-fit text-primary" onClick={() => onChange([...intervals, { startTime: "", endTime: "" }])}>
        <Plus aria-hidden />{intervals.length === 0 ? "إضافة فترة عمل" : "فترة أخرى"}
      </Button>
    </div>
  );
}

function toDays(schedule: Schedule): Interval[][] {
  return WEEKDAYS.map((_, day) => (schedule.days.find(entry => entry.dayOfWeek === day)?.intervals ?? []).map(interval => ({ ...interval })));
}

export function WeeklyScheduleEditor({ employeeId, schedule }: { employeeId: string; schedule: Schedule }) {
  const replace = useReplaceWeekly();
  const [days, setDays] = useState(() => toDays(schedule));
  const [problem, setProblem] = useState<string | null>(null);
  const dirty = JSON.stringify(days) !== JSON.stringify(toDays(schedule));

  const save = () => {
    for (const [day, intervals] of days.entries()) {
      const issue = intervalsProblem(intervals);
      if (issue) { setProblem(`${WEEKDAYS[day]}: ${issue}`); return; }
    }
    setProblem(null);
    replace.mutate(
      { id: employeeId, days: days.map((intervals, dayOfWeek) => ({ dayOfWeek, intervals })).filter(day => day.intervals.length > 0) },
      { onSuccess: updated => { setDays(toDays(updated)); toast.success("تم حفظ الجدول الأسبوعي"); } },
    );
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>ساعات العمل الأسبوعية</CardTitle>
          <CardDescription>تتكرر كل أسبوع بتوقيت الكويت. يمكن تقسيم اليوم إلى عدة فترات.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-0 p-0">
        <ul className="divide-y divide-border">
          {days.map((intervals, day) => (
            <li key={day} className="grid gap-3 px-5 py-4 sm:grid-cols-[7rem_1fr] sm:items-start">
              <p className={cn("pt-2 text-sm font-medium", intervals.length === 0 && "text-muted-foreground")}>{WEEKDAYS[day]}</p>
              <IntervalsEditor label={WEEKDAYS[day]!} intervals={intervals} onChange={next => setDays(days.map((current, index) => (index === day ? next : current)))} />
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
          {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
          <FormAlert error={replace.error} />
          <div className="flex gap-2">
            <Button onClick={save} disabled={!dirty || replace.isPending}>حفظ الجدول</Button>
            {dirty ? <Button variant="ghost" onClick={() => { setDays(toDays(schedule)); setProblem(null); replace.reset(); }}>تراجع</Button> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExceptionDialog({ employeeId, open, onOpenChange }: { employeeId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const replace = useReplaceException();
  const [date, setDate] = useState("");
  const [closed, setClosed] = useState(true);
  const [intervals, setIntervals] = useState<Interval[]>([{ startTime: "", endTime: "" }]);
  const [problem, setProblem] = useState<string | null>(null);

  const save = () => {
    if (!date) { setProblem("اختر التاريخ"); return; }
    const issue = closed ? null : intervals.length === 0 ? "أضف فترة عمل واحدة على الأقل أو اجعل اليوم مغلقاً" : intervalsProblem(intervals);
    if (issue) { setProblem(issue); return; }
    setProblem(null);
    replace.mutate({ id: employeeId, date, intervals: closed ? [] : intervals }, {
      onSuccess: () => { toast.success("تم حفظ الاستثناء"); onOpenChange(false); setDate(""); setClosed(true); setIntervals([{ startTime: "", endTime: "" }]); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) { replace.reset(); setProblem(null); } onOpenChange(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>استثناء ليوم محدد</DialogTitle>
          <DialogDescription>يستبدل ساعات ذلك اليوم فقط، أو يغلقه. استثناء جديد لنفس التاريخ يحل محل السابق.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="التاريخ"><Input type="date" value={date} min={kuwaitNow().date} onChange={event => setDate(event.target.value)} dir="ltr" className="w-48" /></Field>
          <div className="flex items-center gap-3">
            <Switch id="exception-closed" checked={closed} onCheckedChange={setClosed} />
            <Label htmlFor="exception-closed">اليوم مغلق</Label>
          </div>
          {closed ? null : <IntervalsEditor label="الاستثناء" intervals={intervals} onChange={setIntervals} />}
          {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
          <FormAlert error={replace.error} />
        </div>
        <DialogFooter><Button onClick={save} disabled={replace.isPending}>حفظ الاستثناء</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExceptionsCard({ employeeId, schedule, editable }: { employeeId: string; schedule: Schedule; editable: boolean }) {
  const remove = useDeleteException();
  const [open, setOpen] = useState(false);
  const today = kuwaitNow().date;
  const upcoming = schedule.exceptions.filter(exception => exception.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>أيام مستثناة</CardTitle>
          <CardDescription>إغلاق يوم أو تغيير ساعاته لتاريخ معيّن.</CardDescription>
        </div>
        {editable ? <Button variant="outline" size="sm" onClick={() => setOpen(true)}><CalendarPlus aria-hidden />إضافة استثناء</Button> : null}
      </CardHeader>
      {upcoming.length === 0 ? (
        <EmptyState icon={CalendarOff} title="لا توجد استثناءات قادمة" className="py-8" />
      ) : (
        <ul className="divide-y divide-border">
          {upcoming.map(exception => (
            <li key={exception.date} className="flex items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-sm font-medium">{formatDate(exception.date)}</p>
                <p className="text-xs text-muted-foreground">
                  {exception.intervals.length === 0 ? "مغلق" : exception.intervals.map(interval => formatWindow(interval.startTime, interval.endTime)).join("، ")}
                </p>
              </div>
              {editable ? (
                <Button variant="ghost" size="icon-sm" aria-label={`حذف استثناء ${formatDate(exception.date)}`} disabled={remove.isPending}
                  onClick={() => remove.mutate({ id: employeeId, date: exception.date }, { onSuccess: () => toast.success("تم حذف الاستثناء"), onError: error => toast.error(error.message) })}>
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editable ? <ExceptionDialog employeeId={employeeId} open={open} onOpenChange={setOpen} /> : null}
    </Card>
  );
}

/** Read-only weekly hours, used on the employee's own schedule page. */
export function WeeklyScheduleView({ schedule }: { schedule: Schedule }) {
  const days = toDays(schedule);
  const today = new Date(`${kuwaitNow().date}T00:00:00.000Z`).getUTCDay();
  return (
    <Card>
      <CardHeader><CardTitle>ساعات العمل الأسبوعية</CardTitle></CardHeader>
      <ul className="divide-y divide-border">
        {days.map((intervals, day) => (
          <li key={day} className={cn("flex items-center justify-between gap-3 px-5 py-3", day === today && "bg-accent/60")}>
            <span className="text-sm font-medium">{WEEKDAYS[day]}{day === today ? <span className="ms-2 text-xs font-normal text-primary">اليوم</span> : null}</span>
            <span className={cn("text-sm", intervals.length === 0 && "text-muted-foreground")}>
              {intervals.length === 0 ? "إجازة" : intervals.map(interval => formatWindow(interval.startTime, interval.endTime)).join("، ")}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
