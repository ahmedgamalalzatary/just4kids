"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil, Plus, Store } from "lucide-react";
import { AdminOnly } from "@/components/app-shell";
import { Field, FormAlert } from "@/components/field";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBranches, useCreateBranch, useUpdateBranch } from "@/lib/api/hooks";
import type { Branch } from "@/lib/api/types";
import { branchFormSchema, type BranchForm } from "@/lib/forms";

function BranchDialog({ branch, open, onOpenChange }: { branch: Branch | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateBranch();
  const update = useUpdateBranch();
  const mutation = branch ? update : create;
  const form = useForm<BranchForm, unknown, ReturnType<typeof branchFormSchema.parse>>({
    resolver: zodResolver(branchFormSchema),
    values: branch ? { name: branch.name, address: branch.address } : { name: "", address: "" },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(values => {
    const done = () => { toast.success(branch ? "Branch saved" : "Branch added"); onOpenChange(false); };
    if (branch) update.mutate({ id: branch.id, ...values }, { onSuccess: done });
    else create.mutate(values, { onSuccess: done });
  });

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) { create.reset(); update.reset(); } onOpenChange(value); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{branch ? "Edit branch" : "Add branch"}</DialogTitle>
          <DialogDescription>Branches support salon entries and reports. Each branch has a name and an address.</DialogDescription>
        </DialogHeader>
        <form id="branch-form" onSubmit={submit} noValidate className="grid gap-4">
          <Field label="Branch name" error={errors.name?.message}><Input {...form.register("name")} /></Field>
          <Field label="Address" error={errors.address?.message}><Textarea rows={2} {...form.register("address")} /></Field>
        </form>
        <FormAlert error={mutation.error} />
        <DialogFooter>
          <Button type="submit" form="branch-form" disabled={mutation.isPending}>{branch ? "Save changes" : "Add branch"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BranchesScreen() {
  const branches = useBranches();
  const [editing, setEditing] = useState<Branch | null>(null);
  const [open, setOpen] = useState(false);
  const openDialog = (branch: Branch | null) => { setEditing(branch); setOpen(true); };

  return (
    <>
      <PageHeader title="Branches" description="Salon branches and their addresses." actions={<Button onClick={() => openDialog(null)}><Plus aria-hidden />Add branch</Button>} />
      <Card>
        {branches.isPending ? <LoadingRows rows={3} /> : branches.isError ? <ErrorState error={branches.error} onRetry={() => branches.refetch()} /> : branches.data.length === 0 ? (
          <EmptyState icon={Store} title="No branches yet" description="Add the first branch to record salon collections and view reports." action={<Button onClick={() => openDialog(null)}><Plus aria-hidden />Add branch</Button>} />
        ) : (
          <>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.data.map(branch => (
                  <TableRow key={branch.id}>
                    <TableCell><p className="font-medium">{branch.name}</p></TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{branch.address}</TableCell>
                    <TableCell className="text-end"><Button variant="ghost" size="sm" onClick={() => openDialog(branch)}><Pencil aria-hidden />Edit</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ul className="divide-y divide-border md:hidden">
              {branches.data.map(branch => (
                <li key={branch.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{branch.name}</p>
                    <p className="text-xs text-muted-foreground">{branch.address}</p>
                  </div>
                  <Button variant="outline" size="icon-sm" aria-label={`Edit ${branch.name}`} onClick={() => openDialog(branch)}><Pencil /></Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <BranchDialog branch={editing} open={open} onOpenChange={setOpen} />
    </>
  );
}

export default function BranchesPage() {
  return <AdminOnly><BranchesScreen /></AdminOnly>;
}
