"use client";

import Link from "next/link";
import { Folder, Trash2 } from "lucide-react";
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
    <div className="group hover:bg-muted/40 relative flex flex-col gap-2 rounded-lg border p-4 transition-colors">
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(project.id)}
          className="flex flex-col gap-2 pr-8 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2">
            <Folder className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate font-medium">{project.name}</span>
          </div>
          {project.description && (
            <span className="text-muted-foreground line-clamp-1 text-xs">
              {project.description}
            </span>
          )}
          <span className="text-muted-foreground text-xs">
            Updated {formatDate(project.updatedAt)}
          </span>
        </button>
      ) : (
        <Link href={`/projects/${project.id}`} className="flex flex-col gap-2 pr-8">
          <div className="flex items-center gap-2">
            <Folder className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate font-medium">{project.name}</span>
          </div>
          {project.description && (
            <span className="text-muted-foreground line-clamp-1 text-xs">
              {project.description}
            </span>
          )}
          <span className="text-muted-foreground text-xs">
            Updated {formatDate(project.updatedAt)}
          </span>
        </Link>
      )}
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
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
