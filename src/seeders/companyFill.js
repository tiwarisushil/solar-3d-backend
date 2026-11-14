// npm run seed:company -- --email=<owner sign-in email>
// Fills that company with staff and roles, stock, leads, clients, proposals, installations, loans, subsidies,
// expenses, e-way bills, bills and receipts. Refuses to run if the company already has proposals or seeded products.
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { env, redactMongoUri } from '../config/env.js';
import { assertSeedAllowed } from './guard.js';
import { seedBillsOnly, seedCompanyFill, STAFF_PASSWORD } from './companyFill.seeder.js';

const emailArg = process.argv.find((a) => a.startsWith('--email='))?.split('=').slice(1).join('=');
const email = emailArg || 'seedtest+1794551731157@test.local';

try {
  assertSeedAllowed();
  const db = await connectDb();
  console.log(`MongoDB connected: ${redactMongoUri(env.mongoUri)} (${db.name})`);
  if (process.argv.includes('--bills-only')) {
    console.log(`Adding e-way bills, bills and invoices for the booked proposals of ${email}`);
    const { company, stats, problems } = await seedBillsOnly({ email });
    console.log(`\nDone for ${company.name}:`);
    for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(14)} ${v}`);
    for (const p of problems) console.log(`  ! ${p}`);
  } else {
    console.log(`Filling the company of ${email}`);
    const { company, stats, problems, staff } = await seedCompanyFill({ email });
    console.log(`\nDone for ${company.name}:`);
    for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(14)} ${v}`);
    if (problems.length) {
      console.log(`\n${problems.length} step(s) could not be completed (the rest was saved):`);
      for (const p of problems) console.log(`  ! ${p}`);
    }
    console.log(`\nStaff sign-ins (password: ${STAFF_PASSWORD})`);
    for (const s of staff) console.log(`  ${s.email.padEnd(32)} ${s.role}`);
  }
} catch (e) {
  console.error(`Company seeding failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
