export { exec, getPackagesInfo, listPackages } from "kernelsu";
export { toast } from "vue-sonner";

export function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
