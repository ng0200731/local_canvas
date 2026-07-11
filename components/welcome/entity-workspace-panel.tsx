"use client";

import { useId, useMemo, useState } from "react";
import type { ChangeEvent, ClipboardEvent, DragEvent, ReactNode } from "react";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  UserPlus,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  customerCompanySchema,
  employeeSchema,
  hadAtSymbol,
  normalizeEmailDomainSuffix,
  productSchema,
  supplierCompanySchema,
  supplierProductTypeLabels,
  supplierProductTypes,
  type CustomerRecord,
  type CustomerCompanyInput,
  type EmployeeInput,
  type ProductRecord,
  type SupplierCompanyInput,
  type SupplierRecord,
  type SupplierProductType,
} from "@/lib/workspace-records";
import {
  useCustomers,
  useProducts,
  useSuppliers,
  useUpsertCustomer,
  useUpsertProduct,
  useUpsertSupplier,
} from "@/lib/hooks/use-workspace-records";
import { uploadImage } from "@/lib/upload";
import { cn } from "@/lib/utils";

type EntityKind = "customer" | "supplier" | "product";
type PartyKind = "customer" | "supplier";
type PartySubTab = "company" | "employee";

interface EmployeeRow extends EmployeeInput {
  id: string;
}

type PartyRecord = CustomerRecord | SupplierRecord;

type CustomerCompanyState = CustomerCompanyInput;

type SupplierCompanyState = SupplierCompanyInput;

interface ProductImageState {
  name: string;
  url: string;
  storagePath: string | null;
}

interface ProductFormState {
  subject: string;
  detail: string;
  material: string;
  colorNotes: string;
  image: ProductImageState | null;
}

type CompanyErrors = Partial<Record<keyof CustomerCompanyInput, string>> &
  Partial<Record<keyof SupplierCompanyInput, string>>;
type FieldParseResult =
  | { success: true }
  | {
      success: false;
      error: {
        issues: Array<{
          path: readonly PropertyKey[];
          message: string;
        }>;
      };
    };

const emptyEmployee = (): EmployeeRow => ({
  id: crypto.randomUUID(),
  userName: "",
  emailPrefix: "",
  title: "",
  tel: "",
});

const partyLabels: Record<PartyKind, string> = {
  customer: "Customer",
  supplier: "Supplier",
};

function normalizeSearchValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function fuzzyMatches(value: string, normalizedQuery: string) {
  if (!normalizedQuery) return true;

  const normalizedValue = normalizeSearchValue(value);
  if (normalizedValue.includes(normalizedQuery)) return true;

  let queryIndex = 0;
  for (const character of normalizedValue) {
    if (character === normalizedQuery[queryIndex]) queryIndex += 1;
    if (queryIndex === normalizedQuery.length) return true;
  }
  return false;
}

function getEmployeeEmail(employee: EmployeeInput, domainSuffix: string) {
  return `${employee.emailPrefix}@${normalizeEmailDomainSuffix(domainSuffix)}`;
}

function getEmployeeSearchText(employee: EmployeeInput, domainSuffix: string) {
  return [
    employee.userName,
    employee.emailPrefix,
    getEmployeeEmail(employee, domainSuffix),
    employee.title,
    employee.tel,
  ].join(" ");
}

function getPartyRecordSearchText(record: PartyRecord) {
  const companyDetail =
    "type" in record.company
      ? record.company.type
      : record.company.productTypes
          .map((productType) => supplierProductTypeLabels[productType])
          .join(" ");

  return [
    record.company.companyName,
    record.company.emailDomainSuffix,
    companyDetail,
    ...record.employees.map((employee) =>
      getEmployeeSearchText(employee, record.company.emailDomainSuffix),
    ),
  ].join(" ");
}

const dummyCustomerCompanies: CustomerCompanyState[] = [
  {
    companyName: "Northstar Apparel Group",
    emailDomainSuffix: "northstarapparel.com",
    type: "Brand owner",
  },
  {
    companyName: "Cobalt Streetwear Co.",
    emailDomainSuffix: "cobaltstreetwear.com",
    type: "Distributor",
  },
  {
    companyName: "Harborline Retail Ltd.",
    emailDomainSuffix: "harborlineretail.com",
    type: "Buying office",
  },
];

const dummySupplierCompanies: SupplierCompanyState[] = [
  {
    companyName: "Bright Trim Manufacturing",
    emailDomainSuffix: "brighttrim.com",
    productTypes: ["label", "tag", "zipper"],
  },
  {
    companyName: "Metro Embroidery Works",
    emailDomainSuffix: "metroembroidery.com",
    productTypes: ["embroidery-patch", "snap"],
  },
  {
    companyName: "Pearl Packaging Supply",
    emailDomainSuffix: "pearlpackaging.com",
    productTypes: ["tag", "label"],
  },
];

const dummyEmployees: EmployeeRow[] = [
  {
    id: "dummy-employee-1",
    userName: "Mia Chen",
    emailPrefix: "mia.chen",
    title: "Merchandising Manager",
    tel: "+86 755 8821 1042",
  },
  {
    id: "dummy-employee-2",
    userName: "Aaron Lee",
    emailPrefix: "aaron.lee",
    title: "Production Coordinator",
    tel: "+86 755 8821 1043",
  },
];

function createDummyEmployee(index: number): EmployeeRow {
  const dummy = dummyEmployees[index % dummyEmployees.length];
  const cycle = Math.floor(index / dummyEmployees.length);
  const suffix = cycle > 0 ? ` ${cycle + 1}` : "";
  const emailSuffix = cycle > 0 ? `.${cycle + 1}` : "";

  return {
    ...dummy,
    id: crypto.randomUUID(),
    userName: `${dummy.userName}${suffix}`,
    emailPrefix: `${dummy.emailPrefix}${emailSuffix}`,
  };
}

const dummyProducts: ProductFormState[] = [
  {
    subject: "Woven label set for summer capsule",
    detail:
      "Main neck label, care label, and hang tag package. Match soft-hand finish and keep colors within approved Pantone range.",
    material: "Damask woven polyester, 80D",
    colorNotes: "Black ground, warm white logo, copper accent thread",
    image: null,
  },
  {
    subject: "Matte paper hang tag program",
    detail:
      "Two-size tag set with reinforced eyelets, cotton cord, and barcode area reserved on the reverse side.",
    material: "450gsm matte art card",
    colorNotes: "Ivory stock, charcoal print, muted green accent",
    image: null,
  },
  {
    subject: "Antique brass snap sample",
    detail:
      "Logo-engraved snap set for outerwear trial. Confirm pull strength and plating consistency before bulk approval.",
    material: "Brass alloy with antique finish",
    colorNotes: "Aged brass, low shine, black enamel logo fill",
    image: null,
  },
];

function getDummyCustomerCompany(index: number): CustomerCompanyState {
  return { ...dummyCustomerCompanies[index % dummyCustomerCompanies.length] };
}

function getDummySupplierCompany(index: number): SupplierCompanyState {
  const company = dummySupplierCompanies[index % dummySupplierCompanies.length];
  return { ...company, productTypes: [...company.productTypes] };
}

function getDummyProduct(index: number): ProductFormState {
  const product = dummyProducts[index % dummyProducts.length];
  return { ...product, image: product.image ? { ...product.image } : null };
}

function getZodFieldErrors(result: FieldParseResult) {
  const errors: Record<string, string> = {};
  if (result.success) return errors;

  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

function FormField({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-semibold tracking-wide uppercase">{label}</Label>
      {children}
      {error ? <p className="text-destructive text-xs leading-5">{error}</p> : null}
      {!error && hint ? <p className="text-muted-foreground text-xs leading-5">{hint}</p> : null}
    </div>
  );
}

function SubTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "focus-visible:ring-ring h-9 rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ProductTypeMultiSelect({
  value,
  onChange,
}: {
  value: SupplierProductType[];
  onChange: (next: SupplierProductType[]) => void;
}) {
  function toggleProductType(productType: SupplierProductType) {
    onChange(
      value.includes(productType)
        ? value.filter((current) => current !== productType)
        : [...value, productType],
    );
  }

  const label = value.length
    ? value.map((productType) => supplierProductTypeLabels[productType]).join(", ")
    : "Choose product types";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" className="w-full" />}>
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>Product type</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {supplierProductTypes.map((productType) => (
          <DropdownMenuCheckboxItem
            key={productType}
            checked={value.includes(productType)}
            onClick={(event) => {
              event.preventDefault();
              toggleProductType(productType);
            }}
          >
            {supplierProductTypeLabels[productType]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmployeeEditor({
  employees,
  domainSuffix,
  onEmployeesChange,
  onSave,
  isEditing,
}: {
  employees: EmployeeRow[];
  domainSuffix: string;
  onEmployeesChange: (employees: EmployeeRow[]) => void;
  onSave: () => Promise<void>;
  isEditing: boolean;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [dummyInputCount, setDummyInputCount] = useState(0);
  const normalizedDomain = normalizeEmailDomainSuffix(domainSuffix);

  function updateEmployee(id: string, key: keyof EmployeeInput, value: string) {
    onEmployeesChange(
      employees.map((employee) => (employee.id === id ? { ...employee, [key]: value } : employee)),
    );
  }

  function addEmployee() {
    onEmployeesChange([...employees, emptyEmployee()]);
  }

  function removeEmployee(id: string) {
    onEmployeesChange(
      employees.length === 1
        ? [emptyEmployee()]
        : employees.filter((employee) => employee.id !== id),
    );
  }

  function fillDummyEmployees() {
    const targetIndex = Math.max(employees.length - 1, 0);
    const dummy = createDummyEmployee(dummyInputCount);
    onEmployeesChange(
      employees.length
        ? employees.map((employee, index) =>
            index === targetIndex ? { ...dummy, id: employee.id } : employee,
          )
        : [dummy],
    );
    setDummyInputCount((count) => count + 1);
    setSubmitted(false);
  }

  function saveEmployees() {
    setSubmitted(true);
    if (employees.every((employee) => employeeSchema.safeParse(employee).success)) void onSave();
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Employee contacts</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Add one or more contact people for this company.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={fillDummyEmployees}>
            <Wand2 />
            Dummy input
          </Button>
          <Button type="button" onClick={addEmployee}>
            <UserPlus />
            Add more
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {employees.map((employee, index) => {
          const parseResult = employeeSchema.safeParse(employee);
          const errors = submitted ? getZodFieldErrors(parseResult) : {};
          return (
            <div key={employee.id} className="bg-background rounded-lg border p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <Badge variant="secondary">Employee {index + 1}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove employee ${index + 1}`}
                  onClick={() => removeEmployee(employee.id)}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="User name" error={errors.userName}>
                  <Input
                    value={employee.userName}
                    onChange={(event) =>
                      updateEmployee(employee.id, "userName", event.target.value)
                    }
                    placeholder="Jane Cooper"
                  />
                </FormField>
                <FormField
                  label="Email prefix"
                  error={errors.emailPrefix}
                  hint={
                    normalizedDomain
                      ? `Email preview: ${employee.emailPrefix || "name"}@${normalizedDomain}`
                      : undefined
                  }
                >
                  <div className="flex">
                    <Input
                      value={employee.emailPrefix}
                      onChange={(event) =>
                        updateEmployee(
                          employee.id,
                          "emailPrefix",
                          event.target.value.trim().replaceAll("@", ""),
                        )
                      }
                      className="rounded-r-none"
                      placeholder="jane.cooper"
                    />
                    <span className="border-input bg-muted text-muted-foreground flex h-8 shrink-0 items-center rounded-r-lg border border-l-0 px-2 text-sm">
                      @{normalizedDomain || "domain.com"}
                    </span>
                  </div>
                </FormField>
                <FormField label="Title" error={errors.title}>
                  <Input
                    value={employee.title}
                    onChange={(event) => updateEmployee(employee.id, "title", event.target.value)}
                    placeholder="Merchandising manager"
                  />
                </FormField>
                <FormField label="Tel" error={errors.tel}>
                  <Input
                    value={employee.tel}
                    onChange={(event) => updateEmployee(employee.id, "tel", event.target.value)}
                    placeholder="+1 212 555 0134"
                  />
                </FormField>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={saveEmployees}>
          <Save />
          {isEditing ? "Update employees" : "Save employees"}
        </Button>
      </div>
    </div>
  );
}

function CustomerCompanyForm({
  value,
  onChange,
  onSaved,
}: {
  value: CustomerCompanyState;
  onChange: (value: CustomerCompanyState) => void;
  onSaved: () => void;
}) {
  const [errors, setErrors] = useState<CompanyErrors>({});
  const [domainPrompt, setDomainPrompt] = useState<string | null>(null);
  const [dummyInputCount, setDummyInputCount] = useState(0);

  function updateField(key: keyof CustomerCompanyState, nextValue: string) {
    if (key === "emailDomainSuffix") {
      setDomainPrompt(
        hadAtSymbol(nextValue) ? "The @ symbol was removed. Enter only the domain suffix." : null,
      );
      onChange({ ...value, [key]: normalizeEmailDomainSuffix(nextValue) });
      return;
    }
    onChange({ ...value, [key]: nextValue });
  }

  function saveCompany() {
    const result = customerCompanySchema.safeParse(value);
    if (!result.success) {
      setErrors(getZodFieldErrors(result));
      return;
    }
    setErrors({});
    onSaved();
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Company details</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Save the company first, then add employee contacts.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onChange(getDummyCustomerCompany(dummyInputCount));
            setDummyInputCount((count) => count + 1);
            setErrors({});
            setDomainPrompt(null);
          }}
        >
          <Wand2 />
          Dummy input
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Company name" error={errors.companyName}>
          <Input
            value={value.companyName}
            onChange={(event) => updateField("companyName", event.target.value)}
            placeholder="Acme Fashion Ltd."
          />
        </FormField>
        <FormField
          label="Email domain suffix"
          error={errors.emailDomainSuffix}
          hint={domainPrompt ?? "Example: acme.com"}
        >
          <div className="flex">
            <span className="border-input bg-muted text-muted-foreground flex h-8 items-center rounded-l-lg border border-r-0 px-2 text-sm">
              @
            </span>
            <Input
              value={value.emailDomainSuffix}
              onChange={(event) => updateField("emailDomainSuffix", event.target.value)}
              className="rounded-l-none"
              placeholder="acme.com"
            />
          </div>
        </FormField>
        <FormField label="Type" error={errors.type}>
          <Input
            value={value.type}
            onChange={(event) => updateField("type", event.target.value)}
            placeholder="Brand owner, agent, distributor..."
          />
        </FormField>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={saveCompany}>
          <Save />
          Save and add employees
        </Button>
      </div>
    </div>
  );
}

function SupplierCompanyForm({
  value,
  onChange,
  onSaved,
}: {
  value: SupplierCompanyState;
  onChange: (value: SupplierCompanyState) => void;
  onSaved: () => void;
}) {
  const [errors, setErrors] = useState<CompanyErrors>({});
  const [domainPrompt, setDomainPrompt] = useState<string | null>(null);
  const [dummyInputCount, setDummyInputCount] = useState(0);

  function updateTextField(key: "companyName" | "emailDomainSuffix", nextValue: string) {
    if (key === "emailDomainSuffix") {
      setDomainPrompt(
        hadAtSymbol(nextValue) ? "The @ symbol was removed. Enter only the domain suffix." : null,
      );
      onChange({ ...value, [key]: normalizeEmailDomainSuffix(nextValue) });
      return;
    }
    onChange({ ...value, [key]: nextValue });
  }

  function saveCompany() {
    const result = supplierCompanySchema.safeParse(value);
    if (!result.success) {
      setErrors(getZodFieldErrors(result));
      return;
    }
    setErrors({});
    onSaved();
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Supplier company</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Choose the supplier product types, then continue to employees.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onChange(getDummySupplierCompany(dummyInputCount));
            setDummyInputCount((count) => count + 1);
            setErrors({});
            setDomainPrompt(null);
          }}
        >
          <Wand2 />
          Dummy input
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Company name" error={errors.companyName}>
          <Input
            value={value.companyName}
            onChange={(event) => updateTextField("companyName", event.target.value)}
            placeholder="Supplier company name"
          />
        </FormField>
        <FormField
          label="Email domain suffix"
          error={errors.emailDomainSuffix}
          hint={domainPrompt ?? "Example: supplier.com"}
        >
          <div className="flex">
            <span className="border-input bg-muted text-muted-foreground flex h-8 items-center rounded-l-lg border border-r-0 px-2 text-sm">
              @
            </span>
            <Input
              value={value.emailDomainSuffix}
              onChange={(event) => updateTextField("emailDomainSuffix", event.target.value)}
              className="rounded-l-none"
              placeholder="supplier.com"
            />
          </div>
        </FormField>
        <FormField label="Product type" error={errors.productTypes}>
          <ProductTypeMultiSelect
            value={value.productTypes}
            onChange={(productTypes) => onChange({ ...value, productTypes })}
          />
        </FormField>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={saveCompany}>
          <Save />
          Save and add employees
        </Button>
      </div>
    </div>
  );
}

function PartyWorkspacePanel({
  kind,
  mode,
  onModeChange,
  formVersion,
}: {
  kind: PartyKind;
  mode: "new" | "records";
  onModeChange: (mode: "new" | "records") => void;
  formVersion: number;
}) {
  const [activeSubTab, setActiveSubTab] = useState<PartySubTab>("company");
  const [customerCompany, setCustomerCompany] = useState<CustomerCompanyState>({
    companyName: "",
    emailDomainSuffix: "",
    type: "",
  });
  const [supplierCompany, setSupplierCompany] = useState<SupplierCompanyState>({
    companyName: "",
    emailDomainSuffix: "",
    productTypes: [],
  });
  const [employees, setEmployees] = useState<EmployeeRow[]>([emptyEmployee()]);
  const [query, setQuery] = useState("");
  const [expandedRecordIds, setExpandedRecordIds] = useState<string[]>([]);
  const [searchCollapsedRecordKeys, setSearchCollapsedRecordKeys] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeFormVersion, setActiveFormVersion] = useState(formVersion);
  const customers = useCustomers();
  const suppliers = useSuppliers();
  const upsertCustomer = useUpsertCustomer();
  const upsertSupplier = useUpsertSupplier();

  const domainSuffix =
    kind === "customer" ? customerCompany.emailDomainSuffix : supplierCompany.emailDomainSuffix;
  const records: PartyRecord[] =
    kind === "customer" ? (customers.data ?? []) : (suppliers.data ?? []);
  const isLoadingRecords = kind === "customer" ? customers.isLoading : suppliers.isLoading;
  const isRecordsError = kind === "customer" ? customers.isError : suppliers.isError;
  const recordsError = kind === "customer" ? customers.error : suppliers.error;
  const isSaving = kind === "customer" ? upsertCustomer.isPending : upsertSupplier.isPending;
  const normalizedQuery = normalizeSearchValue(query);

  if (activeFormVersion !== formVersion) {
    setActiveFormVersion(formVersion);
    setCustomerCompany({ companyName: "", emailDomainSuffix: "", type: "" });
    setSupplierCompany({ companyName: "", emailDomainSuffix: "", productTypes: [] });
    setEmployees([emptyEmployee()]);
    setExpandedRecordIds([]);
    setSearchCollapsedRecordKeys([]);
    setEditingId(null);
    setActiveSubTab("company");
  }

  async function saveRecord() {
    const company = kind === "customer" ? customerCompany : supplierCompany;
    try {
      if (kind === "customer") {
        await upsertCustomer.mutateAsync({
          id: editingId,
          input: { company: company as CustomerCompanyState, employees },
        });
      } else {
        await upsertSupplier.mutateAsync({
          id: editingId,
          input: { company: company as SupplierCompanyState, employees },
        });
      }
      toast.success(`${partyLabels[kind]} saved`);
      setEditingId(null);
      setActiveSubTab("company");
      setSearchCollapsedRecordKeys([]);
      onModeChange("records");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to save ${kind}`);
    }
  }

  function editRecord(record: PartyRecord, tab: PartySubTab) {
    if (kind === "customer") setCustomerCompany(record.company as CustomerCompanyState);
    else setSupplierCompany(record.company as SupplierCompanyState);
    setEmployees(record.employees);
    setEditingId(record.id);
    setActiveSubTab(tab);
  }

  function getSearchCollapseKey(recordId: string) {
    return `${normalizedQuery}::${recordId}`;
  }

  function toggleRecordExpansion(recordId: string, isExpanded: boolean) {
    const searchCollapseKey = getSearchCollapseKey(recordId);

    if (isExpanded) {
      setExpandedRecordIds((current) => current.filter((id) => id !== recordId));
      setSearchCollapsedRecordKeys((current) =>
        current.includes(searchCollapseKey) ? current : [...current, searchCollapseKey],
      );
      return;
    }

    setExpandedRecordIds((current) =>
      current.includes(recordId) ? current : [...current, recordId],
    );
    setSearchCollapsedRecordKeys((current) =>
      current.filter((key) => key !== searchCollapseKey),
    );
  }

  const visibleRecords = records.filter((record) =>
    fuzzyMatches(getPartyRecordSearchText(record), normalizedQuery),
  );
  const companyIsComplete =
    kind === "customer"
      ? customerCompanySchema.safeParse(customerCompany).success
      : supplierCompanySchema.safeParse(supplierCompany).success;

  if (mode === "records" && editingId === null) {
    return (
      <section className="mx-auto grid w-full max-w-6xl gap-5">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Directory
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            {partyLabels[kind]} records
          </h2>
        </div>
        <div className="bg-card overflow-hidden rounded-lg border shadow-sm">
          <div className="border-b p-4">
            <div className="relative max-w-md">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Search company or employee"
                aria-label="Search records"
              />
            </div>
          </div>
          {isLoadingRecords ? (
            <p className="text-muted-foreground p-10 text-center text-sm">Loading records...</p>
          ) : isRecordsError ? (
            <p className="text-destructive p-10 text-center text-sm">
              Failed to load records:{" "}
              {recordsError instanceof Error ? recordsError.message : "unknown error"}
            </p>
          ) : visibleRecords.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email / domain</th>
                    <th className="px-4 py-3">Details</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                {visibleRecords.map((record) => {
                  const matchingEmployees = normalizedQuery
                    ? record.employees.filter((employee) =>
                        fuzzyMatches(
                          getEmployeeSearchText(employee, record.company.emailDomainSuffix),
                          normalizedQuery,
                        ),
                      )
                    : record.employees;
                  const hasMatchingEmployees =
                    normalizedQuery.length > 0 && matchingEmployees.length > 0;
                  const isAutoExpanded =
                    hasMatchingEmployees &&
                    !searchCollapsedRecordKeys.includes(getSearchCollapseKey(record.id));
                  const isExpanded = expandedRecordIds.includes(record.id) || isAutoExpanded;
                  const employeesToShow = hasMatchingEmployees
                    ? matchingEmployees
                    : record.employees;
                  const employeeCountLabel =
                    record.employees.length === 1
                      ? "1 employee"
                      : `${record.employees.length} employees`;

                  return (
                    <tbody key={record.id} className="border-t first:border-t-0">
                      <tr className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="focus-visible:ring-ring -mx-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium outline-none focus-visible:ring-2"
                            aria-expanded={isExpanded}
                            onClick={() => toggleRecordExpansion(record.id, isExpanded)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="text-muted-foreground size-4" />
                            ) : (
                              <ChevronRight className="text-muted-foreground size-4" />
                            )}
                            <Building2 className="text-muted-foreground size-4" />
                            <span className="min-w-0 truncate">{record.company.companyName}</span>
                          </button>
                        </td>
                        <td className="text-muted-foreground px-4 py-3">
                          @{record.company.emailDomainSuffix}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary">{employeeCountLabel}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => editRecord(record, "company")}
                          >
                            <Pencil />
                            Company Edit
                          </Button>
                        </td>
                      </tr>
                      {isExpanded
                        ? employeesToShow.map((employee) => (
                            <tr key={employee.id} className="bg-muted/10 hover:bg-muted/30">
                              <td className="px-4 py-3 pl-10 font-medium">
                                <div className="flex min-w-0 items-center gap-2">
                                  <UserPlus className="text-muted-foreground size-4" />
                                  <span className="min-w-0 truncate">{employee.userName}</span>
                                </div>
                              </td>
                              <td className="text-muted-foreground px-4 py-3">
                                {getEmployeeEmail(employee, record.company.emailDomainSuffix)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="grid gap-1">
                                  <span>{employee.title}</span>
                                  <span className="text-muted-foreground text-xs">
                                    {employee.tel}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => editRecord(record, "employee")}
                                >
                                  <Pencil />
                                  Employee Edit
                                </Button>
                              </td>
                            </tr>
                          ))
                        : null}
                    </tbody>
                  );
                })}
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground p-10 text-center text-sm">
              {query ? "No matching records." : "No saved records yet."}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-2">
          {editingId !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => {
                setEditingId(null);
                setActiveSubTab("company");
              }}
            >
              <ChevronLeft />
              Back
            </Button>
          ) : null}
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Standard userform
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{partyLabels[kind]} (+)</h2>
        </div>
        <div className="bg-muted flex rounded-lg p-1">
          <SubTabButton
            active={activeSubTab === "company"}
            onClick={() => setActiveSubTab("company")}
          >
            Company
          </SubTabButton>
          <SubTabButton
            active={activeSubTab === "employee"}
            onClick={() => {
              if (companyIsComplete) setActiveSubTab("employee");
            }}
          >
            Employee
          </SubTabButton>
        </div>
      </div>

      <div className="bg-card rounded-lg border p-5 shadow-sm">
        {activeSubTab === "company" && kind === "customer" ? (
          <CustomerCompanyForm
            value={customerCompany}
            onChange={setCustomerCompany}
            onSaved={() => setActiveSubTab("employee")}
          />
        ) : null}

        {activeSubTab === "company" && kind === "supplier" ? (
          <SupplierCompanyForm
            value={supplierCompany}
            onChange={setSupplierCompany}
            onSaved={() => setActiveSubTab("employee")}
          />
        ) : null}

        {activeSubTab === "employee" ? (
          <EmployeeEditor
            employees={employees}
            domainSuffix={domainSuffix}
            onEmployeesChange={setEmployees}
            onSave={saveRecord}
            isEditing={editingId !== null}
          />
        ) : null}
      </div>
      {isSaving ? (
        <div
          className="bg-background/75 fixed inset-0 z-50 grid place-items-center backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="bg-card flex items-center gap-3 rounded-lg border px-5 py-4 shadow-lg">
            <span className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent" />
            <span className="text-sm font-semibold">Saving...</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function getFirstImageFile(fileList: FileList) {
  return Array.from(fileList).find((file) => file.type.startsWith("image/")) ?? null;
}

function ProductWorkspacePanel({
  mode,
  onModeChange,
  formVersion,
}: {
  mode: "new" | "records";
  onModeChange: (mode: "new" | "records") => void;
  formVersion: number;
}) {
  const fileInputId = useId();
  const [form, setForm] = useState<ProductFormState>({
    subject: "",
    detail: "",
    material: "",
    colorNotes: "",
    image: null,
  });
  const [imageError, setImageError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeFormVersion, setActiveFormVersion] = useState(formVersion);
  const [submitted, setSubmitted] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [dummyInputCount, setDummyInputCount] = useState(0);
  const products = useProducts();
  const upsertProduct = useUpsertProduct();

  const hasProductDetail = useMemo(
    () =>
      Boolean(
        form.subject.trim() || form.detail.trim() || form.material.trim() || form.colorNotes.trim(),
      ),
    [form.colorNotes, form.detail, form.material, form.subject],
  );
  const parseResult = productSchema.safeParse(form);
  const errors = submitted ? getZodFieldErrors(parseResult) : {};
  const visibleProducts = (products.data ?? []).filter((product) =>
    [product.subject, product.detail, product.material, product.colorNotes]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );

  if (activeFormVersion !== formVersion) {
    setActiveFormVersion(formVersion);
    setForm({
      subject: "",
      detail: "",
      material: "",
      colorNotes: "",
      image: null,
    });
    setImageError(null);
    setEditingId(null);
    setSubmitted(false);
  }

  async function setImageFromFiles(fileList: FileList) {
    const imageFile = getFirstImageFile(fileList);
    if (!imageFile) {
      setImageError("Drop or paste an image file.");
      return;
    }

    try {
      setIsUploadingImage(true);
      const image = await uploadImage(imageFile);
      setForm((current) => ({
        ...current,
        image: {
          name: imageFile.name || "Pasted image",
          url: image.url,
          storagePath: image.storagePath,
        },
      }));
      setImageError(null);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Unable to read image file.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (event.clipboardData.files.length === 0) return;
    event.preventDefault();
    void setImageFromFiles(event.clipboardData.files);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void setImageFromFiles(event.dataTransfer.files);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (!event.target.files) return;
    void setImageFromFiles(event.target.files);
  }

  async function saveProduct() {
    setSubmitted(true);
    const result = productSchema.safeParse(form);
    if (!result.success) return;

    try {
      await upsertProduct.mutateAsync({ id: editingId, input: result.data });
      toast.success("Product saved");
      setEditingId(null);
      onModeChange("records");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save product");
    }
  }

  function editProduct(product: ProductRecord) {
    setForm({
      subject: product.subject,
      detail: product.detail,
      material: product.material,
      colorNotes: product.colorNotes,
      image: product.image,
    });
    setEditingId(product.id);
    setSubmitted(false);
    setImageError(null);
  }

  if (mode === "records" && editingId === null) {
    return (
      <section className="mx-auto grid w-full max-w-6xl gap-5">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Directory
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Product records</h2>
        </div>
        <div className="bg-card overflow-hidden rounded-lg border shadow-sm">
          <div className="border-b p-4">
            <div className="relative max-w-md">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Search product records"
                aria-label="Search product records"
              />
            </div>
          </div>
          {products.isLoading ? (
            <p className="text-muted-foreground p-10 text-center text-sm">Loading products...</p>
          ) : products.isError ? (
            <p className="text-destructive p-10 text-center text-sm">
              Failed to load products:{" "}
              {products.error instanceof Error ? products.error.message : "unknown error"}
            </p>
          ) : visibleProducts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Material</th>
                    <th className="px-4 py-3">Color notes</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{product.subject}</td>
                      <td className="text-muted-foreground px-4 py-3">{product.material}</td>
                      <td className="px-4 py-3">{product.colorNotes}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => editProduct(product)}
                        >
                          <Pencil />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground p-10 text-center text-sm">
              {query ? "No matching products." : "No saved products yet."}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Standard userform
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Product (+)</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setForm(getDummyProduct(dummyInputCount));
              setDummyInputCount((count) => count + 1);
              setImageError(null);
              setSubmitted(false);
            }}
          >
            <Wand2 />
            Dummy input
          </Button>
          <Button type="button" onClick={saveProduct} disabled={upsertProduct.isPending}>
            <Save />
            {editingId ? "Update product" : "Save product"}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
        <div className="bg-card rounded-lg border p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <Badge variant={hasProductDetail ? "default" : "outline"}>Product detail</Badge>
          </div>
          <div className="grid gap-4">
            <FormField label="Subject" error={errors.subject}>
              <Input
                value={form.subject}
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
                placeholder="Product subject"
              />
            </FormField>
            <FormField label="Product detail" error={errors.detail}>
              <Textarea
                value={form.detail}
                onChange={(event) => setForm({ ...form, detail: event.target.value })}
                className="min-h-32"
                placeholder="Describe product specs, construction, packaging, and quality notes."
              />
            </FormField>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Material" error={errors.material}>
                <Input
                  value={form.material}
                  onChange={(event) => setForm({ ...form, material: event.target.value })}
                  placeholder="Woven polyester, cotton, alloy..."
                />
              </FormField>
              <FormField label="Color notes" error={errors.colorNotes}>
                <Input
                  value={form.colorNotes}
                  onChange={(event) => setForm({ ...form, colorNotes: event.target.value })}
                  placeholder="Pantone, finish, contrast..."
                />
              </FormField>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg border p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <Badge variant={form.image ? "default" : "outline"}>Product image</Badge>
            {form.image ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove product image"
                onClick={() => setForm({ ...form, image: null })}
              >
                <X />
              </Button>
            ) : null}
          </div>

          <div
            tabIndex={0}
            aria-label="Product image upload area"
            onPaste={handlePaste}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            className="border-input focus-visible:ring-ring/50 grid min-h-72 place-items-center rounded-lg border border-dashed p-4 text-center outline-none focus-visible:ring-3"
          >
            {form.image ? (
              <div className="grid gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.image.url}
                  alt="Product preview"
                  className="max-h-64 w-full rounded-md object-contain"
                />
                <p className="text-muted-foreground truncate text-xs">{form.image.name}</p>
              </div>
            ) : (
              <div className="grid justify-items-center gap-3">
                <span className="bg-muted flex size-12 items-center justify-center rounded-lg">
                  <ImagePlus className="text-muted-foreground size-6" />
                </span>
                <div>
                  <p className="text-sm font-medium">
                    {isUploadingImage ? "Uploading image..." : "Paste or drop product image"}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    Ctrl+V from clipboard, drag and drop, or choose a file.
                  </p>
                </div>
                <input
                  id={fileInputId}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleFileChange}
                />
                <Button type="button" variant="outline" render={<Label htmlFor={fileInputId} />}>
                  <Plus />
                  Choose image
                </Button>
              </div>
            )}
          </div>

          {imageError ? (
            <p className="text-destructive mt-3 text-xs leading-5">{imageError}</p>
          ) : null}
        </div>
      </div>
      {upsertProduct.isPending ? (
        <div
          className="bg-background/75 fixed inset-0 z-50 grid place-items-center backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div className="bg-card flex items-center gap-3 rounded-lg border px-5 py-4 shadow-lg">
            <span className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent" />
            <span className="text-sm font-semibold">Saving...</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function EntityWorkspacePanel({
  kind,
  mode = "new",
  onModeChange = () => undefined,
  formVersion = 0,
}: {
  kind: EntityKind;
  mode?: "new" | "records";
  onModeChange?: (mode: "new" | "records") => void;
  formVersion?: number;
}) {
  if (kind === "product")
    return (
      <ProductWorkspacePanel mode={mode} onModeChange={onModeChange} formVersion={formVersion} />
    );
  return (
    <PartyWorkspacePanel
      kind={kind}
      mode={mode}
      onModeChange={onModeChange}
      formVersion={formVersion}
    />
  );
}
