import { toFunctionSelector } from "viem";

export function summarizeSignature(value: string) {
  const input = value.trim();
  if (/^0x[\da-fA-F]{8}$/.test(input)) return input.toLowerCase();
  if (!/^[A-Za-z_$][\w$]*\([^()]*\)$/.test(input)) return "";
  try { return toFunctionSelector(input); } catch { return ""; }
}
