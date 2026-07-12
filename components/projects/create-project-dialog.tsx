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
import { useCustomers } from "@/lib/hooks/use-workspace-records";
import { useCreateProject } from "@/lib/hooks/use-projects";
import type { Project } from "@/lib/store";
import type { CustomerRecord, EmployeeInput } from "@/lib/workspace-records";

function fuzzyMatch(value: string, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const haystack = value.toLocaleLowerCase();
  if (haystack.includes(needle)) return true;
  let index = 0;
  for (const character of haystack) {
    if (character === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

function employeeEmail(employee: EmployeeInput, domain: string): string {
  return `${employee.emailPrefix}@${domain}`;
}

function buildProjectDescription(customer: CustomerRecord, employee: EmployeeInput): string {
  return JSON.stringify({
    version: 1,
    customer: {
      id: customer.id,
      name: customer.company.companyName,
      domain: customer.company.emailDomainSuffix,
    },
    employee: {
      userName: employee.userName,
      title: employee.title,
      email: employeeEmail(employee, customer.company.emailDomainSuffix),
      tel: employee.tel,
    },
  });
}

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
  const [customerQuery, setCustomerQuery] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedEmployeeKey, setSelectedEmployeeKey] = useState<string | null>(null);
  const create = useCreateProject();
  const customers = useCustomers();
  const customerOptions = customers.data ?? [];
  const selectedCustomer =
    customerOptions.find((customer) => customer.id === selectedCustomerId) ?? null;
  const employeeOptions = selectedCustomer?.employees ?? [];
  const effectiveEmployeeKey =
    employeeOptions.length === 1
      ? `${employeeOptions[0]?.emailPrefix ?? ""}:${employeeOptions[0]?.userName ?? ""}`
      : selectedEmployeeKey;
  const selectedEmployee =
    employeeOptions.find(
      (employee) => `${employee.emailPrefix}:${employee.userName}` === effectiveEmployeeKey,
    ) ?? null;
  const visibleCustomers = customerOptions.filter((customer) =>
    fuzzyMatch(
      `${customer.company.companyName} ${customer.company.emailDomainSuffix}`,
      customerQuery,
    ),
  );
  const visibleEmployees = employeeOptions.filter((employee) =>
    fuzzyMatch(
      `${employee.userName} ${employee.title} ${employee.tel} ${employeeEmail(
        employee,
        selectedCustomer?.company.emailDomainSuffix ?? "",
      )}`,
      employeeQuery,
    ),
  );

  function reset() {
    setName("");
    setCustomerQuery("");
    setEmployeeQuery("");
    setSelectedCustomerId(null);
    setSelectedEmployeeKey(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !selectedCustomer || !selectedEmployee) return;
    try {
      const project = await create.mutateAsync({
        name,
        description: buildProjectDescription(selectedCustomer, selectedEmployee),
      });
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
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Choose the customer contact first, then name the project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 rounded-lg border p-3">
            <Label htmlFor="project-customer">Customer company</Label>
            <Input
              id="project-customer"
              autoFocus
              className="h-10"
              placeholder="Fuzzy search customer company"
              value={customerQuery}
              onChange={(event) => {
                setCustomerQuery(event.target.value);
                setSelectedCustomerId(null);
                setSelectedEmployeeKey(null);
              }}
            />
            <div className="bg-background max-h-48 overflow-y-auto rounded-md border">
              {customers.isLoading ? (
                <p className="text-muted-foreground px-3 py-4 text-sm">Loading customers...</p>
              ) : visibleCustomers.length ? (
                visibleCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className="hover:bg-muted/50 flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                    onClick={() => {
                      setSelectedCustomerId(customer.id);
                      setCustomerQuery(customer.company.companyName);
                      setEmployeeQuery("");
                      setSelectedEmployeeKey(null);
                    }}
                  >
                    <span>
                      <span className="block font-medium">{customer.company.companyName}</span>
                      <span className="text-muted-foreground block text-xs">
                        @{customer.company.emailDomainSuffix}
                      </span>
                    </span>
                    {selectedCustomerId === customer.id ? (
                      <span className="text-primary text-xs font-medium">Selected</span>
                    ) : null}
                  </button>
                ))
              ) : (
                <p className="text-muted-foreground px-3 py-4 text-sm">No customer found.</p>
              )}
            </div>
          </div>
          {selectedCustomer ? (
            <div className="grid gap-3 rounded-lg border p-3">
              <Label htmlFor="project-employee">Employer / contact</Label>
              {employeeOptions.length > 1 ? (
                <Input
                  id="project-employee"
                  className="h-10"
                  placeholder="Fuzzy search employee"
                  value={employeeQuery}
                  onChange={(event) => {
                    setEmployeeQuery(event.target.value);
                    setSelectedEmployeeKey(null);
                  }}
                />
              ) : null}
              <div className="bg-background max-h-40 overflow-y-auto rounded-md border">
                {visibleEmployees.length ? (
                  visibleEmployees.map((employee) => {
                    const key = `${employee.emailPrefix}:${employee.userName}`;
                    return (
                      <button
                        key={key}
                        type="button"
                        className="hover:bg-muted/50 flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                        onClick={() => {
                          setSelectedEmployeeKey(key);
                          setEmployeeQuery(employee.userName);
                        }}
                      >
                        <span>
                          <span className="block font-medium">{employee.userName}</span>
                          <span className="text-muted-foreground block text-xs">
                            {employee.title} ·{" "}
                            {employeeEmail(employee, selectedCustomer.company.emailDomainSuffix)}
                          </span>
                        </span>
                        {effectiveEmployeeKey === key ? (
                          <span className="text-primary text-xs font-medium">Selected</span>
                        ) : null}
                      </button>
                    );
                  })
                ) : (
                  <p className="text-muted-foreground px-3 py-4 text-sm">No employee found.</p>
                )}
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              className="h-10"
              placeholder="Untitled project"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button
              type="submit"
              disabled={create.isPending || !name.trim() || !selectedCustomer || !selectedEmployee}
            >
              {create.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
