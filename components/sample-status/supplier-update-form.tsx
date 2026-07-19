"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  SAMPLE_STAGE_LABELS,
  SUPPLIER_UPDATE_STAGES,
  sampleUpdatePayloadSchema,
  type SampleStage,
} from "@/lib/sample-orders";

interface FieldDefinition {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "url" | "textarea" | "select";
  options?: readonly string[];
}

const FIELDS: Record<SampleStage, readonly FieldDefinition[]> = {
  pmc: [
    { key: "receivedBy", label: "Received by", type: "text" },
    { key: "pmcDate", label: "PMC date", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  purchase: [
    { key: "materialItem", label: "Material / item", type: "text" },
    { key: "supplierReference", label: "Supplier reference", type: "text" },
    { key: "orderedQuantity", label: "Ordered quantity", type: "number" },
    { key: "unit", label: "Unit", type: "text" },
    { key: "orderDate", label: "Order date", type: "date" },
    { key: "expectedDeliveryDate", label: "Expected delivery", type: "date" },
  ],
  production: [
    { key: "startDate", label: "Production start", type: "date" },
    { key: "plannedFinishDate", label: "Planned finish", type: "date" },
    { key: "notes", label: "Production notes", type: "textarea" },
  ],
  quality_control: [
    { key: "qcStartDate", label: "QC start date", type: "date" },
    { key: "defectivePercent", label: "Defective (%)", type: "number" },
    { key: "inspectedQuantity", label: "Inspected quantity", type: "number" },
    { key: "evidenceUrl", label: "QC document URL", type: "url" },
  ],
  package: [
    { key: "packagingStartDate", label: "Packaging start", type: "date" },
    { key: "cartonCount", label: "Carton count", type: "number" },
    { key: "unitsPerCarton", label: "Units per carton", type: "number" },
    { key: "notes", label: "Packaging notes", type: "textarea" },
  ],
  shipment: [
    { key: "carrier", label: "Carrier", type: "text" },
    { key: "awb", label: "AWB", type: "text" },
    { key: "shipDate", label: "Ship date", type: "date" },
    { key: "eta", label: "Estimated arrival", type: "date" },
    { key: "documentUrl", label: "Shipping document URL", type: "url" },
  ],
  invoice: [
    { key: "invoiceNumber", label: "Invoice number", type: "text" },
    { key: "invoiceDate", label: "Invoice date", type: "date" },
    { key: "currency", label: "Currency", type: "text" },
    { key: "amount", label: "Amount", type: "number" },
    { key: "documentUrl", label: "Invoice document URL", type: "url" },
  ],
};

export function SupplierUpdateForm({ token }: { token: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<SampleStage>("pmc");
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
  }, []);

  function update(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setSuccess(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = sampleUpdatePayloadSchema.safeParse({ stage, ...values });
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/sample-orders/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, payload: parsed.data }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Update failed.";
        throw new Error(message);
      }
      setValues({});
      setErrors({});
      setSuccess(true);
      router.refresh();
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : "Update failed." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="sample-stage">Update status</Label>
        <Select
          value={stage}
          onValueChange={(value) => {
            setStage(value as SampleStage);
            setValues({});
            setErrors({});
            setSuccess(false);
          }}
        >
          <SelectTrigger id="sample-stage" className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPLIER_UPDATE_STAGES.map((value) => (
              <SelectItem key={value} value={value}>
                {SAMPLE_STAGE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS[stage].map((field) => (
          <div
            key={field.key}
            className={field.type === "textarea" ? "grid gap-2 sm:col-span-2" : "grid gap-2"}
          >
            <Label htmlFor={`sample-${field.key}`}>
              {field.label} <span aria-hidden="true">*</span>
            </Label>
            {field.type === "textarea" ? (
              <Textarea
                id={`sample-${field.key}`}
                value={values[field.key] ?? ""}
                onChange={(event) => update(field.key, event.target.value)}
                aria-invalid={Boolean(errors[field.key])}
              />
            ) : field.type === "select" ? (
              <Select
                value={values[field.key] ?? ""}
                onValueChange={(value) => update(field.key, value ?? "")}
              >
                <SelectTrigger
                  id={`sample-${field.key}`}
                  className="h-11 w-full"
                  aria-invalid={Boolean(errors[field.key])}
                >
                  <SelectValue placeholder="Choose a result" />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={`sample-${field.key}`}
                type={field.type}
                step={field.type === "number" ? "any" : undefined}
                value={values[field.key] ?? ""}
                onChange={(event) => update(field.key, event.target.value)}
                aria-invalid={Boolean(errors[field.key])}
                className="h-11"
              />
            )}
            {errors[field.key] ? (
              <p className="text-destructive text-sm" role="alert">
                {errors[field.key]}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {errors.form ? (
        <p
          className="text-destructive border-destructive/30 bg-destructive/5 rounded-lg border p-3 text-sm"
          role="alert"
        >
          {errors.form}
        </p>
      ) : null}
      {success ? (
        <p
          className="flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-600/5 p-3 text-sm text-green-700"
          role="status"
        >
          <CheckCircle2 className="size-4" />
          Status update saved.
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={submitting} className="min-h-12 w-full sm:w-fit">
        {submitting ? <Loader2 className="animate-spin" /> : <Send />}
        {submitting ? "Saving update..." : "Submit status update"}
      </Button>
    </form>
  );
}
