// RemindPay — formato USD (centavos → $1,234.56)
export function fmtUSD(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
