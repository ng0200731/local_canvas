import { emailRecipientSchema } from "@/lib/email/schemas";

export function splitEmailRecipients(value: string): string[] {
  return value
    .split(/[,\n;]/)
    .map((address) => address.trim())
    .filter(Boolean);
}

export function primaryEmailRecipient(value: string): string | null {
  return (
    splitEmailRecipients(value).find((address) => emailRecipientSchema.safeParse(address).success) ??
    null
  );
}
