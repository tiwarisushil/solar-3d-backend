// Preservation (Property 2): behaviour outside the bug condition stays as it is today.
// Observed on the unfixed code and encoded here so the concurrent sign-in fix cannot change it:
//  - with a limit of 1 a second owner or admin device is refused with today's message and details;
//  - replaceSessions signs out the same sessions (the branch's owners, or only the admin's own);
//  - expired, logged-out and reset sessions are not counted;
//  - agents, clients, the super admin and impersonation have no limit check and are never counted;
//  - credential, deactivation and suspension errors are unchanged and leave no session row;
//  - tokens whose session is gone or expired get 401;
//  - maxBranches, maxClients and maxDesigns are set by every write path exactly as before.
//
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import fc from 'fast-check';

process.env.S3_BUCKET = '';
process.env.JWT_SECRET ||= 'test-only-secret';

const { Organization, Company, User, AuthSession, Notification, Plan, PlanRequest } = await import('../src/models/index.js');
const { createOrganizationWithBranch } = await import('../src/services/organization.service.js');
const { submitPlanRequest, approvePlanRequest } = await import('../src/services/planRequest.service.js');
const { updateCompanyAsAdmin, resetCompanyPassword, impersonate } = await import('../src/services/company.service.js');
const { login, logout, changePassword } = await import('../src/services/auth.service.js');
const { authenticate } = await import('../src/middlewares/auth.middleware.js');
const { verifyToken } = await import('../src/utils/token.js');
const { hashPassword } = await import('../src/utils/password.js');
const { ROLES } = await import('../src/constants/index.js');

let replSet;
let HASH;
before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
  HASH = await hashPassword(PW);
});
after(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

const wipe = () => Promise.all([User, Company, Organization, AuthSession, Notification, Plan, PlanRequest].map((M) => M.deleteMany({})));
beforeEach(wipe);

const PW = 'Goodpass123';
const NEW_PW = 'Newpass456';
const HOUR = 3600e3;
const ONE_DEVICE_MESSAGE = 'Another device is already signed in. Sign out there first, then try again.';
const SUSPENDED = 'This company account is suspended. Contact the platform administrator.';
let seq = 0;
let ipSeq = 0;
const nextIp = () => `10.1.${Math.floor(++ipSeq / 250) % 250}.${ipSeq % 250}`;

/** An organization whose sign-in limit is N on the organization and on every branch (Pune first, then Mumbai, Delhi). */
async function setup({ hasBranches, N = 1, branchCount = 2 }) {
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
      const owner = await User.create({ email: `${names[i - 1].toLowerCase()}${tag}@multi.in`, passwordHash: HASH, role: ROLES.BRANCH, organization: orgId, company: company._id });
      branches.push({ company, owner });
    }
  }
  await Organization.updateOne({ _id: orgId }, { $set: { 'limits.maxConcurrentLogins': N } });
  await Company.updateMany({ organization: orgId }, { $set: { 'limits.maxConcurrentLogins': N } });
  const admin = hasBranches ? await User.findOne({ organization: orgId, role: ROLES.COMPANY }) : null;
  return { orgId, admin, branches };
}

const member = (role, orgId, branch, extra = {}) => User.create({ email: `${role}${++seq}@member.in`, passwordHash: HASH, role, organization: orgId, company: branch.company._id, ...extra });

async function seedSessions(user, companyId, count, { expired = false } = {}) {
  for (let i = 0; i < count; i++) {
    await AuthSession.create({ user: user._id, company: companyId, sessionId: `seed-${new mongoose.Types.ObjectId()}`, userAgent: 'Windows', expiresAt: new Date(Date.now() + (expired ? -HOUR : HOUR)) });
  }
}

async function branchCount(companyId) {
  const owners = await User.find({ company: companyId, role: ROLES.BRANCH }).distinct('_id');
  return AuthSession.countDocuments({ company: companyId, user: { $in: owners }, expiresAt: { $gt: new Date() } });
}
const userCount = (user) => AuthSession.countDocuments({ user: user._id, expiresAt: { $gt: new Date() } });

async function signIn(email, { password = PW, replaceSessions = false } = {}) {
  try {
    const res = await login({ email, password, ip: nextIp(), userAgent: 'Mozilla/5.0 (iPhone)', replaceSessions });
    return { ok: true, res, sid: verifyToken(res.token).sid };
  } catch (err) {
    return { ok: false, err };
  }
}
const describe = (r) => (r.ok ? 'ok' : `${r.err.status} ${r.err.code} ${r.err.message}`);

async function authStatus(token) {
  const req = { get: (h) => (String(h).toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined) };
  try {
    let passed = false;
    await authenticate(req, {}, () => { passed = true; });
    return passed ? 200 : 0;
  } catch (err) {
    return err.status;
  }
}

/* ───────────── 3.1, 3.2: a limit of 1 ───────────── */

test('Property 2: with a limit of 1 a second owner or admin device is refused with today’s message and details', async () => {
  const input = fc.record({
    who: fc.constantFrom('solo', 'branch', 'admin'),
    otherBranch: fc.integer({ min: 0, max: 3 }),
    otherRole: fc.integer({ min: 0, max: 3 }),
  });
  await fc.assert(fc.asyncProperty(input, async ({ who, otherBranch, otherRole }) => {
    await wipe();
    const { admin, branches } = await setup({ hasBranches: who !== 'solo', N: 1 });
    const pune = branches[0];
    const user = who === 'admin' ? admin : pune.owner;
    const count = who === 'admin' ? () => userCount(admin) : () => branchCount(pune.company._id);

    const first = await signIn(user.email);
    assert.equal(first.ok, true, describe(first));
    if (who !== 'solo') {
      await seedSessions(branches[1].owner, branches[1].company._id, otherBranch);
      if (who === 'branch') await seedSessions(admin, pune.company._id, otherRole);
      else await seedSessions(pune.owner, pune.company._id, otherRole);
    }

    const second = await signIn(user.email);
    assert.equal(second.ok, false, `${who}: second device was let in`);
    assert.equal(second.err.status, 403);
    assert.equal(second.err.code, 'DEVICE_LIMIT');
    assert.equal(second.err.message, ONE_DEVICE_MESSAGE);
    assert.equal(second.err.details.max, 1);
    assert.equal(second.err.details.active, 1);
    assert.equal(second.err.details.sessions.length, 1);
    assert.equal(second.err.details.sessions[0].sessionId, first.sid);
    assert.equal(second.err.details.sessions[0].userEmail, user.email);
    assert.equal(second.err.details.sessions[0].device, 'iPhone or iPad');
    assert.equal(await count(), 1);
  }), { numRuns: 8 });
});

/* ───────────── 3.3, 3.4: replaceSessions ───────────── */

test('Property 2: replaceSessions for a branch owner signs out only that branch’s owners', async () => {
  const input = fc.record({
    N: fc.integer({ min: 1, max: 4 }),
    pune: fc.integer({ min: 0, max: 4 }),
    mumbai: fc.integer({ min: 0, max: 3 }),
    admin: fc.integer({ min: 0, max: 3 }),
  });
  await fc.assert(fc.asyncProperty(input, async ({ N, pune: p, mumbai: m, admin: a }) => {
    await wipe();
    const { admin, branches } = await setup({ hasBranches: true, N });
    const [pune, mumbai] = branches;
    await seedSessions(pune.owner, pune.company._id, p);
    await seedSessions(mumbai.owner, mumbai.company._id, m);
    await seedSessions(admin, pune.company._id, a);

    const r = await signIn(pune.owner.email, { replaceSessions: true });
    assert.equal(r.ok, true, describe(r));
    assert.ok(await AuthSession.exists({ sessionId: r.sid }));
    assert.equal(await branchCount(pune.company._id), 1);
    assert.equal(await branchCount(mumbai.company._id), m);
    assert.equal(await userCount(admin), a);
  }), { numRuns: 8 });
});

test('Property 2: replaceSessions for the company admin signs out only the admin’s own devices', async () => {
  const input = fc.record({
    N: fc.integer({ min: 1, max: 4 }),
    adminPune: fc.integer({ min: 0, max: 3 }),
    adminMumbai: fc.integer({ min: 0, max: 2 }),
    pune: fc.integer({ min: 0, max: 3 }),
    mumbai: fc.integer({ min: 0, max: 3 }),
  });
  await fc.assert(fc.asyncProperty(input, async ({ N, adminPune, adminMumbai, pune: p, mumbai: m }) => {
    await wipe();
    const { admin, branches } = await setup({ hasBranches: true, N });
    const [pune, mumbai] = branches;
    await seedSessions(admin, pune.company._id, adminPune);
    await seedSessions(admin, mumbai.company._id, adminMumbai);
    await seedSessions(pune.owner, pune.company._id, p);
    await seedSessions(mumbai.owner, mumbai.company._id, m);

    const r = await signIn(admin.email, { replaceSessions: true });
    assert.equal(r.ok, true, describe(r));
    assert.ok(await AuthSession.exists({ sessionId: r.sid }));
    assert.equal(await userCount(admin), 1);
    assert.equal(await branchCount(pune.company._id), p);
    assert.equal(await branchCount(mumbai.company._id), m);
  }), { numRuns: 8 });
});

/* ───────────── 3.5: sessions that no longer count ───────────── */

test('Property 2: expired, logged-out and reset sessions are not counted', async () => {
  const input = fc.record({
    who: fc.constantFrom('solo', 'branch', 'admin'),
    expired: fc.integer({ min: 0, max: 3 }),
    revoke: fc.constantFrom('none', 'logout', 'reset'),
  });
  await fc.assert(fc.asyncProperty(input, async ({ who, expired, revoke }) => {
    await wipe();
    const { admin, branches } = await setup({ hasBranches: who !== 'solo', N: 1 });
    const pune = branches[0];
    const user = who === 'admin' ? admin : pune.owner;
    const count = who === 'admin' ? () => userCount(admin) : () => branchCount(pune.company._id);
    await seedSessions(user, pune.company._id, expired, { expired: true });

    let password = PW;
    if (revoke !== 'none') {
      const r = await signIn(user.email);
      assert.equal(r.ok, true, describe(r));
      if (revoke === 'logout') await logout(r.sid);
      else {
        await resetCompanyPassword(String(pune.company._id), NEW_PW, who === 'admin' ? 'admin' : 'owner');
        password = NEW_PW;
      }
    }
    const r = await signIn(user.email, { password });
    assert.equal(r.ok, true, `${who} expired=${expired} revoke=${revoke}: ${describe(r)}`);
    assert.equal(await count(), 1);
  }), { numRuns: 9 });
});

test('a password change keeps only its own replacement session', async () => {
  const { branches } = await setup({ hasBranches: false, N: 1 });
  const { company, owner } = branches[0];
  const first = await signIn(owner.email);
  assert.equal(first.ok, true, describe(first));
  const { token } = await changePassword(await User.findById(owner._id), { current: PW, next: NEW_PW });
  assert.equal(await AuthSession.exists({ sessionId: first.sid }), null);
  assert.equal(await branchCount(company._id), 1);
  assert.ok(await AuthSession.exists({ sessionId: verifyToken(token).sid }));
});

/* ───────────── 3.6, 3.7: roles with no limit ───────────── */

test('Property 2: agents and clients sign in at any count and never use up the owner’s devices', async () => {
  const input = fc.record({
    solo: fc.boolean(),
    agentLogins: fc.integer({ min: 1, max: 4 }),
    clientLogins: fc.integer({ min: 1, max: 4 }),
  });
  await fc.assert(fc.asyncProperty(input, async ({ solo, agentLogins, clientLogins }) => {
    await wipe();
    const { orgId, branches } = await setup({ hasBranches: !solo, N: 1 });
    const pune = branches[0];
    const agent = await member(ROLES.AGENT, orgId, pune);
    const client = await member(ROLES.CLIENT, orgId, pune);
    assert.equal((await signIn(pune.owner.email)).ok, true); // the owner is at the limit of 1

    for (let i = 0; i < agentLogins; i++) {
      const r = await signIn(agent.email);
      assert.equal(r.ok, true, `agent sign-in ${i + 1}: ${describe(r)}`);
    }
    for (let i = 0; i < clientLogins; i++) {
      const r = await signIn(client.email);
      assert.equal(r.ok, true, `client sign-in ${i + 1}: ${describe(r)}`);
    }
    assert.equal(await userCount(agent), agentLogins);
    assert.equal(await userCount(client), clientLogins);
    assert.equal(await branchCount(pune.company._id), 1);
    const refused = await signIn(pune.owner.email);
    assert.equal(refused.err?.details?.active, 1, describe(refused));
  }), { numRuns: 6 });
});

test('Property 2: the super admin and impersonation have no limit and are never counted', async () => {
  const input = fc.record({
    adminLogins: fc.integer({ min: 1, max: 3 }),
    impersonations: fc.integer({ min: 1, max: 3 }),
    as: fc.constantFrom('owner', 'admin'),
  });
  await fc.assert(fc.asyncProperty(input, async ({ adminLogins, impersonations, as }) => {
    await wipe();
    const { admin, branches } = await setup({ hasBranches: true, N: 1 });
    const pune = branches[0];
    const superAdmin = await User.create({ email: `super${++seq}@platform.in`, passwordHash: HASH, role: ROLES.SUPERADMIN });

    for (let i = 0; i < adminLogins; i++) {
      const r = await signIn(superAdmin.email);
      assert.equal(r.ok, true, `super admin sign-in ${i + 1}: ${describe(r)}`);
      assert.equal((await AuthSession.findOne({ sessionId: r.sid })).company, null);
    }
    for (let i = 0; i < impersonations; i++) {
      const res = await impersonate(String(pune.company._id), superAdmin, as);
      assert.equal(res.impersonated, true);
      const row = await AuthSession.findOne({ sessionId: verifyToken(res.token).sid });
      assert.equal(row.company, null);
      assert.equal(String(row.user), String(superAdmin._id));
    }
    assert.equal(await branchCount(pune.company._id), 0);
    assert.equal(await userCount(admin), 0);
    assert.equal(await userCount(superAdmin), adminLogins + impersonations);
    // the owner and the admin still have their one device free
    assert.equal((await signIn(pune.owner.email)).ok, true);
    assert.equal((await signIn(admin.email)).ok, true);
  }), { numRuns: 6 });
});

/* ───────────── 3.8: refused before any limit check ───────────── */

test('Property 2: credential, deactivation and suspension errors are unchanged and leave no session row', async () => {
  const input = fc.record({
    kind: fc.constantFrom('wrongPassword', 'unknownEmail', 'inactiveAgent', 'inactiveClient', 'suspendedBranch', 'suspendedOrgOwner', 'suspendedOrgAdmin', 'adminWithoutBranches'),
    existing: fc.integer({ min: 0, max: 2 }),
  });
  await fc.assert(fc.asyncProperty(input, async ({ kind, existing }) => {
    await wipe();
    const solo = kind === 'adminWithoutBranches';
    const { orgId, admin, branches } = await setup({ hasBranches: !solo, N: 1 });
    const pune = branches[0];
    await seedSessions(pune.owner, pune.company._id, existing);
    let email = pune.owner.email;
    let password = PW;
    let expected;
    switch (kind) {
      case 'wrongPassword': password = 'Wrongpass999'; expected = [401, 'Incorrect email or password']; break;
      case 'unknownEmail': email = `nobody${++seq}@nowhere.in`; expected = [401, 'Incorrect email or password']; break;
      case 'inactiveAgent': email = (await member(ROLES.AGENT, orgId, pune, { active: false })).email; expected = [403, 'This account has been deactivated. Contact your company.']; break;
      case 'inactiveClient': email = (await member(ROLES.CLIENT, orgId, pune, { active: false })).email; expected = [403, 'This account has been deactivated. Contact your company.']; break;
      case 'suspendedBranch': await Company.updateOne({ _id: pune.company._id }, { $set: { status: 'suspended' } }); expected = [403, SUSPENDED]; break;
      case 'suspendedOrgOwner': await Organization.updateOne({ _id: orgId }, { $set: { status: 'suspended' } }); expected = [403, SUSPENDED]; break;
      case 'suspendedOrgAdmin': await Organization.updateOne({ _id: orgId }, { $set: { status: 'suspended' } }); email = admin.email; expected = [403, SUSPENDED]; break;
      case 'adminWithoutBranches': email = (await member(ROLES.COMPANY, orgId, pune)).email; expected = [401, 'Incorrect email or password']; break;
      default: throw new Error(kind);
    }
    const before = await AuthSession.countDocuments();
    const r = await signIn(email, { password });
    assert.equal(r.ok, false, `${kind}: let in`);
    assert.deepEqual([r.err.status, r.err.message], expected, kind);
    assert.equal(await AuthSession.countDocuments(), before);
  }), { numRuns: 12 });
});

/* ───────────── 3.9: removed or expired sessions ───────────── */

test('Property 2: a token whose session was removed or expired gets 401', async () => {
  const input = fc.record({
    who: fc.constantFrom('owner', 'admin', 'agent'),
    how: fc.constantFrom('removed', 'loggedOut', 'expired'),
  });
  await fc.assert(fc.asyncProperty(input, async ({ who, how }) => {
    await wipe();
    const { orgId, admin, branches } = await setup({ hasBranches: true, N: 1 });
    const pune = branches[0];
    const user = who === 'admin' ? admin : who === 'agent' ? await member(ROLES.AGENT, orgId, pune) : pune.owner;
    const r = await signIn(user.email);
    assert.equal(r.ok, true, describe(r));
    assert.equal(await authStatus(r.res.token), 200);
    if (how === 'removed') await AuthSession.deleteOne({ sessionId: r.sid });
    else if (how === 'loggedOut') await logout(r.sid);
    else await AuthSession.updateOne({ sessionId: r.sid }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal(await authStatus(r.res.token), 401, `${who} ${how}`);
  }), { numRuns: 9 });
});

/* ───────────── 3.10: branch, client and design caps ───────────── */

const opt = (arb) => fc.option(arb, { nil: undefined });
const planArb = fc.record({
  maxConcurrentLogins: fc.integer({ min: 1, max: 5 }),
  maxBranches: fc.integer({ min: 1, max: 6 }),
  maxClients: fc.integer({ min: 1, max: 1000 }),
  maxDesigns: fc.integer({ min: 1, max: 1000 }),
});
const definedOnly = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const fixedPlan = (limits) => Plan.create({ code: `p${++seq}`, name: `Plan ${seq}`, kind: 'fixed', priceMonthly: 100, selfServe: true, active: true, ...limits });
const caps = async (orgId) => {
  const org = await Organization.findById(orgId).lean();
  return { maxBranches: org.limits.maxBranches, maxClients: org.limits.maxClients, maxDesigns: org.limits.maxDesigns };
};

test('Property 2: organization creation with a plan sets the caps as today', async () => {
  const input = fc.record({
    hasBranches: fc.boolean(),
    plan: planArb,
    typedBranches: opt(fc.integer({ min: 1, max: 6 })),
    typedClients: opt(fc.integer({ min: 1, max: 1000 })),
    typedDesigns: opt(fc.integer({ min: 1, max: 1000 })),
  });
  await fc.assert(fc.asyncProperty(input, async ({ hasBranches, plan: limits, typedBranches, typedClients, typedDesigns }) => {
    await wipe();
    const plan = await fixedPlan(limits);
    const tag = ++seq;
    const { organizationId } = await createOrganizationWithBranch({
      name: `Created ${tag}`, hasBranches, loginEmail: `admin${tag}@made.in`, password: PW,
      ...(hasBranches ? { branchName: 'Pune', branchOwnerEmail: `pune${tag}@made.in`, branchOwnerPassword: PW } : {}),
      planId: plan.id,
      limits: definedOnly({ maxBranches: typedBranches, maxClients: typedClients, maxDesigns: typedDesigns }),
    });
    assert.deepEqual(await caps(organizationId), {
      maxBranches: hasBranches ? (typedBranches ?? limits.maxBranches) : 1,
      maxClients: typedClients ?? limits.maxClients,
      maxDesigns: typedDesigns ?? limits.maxDesigns,
    });
  }), { numRuns: 8 });
});

test('Property 2: approving a preset plan request sets the caps as today', async () => {
  const input = fc.record({ hasBranches: fc.boolean(), branchTotal: fc.integer({ min: 1, max: 3 }), plan: planArb });
  await fc.assert(fc.asyncProperty(input, async ({ hasBranches, branchTotal, plan: limits }) => {
    await wipe();
    const held = hasBranches ? branchTotal : 1;
    const { orgId, branches } = await setup({ hasBranches, branchCount: held });
    const plan = await fixedPlan(limits);
    const requester = await Company.findById(branches[held - 1].company._id);
    const request = await submitPlanRequest(requester, { type: 'preset', planId: plan.id, message: 'Upgrade' });
    await approvePlanRequest(request.id, {}, null);
    assert.deepEqual(await caps(orgId), {
      maxBranches: hasBranches ? Math.max(limits.maxBranches, held) : 1,
      maxClients: limits.maxClients,
      maxDesigns: limits.maxDesigns,
    });
  }), { numRuns: 8 });
});

test('Property 2: approving a custom plan request sets the caps as today', async () => {
  const input = fc.record({
    hasBranches: fc.boolean(),
    branchTotal: fc.integer({ min: 1, max: 3 }),
    asked: planArb,
    overBranches: opt(fc.integer({ min: 1, max: 6 })),
    overClients: opt(fc.integer({ min: 1, max: 1000 })),
    overDesigns: opt(fc.integer({ min: 1, max: 1000 })),
  });
  await fc.assert(fc.asyncProperty(input, async ({ hasBranches, branchTotal, asked, overBranches, overClients, overDesigns }) => {
    await wipe();
    const held = hasBranches ? branchTotal : 1;
    const { orgId, branches } = await setup({ hasBranches, branchCount: held });
    const requester = await Company.findById(branches[held - 1].company._id);
    const request = await submitPlanRequest(requester, { type: 'custom', message: 'Custom please', requestedLimits: asked });
    await approvePlanRequest(request.id, definedOnly({ maxBranches: overBranches, maxClients: overClients, maxDesigns: overDesigns }), null);
    assert.deepEqual(await caps(orgId), {
      maxBranches: hasBranches ? Math.max(overBranches ?? asked.maxBranches, held) : 1,
      maxClients: overClients ?? asked.maxClients,
      maxDesigns: overDesigns ?? asked.maxDesigns,
    });
  }), { numRuns: 8 });
});

test('Property 2: a platform-admin edit sets the caps as today', async () => {
  const input = fc.integer({ min: 1, max: 3 }).chain((branchTotal) => fc.record({
    hasBranches: fc.boolean(),
    branchTotal: fc.constant(branchTotal),
    changePlan: fc.boolean(),
    plan: planArb,
    typedBranches: opt(fc.integer({ min: branchTotal, max: 6 })),
    typedClients: opt(fc.integer({ min: 1, max: 1000 })),
    typedDesigns: opt(fc.integer({ min: 1, max: 1000 })),
  }));
  await fc.assert(fc.asyncProperty(input, async ({ hasBranches, branchTotal, changePlan, plan: limits, typedBranches, typedClients, typedDesigns }) => {
    await wipe();
    const held = hasBranches ? branchTotal : 1;
    const { orgId, branches } = await setup({ hasBranches, branchCount: held });
    const plan = await fixedPlan(limits);
    const current = await caps(orgId);
    await updateCompanyAsAdmin(String(branches[0].company._id), {
      ...(changePlan ? { planId: plan.id } : {}),
      limits: definedOnly({ maxBranches: typedBranches, maxClients: typedClients, maxDesigns: typedDesigns }),
    });
    let maxBranches;
    if (!hasBranches) maxBranches = 1;
    else if (changePlan) maxBranches = typedBranches != null && typedBranches !== current.maxBranches ? typedBranches : Math.max(limits.maxBranches, held);
    else maxBranches = typedBranches ?? current.maxBranches;
    assert.deepEqual(await caps(orgId), {
      maxBranches,
      maxClients: typedClients ?? (changePlan ? limits.maxClients : current.maxClients),
      maxDesigns: typedDesigns ?? (changePlan ? limits.maxDesigns : current.maxDesigns),
    });
  }), { numRuns: 10 });
});
