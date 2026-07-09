"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProject } from "@/lib/hooks/use-projects";
import type { Project } from "@/lib/store";

export function CreateProjectDialog({
  redirectOnCreate = true,
  onCreated,
}: {
  redirectOnCreate?: boolean;
  onCreated?: (project: Project) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const create = useCreateProject();

  function reset() {
    setName("");
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const project = await create.mutateAsync({ name });
      reset();
      setOpen(false);
      toast.success("Project created");
      onCreated?.(project);
      if (redirectOnCreate) {
        router.push(`/projects/${project.id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="shadow-sm">
            <Plus /> New project
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>A project groups one or more canvases.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              autoFocus
              className="h-10"
              placeholder="Untitled project"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
