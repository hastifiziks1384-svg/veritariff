import path from "node:path";
import {
  RecordedTariffClient,
  UkTradeTariffClient,
  type TariffDataSource,
  type TariffHeadingReference,
} from "@veritariff/tariff-client";
import { storageRoot } from "./extraction";

/**
 * Live UK Trade Tariff API, with the recorded snapshot as an offline
 * fallback. Recorded data is real but frozen at recording time — the
 * Classification's rulesDataVersion records which source served it.
 */
class LiveWithRecordedFallback implements TariffDataSource {
  private readonly live = new UkTradeTariffClient();
  private readonly recorded = new RecordedTariffClient(
    path.join(storageRoot(), "data/fixtures/tariff"),
  );

  async getHeadingReference(heading4: string): Promise<TariffHeadingReference> {
    try {
      return await this.live.getHeadingReference(heading4);
    } catch {
      return this.recorded.getHeadingReference(heading4);
    }
  }
}

export function buildTariffClient(): TariffDataSource {
  return new LiveWithRecordedFallback();
}
