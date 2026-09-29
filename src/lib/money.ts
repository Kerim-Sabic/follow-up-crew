// Decimal strings avoid floating point rounding in the spend approval path.
export function usdToNanos(input: string, maximum = 1_000_000_000_000n): string {
  const value = input.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(value))
    throw new Error("Enter a non-negative USD amount with at most nine decimal places");
  const [whole, fraction = ""] = value.split(".");
  const nanos = BigInt(whole!) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0") || "0");
  if (nanos > maximum) throw new Error("Amount exceeds the configured maximum");
  return nanos.toString();
}

export function nanosToUsd(input: string): string {
  const nanos = BigInt(input);
  const sign = nanos < 0n ? "-" : "";
  const abs = nanos < 0n ? -nanos : nanos;
  const fraction = (abs % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return `${sign}${abs / 1_000_000_000n}${fraction ? `.${fraction}` : ""}`;
}
