import { BadgeDollarSign, Building2, MapPin, UserRound } from "lucide-react";

import type { Project } from "@/lib/store";
import { cn } from "@/lib/utils";

interface ProjectMetadataSummaryProps {
  project: Project;
  compact?: boolean;
  className?: string;
}

export function ProjectMetadataSummary({
  project,
  compact = false,
  className,
}: ProjectMetadataSummaryProps) {
  const currency = project.currencyCode
    ? `${project.currencyCode}${project.currencySymbol ? ` (${project.currencySymbol})` : ""}`
    : null;
  const items = [
    project.customerName
      ? { key: "customer", label: "Customer", value: project.customerName, icon: Building2 }
      : null,
    project.employeeName || project.employeeEmail
      ? {
          key: "employee",
          label: "Employer",
          value: [project.employeeName, project.employeeTitle, project.employeeEmail]
            .filter(Boolean)
            .join(" / "),
          icon: UserRound,
        }
      : null,
    currency
      ? { key: "currency", label: "Currency", value: currency, icon: BadgeDollarSign }
      : null,
    project.destinationCountryName
      ? {
          key: "destination",
          label: "Destination",
          value: project.destinationCountryName,
          icon: MapPin,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (items.length === 0) {
    return project.description && !project.description.trim().startsWith("{") ? (
      <p className={cn("text-muted-foreground text-sm leading-5", className)}>
        {project.description}
      </p>
    ) : null;
  }

  if (compact) {
    return (
      <p className={cn("text-muted-foreground line-clamp-2 text-sm leading-5", className)}>
        {items.map((item) => item.value).join(" / ")}
      </p>
    );
  }

  return (
    <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.key} className="min-w-0">
            <dt className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <Icon className="size-3.5" />
              {item.label}
            </dt>
            <dd className="mt-1 text-sm font-medium break-words">{item.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}
