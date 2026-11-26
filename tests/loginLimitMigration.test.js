// One-time repair of the stored sign-in limit (migrations/loginLimit.migration.js).
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const { Company, Organization } = await import('../src/models/index.js');
const { migrateLoginLimits } = await import('../src/migrations/loginLimit.migration.js');

let replSet;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
});
after(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});
beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

const otherLimits = { maxBranches: 3, maxClients: 40, maxDesigns: 80 };
const rawBranch = (id) => Company.findById(id).setOptions({ rawBranch: true }).lean();
const rawOrg = (id) => Organization.findById(id).lean();

test('a company without branches takes its single branch value', async () => {
  const org = await Organization.create({ name: 'Solo', hasBranches: false, limits: { maxConcurrentLogins: 2, ...otherLimits, maxBranches: 1 } });
  const branch = await Company.create({ name: 'Solo', organization: org._id, limits: { maxConcurrentLogins: 5 } });
  await migrateLoginLimits();
  const o = await rawOrg(org._id);
  assert.equal(o.limits.maxConcurrentLogins, 5);
  assert.equal(o.loginLimitMigrated, true);
  assert.equal((await rawBranch(branch._id)).limits.maxConcurrentLogins, 5);
  assert.deepEqual([o.limits.maxBranches, o.limits.maxClients, o.limits.maxDesigns], [1, 40, 80]);
});

test('a company without branches and no valid branch value falls back to the organization value, then 2', async () => {
  const withOrg = await Organization.create({ name: 'A', hasBranches: false, limits: { maxConcurrentLogins: 4 } });
  await Company.collection.insertOne({ name: 'A', organization: withOrg._id, limits: { maxConcurrentLogins: 0 } });
  const none = await Organization.create({ name: 'B', hasBranches: false });
  await Organization.collection.updateOne({ _id: none._id }, { $unset: { 'limits.maxConcurrentLogins': '' } });
  await migrateLoginLimits();
  assert.equal((await rawOrg(withOrg._id)).limits.maxConcurrentLogins, 4);
  assert.equal((await Company.findOne({ organization: withOrg._id }).setOptions({ rawBranch: true }).lean()).limits.maxConcurrentLogins, 4);
  assert.equal((await rawOrg(none._id)).limits.maxConcurrentLogins, 2);
});

test('a company with branches takes the largest value and every branch gets it', async () => {
  const org = await Organization.create({ name: 'Sunrise', hasBranches: true, limits: { maxConcurrentLogins: 2, ...otherLimits } });
  const pune = await Company.create({ name: 'Pune', organization: org._id, limits: { maxConcurrentLogins: 1 } });
  const mumbai = await Company.create({ name: 'Mumbai', organization: org._id, limits: { maxConcurrentLogins: 5 } });
  const nagpur = await Company.create({ name: 'Nagpur', organization: org._id, limits: { maxConcurrentLogins: 3 } });
  await migrateLoginLimits();
  const o = await rawOrg(org._id);
  assert.equal(o.limits.maxConcurrentLogins, 5);
  for (const b of [pune, mumbai, nagpur]) assert.equal((await rawBranch(b._id)).limits.maxConcurrentLogins, 5);
  assert.deepEqual([o.limits.maxBranches, o.limits.maxClients, o.limits.maxDesigns], [3, 40, 80]); // other limits untouched
});

test('a second run changes nothing', async () => {
  const org = await Organization.create({ name: 'Sunrise', hasBranches: true, limits: { maxConcurrentLogins: 2, ...otherLimits } });
  const pune = await Company.create({ name: 'Pune', organization: org._id, limits: { maxConcurrentLogins: 4 } });
  await migrateLoginLimits();
  // the platform admin lowers the number afterwards; a restart must not undo it
  await Organization.updateOne({ _id: org._id }, { $set: { 'limits.maxConcurrentLogins': 3 } });
  await Company.updateMany({ organization: org._id }, { $set: { 'limits.maxConcurrentLogins': 3 } });
  const before2 = [await rawOrg(org._id), await rawBranch(pune._id)];
  await migrateLoginLimits();
  assert.deepEqual([await rawOrg(org._id), await rawBranch(pune._id)], before2);
});
