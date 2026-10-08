"use client";

import { ErrorState, LoadingRows, PageHeader } from "@/components/page";
import { ExceptionsCard, WeeklyScheduleView } from "@/components/schedule";
import { useMySchedule } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";

export default function MySchedulePage() {
  const session = useSession();
  const isEmployee = session.data?.account.role === "employee";
  const schedule = useMySchedule(isEmployee);

  if (!isEmployee) return <p className="py-16 text-center text-sm text-muted-foreground">هذه الصفحة خاصة بالحلاقين.</p>;
  return (
    <>
      <PageHeader title="جدولي" description="ساعات عملك كما حددها المدير، بتوقيت الكويت. لتغييرها تواصل مع المدير." />
      {schedule.isPending ? <LoadingRows /> : schedule.isError ? <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} /> : (
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr] xl:items-start">
          <WeeklyScheduleView schedule={schedule.data} />
          <ExceptionsCard employeeId={schedule.data.employeeId} schedule={schedule.data} editable={false} />
        </div>
      )}
    </>
  );
}
