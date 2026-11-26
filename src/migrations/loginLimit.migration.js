// The sign-in limit (devices signed in at once) now lives on the Organization and applies in full to each branch's
// owners and, separately, to the company admin's own devices; it is no longer split between branches. Before this,
// plan approvals wrote it only to the requesting branch and plan assignment skipped the organization, so the stored
// numbers disagree. Each company gets one number once, never lower than any number configured for it, mirrored onto
// every branch. Only `limits.maxConcurrentLogins` is touched.
import { orgHasBranches } from '../constants/tenant.js';
import { Company, Organization } from '../models/index.js';

const valid = (n) => (Number.isInteger(n) && n >= 1 ? n : null);

export async function migrateLoginLimits() {
  const orgs = await Organization.find({ loginLimitMigrated: { $ne: true } }).select('_id hasBranches limits').lean();
  if (!orgs.length) return;
  for (const org of orgs) {
    const branches = await Company.find({ organization: org._id }).select('_id limits').setOptions({ rawBranch: true }).lean();
    const own = valid(org.limits?.maxConcurrentLogins);
    let n;
    if (!orgHasBranches(org)) {
      // a company without branches: approvals and plan assignment wrote the number on its single branch
      n = valid(branches[0]?.limits?.maxConcurrentLogins) ?? own ?? 2;
    } else {
      const values = [own, ...branches.map((b) => valid(b.limits?.maxConcurrentLogins))].filter((v) => v != null);
      n = values.length ? Math.max(...values) : 2;
    }
    await Organization.updateOne({ _id: org._id }, { $set: { 'limits.maxConcurrentLogins': n, loginLimitMigrated: true } });
    await Company.updateMany({ organization: org._id }, { $set: { 'limits.maxConcurrentLogins': n } });
  }
  console.log(`Sign-in limit set for ${orgs.length} companies`);
}
