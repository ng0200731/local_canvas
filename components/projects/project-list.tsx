"use client";

import { FolderOpen } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { ProjectCard } from "@/components/projects/project-card";
import { useProjects } from "@/lib/hooks/use-projects";

export function ProjectList({
  redirectOnCreate = true,
  onOpenProject,
  onProjectCreated,
}: {
  redirectOnCreate?: boolean;
  onOpenProject?: (projectId: string) => void;
  onProjectCreated?: (projectId: string) => void;
}) {
  const { data: projects, isLoading, isError, error } = useProjects();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <CreateProjectDialog
          redirectOnCreate={redirectOnCreate}
          onCreated={(project) => onProjectCreated?.(project.id)}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-destructive text-sm">
          Failed to load projects: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : projects && projects.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onOpen={onOpenProject} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
          <FolderOpen className="text-muted-foreground size-8" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">No projects yet</p>
            <p className="text-muted-foreground text-sm">
              Create your first project to start arranging canvas nodes.
            </p>
          </div>
          <CreateProjectDialog
            redirectOnCreate={redirectOnCreate}
            onCreated={(project) => onProjectCreated?.(project.id)}
          />
        </div>
      )}
    </div>
  );
}
