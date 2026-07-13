declare module "qrcode" {
  export interface QRCodeToDataURLOptions {
    margin?: number;
    width?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  }

  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
}
