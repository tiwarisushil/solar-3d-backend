// Bug condition exploration (Property 1): sign-ins honour the configured concurrent sign-in limit per scope.
// A branch owner counts only their branch's owner sessions; the company admin counts only their own sessions.
// The limit N is set by the platform admin and is not split between branches.
// On the unfixed code these tests are expected to FAIL (the limit is hardcoded to 1).
//
// **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fc from 'fast-check';

process.env.S3_BUCKET = '';

const { Organization, Company, User, AuthSession, Notification, Plan, PlanRequest } = await import('../src/models/index.js');
const { createOrganizationWithBranch } = await import('../src/services/organization.service.js');
const { submitPlanRequest, approvePlanRequest } = await import('../src/services/planRequest.service.js');
const { login } = await import('../src/services/auth.service.js');
const { ROLES } = await import('../src/constants/index.js');

let replSet;
before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
});
after(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

const wipe = () => Promise.all([User, Company, Organization, AuthSession, Notification, Plan, PlanRequest].map((M) => M.deleteMany({})));
beforeEach(wipe);

const PW = 'Goodpass123';
const HOUR = 3600e3;
let seq = 0;
let ipSeq = 0;
const nextIp = () => `10.0.${Math.floor(++ipSeq / 250) % 250}.${ipSeq % 250}`;

/**
 * An organization whose configured limit is N on the organization and on every branch.
 * Without branches: one branch with its owner. With branches: the admin, Pune (+ owner) and further branches.
 */
async function setup({ hasBranches, N, branchCount = 2 }) {
  const tag = ++seq;
  const made = hasBranches
    ? await createOrganizationWithBranch({
      name: `Multi ${tag}`, hasBranches: true, loginEmail: `admin${tag}@multi.in`, password: PW,
      branchName: 'Pune', branchOwnerEmail: `pune${tag}@multi.in`, branchOwnerPassword: PW,
      limits: { maxBranches: 4, maxConcurrentLogins: N },
    })
    : await createOrganizationWithBranch({ name: `Solo ${tag}`, loginEmail: `owner${tag}@solo.in`, password: PW });
  const orgId = made.organizationId;
  const firstOwner = await User.findOne({ organization: orgId, role: ROLES.BRANCH });
  const branches = [{ company: await Company.findById(made.branchId), owner: firstOwner }];
  if (hasBranches) {
    const names = ['Mumbai', 'Delhi', 'Nagpur'];
    for (let i = 1; i < branchCount; i++) {
      const company = await Company.create({ organization: orgId, name: names[i - 1], status: 'active', limits: { maxConcurrentLogins: N } });
      const owner = await User.create({ email: `${names[i - 1].toLowerCase()}${tag}@multi.in`, passwordHash: firstOwner.passwordHash, role: ROLES.BRANCH, organization: orgId, company: company._id });
      branches.push({ company, owner });
    }
  }
  await Organization.updateOne({ _id: orgId }, { $set: { 'limits.maxConcurrentLogins': N } });
  await Company.updateMany({ organization: orgId }, { $set: { 'limits.maxConcurrentLogins': N } });
  const admin = hasBranches ? await User.findOne({ organization: orgId, role: ROLES.COMPANY }) : null;
  return { orgId, admin, branches };
}

async function seedSessions(user, companyId, count) {
  for (let i = 0; i < count; i++) {
    await AuthSession.create({ user: user._id, company: companyId, sessionId: `seed-${new mongoose.Types.ObjectId()}`, userAgent: 'Windows', expiresAt: new Date(Date.now() + HOUR) });
  }
}

async function branchCount(companyId) {
  const owners = await User.find({ company: companyId, role: ROLES.BRANCH }).distinct('_id');
  return AuthSession.countDocuments({ company: companyId, user: { $in: owners }, expiresAt: { $gt: new Date() } });
}
const adminCount = (admin) => AuthSession.countDocuments({ user: admin._id, expiresAt: { $gt: new Date() } });

async function signIn(email) {
  try {
    const res = await login({ email, password: PW, ip: nextIp(), userAgent: 'Mozilla/5.0 (iPhone)' });
    return { ok: true, res };
  } catch (err) {
    return { ok: false, err };
  }
}

const describe = (r) => (r.ok ? 'ok' : `${r.err.status} ${r.err.code} details.max=${r.err.details?.max} details.active=${r.err.details?.active}`);

/** expectedBehavior from design: allowed below N, refused at N with details.max = N and details.active = active. */
async function assertExpected(r, { N, active, count }) {
  if (active < N) {
    assert.equal(r.ok, true, `N=${N} active=${active}: expected sign-in allowed, got ${describe(r)}`);
    assert.equal(await count(), active + 1);
  } else {
    assert.equal(r.ok, false, `N=${N} active=${active}: expected DEVICE_LIMIT, got ok`);
    assert.equal(r.err.status, 403);
    assert.equal(r.err.code, 'DEVICE_LIMIT');
    assert.equal(r.err.details.max, N, `N=${N} active=${active}: details.max=${r.err.details.max}`);
    assert.equal(r.err.details.active, active);
    assert.equal(await count(), active);
  }
}

/* ───────────── concrete counterexamples from the design ───────────── */

test('solo owner, N = 3, one device signed in: a second sign-in is allowed', async () => {
  const { branches } = await setup({ hasBranches: false, N: 3 });
  const { company, owner } = branches[0];
  await seedSessions(owner, company._id, 1);
  await assertExpected(await signIn(owner.email), { N: 3, active: 1, count: () => branchCount(company._id) });
});

test('company admin, org N = 3, one own device: a second sign-in is allowed', async () => {
  const { admin, branches } = await setup({ hasBranches: true, N: 3 });
  await seedSessions(admin, branches[0].company._id, 1);
  await assertExpected(await signIn(admin.email), { N: 3, active: 1, count: () => adminCount(admin) });
});

test('N = 2 with two devices signed in: refused with details.max = 2', async () => {
  const { branches } = await setup({ hasBranches: false, N: 2 });
  const { company, owner } = branches[0];
  await seedSessions(owner, company._id, 2);
  await assertExpected(await signIn(owner.email), { N: 2, active: 2, count: () => branchCount(company._id) });
});

/* ───────────── Property 1: sequential sign-ins per scope ───────────── */

test('Property 1: a sign-in is allowed below N and refused at N, counting only its own scope', async () => {
  const input = fc.oneof(
    fc.record({ hasBranches: fc.constant(false), role: fc.constant('branch') }),
    fc.record({ hasBranches: fc.constant(true), role: fc.constantFrom('branch', 'company') }),
  ).chain((base) => fc.integer({ min: 2, max: 6 }).chain((N) => fc.record({
    ...Object.fromEntries(Object.entries(base).map(([k, v]) => [k, fc.constant(v)])),
    N: fc.constant(N),
    active: fc.integer({ min: 1, max: N + 1 }),
    otherBranch: fc.integer({ min: 0, max: N + 1 }), // Mumbai owner sessions
    otherRole: fc.integer({ min: 0, max: N + 1 }), // admin sessions (owner scope) or Pune owner sessions (admin scope)
  })));

  await fc.assert(fc.asyncProperty(input, async ({ hasBranches, role, N, active, otherBranch, otherRole }) => {
    await wipe();
    const { admin, branches } = await setup({ hasBranches, N });
    const pune = branches[0];
    if (role === 'branch') {
      await seedSessions(pune.owner, pune.company._id, active);
      if (hasBranches) {
        await seedSessions(branches[1].owner, branches[1].company._id, otherBranch);
        await seedSessions(admin, pune.company._id, otherRole);
      }
      await assertExpected(await signIn(pune.owner.email), { N, active, count: () => branchCount(pune.company._id) });
    } else {
      await seedSessions(admin, pune.company._id, active);
      await seedSessions(pune.owner, pune.company._id, otherRole);
      await seedSessions(branches[1].owner, branches[1].company._id, otherBranch);
      await assertExpected(await signIn(admin.email), { N, active, count: () => adminCount(admin) });
    }
  }), { numRuns: 15 });
});

/* ───────────── Property 1: simultaneous sign-ins ───────────── */

test('N = 2, no device signed in: two simultaneous sign-ins to one branch are both kept', async () => {
  const { branches } = await setup({ hasBranches: false, N: 2 });
  const { company, owner } = branches[0];
  const results = await Promise.all([signIn(owner.email), signIn(owner.email)]);
  assert.deepEqual(results.map(describe), ['ok', 'ok']);
  assert.equal(await branchCount(company._id), 2);
});

test('Property 1: k simultaneous sign-ins keep exactly min(k, N - active) and refuse the rest with details.max = N', async () => {
  const input = fc.integer({ min: 2, max: 5 }).chain((N) => fc.record({
    N: fc.constant(N),
    active: fc.integer({ min: 0, max: N }),
    k: fc.integer({ min: 2, max: 5 }),
    scope: fc.constantFrom('branch', 'admin'),
  }));
  await fc.assert(fc.asyncProperty(input, async ({ N, active, k, scope }) => {
    await wipe();
    const { admin, branches } = await setup({ hasBranches: true, N });
    const pune = branches[0];
    const who = scope === 'branch' ? pune.owner : admin;
    const count = scope === 'branch' ? () => branchCount(pune.company._id) : () => adminCount(admin);
    await seedSessions(who, pune.company._id, active);
    const results = await Promise.all(Array.from({ length: k }, () => signIn(who.email)));
    const kept = Math.min(k, Math.max(0, N - active));
    const outcome = results.map(describe).join(', ');
    assert.equal(results.filter((r) => r.ok).length, kept, `N=${N} active=${active} k=${k} scope=${scope}: ${outcome}`);
    for (const r of results.filter((x) => !x.ok)) {
      assert.equal(r.err.code, 'DEVICE_LIMIT', outcome);
      assert.equal(r.err.details.max, N, outcome);
    }
    assert.equal(await count(), active + kept);
  }), { numRuns: 10 });
});

/* ───────────── Property 1: limit writes reach every branch and the admin ───────────── */

test('Property 1: approving a custom request for 5 on Mumbai gives every branch owner and the admin 5 sign-ins', async () => {
  await fc.assert(fc.asyncProperty(fc.integer({ min: 2, max: 4 }), async (branchTotal) => {
    await wipe();
    const { orgId, admin, branches } = await setup({ hasBranches: true, N: 2, branchCount: branchTotal });
    const mumbai = branches[1];
    const request = await submitPlanRequest(mumbai.company, {
      type: 'custom', message: 'More sign-ins',
      requestedLimits: { maxConcurrentLogins: 5, maxBranches: 4, maxClients: 100, maxDesigns: 200 },
    });
    await approvePlanRequest(request.id, {}, null);

    const org = await Organization.findById(orgId);
    assert.equal(org.limits.maxConcurrentLogins, 5, `branches=${branchTotal}: org.limits.maxConcurrentLogins=${org.limits.maxConcurrentLogins}`);
    const stored = (await Company.find({ organization: orgId }).setOptions({ rawBranch: true }).lean()).map((b) => [b.name, b.limits?.maxConcurrentLogins]);
    for (const [name, n] of stored) assert.equal(n, 5, `branches=${branchTotal}: ${name}.limits.maxConcurrentLogins=${n}`);

    const pune = branches[0];
    for (let i = 0; i < 5; i++) {
      const r = await signIn(pune.owner.email);
      assert.equal(r.ok, true, `Pune owner sign-in ${i + 1} of 5: ${describe(r)}`);
    }
    assert.equal((await signIn(pune.owner.email)).err?.details?.max, 5);
    for (let i = 0; i < 5; i++) {
      const r = await signIn(admin.email);
      assert.equal(r.ok, true, `admin sign-in ${i + 1} of 5: ${describe(r)}`);
    }
    assert.equal((await signIn(admin.email)).err?.details?.max, 5);
  }), { numRuns: 3 });
});
