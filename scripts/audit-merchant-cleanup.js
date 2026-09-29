/* Read-only inventory. A legacy table name is never evidence that a record is disposable. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for a read-only inventory');
  const report = await prisma.$transaction(async db => {
    await db.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const sample = await db.tenant.findUnique({ where: { slug: 'acme-store' }, select: { id: true, slug: true, status: true, activeReleaseId: true } });
    const statuses = await db.tenant.groupBy({ by: ['status'], _count: { _all: true } });
    const dependencies = sample ? {
      memberships: await db.tenantUser.count({ where: { tenantId: sample.id } }),
      releases: await db.release.count({ where: { tenantId: sample.id } }),
      orders: await db.order.count({ where: { tenantId: sample.id } }),
      products: await db.product.count({ where: { tenantId: sample.id } }),
    } : null;
    return { readOnly: true, merchantStatuses: statuses, sampleCandidate: sample, dependencies, note: 'Candidate only. Verify ownership and activity before any removal.' };
  });
  console.log(JSON.stringify(report, null, 2));
}
main().catch(() => { console.error('Read-only audit failed. Check database configuration and access.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
