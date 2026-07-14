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
import { SearchableOptionPicker } from "@/components/searchable-option-picker";
import { useCustomers, useWorkspaceOptions } from "@/lib/hooks/use-workspace-records";
import { useCreateProject } from "@/lib/hooks/use-projects";
import type { Project } from "@/lib/store";
import type { EmployeeInput } from "@/lib/workspace-records";

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
  const [currencyQuery, setCurrencyQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [selectedCurrencyId, setSelectedCurrencyId] = useState<string | null>(null);
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);
  const create = useCreateProject();
  const customers = useCustomers();
  const currencies = useWorkspaceOptions("currency");
  const destinations = useWorkspaceOptions("destination-country");
  const customerOptions = customers.data ?? [];
  const selectedCustomer =
    customerOptions.find((customer) => customer.id === selectedCustomerId) ?? null;
  const employeeOptions = selectedCustomer?.employees ?? [];
  const effectiveEmployeeKey =
    employeeOptions.length === 1 ? (employeeOptions[0]?.id ?? null) : selectedEmployeeKey;
  const selectedEmployee =
    employeeOptions.find((employee) => employee.id === effectiveEmployeeKey) ?? null;
  const selectedCurrency =
    currencies.data?.find((currency) => currency.id === selectedCurrencyId) ?? null;
  const selectedDestination =
    destinations.data?.find((destination) => destination.id === selectedDestinationId) ?? null;
  const currencyOptions = (currencies.data ?? []).map((currency) => ({
    value: currency.id,
    label: `${currency.code} - ${currency.name}`,
    description: currency.symbol ?? undefined,
    searchText: `${currency.code} ${currency.name} ${currency.symbol ?? ""}`,
    isFavorite: currency.isFavorite,
  }));
  const destinationOptions = (destinations.data ?? []).map((destination) => ({
    value: destination.id,
    label: destination.name,
    description: destination.code,
    searchText: `${destination.name} ${destination.code}`,
    isFavorite: destination.isFavorite,
  }));
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
    setCurrencyQuery("");
    setDestinationQuery("");
    setSelectedCustomerId(null);
    setSelectedEmployeeKey(null);
    setSelectedCurrencyId(null);
    setSelectedDestinationId(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (
      !name.trim() ||
      !selectedCustomer ||
      !selectedEmployee ||
      !selectedCurrency ||
      !selectedDestination
    )
      return;
    try {
      const project = await create.mutateAsync({
        name,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.company.companyName,
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.userName,
        employeeTitle: selectedEmployee.title,
        employeeEmail: employeeEmail(selectedEmployee, selectedCustomer.company.emailDomainSuffix),
        employeeTel: selectedEmployee.tel,
        currencyCode: selectedCurrency.code,
        currencyName: selectedCurrency.name,
        currencySymbol: selectedCurrency.symbol,
        destinationCountryCode: selectedDestination.code,
        destinationCountryName: selectedDestination.name,
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
                    const key = employee.id;
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="project-currency">Currency</Label>
              <SearchableOptionPicker
                id="project-currency"
                query={currencyQuery}
                value={selectedCurrencyId}
                options={currencyOptions}
                placeholder="Type a code, name, or symbol"
                emptyMessage="No currencies are configured. Add one in Settings."
                noMatchesMessage="No currency matches this search."
                loading={currencies.isLoading}
                error={currencies.isError}
                onQueryChange={setCurrencyQuery}
                onValueChange={setSelectedCurrencyId}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-destination">Delivery destination</Label>
              <SearchableOptionPicker
                id="project-destination"
                query={destinationQuery}
                value={selectedDestinationId}
                options={destinationOptions}
                placeholder="Type a country name or code"
                emptyMessage="No destinations are configured. Add one in Settings."
                noMatchesMessage="No destination matches this search."
                loading={destinations.isLoading}
                error={destinations.isError}
                onQueryChange={setDestinationQuery}
                onValueChange={setSelectedDestinationId}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button
              type="submit"
              disabled={
                create.isPending ||
                !name.trim() ||
                !selectedCustomer ||
                !selectedEmployee ||
                !selectedCurrency ||
                !selectedDestination
              }
            >
              {create.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
