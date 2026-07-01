import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veritariff",
  description:
    "Per-shipment customs compliance records with deterministic, codified legal logic — every output cited to its legal source.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen antialiased">
        <header className="border-b border-ink/10 bg-ground">
          <div className="mx-auto flex max-w-5xl items-baseline gap-3 px-6 py-4">
            <span className="text-xl font-semibold tracking-tight text-ink">
              Veri<span className="text-road">tariff</span>
            </span>
            <span className="text-sm text-ink/60">
              Shipment compliance records, cited to source
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
