import { PrismaClient } from "@prisma/client";
import { join } from "node:path";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma() {
  const configuredUrl = process.env.DATABASE_URL;
  if (!configuredUrl) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!globalForPrisma.prisma) {
    const url = new URL(configuredUrl);
    if (url.searchParams.get("sslcert") === "./aiven-ca.crt") {
      url.searchParams.set("sslcert", join(process.cwd(), "prisma", "aiven-ca.crt"));
    }
    globalForPrisma.prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  }
  return globalForPrisma.prisma;
}
