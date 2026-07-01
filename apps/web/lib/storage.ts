import path from "node:path";

/**
 * Raw-file storage root. Local directory in dev; swap for an S3-compatible
 * store in prod behind the same path contract.
 */
export function storageDir(): string {
  return (
    process.env.VERITARIFF_STORAGE_DIR ?? path.resolve(process.cwd(), "../../storage")
  );
}
