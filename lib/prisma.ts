import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });

const prisma = new PrismaClient({ adapter });

export default prisma;