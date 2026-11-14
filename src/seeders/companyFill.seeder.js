// Fill one company with realistic test data for manual QA: staff with different roles, a product catalogue with stock,
// leads, clients, proposals (designs), installations, loans, subsidies, expenses, e-way bills, bills and receipts.
// Goes through the same services the app uses (stock receipts, e-way bills, bills, receipts), so numbering and stock
// stay consistent. Refuses to run when the company already has proposals or seeded products.
import mongoose from 'mongoose';
import {
  DEFAULT_EXPENSE_REASONS,
  DEFAULT_INSTALLATION_STEPS,
  DEFAULT_LOAN_STEPS,
  DEFAULT_SUBSIDY_STEPS,
  ROLES,
  STAFF_PERMISSIONS,
} from '../constants/index.js';
import { Category, Client, Company, Design, EwayBill, Expense, Loan, Product, Project, Role, SerialUnit, Subsidy, Supplier, User } from '../models/index.js';
import { leadModels } from '../integrations/leads.js';
import { billService } from '../services/bill.service.js';
import { billingService } from '../services/billing.service.js';
import { ewayBillService } from '../services/ewayBill.service.js';
import { receiptService } from '../services/receipt.service.js';
import { receiveStock } from '../services/stock.service.js';
import { hashPassword } from '../utils/password.js';
import { rect, site } from './data/companies.js';

export const STAFF_PASSWORD = 'SeedStaff@2026';

const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const round = (v) => Math.round(v);

// deterministic random so the same run always produces the same data
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const rnd = rng(20261113);
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (list) => list[Math.floor(rnd() * list.length)];
const shuffle = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/* ───────────── staff & roles ───────────── */

const area = (name) => STAFF_PERMISSIONS.filter((p) => p.startsWith(`${name}:`));
const only = (...list) => {
  for (const p of list) if (!STAFF_PERMISSIONS.includes(p)) throw new Error(`Unknown staff permission ${p}`);
  return list;
};

const STAFF_ROLE_DEFS = [
  { name: 'Sales manager', description: 'Runs leads, proposals and clients and sees the team’s work.', permissions: [...area('leads'), ...area('proposals'), ...only('clients:view_team', 'clients:view', 'clients:create', 'clients:update', 'finances:view')] },
  { name: 'Telecaller', description: 'Calls new leads and adds clients.', permissions: only('leads:view', 'leads:create', 'leads:change_status', 'leads:update', 'clients:view', 'clients:create') },
  { name: 'Accountant', description: 'Bills, invoices, receipts and expenses.', permissions: [...area('finances'), ...area('expenses'), ...only('loans:view', 'subsidies:view', 'clients:view', 'proposals:view')] },
  { name: 'Store keeper', description: 'Receives stock and manages inventory.', permissions: [...area('inventory'), ...only('proposals:view')] },
  { name: 'Field staff', description: 'Works on the installation steps assigned to them.', permissions: only('tasks:view', 'tasks:update', 'tasks:change_status') },
  { name: 'Site supervisor', description: 'Assigns and tracks installation tasks for the team.', permissions: only('tasks:view', 'tasks:view_team', 'tasks:assign', 'tasks:change_status', 'proposals:view', 'clients:view') },
];

// `roles` are the installation-step labels a person can be assigned (the company's agent roles)
const STAFF = [
  { local: 'ravi.sharma', name: 'Ravi Sharma', phone: '9810011001', role: 'Sales manager', roles: [] },
  { local: 'meera.nair', name: 'Meera Nair', phone: '9810011002', role: 'Telecaller', roles: [] },
  { local: 'arjun.kapoor', name: 'Arjun Kapoor', phone: '9810011003', role: 'Accountant', roles: [] },
  { local: 'pooja.iyer', name: 'Pooja Iyer', phone: '9810011004', role: 'Store keeper', roles: [] },
  { local: 'kiran.desai', name: 'Kiran Desai', phone: '9810011005', role: 'Field staff', roles: ['Site surveyor', 'Installer', 'Electrician'] },
  { local: 'sanjay.rao', name: 'Sanjay Rao', phone: '9810011006', role: 'Site supervisor', roles: ['Supervisor', 'Inspector'] },
];

/* ───────────── catalogue: [name, brand, model, sku, retail price] ───────────── */

const CATALOG = [
  {
    category: 'Solar Panels', unit: 'Panel', hsn: '85414300', gst: 12, serialized: true, warrantyMonths: 300,
    items: [
      ['Waaree Ahnay 540 Wp Mono PERC', 'Waaree', 'WSMD-540', 'SC-PNL-WA540', 13900],
      ['Adani Shine TOPCon 575 Wp', 'Adani Solar', 'Shine TOPCon 575', 'SC-PNL-AD575', 16900],
      ['Tata Power TP440M-BF 440 Wp', 'Tata Power Solar', 'TP440M-BF', 'SC-PNL-TP440', 11400],
      ['Premier PE-TOPCon 620 Wp', 'Premier Energies', 'PE-TOPCon 620', 'SC-PNL-PE620', 18700],
      ['Vikram Somera 400 Wp', 'Vikram Solar', 'VSM.72.400', 'SC-PNL-VK400', 9800],
      ['Rayzon Bifacial 580 Wp', 'Rayzon Solar', 'RZ-BF-580', 'SC-PNL-RZ580', 15800],
      ['Goldi Mono 335 Wp', 'Goldi Solar', 'GSM-335', 'SC-PNL-GD335', 8200],
    ],
  },
  {
    category: 'Inverter', unit: 'Nos', hsn: '85044090', gst: 12, serialized: true, warrantyMonths: 60,
    items: [
      ['Havells Enviro GT 3.3 kW on-grid inverter', 'Havells', 'Enviro GT 3300', 'SC-INV-HV33', 36000],
      ['Growatt MIN 5000TL-X on-grid inverter', 'Growatt', 'MIN 5000TL-X', 'SC-INV-GW50', 48000],
      ['Solis S5-GC8K 8 kW three-phase inverter', 'Solis', 'S5-GC8K', 'SC-INV-SL80', 71000],
      ['Sungrow SG10RT 10 kW three-phase inverter', 'Sungrow', 'SG10RT', 'SC-INV-SG10', 88000],
      ['Huawei SUN2000-5KTL-L1 5 kW inverter', 'Huawei', 'SUN2000-5KTL-L1', 'SC-INV-HW50', 52000],
      ['Luminous Solar Hybrid 3 kW inverter', 'Luminous', 'Zelio Hybrid 3K', 'SC-INV-LU30', 42000],
    ],
  },
  {
    category: 'Batteries', unit: 'Nos', hsn: '85071000', gst: 18, serialized: true, warrantyMonths: 60,
    items: [
      ['Exide Solar tubular 150 Ah battery', 'Exide', 'SOLAR-TT-150', 'SC-BAT-EX150', 14500],
      ['Luminous Eco Volt 120 Ah battery', 'Luminous', 'ECO VOLT 120', 'SC-BAT-LU120', 12800],
      ['Amaron Pro 200 Ah tubular battery', 'Amaron', 'PRO-200', 'SC-BAT-AM200', 18500],
      ['Genus Lithium 5.12 kWh battery', 'Genus', 'GLB-5120', 'SC-BAT-GN512', 142000],
      ['Tata Agratas 2.5 kWh LFP battery', 'Tata Agratas', 'AG-2500', 'SC-BAT-TA25', 78000],
      ['Su-Kam Power Plus 100 Ah battery', 'Su-Kam', 'PP-100', 'SC-BAT-SK100', 9800],
    ],
  },
  {
    category: 'Mounting Structure & Rails', unit: 'Piece', hsn: '7308', gst: 18, serialized: false, warrantyMonths: 120,
    items: [
      ['Aluminium mounting rail 4.2 m', 'Hindalco', 'AL-RAIL-4200', 'SC-MNT-RAIL42', 1450],
      ['Mid clamp (anodised aluminium)', 'Generic', 'MID-CLP-AL', 'SC-MNT-MIDC', 95],
      ['End clamp (anodised aluminium)', 'Generic', 'END-CLP-AL', 'SC-MNT-ENDC', 110],
      ['Roof hook L-foot 150 mm (GI)', 'Generic', 'LFT-150-GI', 'SC-MNT-LFOOT', 240],
      ['Chemical anchor bolt M10 (set)', 'Fischer', 'FIS-M10', 'SC-MNT-ANCH', 185],
      ['Ballast block 25 kg (RCC)', 'Generic', 'BAL-25', 'SC-MNT-BAL25', 420],
      ['Module earthing lug (stainless steel)', 'Generic', 'EARTH-LUG', 'SC-MNT-LUG', 38],
    ],
  },
  {
    category: 'Solar DC Cables', unit: 'Meter', hsn: '85444290', gst: 18, serialized: false, warrantyMonths: 60,
    items: [
      ['Solar DC cable 4 sq mm (red)', 'Polycab', 'PV1-F-4-RED', 'SC-DCC-4R', 48],
      ['Solar DC cable 4 sq mm (black)', 'Polycab', 'PV1-F-4-BLK', 'SC-DCC-4B', 48],
      ['Solar DC cable 6 sq mm (red)', 'Polycab', 'PV1-F-6-RED', 'SC-DCC-6R', 72],
      ['Solar DC cable 6 sq mm (black)', 'Polycab', 'PV1-F-6-BLK', 'SC-DCC-6B', 72],
      ['Battery interconnect cable 25 sq mm', 'Finolex', 'BIC-25', 'SC-DCC-BIC25', 210],
      ['MC4 male-female connector pair', 'Stäubli', 'MC4-PAIR', 'SC-DCC-MC4', 65],
    ],
  },
  {
    category: 'AC Cables', unit: 'Meter', hsn: '85444949', gst: 18, serialized: false, warrantyMonths: 60,
    items: [
      ['AC armoured cable 4C x 10 sq mm', 'Finolex', 'FLX-AC-4C10', 'SC-ACC-4C10', 210],
      ['AC armoured cable 4C x 16 sq mm', 'Finolex', 'FLX-AC-4C16', 'SC-ACC-4C16', 320],
      ['AC armoured cable 4C x 25 sq mm', 'Polycab', 'PC-AC-4C25', 'SC-ACC-4C25', 470],
      ['AC cable 3.5C x 25 sq mm (three-phase)', 'Polycab', 'PC-AC-35C25', 'SC-ACC-35C25', 430],
      ['Flexible AC cable 2C x 4 sq mm', 'Havells', 'HV-FL-2C4', 'SC-ACC-2C4', 58],
      ['Earthing wire GI 8 SWG', 'Generic', 'GI-8SWG', 'SC-ACC-GI8', 45],
    ],
  },
];

const SUPPLIERS = [
  { name: 'Apex Solar Traders', phone: '9822500101', email: 'orders@apexsolar.test', address: 'Bhosari MIDC, Pune 411026', categories: ['Solar Panels', 'Inverter', 'Batteries'] },
  { name: 'Kaveri Electricals', phone: '9850500202', email: 'sales@kaveri.test', address: 'Budhwar Peth, Pune 411002', categories: ['Solar DC Cables', 'AC Cables'] },
  { name: 'Metro Steel Works', phone: '9763500303', email: 'info@metrosteel.test', address: 'Chakan Industrial Area, Pune 410501', categories: ['Mounting Structure & Rails'] },
];

/* ───────────── leads & clients ───────────── */

const LEAD_STATUSES = [
  { name: 'New', color: 'slate' },
  { name: 'Interested', color: 'amber' },
  { name: 'Callback', color: 'blue' },
  { name: 'Site visit', color: 'purple' },
  { name: 'Converted', color: 'emerald', outcome: 'converted', isConversion: true },
  { name: 'Lost', color: 'rose', outcome: 'lost' },
];
const FIRST = ['Rahul', 'Sneha', 'Amit', 'Priya', 'Vikram', 'Anita', 'Suresh', 'Kavita', 'Rohan', 'Neha', 'Deepak', 'Sunita', 'Manoj', 'Pallavi', 'Nitin', 'Rekha', 'Ajay', 'Swati', 'Karan', 'Meena', 'Prakash', 'Divya', 'Sachin', 'Asha', 'Rakesh'];
const LAST = ['Patil', 'Joshi', 'Kulkarni', 'Deshmukh', 'Shinde', 'Pawar', 'Gaikwad', 'Jadhav', 'More', 'Sawant', 'Bhosale', 'Kale', 'Mane', 'Chavan', 'Gokhale', 'Phadke', 'Naik', 'Mhatre', 'Thorat', 'Salunkhe'];
const AREAS = ['Kothrud, Pune', 'Baner, Pune', 'Wakad, Pimpri-Chinchwad', 'Hadapsar, Pune', 'Aundh, Pune', 'Nashik Road', 'Chakan, Pune', 'Viman Nagar, Pune', 'Pashan, Pune', 'Kharadi, Pune'];
const SOURCES = ['Website', 'Google Search', 'Referral', 'Meta Ads', 'Direct Walk-in', 'Social Media'];

const CLIENT_DEFS = [
  ...['Anil Mahajan', 'Rupali Gore', 'Sachin Bhatt', 'Nilesh Kadam', 'Shalini Rane', 'Harish Menon', 'Yogesh Thakur', 'Sonal Wagh', 'Ketan Shah', 'Geeta Pillai', 'Prakash Sawant', 'Madhuri Kale', 'Omkar Dange'].map((name) => ({ name, projectType: 'residential', roofType: 'concrete', short: name.split(' ')[0] })),
  { name: 'Sunrise Dental Clinic', projectType: 'commercial', roofType: 'concrete', short: 'Sunrise Dental' },
  { name: 'Pioneer Logistics Pvt Ltd', projectType: 'industrial', roofType: 'tin_shed', short: 'Pioneer Logistics' },
];

const PAN_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Same text the app stores for a manual lead: lower-cased answers joined by spaces (leadSearchText.buildSearchText). */
export const searchTextFor = (...values) => values.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean).join(' ');

async function ensureLeadStatuses(companyId) {
  const base = { company: companyId, isDeleted: false };
  if (!(await leadModels.status.countDocuments(base))) {
    await leadModels.status.insertMany(
      LEAD_STATUSES.map((s, i) => ({ ...s, company: companyId, nameKey: s.name.toLowerCase(), order: i, isActive: true })),
      { ordered: true },
    );
  }
  return leadModels.status.find(base).sort({ order: 1 }).lean();
}

/* ───────────── the seed ───────────── */

export async function seedCompanyFill({ email, log = console.log } = {}) {
  const owner = await User.findOne({ email: String(email || '').trim().toLowerCase() });
  if (!owner) throw new Error(`No user with sign-in email ${email}`);
  const company = await Company.findById(owner.company);
  if (!company) throw new Error(`No company for ${email}`);
  if ((await Design.exists({ company: company._id })) || (await Product.exists({ company: company._id, sku: /^SC-/ }))) {
    throw new Error(`${company.name} already has proposals or seeded products. Refusing to add them twice.`);
  }
  const ownerName = owner.name || owner.email;
  const stats = { roles: 0, staff: 0, products: 0, receipts: 0, leads: 0, clients: 0, proposals: 0, installations: 0, loans: 0, subsidies: 0, expenses: 0, ewayBills: 0, bills: 0 };
  const problems = [];
  const tryStep = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      problems.push(`${label}: ${e.message}`);
      return null;
    }
  };

  /* staff with roles */
  const roleDocs = new Map();
  for (const def of STAFF_ROLE_DEFS) {
    roleDocs.set(def.name, await Role.create({ company: company._id, ...def }));
    stats.roles += 1;
  }
  const passwordHash = await hashPassword(STAFF_PASSWORD);
  const staff = [];
  for (const s of STAFF) {
    const user = await User.create({
      name: s.name,
      email: `${s.local}@seedcompany.test`,
      phone: s.phone,
      role: ROLES.AGENT,
      company: company._id,
      organization: company.organization,
      roles: s.roles,
      staffRoles: [roleDocs.get(s.role)._id],
      permissions: [],
      passwordHash,
      active: true,
      lastLoginAt: daysAgo(1),
    });
    staff.push({ ...s, user });
    stats.staff += 1;
  }
  const salesStaff = staff.filter((s) => s.role === 'Sales manager' || s.role === 'Telecaller').map((s) => s.user);
  const assigneeFor = (stepRole) => (staff.find((s) => s.roles.includes(stepRole)) || staff[5]).user;
  log(`  + ${stats.roles} roles and ${stats.staff} staff`);

  /* suppliers, categories and stock */
  await Company.updateOne({ _id: company._id }, { $addToSet: { productUnits: { $each: [...new Set(CATALOG.map((c) => c.unit))] } } });
  const categories = new Map((await Category.find({ company: company._id }).lean()).map((c) => [c.name, c]));
  const supplierDocs = new Map();
  for (const s of SUPPLIERS) {
    const doc = await Supplier.create({ company: company._id, name: s.name, phone: s.phone, email: s.email, address: s.address, categories: s.categories.map((n) => categories.get(n)._id) });
    for (const n of s.categories) supplierDocs.set(n, doc);
  }
  const productsBySku = new Map();
  for (const group of CATALOG) {
    const cat = categories.get(group.category);
    if (!cat) throw new Error(`Category "${group.category}" is missing for this company`);
    for (const [name, brand, model, sku, price] of group.items) {
      const product = await Product.create({
        company: company._id,
        category: cat._id,
        type: cat.type || 'general',
        name,
        brand,
        model,
        sku,
        hsnCode: group.hsn,
        unit: group.unit,
        gstPercent: group.gst,
        warrantyMonths: group.warrantyMonths,
        reorderLevel: 5,
        isSerialized: group.serialized,
        attributes: {},
        isActive: false, // stock can only be received while a product is inactive (activated below)
      });
      productsBySku.set(sku, product);
      const qty = between(20, 30);
      await receiveStock(company, product._id, {
        supplier: supplierDocs.get(group.category)._id,
        batchNo: `${sku}-B1`,
        receivedDate: daysAgo(between(30, 60)),
        retailPrice: price,
        wholesalePrice: round(price * 0.92),
        basePrice: round(price * 0.86),
        purchasePrice: round(price * 0.78),
        note: 'Opening stock',
        ...(group.serialized
          ? { serials: Array.from({ length: qty }, (_, n) => `${sku}-${String(n + 1).padStart(3, '0')}`) }
          : { qtyReceived: qty }),
      });
      await Product.updateOne({ _id: product._id }, { isActive: true });
      stats.products += 1;
    }
  }
  log(`  + ${stats.products} products (20–30 in stock each) across ${CATALOG.length} categories`);

  /* lead statuses and leads */
  const statuses = await ensureLeadStatuses(company._id);
  const statusByName = new Map(statuses.map((s) => [s.name, s]));
  for (let i = 0; i < 45; i += 1) {
    const fullName = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const phone = `98${String(10000000 + i * 104729).slice(-8)}`;
    const status = statusByName.get(pick(LEAD_STATUSES).name);
    const owned = pick(salesStaff);
    const createdAt = daysAgo(between(1, 60));
    const address = pick(AREAS);
    await leadModels.manual.create({
      company: company._id,
      source: 'manual',
      fullName,
      phone,
      phoneKey: phone.slice(-10),
      address,
      searchText: searchTextFor(fullName, phone, address), // the search box matches on this (see leads-integration/utils/leadSearch.js)
      assignedTo: status.name === 'New' ? undefined : owned._id,
      assignedAt: status.name === 'New' ? undefined : createdAt,
      status: status._id,
      statusName: status.name,
      statusColor: status.color,
      statusUpdatedAt: createdAt,
      createdBy: owner._id,
      createdByName: ownerName,
      createdAt,
    });
    stats.leads += 1;
  }
  log(`  + ${stats.leads} leads`);

  /* clients */
  const clients = [];
  for (const [i, def] of CLIENT_DEFS.entries()) {
    const phone = `97${String(10000000 + i * 73331).slice(-8)}`;
    const pan = `${PAN_LETTERS[(i * 3) % 24]}${PAN_LETTERS[(i * 5 + 1) % 24]}${PAN_LETTERS[(i * 7 + 2) % 24]}${PAN_LETTERS[(i * 11 + 3) % 24]}${PAN_LETTERS[(i * 13 + 4) % 24]}${String(1000 + i * 137).slice(-4)}${PAN_LETTERS[(i * 17) % 24]}`;
    const client = await Client.create({
      company: company._id,
      name: def.name,
      email: `${def.short.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
      phone,
      pan,
      address: `${pick(AREAS)}, Maharashtra`,
      consumerNumber: `1700${String(10000000 + i * 31337).slice(-8)}`,
      projectType: def.projectType,
      roofType: def.roofType,
      kwRequired: pick([3, 4, 5, 6, 8, 10, 12, 20, 25, 30]),
      source: pick(SOURCES),
      notes: `${def.projectType === 'residential' ? 'Home' : 'Business'} client seeded for QA.`,
    });
    clients.push(client);
    stats.clients += 1;
  }
  log(`  + ${stats.clients} clients`);

  /* proposals (designs) across every status */
  const STATUS_MIX = [...Array(7).fill('draft'), ...Array(9).fill('proposed'), ...Array(3).fill('reproposed'), ...Array(4).fill('negotiation'), ...Array(7).fill('won'), ...Array(5).fill('lost')];
  const designs = [];
  for (const [i, status] of shuffle(STATUS_MIX).entries()) {
    const client = clients[i % clients.length];
    const kwp = pick([3, 3.3, 4, 5, 5.5, 6, 8, 10, 12, 15, 20, 25, 30]);
    const panels = Math.ceil((kwp * 1000) / 540);
    const cost = round((kwp * between(54000, 60000)) / 500) * 500;
    const lat = 18.52 + (rnd() - 0.5) * 0.1;
    const lng = 73.85 + (rnd() - 0.5) * 0.12;
    const short = client.name.split(' ').slice(0, 2).join(' ');
    const createdAt = daysAgo(between(5, 90));
    const subsidyEligible = kwp <= 10 && ['proposed', 'reproposed', 'won'].includes(status) && rnd() < 0.6;
    const design = await Design.create({
      company: company._id,
      client: client._id,
      name: `${short} – ${kwp} kW ${['rooftop', 'terrace', 'shed'][i % 3]}`,
      type: '3d',
      status,
      validUntil: ['draft', 'won', 'lost'].includes(status) ? null : new Date(Date.now() + between(7, 30) * 86400000),
      loanRequired: !subsidyEligible && ['proposed', 'won'].includes(status) && rnd() < 0.3,
      gridType: 'on_grid',
      projectType: client.projectType,
      roofType: client.roofType,
      subsidy: subsidyEligible ? { enabled: true, central: Math.min(78000, round(kwp * 30000)), state: kwp <= 3 ? 10000 : 0 } : undefined,
      data: site(client.address, lat, lng, rect(6 + kwp * 0.5, 5 + kwp * 0.25), between(6, 15)),
      summary: { kwp, panels, cost, annualKwh: round(kwp * 1450) },
      logs: [{ action: 'design_created', by: owner._id, byName: ownerName, byRole: ROLES.BRANCH, message: `${kwp} kW proposal`, at: createdAt }],
      createdAt,
      updatedAt: createdAt,
    });
    designs.push(design);
    stats.proposals += 1;
  }
  const won = designs.filter((d) => d.status === 'won');
  log(`  + ${stats.proposals} proposals (${won.length} booked)`);

  /* installations for the first four booked proposals */
  const COMPLETED_STEPS = [5, 5, 3, 1];
  const STARTED_DAYS = [40, 25, 12, 5];
  for (const [p, design] of won.slice(0, 4).entries()) {
    const done = COMPLETED_STEPS[p];
    const started = STARTED_DAYS[p];
    const steps = DEFAULT_INSTALLATION_STEPS.map((tpl, k) => {
      const status = k < done ? 'done' : k === done ? 'in_progress' : 'pending';
      return {
        _id: new mongoose.Types.ObjectId(),
        name: tpl.name,
        description: tpl.description,
        role: tpl.role,
        assignee: assigneeFor(tpl.role)._id,
        status,
        startedAt: status === 'pending' ? null : daysAgo(started - k * 4),
        completedAt: status === 'done' ? daysAgo(Math.max(0, started - k * 4 - 2)) : null,
      };
    });
    const logs = [{ action: 'started', by: owner._id, byName: ownerName, byRole: ROLES.BRANCH, message: '', at: daysAgo(started) }];
    for (const s of steps) {
      if (s.status === 'pending') continue;
      logs.push({ action: 'step_assigned', by: owner._id, byName: ownerName, byRole: ROLES.BRANCH, message: '', at: daysAgo(started), step: s._id, stepName: s.name });
      if (s.status === 'done') logs.push({ action: 'step_completed', by: s.assignee, byName: '', byRole: ROLES.AGENT, message: '', at: s.completedAt, step: s._id, stepName: s.name });
    }
    const complete = done === steps.length;
    const project = await tryStep(`installation for ${design.name}`, () => Project.create({
      company: company._id,
      design: design._id,
      client: design.client,
      status: complete ? 'completed' : 'active',
      installationCompletedAt: complete ? daysAgo(2) : null,
      steps,
      logs: logs.sort((a, b) => a.at - b.at),
      createdAt: daysAgo(started),
      updatedAt: daysAgo(1),
    }));
    if (project) stats.installations += 1;
    for (const reason of shuffle(DEFAULT_EXPENSE_REASONS).slice(0, 2)) {
      const expense = await tryStep(`expense for ${design.name}`, () => Expense.create({ company: company._id, design: design._id, amount: between(1500, 9000), reason, spentOn: daysAgo(between(2, started)), createdBy: owner._id, note: 'Seeded site cost' }));
      if (expense) stats.expenses += 1;
    }
  }
  log(`  + ${stats.installations} installations with steps assigned to staff, ${stats.expenses} expenses`);

  /* loans (booked proposals flagged for finance) */
  const loanTargets = won.slice(0, 3);
  for (const [i, design] of loanTargets.entries()) {
    const completedLoan = i === 0;
    const doneSteps = completedLoan ? DEFAULT_LOAN_STEPS.length : 2;
    await tryStep(`loan for ${design.name}`, async () => {
      await Design.updateOne({ _id: design._id }, { loanRequired: true });
      await Loan.create({
        company: company._id,
        design: design._id,
        client: design.client,
        lender: pick(['State Bank of India', 'HDFC Bank', 'ICICI Bank']),
        amount: round((design.summary.cost * 0.8) / 1000) * 1000,
        interestRate: pick([9.5, 10.5, 11]),
        tenureMonths: pick([60, 84]),
        status: completedLoan ? 'completed' : 'in_progress',
        disbursedOn: completedLoan ? daysAgo(3) : null,
        steps: DEFAULT_LOAN_STEPS.map((s, k) => ({
          ...s,
          status: k < doneSteps ? 'done' : k === doneSteps ? 'in_progress' : 'pending',
          completedAt: k < doneSteps ? daysAgo(20 - k * 3) : null,
        })),
        logs: [{ action: 'created', byName: ownerName, message: 'Loan file opened', at: daysAgo(25) }],
      });
      stats.loans += 1;
    });
  }
  log(`  + ${stats.loans} loans`);

  /* subsidies (PM Surya Ghar style, on small systems) */
  const subsidyTargets = designs.filter((d) => d.subsidy?.enabled).slice(0, 3);
  for (const [i, design] of subsidyTargets.entries()) {
    const doneSteps = i === 0 ? DEFAULT_SUBSIDY_STEPS.length : 3;
    await tryStep(`subsidy for ${design.name}`, async () => {
      await Subsidy.create({
        company: company._id,
        design: design._id,
        client: design.client,
        scheme: 'PM Surya Ghar',
        applicationNo: `PMSG-SC${i + 1}-${String(company._id).slice(-4)}`,
        status: i === 0 ? 'completed' : 'in_progress',
        centralAmount: design.subsidy.central,
        stateAmount: design.subsidy.state,
        receivedAmount: i === 0 ? design.subsidy.central : null,
        creditedOn: i === 0 ? daysAgo(2) : null,
        steps: DEFAULT_SUBSIDY_STEPS.map((s, k) => ({
          ...s,
          status: k < doneSteps ? 'done' : k === doneSteps ? 'in_progress' : 'pending',
          completedAt: k < doneSteps ? daysAgo(15 - k * 2) : null,
        })),
      });
      stats.subsidies += 1;
    });
  }
  log(`  + ${stats.subsidies} subsidy files`);

  /* stock sold on booked proposals: e-way bill → bill (→ invoice) */
  const sellLines = (panelCount) => [
    { sku: 'SC-PNL-WA540', qty: panelCount, serialized: true },
    { sku: 'SC-INV-HV33', qty: 1, serialized: true },
    { sku: 'SC-MNT-RAIL42', qty: 4 },
    { sku: 'SC-DCC-4R', qty: 5 },
    { sku: 'SC-ACC-4C10', qty: 5 },
  ];
  for (const [i, design] of won.slice(0, 3).entries()) {
    const lines = [];
    for (const row of sellLines(6)) {
      const product = productsBySku.get(row.sku);
      if (!product) continue;
      if (row.serialized) {
        const units = await SerialUnit.find({ company: company._id, product: product._id, status: 'inStock' }).sort({ serialNo: 1 }).limit(row.qty).lean();
        lines.push({ productId: product.id, serials: units.map((u) => u.serialNo), priceType: 'retail' });
      } else {
        lines.push({ productId: product.id, qty: row.qty, priceType: 'retail' });
      }
    }
    const eway = await tryStep(`e-way bill for ${design.name}`, () => ewayBillService.create(company, owner, { design: design.id, lines, withGst: true }));
    if (!eway) continue;
    stats.ewayBills += 1;
    const bill = await tryStep(`bill for ${design.name}`, () => billService.create(company, owner, {
      design: design.id,
      ewayBills: [eway.id],
      services: [{ name: 'Installation & commissioning', qty: 1, unit: 'Nos', rate: 25000, gstPercent: 18 }],
      withGst: true,
      payment: { mode: i === 0 ? 'bank_transfer' : 'upi', reference: `SEED-PAY-${i + 1}` },
    }));
    if (bill) stats.bills += 1;
    if (bill) await tryStep(`invoice for ${design.name}`, () => billingService.createInvoiceFromBills(company, owner, { design: design.id }));
  }
  log(`  + ${stats.ewayBills} e-way bills, ${stats.bills} bills`);

  /* receipts (money received against booked proposals) */
  const MODES = ['cash', 'upi', 'bank_transfer', 'cheque'];
  for (const [i, design] of won.slice(0, 6).entries()) {
    const amount = i < 3 ? round((design.summary.cost * 0.3) / 100) * 100 : round((design.summary.cost * 0.15) / 100) * 100;
    const receipt = await tryStep(`receipt for ${design.name}`, () => receiptService.create(company, owner, {
      design: design.id,
      amount,
      mode: MODES[i % MODES.length],
      reference: MODES[i % MODES.length] === 'cash' ? '' : `SEED-REF-${i + 1}`,
      reason: i < 3 ? 'Advance payment' : 'Part payment',
      receivedOn: daysAgo(between(2, 30)),
      receivedBy: pick(staff).user.name,
    }));
    if (receipt) stats.receipts += 1;
  }
  log(`  + ${stats.receipts} receipts`);

  return { company, stats, problems, staff: staff.map((s) => ({ name: s.name, email: `${s.local}@seedcompany.test`, role: s.role })) };
}

/**
 * Only the sales step, for a company that already has proposals (the full seed refuses to run twice): one e-way bill
 * per booked proposal, its bill, then the invoice. Lines are sold at retail price, as the app's own seeder does.
 */
export async function seedBillsOnly({ email, log = console.log } = {}) {
  const owner = await User.findOne({ email: String(email || '').trim().toLowerCase() });
  if (!owner) throw new Error(`No user with sign-in email ${email}`);
  const company = await Company.findById(owner.company);
  if (!company) throw new Error(`No company for ${email}`);
  if (await EwayBill.exists({ company: company._id })) throw new Error(`${company.name} already has e-way bills. Refusing to bill again.`);
  const won = await Design.find({ company: company._id, status: 'won' }).sort({ createdAt: 1 }).limit(3);
  const productsBySku = new Map((await Product.find({ company: company._id, sku: /^SC-/ }).lean()).map((p) => [p.sku, p]));
  const stats = { ewayBills: 0, bills: 0, invoices: 0 };
  const problems = [];
  const sellLines = [
    { sku: 'SC-PNL-WA540', qty: 6, serialized: true },
    { sku: 'SC-INV-HV33', qty: 1, serialized: true },
    { sku: 'SC-MNT-RAIL42', qty: 4 },
    { sku: 'SC-DCC-4R', qty: 5 },
    { sku: 'SC-ACC-4C10', qty: 5 },
  ];
  for (const [i, design] of won.entries()) {
    const lines = [];
    for (const row of sellLines) {
      const product = productsBySku.get(row.sku);
      if (!product) continue;
      if (row.serialized) {
        const units = await SerialUnit.find({ company: company._id, product: product._id, status: 'inStock' }).sort({ serialNo: 1 }).limit(row.qty).lean();
        lines.push({ productId: String(product._id), serials: units.map((u) => u.serialNo), priceType: 'retail' });
      } else {
        lines.push({ productId: String(product._id), qty: row.qty, priceType: 'retail' });
      }
    }
    try {
      const eway = await ewayBillService.create(company, owner, { design: design.id, lines, withGst: true });
      stats.ewayBills += 1;
      const bill = await billService.create(company, owner, {
        design: design.id,
        ewayBills: [eway.id],
        services: [{ name: 'Installation & commissioning', qty: 1, unit: 'Nos', rate: 25000, gstPercent: 18 }],
        withGst: true,
        payment: { mode: i === 0 ? 'bank_transfer' : 'upi', reference: `SEED-PAY-${i + 1}` },
      });
      stats.bills += 1;
      try {
        await billingService.createInvoiceFromBills(company, owner, { design: design.id });
        stats.invoices += 1;
      } catch (e) {
        problems.push(`invoice for ${design.name}: ${e.message}`);
      }
      void bill;
    } catch (e) {
      problems.push(`e-way bill / bill for ${design.name}: ${e.message}`);
    }
  }
  log(`  + ${stats.ewayBills} e-way bills, ${stats.bills} bills, ${stats.invoices} invoices`);
  return { company, stats, problems };
}

