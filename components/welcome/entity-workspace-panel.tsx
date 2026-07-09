"use client";

import { useId, useMemo, useState } from "react";
import type { ChangeEvent, ClipboardEvent, DragEvent, ReactNode } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  ImagePlus,
  Mail,
  Plus,
  Save,
  Trash2,
  UserPlus,
  Wand2,
  X,
} from "lucide-react";

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
  supplierCompanySchema,
  supplierProductTypeLabels,
  supplierProductTypes,
  type CustomerCompanyInput,
  type EmployeeInput,
  type SupplierCompanyInput,
  type SupplierProductType,
} from "@/lib/workspace-records";
import { cn } from "@/lib/utils";

type EntityKind = "customer" | "supplier" | "product";
type PartyKind = "customer" | "supplier";
type PartySubTab = "company" | "employee";

interface EmployeeRow extends EmployeeInput {
  id: string;
}

type CustomerCompanyState = CustomerCompanyInput;

type SupplierCompanyState = SupplierCompanyInput;

interface ProductImageState {
  name: string;
  src: string;
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

const dummyCustomerCompany: CustomerCompanyState = {
  companyName: "Northstar Apparel Group",
  emailDomainSuffix: "northstarapparel.com",
  type: "Brand owner",
};

const dummySupplierCompany: SupplierCompanyState = {
  companyName: "Bright Trim Manufacturing",
  emailDomainSuffix: "brighttrim.com",
  productTypes: ["label", "tag", "zipper"],
};

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

const dummyProduct: ProductFormState = {
  subject: "Woven label set for summer capsule",
  detail:
    "Main neck label, care label, and hang tag package. Match soft-hand finish and keep colors within approved Pantone range.",
  material: "Damask woven polyester, 80D",
  colorNotes: "Black ground, warm white logo, copper accent thread",
  image: null,
};

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
}: {
  employees: EmployeeRow[];
  domainSuffix: string;
  onEmployeesChange: (employees: EmployeeRow[]) => void;
}) {
  const [submitted, setSubmitted] = useState(false);
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
    onEmployeesChange(dummyEmployees.map((employee) => ({ ...employee, id: crypto.randomUUID() })));
    setSubmitted(false);
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
        <Button type="button" variant="outline" onClick={() => setSubmitted(true)}>
          <Check />
          Check employee input
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
            onChange(dummyCustomerCompany);
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
            onChange(dummySupplierCompany);
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

function PartyWorkspacePanel({ kind }: { kind: PartyKind }) {
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

  const domainSuffix =
    kind === "customer" ? customerCompany.emailDomainSuffix : supplierCompany.emailDomainSuffix;

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
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
            onClick={() => setActiveSubTab("employee")}
          >
            Employee
          </SubTabButton>
        </div>
      </div>

      <div className="bg-card rounded-lg border p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap gap-2">
          <Badge variant={activeSubTab === "company" ? "default" : "outline"}>
            <Building2 />
            Company tab
          </Badge>
          <Badge variant={activeSubTab === "employee" ? "default" : "outline"}>
            <Mail />
            Employee tab
          </Badge>
        </div>

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
          />
        ) : null}
      </div>
    </section>
  );
}

function getFirstImageFile(fileList: FileList) {
  return Array.from(fileList).find((file) => file.type.startsWith("image/")) ?? null;
}

function readImageFile(file: File): Promise<ProductImageState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve({ name: file.name || "Pasted image", src: reader.result });
        return;
      }
      reject(new Error("Unable to read image file."));
    });
    reader.addEventListener("error", () => reject(new Error("Unable to read image file.")));
    reader.readAsDataURL(file);
  });
}

function ProductWorkspacePanel() {
  const fileInputId = useId();
  const [form, setForm] = useState<ProductFormState>({
    subject: "",
    detail: "",
    material: "",
    colorNotes: "",
    image: null,
  });
  const [imageError, setImageError] = useState<string | null>(null);

  const hasProductDetail = useMemo(
    () =>
      Boolean(
        form.subject.trim() || form.detail.trim() || form.material.trim() || form.colorNotes.trim(),
      ),
    [form.colorNotes, form.detail, form.material, form.subject],
  );

  async function setImageFromFiles(fileList: FileList) {
    const imageFile = getFirstImageFile(fileList);
    if (!imageFile) {
      setImageError("Drop or paste an image file.");
      return;
    }

    try {
      const image = await readImageFile(imageFile);
      setForm((current) => ({ ...current, image }));
      setImageError(null);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Unable to read image file.");
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

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Standard userform
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Product (+)</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setForm(dummyProduct);
            setImageError(null);
          }}
        >
          <Wand2 />
          Dummy input
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
        <div className="bg-card rounded-lg border p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <Badge variant={hasProductDetail ? "default" : "outline"}>Product detail</Badge>
          </div>
          <div className="grid gap-4">
            <FormField label="Subject">
              <Input
                value={form.subject}
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
                placeholder="Product subject"
              />
            </FormField>
            <FormField label="Product detail">
              <Textarea
                value={form.detail}
                onChange={(event) => setForm({ ...form, detail: event.target.value })}
                className="min-h-32"
                placeholder="Describe product specs, construction, packaging, and quality notes."
              />
            </FormField>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Material">
                <Input
                  value={form.material}
                  onChange={(event) => setForm({ ...form, material: event.target.value })}
                  placeholder="Woven polyester, cotton, alloy..."
                />
              </FormField>
              <FormField label="Color notes">
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
                  src={form.image.src}
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
                  <p className="text-sm font-medium">Paste or drop product image</p>
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
    </section>
  );
}

export function EntityWorkspacePanel({ kind }: { kind: EntityKind }) {
  if (kind === "product") return <ProductWorkspacePanel />;
  return <PartyWorkspacePanel kind={kind} />;
}
