import { z } from "zod";

export const workspaceOptionKinds = ["currency", "destination-country"] as const;
export type WorkspaceOptionKind = (typeof workspaceOptionKinds)[number];

export const workspaceOptionSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(workspaceOptionKinds),
  code: z.string().trim().min(1).max(12),
  name: z.string().trim().min(1).max(120),
  symbol: z.string().trim().max(12).nullable(),
  sortIndex: z.number().int().min(0),
});

export const workspaceOptionListSchema = z.array(workspaceOptionSchema);
export type WorkspaceOption = z.infer<typeof workspaceOptionSchema>;

export const genericNodeDefinitionSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(80),
  imageUrl: z.string().trim().min(1),
  storagePath: z.string().trim().min(1).nullable(),
  sortIndex: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const genericNodeDefinitionInputSchema = genericNodeDefinitionSchema.pick({
  name: true,
  imageUrl: true,
  storagePath: true,
});

export type GenericNodeDefinition = z.infer<typeof genericNodeDefinitionSchema>;
export type GenericNodeDefinitionInput = z.infer<typeof genericNodeDefinitionInputSchema>;

interface IntlWithSupportedValues {
  supportedValuesOf?: (key: "currency") => string[];
}

const FALLBACK_CURRENCY_CODES = [
  "AED",
  "AUD",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "EUR",
  "GBP",
  "HKD",
  "IDR",
  "INR",
  "JPY",
  "KRW",
  "MXN",
  "MYR",
  "NZD",
  "PHP",
  "RMB",
  "SGD",
  "THB",
  "TWD",
  "USD",
  "VND",
] as const;

const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ",
  "EC", "EE", "EG", "EH", "ER", "ES", "ET",
  "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY",
  "HK", "HM", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
  "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
  "QA",
  "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "UM", "US", "UY", "UZ",
  "VA", "VC", "VE", "VG", "VI", "VN", "VU",
  "WF", "WS",
  "YE", "YT",
  "ZA", "ZM", "ZW",
] as const;

function displayName(type: "currency" | "region", code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type }).of(code) ?? code;
  } catch {
    return code;
  }
}

function currencySymbol(code: string): string {
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: code,
        currencyDisplay: "narrowSymbol",
      })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? code
    );
  } catch {
    return code;
  }
}

function supportedCurrencyCodes(): string[] {
  const values = (Intl as unknown as IntlWithSupportedValues).supportedValuesOf?.("currency");
  const parsed = z.array(z.string().regex(/^[A-Z]{3}$/)).safeParse(values);
  return parsed.success ? parsed.data : [...FALLBACK_CURRENCY_CODES];
}

export function defaultWorkspaceOptions(kind: WorkspaceOptionKind): WorkspaceOption[] {
  const codes = kind === "currency" ? supportedCurrencyCodes() : [...COUNTRY_CODES];
  return codes.map((code, sortIndex) => ({
    id: `${kind}:${code}`,
    kind,
    code,
    name: displayName(kind === "currency" ? "currency" : "region", code),
    symbol: kind === "currency" ? currencySymbol(code) : null,
    sortIndex,
  }));
}

export function normalizeWorkspaceOptions(
  kind: WorkspaceOptionKind,
  value: unknown,
): WorkspaceOption[] {
  const parsed = workspaceOptionListSchema.safeParse(value);
  if (!parsed.success || parsed.data.length === 0) return defaultWorkspaceOptions(kind);

  return parsed.data
    .filter((option) => option.kind === kind)
    .sort((left, right) => left.sortIndex - right.sortIndex)
    .map((option, sortIndex) => ({ ...option, sortIndex }));
}

