"use client";

import Link from "next/link";
import { ArrowUpRight, Folder, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useDeleteProject } from "@/lib/hooks/use-projects";
import { formatDate } from "@/lib/format";
import type { Project } from "@/lib/store";

export function ProjectCard({
  project,
  onOpen,
}: {
  project: Project;
  onOpen?: (projectId: string) => void;
}) {
  const del = useDeleteProject();

  async function onDelete() {
    await del.mutateAsync(project.id);
    toast.success("Project deleted");
  }

  return (
    <div className="group bg-card hover:border-primary/30 relative flex min-h-32 flex-col gap-3 rounded-lg border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(project.id)}
          className="focus-visible:ring-ring flex flex-1 flex-col gap-3 rounded-md pr-9 text-left outline-none focus-visible:ring-2"
        >
          <div className="flex items-start gap-3">
            <span className="bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
              <Folder className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{project.name}</span>
              <span className="text-muted-foreground mt-1 block text-xs">
                Updated {formatDate(project.updatedAt)}
              </span>
            </span>
          </div>
          {project.description && (
            <span className="text-muted-foreground line-clamp-2 text-sm leading-5">
              {project.description}
            </span>
          )}
          <span className="text-primary mt-auto inline-flex items-center gap-1 text-xs font-medium">
            Open project <ArrowUpRight className="size-3.5" />
          </span>
        </button>
      ) : (
        <Link
          href={`/projects/${project.id}`}
          className="focus-visible:ring-ring flex flex-1 flex-col gap-3 rounded-md pr-9 outline-none focus-visible:ring-2"
        >
          <div className="flex items-start gap-3">
            <span className="bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
              <Folder className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{project.name}</span>
              <span className="text-muted-foreground mt-1 block text-xs">
                Updated {formatDate(project.updatedAt)}
              </span>
            </span>
          </div>
          {project.description && (
            <span className="text-muted-foreground line-clamp-2 text-sm leading-5">
              {project.description}
            </span>
          )}
          <span className="text-primary mt-auto inline-flex items-center gap-1 text-xs font-medium">
            Open project <ArrowUpRight className="size-3.5" />
          </span>
        </Link>
      )}
      <div className="absolute top-3 right-3 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <ConfirmDialog
          title="Delete project?"
          description="This permanently deletes the project and all of its canvases."
          onConfirm={onDelete}
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label="Delete project">
              <Trash2 />
            </Button>
          }
        />
      </div>
    </div>
  );
}
