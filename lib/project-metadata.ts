import { z } from "zod";

const nullableTrimmedString = z.string().trim().min(1).nullable();

export const projectMetadataSchema = z.object({
  customerId: nullableTrimmedString,
  customerName: nullableTrimmedString,
  employeeId: nullableTrimmedString,
  employeeName: nullableTrimmedString,
  employeeTitle: nullableTrimmedString,
  employeeEmail: z.string().trim().email().nullable(),
  employeeTel: nullableTrimmedString,
  currencyCode: nullableTrimmedString,
  currencyName: nullableTrimmedString,
  currencySymbol: z.string().trim().nullable(),
  destinationCountryCode: nullableTrimmedString,
  destinationCountryName: nullableTrimmedString,
});

export type ProjectMetadata = z.infer<typeof projectMetadataSchema>;

export const emptyProjectMetadata: ProjectMetadata = {
  customerId: null,
  customerName: null,
  employeeId: null,
  employeeName: null,
  employeeTitle: null,
  employeeEmail: null,
  employeeTel: null,
  currencyCode: null,
  currencyName: null,
  currencySymbol: null,
  destinationCountryCode: null,
  destinationCountryName: null,
};

const legacyProjectDescriptionSchema = z.object({
  version: z.literal(1),
  customer: z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    domain: z.string().trim().min(1).optional(),
  }),
  employee: z.object({
    id: z.string().trim().min(1).optional(),
    userName: z.string().trim().min(1),
    title: z.string().trim().min(1),
    email: z.string().trim().email(),
    tel: z.string().trim().min(1),
  }),
  currency: z
    .object({
      code: z.string().trim().min(1),
      name: z.string().trim().min(1).optional(),
      symbol: z.string().trim().optional(),
    })
    .optional(),
  destination: z
    .object({
      code: z.string().trim().min(1),
      name: z.string().trim().min(1),
    })
    .optional(),
});

export function parseLegacyProjectDescription(description: string | null): ProjectMetadata {
  if (!description) return emptyProjectMetadata;

  let value: unknown;
  try {
    value = JSON.parse(description) as unknown;
  } catch {
    return emptyProjectMetadata;
  }

  const parsed = legacyProjectDescriptionSchema.safeParse(value);
  if (!parsed.success) return emptyProjectMetadata;

  return {
    customerId: parsed.data.customer.id,
    customerName: parsed.data.customer.name,
    employeeId: parsed.data.employee.id ?? null,
    employeeName: parsed.data.employee.userName,
    employeeTitle: parsed.data.employee.title,
    employeeEmail: parsed.data.employee.email,
    employeeTel: parsed.data.employee.tel,
    currencyCode: parsed.data.currency?.code ?? null,
    currencyName: parsed.data.currency?.name ?? null,
    currencySymbol: parsed.data.currency?.symbol ?? null,
    destinationCountryCode: parsed.data.destination?.code ?? null,
    destinationCountryName: parsed.data.destination?.name ?? null,
  };
}

export function mergeProjectMetadata(
  current: Partial<ProjectMetadata>,
  description: string | null,
): ProjectMetadata {
  const legacy = parseLegacyProjectDescription(description);
  const definedCurrent = Object.fromEntries(
    Object.entries(current).filter((entry) => entry[1] !== undefined),
  );
  const candidate = Object.fromEntries(
    Object.entries({ ...legacy, ...definedCurrent }).map(([key, value]) => [key, value ?? null]),
  );
  return projectMetadataSchema.parse(candidate);
}
