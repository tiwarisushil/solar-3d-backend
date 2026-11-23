// OpenAPI paths for designs, estimates, catalog, categories, products, packages,
// installation charges, Google Solar, roof detection, and static maps.
// Success JSON is the value itself. There is no { data } wrapper.

const oid = { $ref: '#/components/schemas/ObjectId' };
const bearer = [{ bearerAuth: [] }];

const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
    code: { type: 'string' },
    details: { type: 'object', additionalProperties: true },
  },
};

const json = (description, schema, example) => ({
  description,
  content: { 'application/json': { schema, ...(example !== undefined ? { example } : {}) } },
});

const err = (description, example) => json(description, errorSchema, example);

const std = {
  401: { $ref: '#/components/responses/Unauthorized' },
  403: { $ref: '#/components/responses/Forbidden' },
  429: { $ref: '#/components/responses/RateLimited' },
  500: { $ref: '#/components/responses/ServerError' },
};

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: '24-character hex id.',
  schema: oid,
};

const ok = json('The action finished.', { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', enum: [true] } } }, { ok: true });

const validation = { $ref: '#/components/responses/ValidationError' };
const notFound = { $ref: '#/components/responses/NotFound' };
const conflict = { $ref: '#/components/responses/Conflict' };

function route(operationId, tag, summary, description, extra = {}) {
  return {
    operationId,
    tags: [tag],
    summary,
    description,
    security: bearer,
    ...extra,
  };
}

/* ───────────── shared field notes ───────────── */

const areaGate = `The mount is an area gate (any action in the named area is enough to reach the router). The route then checks the exact permission. A branch owner or company admin passes every permission check. Staff need the named \`area:action\`. A company with branches: catalog writes (categories, parent categories, products) also require the company admin (\`catalogEditorOnly\`). A company without branches keeps the inventory permission only.`;

const globalLimit = `The whole API also allows 1500 requests per IP per 5 minutes. A JSON body over 4 MB is 413 \`{ "error": "Request is too large" }\`. Unknown JSON keys are ignored, not rejected.`;

const catalogWrite = `**Write permission:** \`inventory:create\`, \`inventory:update\`, or \`inventory:delete\` for that verb, **and** \`catalogEditorOnly\`. When the organization has branches, a branch owner or staff member gets 403 \`Products and categories are shared by all branches. Only your company admin can change them.\` The catalog is shared by every branch of the organization; stock stays on the branch.`;

const branchWrite = `**Write permission:** the matching \`inventory:create\`, \`inventory:update\`, or \`inventory:delete\`. These records belong to the signed-in branch. \`catalogEditorOnly\` is not applied.`;

/* ───────────── design document ───────────── */

const chargeLine = {
  type: 'object',
  description: 'One installation charge copied onto a proposal. The name is stored so the quote still reads if the catalog row is later renamed or deleted.',
  properties: {
    chargeId: { type: 'string', description: 'Id of an installation-charge row, or "". Not checked as a foreign key.' },
    name: { type: 'string', maxLength: 80 },
    price: { type: 'number', minimum: 0, description: 'Amount for this proposal. `defaultPrice` on the catalog row only pre-fills the box.' },
    gstPercent: { type: 'number', minimum: 0, maximum: 100, description: 'On create, omitted or unusable values become 18. Clamped to 0–100.' },
    sac: { type: 'string', description: 'Optional. The designer copies the charge’s SAC into the saved workspace. Create’s charge cleaner keeps only chargeId, name, price, and gstPercent, so SAC survives on a later PUT of `data`, not on the create-time seed.' },
  },
};

const quoteCleaned = {
  type: 'object',
  description: 'What `POST /api/designs` stores at `data.quote` when `type` is `quick`. The service runs this cleaner. A later PUT replaces `data` with whatever object you send and does not run the cleaner again.',
  properties: {
    pricingMode: { type: 'string', enum: ['package', 'custom'], description: 'Only the string `custom` is kept as custom. Anything else, including omitted, becomes `package`.' },
    packageId: { type: 'string', maxLength: 64 },
    packagePrice: { type: 'number', minimum: 0 },
    items: {
      type: 'array',
      maxItems: 100,
      description: 'Lines with an empty name are dropped.',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['package', 'product'], description: 'Anything other than `package` is stored as `product`.' },
          refId: { type: 'string', description: 'Package or product id as a string. Not checked as a foreign key.' },
          name: { type: 'string', maxLength: 160 },
          detail: { type: 'string', maxLength: 300 },
          unit: { type: 'string', maxLength: 20 },
          qty: { type: 'number', minimum: 0 },
          price: { type: 'number', minimum: 0 },
        },
      },
    },
    withGst: { type: 'boolean', description: 'False only when sent as false. Omitted becomes true.' },
    gstIncluded: { type: 'boolean', description: 'False only when sent as false. Omitted becomes true. The quick editor’s later PUT sends rates that do not include GST (`pricingFromQuote` uses `gstIncluded: false`).' },
    gstPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Omitted becomes 18.' },
    discount: { type: 'number', minimum: 0 },
    discountIsPercent: { type: 'boolean' },
    discountRemark: { type: 'string', maxLength: 200 },
    floorPlacement: { type: 'integer', minimum: 0, maximum: 5, description: '0 is ground. The quick editor labels 0–5 as Ground floor through 5th floor+.' },
    floorCost: { type: 'number', minimum: 0 },
    outlookYears: { type: 'integer', minimum: 1, maximum: 30, description: 'Omitted becomes 10.' },
    tariff: { type: 'number', minimum: 0, description: 'Currency units per kWh. Omitted becomes 0. The quick editor usually uses the company tariff from `GET /api/catalog` instead of this field.' },
    installationCharges: { type: 'array', maxItems: 50, items: chargeLine },
  },
};

const pricingLine = {
  type: 'object',
  description: 'One priced line inside `summary.pricing`. Written by the designer (`buildPricing`). The server stores the object and does not recompute it.',
  properties: {
    productId: { type: 'string', description: 'Present when the line is tied to a catalog product.' },
    priceType: { type: 'string', enum: ['base', 'wholesale', 'retail'] },
    batch: { type: 'string' },
    batchNo: { type: 'string' },
    serials: { type: 'array', items: { type: 'string' } },
    issueId: { type: 'string' },
    name: { type: 'string', maxLength: 160 },
    detail: { type: 'string', maxLength: 600 },
    hsn: { type: 'string', description: 'HSN, or the installation charge’s SAC.' },
    qty: { type: 'number' },
    unit: { type: 'string' },
    rate: { type: 'number' },
    amount: { type: 'number', description: 'This line’s share of the subtotal after discount.' },
    gross: { type: 'number', description: 'qty × rate before discount.' },
    gstPercent: { type: 'number' },
    gstIncluded: { type: 'boolean' },
    taxable: { type: 'number' },
    gstAmount: { type: 'number' },
    lineTotal: { type: 'number' },
  },
};

const pricingSummary = {
  type: 'object',
  description: 'Price breakdown used by receipts and the invoice. The 3D designer sends the result of `pricingFrom3D`. The quick editor sends `pricingFromQuote` plus `grandTotal` set equal to `total`.',
  properties: {
    lines: { type: 'array', items: pricingLine },
    subtotal: { type: 'number' },
    discountAmount: { type: 'number' },
    discount: { type: 'number' },
    discountIsPercent: { type: 'boolean' },
    discountRemark: { type: 'string', maxLength: 200 },
    taxableTotal: { type: 'number' },
    gstTotal: { type: 'number' },
    taxByHsn: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hsn: { type: 'string' },
          taxable: { type: 'number' },
          gst: { type: 'number' },
          rate: { type: 'number', nullable: true, description: 'The single GST % when every line of this HSN shares it. Null when they differ.' },
        },
      },
    },
    gstIncluded: { type: 'boolean' },
    gstRate: { type: 'number', description: 'Highest GST % on the lines.' },
    total: { type: 'number', description: 'The figure a booked proposal locks. Changing it after an e-way bill, payment, or invoice is refused.' },
    grandTotal: { type: 'number', description: 'Set by the quick editor to the same number as `total`. The 3D autosave does not set this key.' },
    invoiceGstMode: { type: 'string', enum: ['with_gst', 'without_gst'] },
    withGst: { type: 'boolean' },
    paymentTerms: { type: 'string', maxLength: 120 },
  },
};

const latLng = {
  type: 'object',
  required: ['lat', 'lng'],
  properties: {
    lat: { type: 'number' },
    lng: { type: 'number' },
  },
};

const designData = {
  type: 'object',
  nullable: true,
  description: `Designer workspace. \`PUT\` replaces the whole object (it is not deep-merged). \`null\` clears it. Any other non-object is 400 \`Invalid design data\`.

The 3D designer autosaves these keys (and only these) about 1.2 seconds after an edit: \`mode\`, \`layoutKey\`, \`project\`, \`place\`, \`origin\`, \`roofArea\`, \`roofAreas\`, \`buildings\`, \`sections\`, \`objects\`, \`config\`, \`electrical\`, \`finance\`, \`sun\`. Load ignores a key whose saved value is \`null\`.

A quick (no-3D) proposal stores \`{ quote }\` instead. Create with \`type: "quick"\` writes a cleaned quote. The quick editor then PUTs its live quote, which has more keys than the cleaner keeps.

Coordinates: map outlines (\`place\`, \`origin\`, \`roofArea\`, \`roofAreas\`) are latitude/longitude. Roof sections and obstacles are metres around \`origin\` (x east, y north).`,
  properties: {
    mode: { type: 'string', description: 'Designer mode. The current app saves `simple`.' },
    layoutKey: { type: 'string', description: 'Opaque string the designer changes when the layout must be rebuilt. Not shown to the user.' },
    project: {
      type: 'object',
      description: 'Saved, then overwritten on the next load from the design name, the client name, and the company name.',
      properties: {
        name: { type: 'string' },
        customer: { type: 'string' },
        preparedBy: { type: 'string' },
      },
    },
    place: {
      type: 'object',
      nullable: true,
      description: 'Address chosen on the location step.',
      properties: {
        name: { type: 'string' },
        address: { type: 'string' },
        location: latLng,
      },
    },
    origin: { ...latLng, nullable: true, description: 'Confirmed site. Satellite imagery and local metres are measured from here.' },
    roofArea: {
      type: 'array',
      nullable: true,
      description: 'First roof outline marked on the map. Older designs have only this.',
      items: latLng,
    },
    roofAreas: {
      type: 'array',
      nullable: true,
      description: 'Every roof outline, one ring per building.',
      items: { type: 'array', items: latLng },
    },
    buildings: {
      type: 'array',
      description: 'Empty means one building. A campus lists `{ id, name }`. Section `building` points at `id`.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Client id such as `b1` or `b` + a short random string. Not a Mongo id.' },
          name: { type: 'string' },
        },
      },
    },
    sections: {
      type: 'array',
      description: 'Roof polygons in local metres. `frame` is computed when drawing and is not a field you need to send.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          building: { type: 'string', description: 'Building id. Missing or unknown uses the first building.' },
          points: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } }, description: 'Outline in local metres.' },
          height: { type: 'number', description: 'Wall or eave height in metres. Flat roofs use the roof height. Ground mounts use a near-zero height.' },
          parapetH: { type: 'number', description: 'Parapet height in metres. 0 on sloped roofs.' },
          parapetT: { type: 'number', description: 'Parapet thickness in metres. A new roof uses 0.23.' },
          roofType: { type: 'string', enum: ['flat', 'shed', 'gable', 'hip', 'plane'], description: 'Omitted until a style is picked, which draws as flat.' },
          pitch: { type: 'number', description: 'Slope in degrees.' },
          slopeAz: { type: 'number', description: 'Compass bearing of the low edge (0 north, 180 south).' },
          slopeAzSnap: { type: 'boolean', description: 'When true, the bearing snaps to a wall.' },
          ridge: { type: 'number', minimum: 0.15, maximum: 0.85, description: 'Gable only. Share of the depth on the slope that faces `slopeAz`. Default 0.5.' },
          rise2: { type: 'number', description: 'Gable only. Metres the other slope climbs. Omitted means both eaves sit at `height`.' },
          ends: { type: 'string', enum: ['hip', 'kerala', 'gable'], description: 'Hip roofs. `kerala` is the Kerala style. `gable` is a hip with gable ends.' },
          overhang: { type: 'number', description: 'Hip/Kerala overhang in metres. Default 0.4 when a hip style is applied.' },
          ground: { type: 'boolean', description: 'Ground-mounted array, not a roof.' },
          deck: { type: 'string', enum: ['stair', 'lift', 'floor'], description: 'A slab standing on another roof: staircase room, lift room, or roof-on-roof.' },
          auto: {
            type: 'object',
            description: 'Heights remembered when the roof was styled, so changing style does not lose the wall height.',
            properties: {
              flatH: { type: 'number' },
              wallH: { type: 'number' },
              floors: { type: 'number' },
              pitch: { type: 'number' },
            },
          },
        },
      },
    },
    objects: {
      type: 'array',
      description: 'Obstacles and panel bases, in local metres.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['array', 'zone', 'tree', 'block'] },
          name: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          points: { type: 'array', description: 'Zone outline, or a block drawn as a polygon.', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } } },
          r: { type: 'number', description: 'Tree radius, metres.' },
          h: { type: 'number', description: 'Tree or block height, metres.' },
          w: { type: 'number', description: 'Block width, or the computed width of a panel base.' },
          d: { type: 'number', description: 'Block depth, metres.' },
          len: { type: 'number', description: 'Panel-base length along the slope, metres.' },
          rot: { type: 'number', description: 'Block rotation, degrees.' },
          shape: { type: 'string', enum: ['cylinder'], description: 'Round block (water tank). Omitted means a box or a drawn polygon.' },
          rows: { type: 'integer', description: 'Panel base, or a zone’s rows per table.' },
          cols: { type: 'integer' },
          count: { type: 'integer', description: 'Panels on the base when it is not full and `filled` is absent.' },
          filled: { type: 'array', items: { type: 'string' }, description: 'Panel slots the user placed, `"row:col"`.' },
          tilt: { type: 'number' },
          azimuth: { type: 'number' },
          frontLeg: { type: 'number', description: 'Front leg height, metres.' },
          orientation: { type: 'string', enum: ['portrait', 'landscape'] },
          rowGap: { type: 'number' },
          rowsPerTable: { type: 'integer' },
          elevated: { type: 'boolean' },
          flush: { type: 'boolean', description: 'Zone sits on the roof surface.' },
          planted: { type: 'boolean', description: 'False means the base is drawn but has no modules yet.' },
          auto: { type: 'boolean', description: 'True when autofill placed the base.' },
          poleId: { type: 'string', description: 'Pole product id when this base does not use the design’s default pillar.' },
        },
      },
    },
    config: {
      type: 'object',
      description: 'Panel, structure, and price choices for a 3D design. Defaults below are what a new designer state starts with. Create can seed a smaller subset (see the create body).',
      properties: {
        specId: { type: 'string', description: 'Panel product id from `GET /api/catalog` `panels`. Empty until one is chosen. Package mode uses the package’s panel instead.' },
        pillarId: { type: 'string', description: 'Pole product id from `catalog.pillars`.' },
        orientation: { type: 'string', enum: ['portrait', 'landscape'], default: 'portrait' },
        tilt: { type: 'number', default: 15, description: 'Degrees. The panel step allows 0–45.' },
        azimuthMode: { type: 'string', enum: ['building', 'south', 'custom'], default: 'building', description: '`south` means true south in the northern hemisphere and true north in the southern.' },
        azimuth: { type: 'number', default: 180, description: 'Used when `azimuthMode` is `custom`. 0 is north, 180 is south.' },
        setback: { type: 'number', default: 0.6, description: 'Metres from the parapet. The panel step allows 0–5.' },
        frontLeg: { type: 'number', default: 0.4, description: 'Metres. The panel step allows 0.1–6.' },
        rowsPerTable: { type: 'integer', default: 2, description: 'The panel step allows 1–6.' },
        rowGap: { type: 'number', default: 0 },
        maxPanels: { type: 'number', default: 0 },
        targetKw: { type: 'number', default: 0 },
        sizeBy: { type: 'string', enum: ['bill', 'kw'], default: 'bill', description: 'Size the system from a monthly bill or from kW.' },
        sizeMode: { type: 'string', enum: ['bill', 'kw', 'fill'], description: 'Set when the user sizes by bill, by kW, or fills the roof.' },
        sizeBill: { type: 'string', description: 'Monthly bill typed by the user, kept as text.' },
        sizeKw: { type: 'string', description: 'Target kW kept as text.' },
        sizeValue: { type: 'number', description: 'Cleared (sent undefined, so the key drops out) when the sizing mode changes.' },
        pricingMode: { type: 'string', enum: ['custom', 'package'], default: 'custom' },
        packageId: { type: 'string', default: '' },
        productPricingMode: { type: 'string', enum: ['separate', 'combined'], default: 'separate', description: '`combined` prices groups of products as one amount.' },
        pricingGroups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              price: { type: 'number', minimum: 0 },
              gstPercent: { type: 'number' },
              memberKeys: { type: 'array', items: { type: 'string' }, description: 'Keys of the lines in the group, such as `modules` or `material:<categoryId>`.' },
            },
          },
        },
        floorPlacement: { type: 'integer', minimum: 0, maximum: 5, default: 0 },
        floorCost: { type: 'number', minimum: 0, default: 0 },
        installationCharges: { type: 'array', items: chargeLine },
        outlookYears: { type: 'integer', minimum: 1, maximum: 30, default: 10 },
        tariff: { type: 'number', minimum: 0, default: 0, description: 'The 3D financials use `catalog.tariff` for savings. This field is still saved on the config.' },
        customMaterials: {
          type: 'object',
          description: 'Map of material category id → the product chosen for that category.',
          additionalProperties: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
              qty: { type: 'number' },
              price: { type: 'number', description: 'Override. Omitted uses the catalog price.' },
              gstPercent: { type: 'number' },
            },
          },
        },
        extraItems: {
          type: 'array',
          description: 'Lines typed by hand, or lines copied from an estimate that did not fit one product per category.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              detail: { type: 'string' },
              qty: { type: 'number' },
              unit: { type: 'string' },
              price: { type: 'number' },
              gstPercent: { type: 'number' },
              hsn: { type: 'string' },
            },
          },
        },
        withGst: { type: 'boolean', default: true },
        gstPercent: { type: 'number', description: 'Omitted means the company’s default tax rate.' },
        discount: { type: 'number', minimum: 0 },
        discountIsPercent: { type: 'boolean' },
        discountRemark: { type: 'string', maxLength: 200 },
      },
    },
    electrical: {
      type: 'object',
      properties: {
        inverterId: { type: 'string', default: 'auto', description: '`auto`, or a generic size id `inv3` … `inv100` (3, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100 kW). A catalog inverter chosen on the Products step is a `customMaterials` entry, not this id.' },
        strings: {
          type: 'array',
          description: 'Strings the user drew by hand. Automatic strings are recomputed and are not saved here.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              modules: { type: 'array', items: { type: 'string' }, description: 'Module ids on the roof.' },
            },
          },
        },
      },
    },
    finance: {
      type: 'object',
      description: 'Yield assumptions. `init` stays false until the user has edited them.',
      properties: {
        currency: { type: 'string', default: 'INR', description: 'Display currency. Amounts are not converted.' },
        tariff: { type: 'number', default: 8, description: 'Fallback currency units per kWh. The open design uses the company tariff from the catalog.' },
        costPerKw: { type: 'number', default: 55000 },
        efficiency: { type: 'number', default: 85, description: 'DC to AC, percent. Quick quotes use 85.' },
        degradation: { type: 'number', default: 0.5, description: 'Percent per year.' },
        init: { type: 'boolean', default: false },
      },
    },
    sun: {
      type: 'object',
      description: 'Sun used by the 3D view. Shadow-report overrides are not saved.',
      properties: {
        season: { type: 'string', nullable: true, description: 'Preset such as `today`. Null when `day` is set.' },
        hour: { type: 'number', default: 12 },
        day: { type: 'integer', minimum: 1, maximum: 365, description: 'Day of year when the user picks a date instead of a season.' },
      },
    },
    quote: {
      allOf: [quoteCleaned],
      description: 'Quick proposal only. The live editor also keeps the keys below, which create’s cleaner drops and a PUT of `data` keeps.',
      properties: {
        ...quoteCleaned.properties,
        packageGstPercent: { type: 'number' },
        bundle: {
          type: 'array',
          description: 'Package lines copied at selection time (name, brand, model, category, detail, qty, unit, price, hsn, gstPercent, and `panel` on the module line).',
          items: { type: 'object', additionalProperties: true },
        },
        materials: {
          type: 'object',
          description: 'Custom mode: category id → one product line (`productId`, `name`, `detail`, `category`, `hsn`, `panel`, `unit`, `qty`, `price`, `gstPercent`).',
          additionalProperties: { type: 'object', additionalProperties: true },
        },
        extraItems: { type: 'array', items: { type: 'object', additionalProperties: true } },
        system: {
          type: 'object',
          description: 'Site used for the quick quote’s energy figures.',
          properties: {
            kwp: { type: 'number', default: 0 },
            moduleId: { type: 'string', default: '' },
            lat: { type: 'number', default: 28.6 },
            tilt: { type: 'number', default: 15 },
            azimuth: { type: 'number', default: 180 },
          },
        },
      },
    },
  },
};

const subsidySchema = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    central: { type: 'number', minimum: 0, description: 'Central (PM Surya Ghar) amount. Forced to 0 when `enabled` is false. Rounded to paise.' },
    state: { type: 'number', minimum: 0, description: 'State amount. Same rules as `central`.' },
  },
};

const summarySchema = {
  type: 'object',
  description: 'List figures. A PUT sends only the keys that should change; the others stay. The 3D autosave sends all six.',
  properties: {
    address: { type: 'string', maxLength: 300, description: 'The designer sends `place.address`, or "" before a place is chosen.' },
    kwp: { type: 'number', description: 'DC kilowatts, 3 decimal places from the 3D designer.' },
    panels: { type: 'number', description: 'Module count.' },
    cost: { type: 'number', description: 'Rounded grand total. This is part of the locked total once the proposal is billed.' },
    annualKwh: { type: 'number', description: 'Rounded AC kWh per year.' },
    pricing: pricingSummary,
  },
};

const clientEmbedded = {
  type: 'object',
  description: 'Populated client on GET, create, restore, and send-for-review (send-for-review and duplicate return only id, name, email).',
  properties: {
    id: oid,
    company: oid,
    name: { type: 'string', maxLength: 120 },
    email: { type: 'string' },
    phone: { type: 'string' },
    pan: { type: 'string' },
    gstNumber: { type: 'string' },
    projectType: { type: 'string', enum: ['residential', 'industrial', 'commercial', 'agricultural'] },
    roofType: { type: 'string', enum: ['concrete', 'factory', 'tin_shed', ''] },
    address: { type: 'string' },
    notes: { type: 'string' },
    consumerNumber: { type: 'string' },
    kwRequired: { type: 'number', nullable: true },
    source: { type: 'string' },
    referredBy: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' } } },
    documents: { type: 'array', items: { type: 'object', additionalProperties: true } },
    logs: { type: 'array', items: { type: 'object', additionalProperties: true } },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const activityLog = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    at: { type: 'string', format: 'date-time' },
    action: {
      type: 'string',
      description: 'Design actions: `design_created`, `design_updated` (at most once per 10 minutes), `design_renamed`, `design_status_changed`, `design_client_changed`, `design_duplicated`, `design_sent_for_client_review`, `design_version_restored`, `design_pdf_downloaded`. Installation logs use the same shape.',
    },
    step: { type: 'string', nullable: true },
    stepName: { type: 'string' },
    by: { type: 'string', nullable: true },
    byName: { type: 'string' },
    byRole: { type: 'string' },
    message: { type: 'string', maxLength: 1000 },
    lat: { type: 'number', nullable: true },
    lng: { type: 'number', nullable: true },
    imageUrl: { type: 'string' },
  },
};

const designDoc = {
  type: 'object',
  properties: {
    id: oid,
    company: oid,
    client: clientEmbedded,
    name: { type: 'string', maxLength: 120 },
    proposalNo: { type: 'string', maxLength: 60, description: 'Running proposal number. Proposals made before 2026-11-10 may have none.' },
    type: { type: 'string', enum: ['3d', 'quick'] },
    shareToken: { type: 'string', description: 'Public-link token. Absent after unshare (the key is removed, not set to null).' },
    validUntil: { type: 'string', format: 'date-time', nullable: true, description: 'Last moment of the chosen calendar day in the server’s local timezone.' },
    status: { type: 'string', enum: ['draft', 'proposed', 'reproposed', 'negotiation', 'won', 'lost'] },
    billingName: { type: 'string', maxLength: 160, description: 'Name to print when it differs from the client. "" when unset.' },
    loanRequired: { type: 'boolean' },
    gridType: { type: 'string', enum: ['on_grid', 'off_grid', 'hybrid', ''], description: 'Default `on_grid`. An unknown value is stored as "".' },
    projectType: { type: 'string', enum: ['residential', 'industrial', 'commercial', 'agricultural'], description: 'An unknown value is stored as `residential`.' },
    roofType: { type: 'string', enum: ['concrete', 'factory', 'tin_shed', ''], description: 'An unknown value is stored as "".' },
    cleaningFrequency: { type: 'number', minimum: 0, maximum: 365, description: 'Cleanings per year. Rounded. Default 0.' },
    cleaningCharge: { type: 'number', minimum: 0, description: 'Price per cleaning visit. Default 0.' },
    subsidy: subsidySchema,
    clientResponse: {
      type: 'object',
      nullable: true,
      description: 'Set by the client portal. Cleared when status becomes `proposed` or `reproposed`, and when the company sends the proposal back for review.',
      properties: {
        decision: { type: 'string', enum: ['accepted', 'rejected', 'changes_requested'] },
        note: { type: 'string', maxLength: 2000 },
        respondedAt: { type: 'string', format: 'date-time' },
        respondedBy: oid,
      },
    },
    clientReviewInvite: {
      type: 'object',
      nullable: true,
      description: 'Set by send-for-review. Cleared when the client responds, and when status becomes `proposed` or `reproposed`.',
      properties: {
        message: { type: 'string', maxLength: 2000 },
        sentAt: { type: 'string', format: 'date-time' },
        sentBy: oid,
      },
    },
    data: designData,
    summary: {
      type: 'object',
      properties: {
        address: { type: 'string' },
        kwp: { type: 'number' },
        panels: { type: 'number' },
        cost: { type: 'number' },
        annualKwh: { type: 'number' },
        pricing: { nullable: true, allOf: [pricingSummary] },
      },
    },
    amcOptionalSelections: { type: 'array', items: { type: 'string', maxLength: 80 }, description: 'AMC package names the client opted into. Not writable on these routes.' },
    amcRequests: {
      type: 'array',
      description: 'AMC visits requested on this proposal. Not writable on these routes.',
      items: { type: 'object', additionalProperties: true },
    },
    logs: { type: 'array', items: activityLog },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const designUpdateAck = {
  type: 'object',
  description: 'PUT does not return the design. The autosave uses this short acknowledgement. Read the design again with GET if you need `data`.',
  properties: {
    id: oid,
    name: { type: 'string' },
    status: { type: 'string', enum: ['draft', 'proposed', 'reproposed', 'negotiation', 'won', 'lost'] },
    validUntil: { type: 'string', format: 'date-time', nullable: true },
    updatedAt: { type: 'string', format: 'date-time' },
    clientResponse: { nullable: true },
    clientReviewInvite: { nullable: true },
    billingName: { type: 'string' },
    loanRequired: { type: 'boolean' },
    gridType: { type: 'string' },
    cleaningFrequency: { type: 'number' },
    cleaningCharge: { type: 'number' },
    subsidy: subsidySchema,
  },
};

const billingBodyProps = {
  billingName: { type: 'string', maxLength: 160, description: 'Trimmed. Null or "" stores "".' },
  loanRequired: {
    type: 'boolean',
    description: 'True for boolean true or any truthy value except the string `"false"`. Turning it on opens a loan file. Turning it off closes the loan, unless the loan is already being processed: 400 `This proposal’s loan is already being processed. Mark it as rejected under Loans instead of turning the loan option off.`',
  },
  gridType: { type: 'string', enum: ['on_grid', 'off_grid', 'hybrid', ''], description: 'Any other string is stored as "".' },
  projectType: { type: 'string', enum: ['residential', 'industrial', 'commercial', 'agricultural'], description: 'Any other string is stored as `residential`.' },
  roofType: { type: 'string', enum: ['concrete', 'factory', 'tin_shed', ''], description: 'Any other string is stored as "".' },
  cleaningFrequency: { type: 'number', minimum: 0, maximum: 365, description: 'Rounded to a whole number and clamped.' },
  cleaningCharge: { type: 'number', minimum: 0 },
  subsidy: {
    ...subsidySchema,
    description: 'Send the object to replace subsidy. A non-object is treated as `{}` (disabled, both amounts 0). Turning it on opens a subsidy file. Turning it off closes it, unless processing has started: 400 `This proposal’s subsidy is already being processed. Mark it as rejected under Subsidies instead of turning the subsidy option off.`',
  },
  validUntil: {
    type: 'string',
    nullable: true,
    description: 'A date the form can parse (`2026-10-31` or an ISO string). `null` or `""` clears it. The server sets the time to 23:59:59 in the server’s local timezone. Unparseable: 400 `Enter a valid date for “Valid until”`.',
  },
};

/* ───────────── catalog documents ───────────── */

const attributeDef = {
  type: 'object',
  required: ['label'],
  properties: {
    key: { type: 'string', maxLength: 40, description: 'Optional. Kept when sent so renaming the label does not orphan product values. If omitted, the server builds one from the label (`Efficiency (%)` → `efficiency`, `MPPT count` → `mpptCount`). Must match `^[A-Za-z][A-Za-z0-9_]{0,39}$`.' },
    label: { type: 'string', maxLength: 60, description: 'Required by zod (at most 60). A blank label is skipped by the service.' },
    dataType: { type: 'string', enum: ['text', 'number', 'select', 'boolean'], description: 'Omitted becomes `text`.' },
    isRequired: { type: 'boolean' },
    options: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 60 }, description: 'Select only. At least one option. Other types store `[]`. Duplicates are dropped.' },
    sortOrder: { type: 'number', minimum: 0, maximum: 1000, description: 'Omitted becomes the 1-based position in the list.' },
  },
};

const categoryDoc = {
  type: 'object',
  properties: {
    id: oid,
    company: oid,
    organization: { nullable: true, allOf: [oid], description: 'Set when the company belongs to an organization. The row is then shared by every branch.' },
    name: { type: 'string', maxLength: 60, description: 'Stored with the first letter capitalised.' },
    parent: { nullable: true, allOf: [oid] },
    type: { type: 'string', enum: ['general', 'panels', 'poles'], description: '`panels` and `poles` are the designer categories. You cannot create another of those types, change their type, or delete them.' },
    description: { type: 'string', maxLength: 300 },
    icon: { type: 'string', description: '`/uploads/<file>` or "".' },
    position: { type: 'number', description: '1-based order. New rows go last.' },
    attributes: { type: 'array', maxItems: 40, items: attributeDef },
    products: { type: 'integer', description: 'Count of products in the category. Present on list, get, create, update, reorder, and icon routes. Not a product array. `GET /api/catalog` is the one that nests products.' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const parentDoc = {
  type: 'object',
  properties: {
    id: oid,
    company: oid,
    organization: { nullable: true, allOf: [oid] },
    name: { type: 'string', maxLength: 60 },
    description: { type: 'string', maxLength: 300 },
    position: { type: 'number' },
    categories: { type: 'integer', description: 'How many categories are filed under it. Deleting the parent leaves those categories in place with `parent: null`.' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const productDoc = {
  type: 'object',
  description: 'List and create return `category` as an id string. GET, PUT, and the document routes populate `category` as the category object. `stock`, `price`, `lowStock`, and `hasBatches` are added on every product response and are not writable here. Prices and quantities live on stock batches.',
  properties: {
    id: oid,
    company: oid,
    organization: { nullable: true, allOf: [oid] },
    category: { description: 'Id string, or the category object on GET, PUT, and document routes.', oneOf: [oid, categoryDoc] },
    type: { type: 'string', enum: ['general', 'panels', 'poles'], description: 'Copied from the category. Not sent by the client.' },
    name: { type: 'string', maxLength: 120 },
    brand: { type: 'string', maxLength: 60 },
    model: { type: 'string', maxLength: 60 },
    sku: { type: 'string', maxLength: 60, description: 'Letters, digits, and `. _ - /`. Must start with a letter or digit. Blank is allowed.' },
    hsnCode: { type: 'string', description: '4, 6, or 8 digits, or blank. The column allows 20 characters; zod enforces the digit pattern.' },
    unit: { type: 'string', maxLength: 20, description: 'Must match one of the company’s product units, case-insensitive. Blank becomes the first unit in that list. A value that is not in the list is 400.' },
    gstPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Default 18.' },
    warrantyMonths: { type: 'integer', minimum: 0, maximum: 720 },
    reorderLevel: { type: 'number', minimum: 0 },
    isActive: { type: 'boolean', description: 'Default true. Inactive products stay in the catalog and drop out of the designer, package lines, and pickers unless `includeInactive` is set.' },
    isSerialized: { type: 'boolean', description: 'Default false. Cannot change after any batch exists.' },
    description: { type: 'string', maxLength: 1000 },
    attributes: { type: 'object', additionalProperties: true, description: 'Values keyed by the category attribute `key`. Unknown new keys are dropped. Values for attributes the category no longer defines are kept.' },
    documents: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        properties: {
          id: oid,
          name: { type: 'string', maxLength: 200, description: 'Original file name without `.pdf`.' },
          url: { type: 'string', description: '`/uploads/<organization-or-company>-proddoc-<productId>-….pdf`. Protected.' },
          size: { type: 'number' },
          uploadedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    watts: { type: 'number', minimum: 1, maximum: 2000, description: 'Panels only. Required and must be > 0. Cleared when the product is not a panel.' },
    length: { type: 'number', minimum: 0.2, maximum: 5, description: 'Panels only, metres. Required.' },
    width: { type: 'number', minimum: 0.2, maximum: 5, description: 'Panels only, metres. Required.' },
    shape: { type: 'string', enum: ['l-shape', 'cylindrical', 'square'], description: 'Poles only. Omitted becomes `square`.' },
    stock: { type: 'number', description: 'Sum of this branch’s remaining batch quantity. Read-only.' },
    price: { type: 'number', description: 'Retail price of the batch FIFO would sell next. 0 when there is no batch. Read-only.' },
    lowStock: { type: 'boolean', description: 'True when `stock` is less than or equal to `reorderLevel`.' },
    hasBatches: { type: 'boolean', description: 'True once stock was received. Serial tracking can no longer change.' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const productBody = {
  type: 'object',
  properties: {
    category: { ...oid, description: 'Required on create. On update, omit to keep the current category. The product takes that category’s type. Moving onto a panel category then requires watts, length, and width.' },
    name: { type: 'string', maxLength: 120, description: 'Required in effect. Panels with an empty name are named `"<brand> <model>"`. Anything still blank is 400 `Product name is required`.' },
    brand: { type: 'string', maxLength: 60 },
    model: { type: 'string', maxLength: 60 },
    sku: { type: 'string', maxLength: 60, description: 'Blank, or letters, digits, and `. _ - /`, starting with a letter or digit. Zod: `SKU can only have letters, digits and . _ - /`.' },
    hsnCode: { type: 'string', description: 'Blank, or 4, 6, or 8 digits. Zod: `HSN code must be 4, 6 or 8 digits`.' },
    unit: { type: 'string', maxLength: 20, description: 'Must be one of the company product units (Settings). Blank uses the first unit. Otherwise 400 `“<unit>” is not in your product units. Add it on the Product units page or choose another.`' },
    gstPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Blank string is treated as omitted (null) by zod and then left to the stored value on update, or the schema default 18 on create.' },
    warrantyMonths: { type: 'integer', minimum: 0, maximum: 720, description: 'Whole months. Prefer this over `warrantyYears`.' },
    warrantyYears: { type: 'number', minimum: 0, maximum: 60, description: 'Older clients. Used only when `warrantyMonths` is omitted. Stored as `round(years * 12)`.' },
    reorderLevel: { type: 'number', minimum: 0, maximum: 1e9 },
    isActive: { type: 'boolean', description: 'A PUT whose only key is `isActive` is always allowed, so you can deactivate before editing. Any other change while the product is active is 409 `Mark “<name>” inactive before you edit its catalog details`.' },
    isSerialized: { type: 'boolean', description: 'After a batch exists, changing this is 409 `Stock of this product has already been received, so its serial-number tracking can’t be changed`.' },
    description: { type: 'string', maxLength: 1000 },
    attributes: {
      type: 'object',
      description: 'Map of attribute key → string (≤ 200), number, boolean, or null. Checked against the category: required keys must be filled, numbers must be numbers, selects must match an option (case-insensitive), booleans accept true/false/yes/no/1/0.',
      additionalProperties: { oneOf: [{ type: 'string', maxLength: 200 }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }] },
    },
    watts: { type: 'number', minimum: 1, maximum: 2000, description: 'Panels. 400 `Watt is required` when missing or not > 0.' },
    length: { type: 'number', minimum: 0.2, maximum: 5, description: 'Panels, metres. 400 `Length is required`.' },
    width: { type: 'number', minimum: 0.2, maximum: 5, description: 'Panels, metres. 400 `Width is required`.' },
    shape: { type: 'string', enum: ['l-shape', 'cylindrical', 'square'], description: 'Poles. Zod: `Invalid shape`.' },
  },
};

const packageItemWrite = {
  type: 'object',
  required: ['productId'],
  properties: {
    productId: oid,
    qty: { type: 'number', minimum: 0, maximum: 1e6, description: 'Required by zod. The service stores `max(0, number)`, and a non-number becomes 1.' },
    unit: { type: 'string', maxLength: 20, description: 'Blank becomes `Nos`. First letter capitalised.' },
  },
};

const packageItemRead = {
  type: 'object',
  properties: {
    productId: { type: 'string' },
    qty: { type: 'number' },
    unit: { type: 'string' },
    name: { type: 'string', description: '"" if the product is gone.' },
    brand: { type: 'string' },
    model: { type: 'string' },
    watts: { type: 'number' },
    hsnCode: { type: 'string' },
    gstPercent: { type: 'number' },
    type: { type: 'string', enum: ['general', 'panels', 'poles', ''] },
    categoryName: { type: 'string', description: 'Lowercased category name. Used to infer `itemType`.' },
    category: { type: 'string', description: 'Category name as stored.' },
    parentId: { type: 'string' },
    parentName: { type: 'string' },
    parentOrder: { type: 'number' },
    price: { type: 'number', description: 'Current retail price of the product’s next FIFO batch. 0 if none. Not the package price.' },
    spec: { type: 'string', description: 'Attribute labels and values in category order (`Efficiency (%): 21.5, Cell type: TOPCon`). The product description when no attribute has a value.' },
    itemType: { type: 'string', enum: ['panel', 'poles', 'inverter', 'wire', 'earthing', 'acdb', 'dcdb', 'other'], description: 'Inferred from product type and category name. Not stored.' },
  },
};

const packageDoc = {
  type: 'object',
  description: 'List, get, create, and update return this enriched shape. The raw Mongo `_id` is also present (stringified) alongside `id`.',
  properties: {
    id: oid,
    _id: { type: 'string' },
    company: oid,
    name: { type: 'string', maxLength: 140 },
    kw: { type: 'number' },
    price: { type: 'number', minimum: 0 },
    description: { type: 'string', maxLength: 500, description: 'Zod allows 1000 characters. The column max is 500, so a longer value is 400 `The description is too long (up to 500 characters)`.' },
    items: { type: 'array', items: packageItemRead },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const chargeDoc = {
  type: 'object',
  properties: {
    id: oid,
    company: oid,
    name: { type: 'string', maxLength: 80 },
    description: { type: 'string', maxLength: 300 },
    defaultPrice: { type: 'number', minimum: 0, description: 'Default 0. Pre-fills the proposal; the proposal stores its own price.' },
    gstPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Default 18.' },
    sac: { type: 'string', maxLength: 8, description: 'Digits only. Non-digits are stripped. Printed in the HSN/SAC column.' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const estimateLine = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['package', 'product', 'service', 'custom'], description: 'Anything else is stored as `custom`.' },
    refId: { type: 'string', maxLength: 40, description: 'Catalog id copied for the quantity steppers. Not a Mongo reference.' },
    name: { type: 'string', maxLength: 140 },
    detail: { type: 'string', maxLength: 600 },
    hsn: { type: 'string', maxLength: 20 },
    unit: { type: 'string', maxLength: 20 },
    qty: { type: 'number', minimum: 0, maximum: 1e7 },
    rate: { type: 'number', minimum: 0, description: 'Before GST.' },
    gstPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Omitted becomes 18.' },
  },
};

const estimateClient = {
  type: 'object',
  required: ['name'],
  properties: {
    clientId: { type: 'string', maxLength: 40, description: 'Client id when picked from the client list. "" when the name was typed.' },
    name: { type: 'string', maxLength: 120, description: 'Required. 400 `Client name is required`.' },
    phone: { type: 'string', maxLength: 40, description: 'Stored as typed, trimmed. Not run through the phone normaliser.' },
    email: { type: 'string', maxLength: 200 },
    address: { type: 'string', maxLength: 400 },
  },
};

const estimateDoc = {
  type: 'object',
  properties: {
    id: oid,
    company: oid,
    client: estimateClient,
    date: { type: 'string', description: '`YYYY-MM-DD`. Anything else is replaced with today’s UTC date.' },
    withGst: { type: 'boolean' },
    lines: { type: 'array', items: estimateLine, description: 'Omitted on the list.' },
    notes: { type: 'string', maxLength: 1000 },
    design: {
      nullable: true,
      description: 'On the list, populated as `{ id, name }` or null if that proposal was deleted. On get/create/update, the id (or null).',
      oneOf: [oid, { type: 'object', properties: { id: oid, name: { type: 'string' } } }, { type: 'null' }],
    },
    subtotal: { type: 'number', description: 'Sum of round(qty × rate) per line, then rounded to paise. Server-computed.' },
    gstTotal: { type: 'number', description: 'Sum of per-line GST, each rounded to paise, only when `withGst` is true.' },
    total: { type: 'number' },
    createdByName: { type: 'string', maxLength: 120, description: 'Set on create from the signed-in user’s name or email. Update does not change it.' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const catalogProduct = {
  type: 'object',
  properties: {
    id: oid,
    name: { type: 'string' },
    brand: { type: 'string' },
    model: { type: 'string' },
    price: { type: 'number', description: 'This branch’s FIFO retail price. 0 if no batch.' },
    stock: { type: 'number' },
    unit: { type: 'string' },
    description: { type: 'string' },
    hsnCode: { type: 'string' },
    gstPercent: { type: 'number' },
    attributes: { type: 'object', additionalProperties: true, description: 'Datasheet values. The single-line diagram checks inverter attributes against these.' },
  },
};

const designerCatalog = {
  type: 'object',
  properties: {
    currency: { type: 'string', description: 'Company currency code, such as `INR`.' },
    tariff: { type: 'number', description: 'Company tariff, currency units per kWh. The designer uses this for savings.' },
    otherCostPerKw: { type: 'number', description: 'Company setting. Passed through for the designer.' },
    panels: {
      type: 'array',
      description: 'Active panel products with watts, length, and width all > 0. Sorted by product name within the category walk.',
      items: {
        type: 'object',
        properties: {
          id: oid,
          brand: { type: 'string', description: 'Product brand, or the product name when brand is empty.' },
          model: { type: 'string', description: 'Empty when brand was empty (the name was used as brand).' },
          watts: { type: 'number' },
          length: { type: 'number' },
          width: { type: 'number' },
          warrantyMonths: { type: 'number' },
          warrantyYears: { type: 'integer', description: '`floor(warrantyMonths / 12)`.' },
          hsnCode: { type: 'string' },
          gstPercent: { type: 'number' },
          attributes: { type: 'object', additionalProperties: true },
          price: { type: 'number' },
          manufactureYear: { type: 'number', nullable: true, description: 'Manufacture year of the FIFO batch, or null.' },
          categoryName: { type: 'string' },
          parentId: { type: 'string' },
          parentName: { type: 'string' },
          parentOrder: { type: 'number', description: '1-based parent order. 0 when the category has no parent.' },
        },
      },
    },
    pillars: {
      type: 'array',
      description: 'Active pole products. Price is per foot (`pricePerFt`), from the same FIFO retail price.',
      items: {
        type: 'object',
        properties: {
          id: oid,
          name: { type: 'string' },
          shape: { type: 'string', enum: ['l-shape', 'cylindrical', 'square'] },
          pricePerFt: { type: 'number' },
          hsnCode: { type: 'string' },
          gstPercent: { type: 'number' },
          categoryName: { type: 'string' },
          parentId: { type: 'string' },
          parentName: { type: 'string' },
          parentOrder: { type: 'number' },
        },
      },
    },
    parentCategories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: oid,
          name: { type: 'string' },
          order: { type: 'integer', description: '1-based, in `position` order.' },
        },
      },
    },
    materialCategories: {
      type: 'array',
      description: 'Every category that is not panels or poles and that has at least one active product. Empty categories are omitted. Packages are not in this payload; load `GET /api/packages`.',
      items: {
        type: 'object',
        properties: {
          id: oid,
          name: { type: 'string' },
          description: { type: 'string' },
          parentId: { type: 'string' },
          parentName: { type: 'string' },
          parentOrder: { type: 'number' },
          products: { type: 'array', items: catalogProduct },
        },
      },
    },
  },
};

const reorderBody = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['ids'],
        properties: {
          ids: {
            type: 'array',
            minItems: 1,
            items: oid,
            description: 'Every id of this company, in the new order. Position becomes the 1-based index. Ids that are not yours are skipped (the update matches none). An id that is not 24 hex is 404.',
          },
        },
      },
      example: { ids: ['665f1c2a3b4d5e6f7a8b9c0d', '665f1c2a3b4d5e6f7a8b9c0e'] },
    },
  },
};

const uploadRate = `File routes also count toward the upload limit: 60 uploads per user per 10 minutes, and at most 3 uploads in flight for that user. Over the in-flight cap: 429 \`Too many uploads at once. Wait for the others to finish.\` A file over the size limit: 400 \`That file is too large\`. The declared MIME type is not trusted; the server reads the first bytes.`;

export default {
  '/api/designs': {
    get: route(
      'designList',
      'Designs',
      'List proposals',
      `**Who:** anyone who can open Proposals. **Permission:** \`proposals:view\`.

Returns \`{ items, total, page, limit }\`. Each item is a proposal **without** \`data\` (that object is large). \`client\` is \`{ id, name, email }\` or missing if the client was removed. \`installationId\` is the installation’s id when one exists, otherwise null.

\`installable=1\` (or \`true\`) forces \`status=won\` and drops proposals that already have an installation. That is the Start installation picker. It overrides \`status\` and \`show\`.

\`show\` is a dashboard preset. An unknown value does not filter.

| show | What it lists |
| --- | --- |
| changes | Open quote (\`proposed\`, \`reproposed\`, \`negotiation\`) where the client asked for changes |
| no_reply | Open quote, no client decision, not updated in 7 days |
| expiring | Open quote whose \`validUntil\` is today through the next 7 days |
| not_started | \`won\`, no installation |
| loan_missing | \`won\`, \`loanRequired\`, no loan file |
| subsidy_missing | \`won\`, subsidy enabled, no subsidy file |
| made_month | Created since the 1st of this month (server local date) |

\`from\` / \`to\` are \`YYYY-MM-DD\` on \`createdAt\`, inclusive, UTC day bounds. A bad date is ignored. \`q\` matches name, proposal number, client name, or \`summary.address\`, case-insensitive.

A \`client\` query that is not a valid id is 404 \`Client not found\`.

${globalLimit}`,
      {
        parameters: [
          { name: 'client', in: 'query', schema: oid, description: 'Only this client’s proposals.' },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
          { name: 'from', in: 'query', schema: { type: 'string', example: '2026-01-01' } },
          { name: 'to', in: 'query', schema: { type: 'string', example: '2026-12-31' } },
          { name: 'show', in: 'query', schema: { type: 'string', enum: ['changes', 'no_reply', 'expiring', 'not_started', 'loan_missing', 'subsidy_missing', 'made_month'] } },
          { name: 'status', in: 'query', schema: { type: 'string' }, description: '`all` or omitted means every status. Any other string is matched exactly, including values outside the enum (those simply return no rows).' },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'installable', in: 'query', schema: { type: 'string', enum: ['1', 'true'] }, description: 'Won proposals with no installation yet.' },
        ],
        responses: {
          200: json('Page of proposals, newest update first. `data` is omitted.', {
            type: 'object',
            properties: {
              items: { type: 'array', items: { type: 'object', additionalProperties: true } },
              total: { type: 'integer' },
              page: { type: 'integer' },
              limit: { type: 'integer' },
            },
          }, {
            items: [{
              id: '665f1c2a3b4d5e6f7a8b9c0d',
              name: 'Sharma – rooftop solar',
              proposalNo: 'P-0042',
              status: 'draft',
              type: '3d',
              client: { id: '665f1c2a3b4d5e6f7a8b9c01', name: 'Sharma', email: 'sharma@example.com' },
              summary: { address: '12 MG Road, Pune', kwp: 5.4, panels: 10, cost: 285000, annualKwh: 8100, pricing: null },
              installationId: null,
              updatedAt: '2026-11-20T10:00:00.000Z',
            }],
            total: 1,
            page: 1,
            limit: 50,
          }),
          404: err('`client` is not a valid id.', { error: 'Client not found' }),
          ...std,
        },
      },
    ),
    post: route(
      'designCreate',
      'Designs',
      'Create a proposal',
      `**Who:** a designer starting a proposal for one of this branch’s clients. **Permission:** \`proposals:create\`. Mount: Proposals area.

Zod checks only \`client\` (required, 24 hex) and \`name\` (optional, at most 120 characters). Every other key below is read by the service. Extra keys are kept by the loose schema and ignored unless listed here.

**What gets stored**

- \`name\`: trimmed. Blank becomes \`"<client name> – rooftop solar"\` (en dash).
- \`proposalNo\`: the next number for this branch. Not sent by the client.
- \`shareToken\`: created immediately, so the public link exists before anyone opens Share.
- \`status\`: \`draft\`. Send status on a later PUT.
- \`type\`: \`quick\` only when the body says \`type: "quick"\`. Anything else, including omitted, is \`3d\`.
- \`data\` for a quick proposal: \`{ quote }\` after the quote cleaner (see the schema). Omit \`quote\` and you still get a cleaned empty package quote.
- \`data\` for a 3D proposal: \`null\`, unless you send \`pricingMode\`, \`packageId\`, or \`floorPlacement\`. Then \`data\` is \`{ config }\` with \`pricingMode\` (default \`custom\`, not restricted to the enum), \`packageId\` (default \`""\`), \`floorPlacement\` (\`Number\` or 0, **not** clamped to 0–5), \`floorCost\`, \`installationCharges\` (at most 50, nameless rows dropped), \`outlookYears\` (1–30, default 10), \`tariff\` (≥ 0).
- Billing fields in the body (\`billingName\`, \`loanRequired\`, \`gridType\`, \`projectType\`, \`roofType\`, \`cleaningFrequency\`, \`cleaningCharge\`, \`subsidy\`) are applied the same way as on update. \`loanRequired: true\` opens a loan file. \`subsidy.enabled: true\` opens a subsidy file.
- \`validUntil\`: same parsing as update. Omitted stores null.

The plan cap counts designs across every branch. At the cap: 400 \`Your company has reached its plan limit of <n> designs, counted across all branches. Ask your company admin to upgrade the plan to add more.\`

A client id that is not one of yours: 400 \`Choose one of your clients\` if it is 24 hex but not in this branch, or 404 \`Client not found\` if it is not a valid id. Zod rejects a non-hex id first: 400 \`Invalid id\` with \`code: "VALIDATION"\`.

Response is the new proposal with the client populated, status 201.

${globalLimit}`,
      {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['client'],
                properties: {
                  client: { ...oid, description: 'Required. A client of this branch.' },
                  name: { type: 'string', maxLength: 120, description: 'Optional. Blank uses `"<client name> – rooftop solar"`.' },
                  type: { type: 'string', enum: ['3d', 'quick'], description: 'Only `quick` is special. Omit for a 3D proposal.' },
                  quote: quoteCleaned,
                  pricingMode: { type: 'string', description: '3D seed only, and only when this, `packageId`, or `floorPlacement` is sent. Not used when `type` is `quick`.' },
                  packageId: { type: 'string' },
                  floorPlacement: { type: 'number' },
                  floorCost: { type: 'number' },
                  installationCharges: { type: 'array', maxItems: 50, items: chargeLine },
                  outlookYears: { type: 'number' },
                  tariff: { type: 'number' },
                  ...billingBodyProps,
                },
              },
              examples: {
                minimal: {
                  summary: 'Smallest 3D proposal',
                  value: { client: '665f1c2a3b4d5e6f7a8b9c01' },
                },
                named: {
                  summary: 'Named draft',
                  value: { client: '665f1c2a3b4d5e6f7a8b9c01', name: 'Sharma residence 5 kW' },
                },
                quick: {
                  summary: 'Quick quote with no lines yet',
                  value: { client: '665f1c2a3b4d5e6f7a8b9c01', type: 'quick', name: 'Sharma quick quote' },
                },
              },
            },
          },
        },
        responses: {
          201: json('The created proposal, client populated.', designDoc),
          400: validation,
          404: err('Client id is not 24 hex characters (thrown before zod only if validation is skipped). Zod usually returns 400 instead.', { error: 'Client not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/designs/{id}': {
    get: route(
      'designGet',
      'Designs',
      'Get one proposal',
      `**Who:** the designer opening a proposal, including someone who may only view. **Permission:** \`proposals:view\`.

Returns the full document, including \`data\` and \`summary\`, with \`client\` populated (every client field). A view-only user can read this; their edits must not be PUT back.

404 \`Design not found\` when the id is unknown, belongs to another branch, or is not 24 hex.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: json('The proposal.', designDoc),
          404: err('No proposal with that id in this branch.', { error: 'Design not found' }),
          ...std,
        },
      },
    ),
    put: route(
      'designUpdate',
      'Designs',
      'Save a proposal',
      `**Who:** the designer autosave, the quick-quote editor, and the proposal sidebar. **Permission:** \`proposals:update\`. Changing \`status\` also needs \`proposals:change_status\`. Changing \`client\` also needs \`proposals:change_client\`. Missing those: 403 with the permission name.

There is **no zod schema** on this route. Only the keys below are applied. Any other top-level key is ignored. This is a partial update: omit a key to leave it unchanged.

**Keys**

- \`name\` — string, trimmed by mongoose, max 120. Empty fails as 400 \`The name is required\`. A rename writes a log.
- \`status\` — \`draft\`, \`proposed\`, \`reproposed\`, \`negotiation\`, \`won\`, \`lost\`. Any other value is 400 \`“<value>” is not a valid status\` (no \`VALIDATION\` code). Moving to \`proposed\` or \`reproposed\` clears \`clientResponse\` and \`clientReviewInvite\`.
- \`client\` — a client id of this branch. 400 \`Choose one of your clients\` or 404 \`Client not found\`. The installation, loan, and subsidy follow the new client.
- \`validUntil\` — see the schema. Omit to leave it.
- \`billingName\`, \`loanRequired\`, \`gridType\`, \`projectType\`, \`roofType\`, \`cleaningFrequency\`, \`cleaningCharge\`, \`subsidy\` — only keys you send are written. Rules are on each property.
- \`summary\` — merged onto the existing summary. Only \`address\` (max 300), \`kwp\`, \`panels\`, \`cost\`, \`annualKwh\`, and \`pricing\` are copied. Other summary keys are ignored. \`pricing\` replaces the previous pricing object.
- \`data\` — **replaces** the saved workspace. Send the full object the screen should keep. \`null\` clears it. A string or array is 400 \`Invalid design data\`.

The 3D autosave sends \`{ data, summary }\` where \`data\` is the saved keys listed on the \`data\` schema and \`summary\` is \`{ address, kwp, panels, cost, annualKwh, pricing }\`. The quick editor sends \`{ data: { quote }, validUntil, summary: { cost, pricing } }\`. \`quote\` on that PUT is the editor state (package, materials, bundle, system, extra items), not the smaller object create would have cleaned.

**Locked after billing.** If the proposal has a non-cancelled e-way bill, a payment, or an invoice, you cannot change \`status\`, \`client\`, or the priced total. 400 \`This proposal has e-way bills, bills or an invoice, so its <price|client|status> can’t be changed. Cancel its open e-way bills first, or duplicate the proposal to quote something different.\` Saving \`data\` without changing the total still works, so autosave continues.

The response is a short acknowledgement, not the design. It includes the billing fields the sidebar reads, and it does **not** include \`projectType\`, \`roofType\`, \`data\`, or \`summary\`.

${globalLimit}`,
      {
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'Every property is optional. Omitted properties stay as they are. `data`, when sent, replaces the whole workspace.',
                properties: {
                  name: { type: 'string', maxLength: 120 },
                  status: { type: 'string', enum: ['draft', 'proposed', 'reproposed', 'negotiation', 'won', 'lost'] },
                  client: oid,
                  data: designData,
                  summary: summarySchema,
                  ...billingBodyProps,
                },
              },
              examples: {
                autosave: {
                  summary: '3D autosave (shape, not a full roof)',
                  value: {
                    data: {
                      mode: 'simple',
                      layoutKey: '',
                      project: { name: 'Sharma residence', customer: 'Sharma', preparedBy: 'Innovbit Solar' },
                      place: { address: '12 MG Road, Pune', location: { lat: 18.5204, lng: 73.8567 } },
                      origin: { lat: 18.5204, lng: 73.8567 },
                      roofArea: [{ lat: 18.52043, lng: 73.85665 }, { lat: 18.52043, lng: 73.8568 }, { lat: 18.5205, lng: 73.8568 }],
                      roofAreas: [[{ lat: 18.52043, lng: 73.85665 }, { lat: 18.52043, lng: 73.8568 }, { lat: 18.5205, lng: 73.8568 }]],
                      buildings: [{ id: 'b1', name: 'Building 1' }],
                      sections: [{ id: 'r1', name: 'Main roof', building: 'b1', points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }], height: 6, parapetH: 0.9, parapetT: 0.23, roofType: 'flat' }],
                      objects: [],
                      config: { specId: '665f1c2a3b4d5e6f7a8b9c11', pillarId: '', orientation: 'portrait', tilt: 15, azimuthMode: 'building', azimuth: 180, setback: 0.6, frontLeg: 0.4, rowsPerTable: 2, rowGap: 0, pricingMode: 'custom', packageId: '', floorPlacement: 0, floorCost: 0, installationCharges: [], outlookYears: 10, tariff: 8, customMaterials: {}, withGst: true },
                      electrical: { inverterId: 'auto', strings: [] },
                      finance: { currency: 'INR', tariff: 8, costPerKw: 55000, efficiency: 85, degradation: 0.5, init: false },
                      sun: { season: 'today', hour: 12 },
                    },
                    summary: { address: '12 MG Road, Pune', kwp: 5.4, panels: 10, cost: 285000, annualKwh: 8100, pricing: { lines: [], subtotal: 285000, total: 285000, gstTotal: 0, withGst: true } },
                  },
                },
                sidebar: {
                  summary: 'Status, validity, and subsidy only',
                  value: {
                    status: 'proposed',
                    validUntil: '2026-12-31',
                    subsidy: { enabled: true, central: 78000, state: 0 },
                    loanRequired: false,
                    gridType: 'on_grid',
                    projectType: 'residential',
                    roofType: 'concrete',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: json('Short acknowledgement. Not the saved design.', designUpdateAck, {
            id: '665f1c2a3b4d5e6f7a8b9c0d',
            name: 'Sharma residence',
            status: 'draft',
            validUntil: null,
            updatedAt: '2026-11-23T08:00:00.000Z',
            clientResponse: null,
            clientReviewInvite: null,
            billingName: '',
            loanRequired: false,
            gridType: 'on_grid',
            cleaningFrequency: 0,
            cleaningCharge: 0,
            subsidy: { enabled: false, central: 0, state: 0 },
          }),
          400: err('A business rule or a stored-field check failed. Zod is not used, so `code` is absent unless noted.', { error: 'Invalid design data' }),
          403: { $ref: '#/components/responses/Forbidden' },
          404: err('Proposal or client id is unknown.', { error: 'Design not found' }),
          409: err('The document version changed under you.', { error: 'This was just changed by someone else. Reload and try again.' }),
          401: std[401],
          429: std[429],
          500: std[500],
        },
      },
    ),
    delete: route(
      'designDelete',
      'Designs',
      'Delete a proposal',
      `**Who:** someone removing a proposal that was never billed. **Permission:** \`proposals:delete\`.

Deletes the proposal, its installation, its loan file, its subsidy file, its expenses, and its archived PDF versions (the files too).

Refused when a non-cancelled e-way bill, a payment, an invoice, or any bill exists: 400 \`This proposal has e-way bills, bills or an invoice, so it cannot be deleted. Cancel its open e-way bills first\`. A cancelled e-way bill by itself does not block deletion.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: ok,
          400: err('The proposal has been billed.', { error: 'This proposal has e-way bills, bills or an invoice, so it cannot be deleted. Cancel its open e-way bills first' }),
          404: err('Unknown id.', { error: 'Design not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/designs/{id}/lifecycle': {
    get: route(
      'designLifecycle',
      'Designs',
      'Proposal history',
      `**Who:** the proposal timeline. **Permission:** \`proposals:view\`.

Merges client logs, proposal logs, and installation logs in time order. A proposal that has no \`design_created\` log gets a synthetic one. Same for a client with no \`client_created\` log.

\`installation\` is \`{ id, status, startedAt }\` or null. \`client\` is the populated client (\`name\`, \`email\`, \`phone\`, plus id). \`design.summary\` is included.

404 \`Design not found\`.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: json('Timeline.', {
            type: 'object',
            properties: {
              design: {
                type: 'object',
                properties: {
                  id: oid,
                  name: { type: 'string' },
                  status: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  summary: summarySchema,
                },
              },
              client: { nullable: true, allOf: [clientEmbedded] },
              installation: {
                nullable: true,
                type: 'object',
                properties: {
                  id: oid,
                  status: { type: 'string', enum: ['active', 'completed'] },
                  startedAt: { type: 'string', format: 'date-time' },
                },
              },
              events: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    at: { type: 'string', format: 'date-time' },
                    action: { type: 'string' },
                    phase: { type: 'string', enum: ['client', 'design', 'installation'] },
                    stepName: { type: 'string' },
                    byName: { type: 'string' },
                    byRole: { type: 'string' },
                    message: { type: 'string' },
                    lat: { type: 'number', nullable: true },
                    lng: { type: 'number', nullable: true },
                    imageUrl: { type: 'string' },
                  },
                },
              },
            },
          }),
          404: err('Unknown proposal.', { error: 'Design not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/designs/{id}/versions': {
    get: route(
      'designListVersions',
      'Designs',
      'List archived quotation PDFs',
      `**Who:** the version list on a proposal. **Permission:** \`proposals:view\`.

Newest first. \`data\` is not included. \`summary\` is the snapshot taken when the PDF was archived. \`createdBy\` is \`{ id, name, email }\`. \`pdfName\` is the stored file name under \`/uploads/\`.

An unknown design id returns an empty array (the query is filtered by design id; a non-hex id is 404 \`Design not found\`).

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: json('Versions, without the workspace snapshot.', {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: oid,
                company: oid,
                design: oid,
                createdBy: { type: 'object', nullable: true, properties: { id: oid, name: { type: 'string' }, email: { type: 'string' } } },
                pdfName: { type: 'string' },
                summary: { nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          }),
          404: notFound,
          ...std,
        },
      },
    ),
    post: route(
      'designCreateVersion',
      'Designs',
      'Archive the quotation PDF',
      `**Who:** the designer, when a quotation PDF is downloaded. **Permission:** \`proposals:update\` (archiving happens while editing, not under a separate permission).

Multipart. Field name \`file\`. One PDF, at most 20 MB. Content must be a real PDF (\`%PDF-\`), not only a \`.pdf\` name. ${uploadRate}

Missing file: 400 \`A PDF file is required\` (no \`VALIDATION\` code). Wrong type: 400 \`Upload a PDF\` or \`That file is not a valid PNG, JPG, WebP image or PDF\` after the byte check (the PDF allow-list message is the shared invalid-file message when the bytes are not a PDF).

Stores the current \`data\` and \`summary\` on the version and logs \`design_pdf_downloaded\`. Returns the version including \`data\` and \`summary\`, status 201.

${globalLimit}`,
      {
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary', description: 'PDF. Field name `file`. Max 20 MB.' },
                },
              },
            },
          },
        },
        responses: {
          201: json('The new version, including the workspace snapshot.', { type: 'object', additionalProperties: true }),
          400: err('No file, or the file is not a PDF / is too large.', { error: 'A PDF file is required' }),
          404: err('Unknown proposal.', { error: 'Design not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/designs/{id}/versions/{versionId}/restore': {
    post: route(
      'designRestoreVersion',
      'Designs',
      'Restore an archived version',
      `**Who:** someone putting an older quotation back. **Permission:** \`proposals:update\`. No body.

Copies that version’s \`data\` and \`summary\` onto the live proposal. The current state is not snapshotted by this call; the next PDF download archives whatever is then current.

If the version’s summary would change the billed total, the same lock as PUT applies (400, price can’t be changed).

Returns the proposal with the client populated.

${globalLimit}`,
      {
        parameters: [
          idParam,
          { name: 'versionId', in: 'path', required: true, schema: oid, description: 'Version id from the list.' },
        ],
        responses: {
          200: json('The proposal after restore.', designDoc),
          400: err('Restoring would change a billed total.', { error: 'This proposal has e-way bills, bills or an invoice, so its price can’t be changed. Cancel its open e-way bills first, or duplicate the proposal to quote something different.' }),
          404: err('Proposal or version is unknown.', { error: 'Design version not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/designs/{id}/send-for-review': {
    post: route(
      'designSendForReview',
      'Designs',
      'Ask the client to review again',
      `**Who:** the company, after editing a proposal the client sent back. **Permission:** \`proposals:change_status\` (not \`proposals:update\`).

The proposal must already be \`proposed\`, \`reproposed\`, or \`negotiation\`. Otherwise 400 \`Set the proposal to Proposed, Reproposed or Negotiation before asking the client to review it.\`

\`clientResponse.decision\` must be \`changes_requested\`. Otherwise 400 \`The client has not asked for changes on this proposal.\`

Clears \`clientResponse\`, sets \`clientReviewInvite\` to the message, and notifies the client. The message is trimmed, max 2000. Blank uses \`I have made the changes you requested. Please review the updated proposal.\`

Returns the proposal with \`client\` limited to \`id\`, \`name\`, and \`email\`.

${globalLimit}`,
      {
        parameters: [idParam],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string', maxLength: 2000, description: 'Optional note to the client. Empty uses the default sentence.' },
                },
              },
              example: { message: 'Updated the panel count as you asked. Please review.' },
            },
          },
        },
        responses: {
          200: json('The proposal, client limited to id, name, email.', designDoc),
          400: validation,
          404: err('Unknown proposal.', { error: 'Design not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/designs/{id}/share': {
    post: route(
      'designShare',
      'Designs',
      'Get or create the public link token',
      `**Who:** someone copying the share link or QR. **Permission:** \`proposals:share\`. **No request body.**

Creates \`shareToken\` the first time (new proposals already have one from create). Returns \`{ token }\`. Does not return the URL; the app builds \`/p/<token>\` (or the public proposal path it already uses) from this token.

Calling it again returns the same token.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: json('The public token.', { type: 'object', required: ['token'], properties: { token: { type: 'string' } } }, { token: 'a8f3kQ2mN0pL9xR7vB4cD1eH' }),
          404: err('Unknown proposal.', { error: 'Design not found' }),
          ...std,
        },
      },
    ),
    delete: route(
      'designUnshare',
      'Designs',
      'Turn the public link off',
      `**Who:** someone disabling a link that was already printed or shared. **Permission:** \`proposals:share\`.

Removes \`shareToken\`. Existing QR codes stop working. A later POST creates a new token. This does not delete the proposal.

Returns \`{ token: null }\`.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: json('The link is off.', { type: 'object', properties: { token: { type: 'null' } } }, { token: null }),
          404: err('Unknown proposal.', { error: 'Design not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/designs/{id}/duplicate': {
    post: route(
      'designDuplicate',
      'Designs',
      'Duplicate a proposal',
      `**Who:** someone quoting a change without editing a billed proposal. **Permission:** \`proposals:create\`. No body.

Copies type, data, summary, billing name, loan flag, grid type, project type, roof type, cleaning terms, subsidy, and optional AMC package names. The copy is a new \`draft\` with a new proposal number and a new share token. \`validUntil\` is cleared. Client response, review invite, AMC bookings, and logs are not copied. The name is \`"<original> (copy)"\` cut to 120 characters.

The same plan cap as create applies. If the copy has a loan or an enabled subsidy, those files are opened.

Returns the copy with \`client\` limited to \`id\`, \`name\`, and \`email\`. Status 201.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          201: json('The new draft.', designDoc),
          400: err('The company is at its design cap.', { error: 'Your company has reached its plan limit of 100 designs, counted across all branches. Ask your company admin to upgrade the plan to add more.' }),
          404: err('Unknown proposal.', { error: 'Design not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/estimates': {
    get: route(
      'estimateList',
      'Estimates',
      'List saved estimates',
      `**Who:** Dashboard → Estimation. **Permission:** \`proposals:view\`. Mount: Proposals area.

Returns an **array**, newest first, at most 500. \`lines\` are omitted. \`design\` is \`{ id, name }\` when a proposal was made from the estimate, or null if that proposal was deleted or none was linked. \`q\` matches \`client.name\`, case-insensitive, max 80 characters used.

${globalLimit}`,
      {
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Client name contains this text.' },
        ],
        responses: {
          200: json('Estimates without lines.', { type: 'array', items: estimateDoc }),
          ...std,
        },
      },
    ),
    post: route(
      'estimateCreate',
      'Estimates',
      'Save an estimate',
      `**Who:** someone saving a quick price list that is not yet a proposal. **Permission:** \`proposals:create\`.

There is no zod schema. The service cleans the body and **replaces** the commercial fields (this is not a partial document). \`client.name\` is required. At least one line is required, at most 100. Blank line names are kept (they still count). Totals are computed on the server: each line is \`round(qty × rate)\` to paise, GST is \`round(amount × gstPercent / 100)\` per line when \`withGst\` is not false.

\`date\` must be \`YYYY-MM-DD\` or it becomes today (UTC). \`createdByName\` is the signed-in user.

This does not create a proposal. Converting is: create a quick design, PUT its quote, then \`POST /api/estimates/{id}/converted\`.

${globalLimit}`,
      {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['client', 'lines'],
                properties: {
                  client: estimateClient,
                  date: { type: 'string', example: '2026-11-23' },
                  withGst: { type: 'boolean', description: 'Omitted or anything other than false means GST is added.' },
                  lines: { type: 'array', minItems: 1, maxItems: 100, items: estimateLine },
                  notes: { type: 'string', maxLength: 1000 },
                },
              },
              example: {
                client: { clientId: '665f1c2a3b4d5e6f7a8b9c01', name: 'Sharma', phone: '9876543210', email: '', address: '12 MG Road, Pune' },
                date: '2026-11-23',
                withGst: true,
                lines: [{ kind: 'product', refId: '665f1c2a3b4d5e6f7a8b9c11', name: 'Adani 540 W', detail: 'Mono PERC', hsn: '85414011', unit: 'Nos', qty: 10, rate: 12500, gstPercent: 12 }],
                notes: 'Valid for 7 days',
              },
            },
          },
        },
        responses: {
          201: json('The saved estimate, with server totals.', estimateDoc),
          400: err('Name or lines missing, or more than 100 lines.', { error: 'Client name is required' }),
          ...std,
        },
      },
    ),
  },

  '/api/estimates/{id}': {
    get: route(
      'estimateGet',
      'Estimates',
      'Get an estimate',
      `**Permission:** \`proposals:view\`. Returns the estimate including \`lines\`. \`design\` is the id, not a populated object.

404 \`Estimate not found\`. A non-hex id is the same 404.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: json('The estimate.', estimateDoc),
          404: err('Unknown id.', { error: 'Estimate not found' }),
          ...std,
        },
      },
    ),
    put: route(
      'estimateUpdate',
      'Estimates',
      'Replace an estimate',
      `**Permission:** \`proposals:update\`.

Not a partial update. The same cleaner as create runs on the whole body. You must send \`client.name\` and at least one line every time. Omitted \`lines\` becomes an empty list and 400 \`Add at least one item\`. Omitted \`withGst\` becomes true. Omitted \`notes\` becomes "". \`createdByName\` and \`design\` are left as they were.

${globalLimit}`,
      {
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['client', 'lines'],
                properties: {
                  client: estimateClient,
                  date: { type: 'string' },
                  withGst: { type: 'boolean' },
                  lines: { type: 'array', minItems: 1, maxItems: 100, items: estimateLine },
                  notes: { type: 'string', maxLength: 1000 },
                },
              },
            },
          },
        },
        responses: {
          200: json('The estimate after the replacement.', estimateDoc),
          400: err('Name or lines missing.', { error: 'Add at least one item' }),
          404: err('Unknown id.', { error: 'Estimate not found' }),
          ...std,
        },
      },
    ),
    delete: route(
      'estimateDelete',
      'Estimates',
      'Delete an estimate',
      `**Permission:** \`proposals:delete\`. Does not delete a proposal that was created from it.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: ok,
          404: err('Unknown id.', { error: 'Estimate not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/estimates/{id}/converted': {
    post: route(
      'estimateMarkConverted',
      'Estimates',
      'Note the proposal made from this estimate',
      `**Who:** the convert-to-proposal flow, after \`POST /api/designs\` and the PUT that writes \`data.quote\`. **Permission:** \`proposals:create\`.

Body \`{ design }\` is the new proposal’s id. The estimate stores that id. It does not copy lines; the page already did that.

404 \`Proposal not found\` when \`design\` is missing or not a proposal of this branch. 404 \`Estimate not found\` when the estimate id is wrong.

${globalLimit}`,
      {
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['design'], properties: { design: oid } },
              example: { design: '665f1c2a3b4d5e6f7a8b9c0d' },
            },
          },
        },
        responses: {
          200: json('The estimate, with `design` set.', estimateDoc),
          404: err('Estimate or proposal is unknown.', { error: 'Proposal not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/catalog': {
    get: route(
      'catalogGet',
      'Catalog',
      'Designer catalog',
      `**Who:** the designer and the catalog page. **Read permission:** \`proposals:view\` **or** \`inventory:view\`. Mount allows anyone with any Proposals or Inventory permission, then this check.

Read-only. One object: company \`currency\`, \`tariff\`, \`otherCostPerKw\`, active panels, active poles, parent categories, and material categories that have products. Inactive products are excluded. Panel rows without watts, length, and width are excluded, so a half-imported panel does not appear until those are filled.

\`price\` / \`pricePerFt\` is this branch’s retail price for the batch that would be sold next. Another branch of the same company can see different prices. Stock is this branch’s stock.

Packages are **not** included. Call \`GET /api/packages\`.

Response header \`Cache-Control: no-store\`.

${globalLimit}`,
      {
        responses: {
          200: json('The aggregated catalog.', designerCatalog),
          ...std,
        },
      },
    ),
  },

  '/api/categories': {
    get: route(
      'categoryList',
      'Categories',
      'List categories',
      `**Who:** the designer (to group products) and the catalog admin. ${areaGate}

**Mount:** any Proposals or Inventory permission. **Route:** \`proposals:view\` or \`inventory:view\`.

Array in the company’s \`position\` order. Each row includes \`products\` (a count). Shared across branches of the organization.

${globalLimit}`,
      {
        responses: {
          200: json('Categories.', { type: 'array', items: categoryDoc }),
          ...std,
        },
      },
    ),
    post: route(
      'categoryCreate',
      'Categories',
      'Create a category',
      `**Who:** a catalog editor. ${catalogWrite} **This verb:** \`inventory:create\`.

You cannot create \`type: "panels"\` or \`"poles"\`. Those categories are seeded. 400 \`Solar panel and pole categories are set up for you; add products under those categories\`.

At most 80 categories. 400 \`You can have up to 80 categories\`. Duplicate name (case-insensitive): 409 \`You already have a category with that name\`.

\`parent\`: a parent-category id, \`""\`, or \`null\` for none. Unknown parent: 404 \`Parent category not found\`.

\`attributes\`: at most 40. See the attribute object. A non-array is 400 \`Invalid attributes\`.

Returns the category plus \`products: 0\`. Status 201.

${globalLimit}`,
      {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', maxLength: 60 },
                  description: { type: 'string', maxLength: 300 },
                  type: { type: 'string', enum: ['general', 'panels', 'poles'], description: 'Omit for `general`. `panels` and `poles` are rejected.' },
                  attributes: { type: 'array', maxItems: 40, items: attributeDef },
                  parent: { nullable: true, description: 'Parent category id, empty string, or null.', oneOf: [oid, { type: 'string', enum: [''] }, { type: 'null' }] },
                },
              },
              example: {
                name: 'Inverters',
                description: 'On-grid and hybrid inverters',
                type: 'general',
                parent: null,
                attributes: [{ label: 'Capacity (kW)', dataType: 'number', isRequired: false }],
              },
            },
          },
        },
        responses: {
          201: json('The category, with a product count of 0.', categoryDoc),
          400: validation,
          404: err('Parent id is unknown.', { error: 'Parent category not found' }),
          409: err('Duplicate name.', { error: 'You already have a category with that name' }),
          ...std,
        },
      },
    ),
  },

  '/api/categories/reorder': {
    post: route(
      'categoryReorder',
      'Categories',
      'Reorder categories',
      `**Permission:** \`inventory:update\` and catalog editor. Body \`{ ids }\` is the full list in the new order. Empty or missing: 400 \`Nothing to reorder\`. Returns the category list (same shape as GET).

${globalLimit}`,
      {
        requestBody: reorderBody,
        responses: {
          200: json('Categories in the new order.', { type: 'array', items: categoryDoc }),
          400: err('No ids.', { error: 'Nothing to reorder' }),
          404: err('An id is not 24 hex.', { error: 'Category not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/categories/{id}': {
    get: route(
      'categoryGet',
      'Categories',
      'Get a category',
      `**Read:** \`proposals:view\` or \`inventory:view\`, after the Proposals-or-Inventory mount.

Same object as one row of \`GET /api/categories\`: the category plus \`products\` (a count, not the product list). An id that is not 24 hex, or a category in another company, is 404 \`Category not found\`.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: json('The category and its product count.', categoryDoc),
          404: err('Unknown category.', { error: 'Category not found' }),
          ...std,
        },
      },
    ),
    put: route(
      'categoryUpdate',
      'Categories',
      'Update a category',
      `**Permission:** \`inventory:update\` and catalog editor.

Partial. Send only the keys that change. \`name\` and \`description\` are copied when present. \`type\`, when present, must be \`general\`, \`panels\`, or \`poles\`.

You cannot change the type of an existing panel or pole category: 400 \`Solar panel and pole categories are required for the designer and can’t change type\`. You also cannot change a general category **into** panels or poles: 400 \`Solar panel and pole categories are set up for you; add products under those categories\`.

Changing \`type\` among values the rules allow updates every product in the category to that type. Panel fields that are then missing keep the product out of the designer until someone edits it.

\`attributes\`, when sent, replaces the definition list. Existing product values for removed keys are kept on the products.

Duplicate name: 409. Returns the category plus the product count (not wrapped).

${globalLimit}`,
      {
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', maxLength: 60 },
                  description: { type: 'string', maxLength: 300 },
                  type: { type: 'string', enum: ['general', 'panels', 'poles'] },
                  attributes: { type: 'array', maxItems: 40, items: attributeDef },
                  parent: { nullable: true, oneOf: [oid, { type: 'string', enum: [''] }, { type: 'null' }] },
                },
              },
            },
          },
        },
        responses: {
          200: json('The category and its product count.', categoryDoc),
          400: validation,
          404: err('Category or parent is unknown.', { error: 'Category not found' }),
          409: conflict,
          ...std,
        },
      },
    ),
    delete: route(
      'categoryDelete',
      'Categories',
      'Delete a category',
      `**Permission:** \`inventory:delete\` and catalog editor.

Panel and pole categories cannot be deleted: 400 \`Solar panel and pole categories are required for the designer and can’t be deleted\`.

Deletes the category and its products, and their PDFs, and pulls the category off suppliers. If any product has a stock batch: 409 \`Products in this category have stock received. Move them to another category first\`.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: ok,
          400: err('Designer category.', { error: 'Solar panel and pole categories are required for the designer and can’t be deleted' }),
          404: err('Unknown id.', { error: 'Category not found' }),
          409: err('Products have stock.', { error: 'Products in this category have stock received. Move them to another category first' }),
          ...std,
        },
      },
    ),
  },

  '/api/categories/{id}/icon': {
    post: route(
      'categoryUploadIcon',
      'Categories',
      'Upload a category icon',
      `**Permission:** \`inventory:update\` and catalog editor.

Multipart field \`file\`. PNG, JPG, or WebP, at most **50 KB**. ${uploadRate} Declared type must be an image; bytes are checked again. Wrong type: 400 \`Upload a PNG, JPG or WebP image\` or \`That file is not a valid PNG, JPG or WebP image\`.

Replaces the previous icon file. Returns the category with its product count. \`icon\` is \`/uploads/...\`.

${globalLimit}`,
      {
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary', description: 'PNG, JPG, or WebP. Max 50 KB. Field name `file`.' } },
              },
            },
          },
        },
        responses: {
          200: json('The category, including the new icon URL and the product count.', categoryDoc),
          400: err('No file, wrong type, or too big.', { error: 'Choose an image to upload' }),
          404: err('Unknown category.', { error: 'Category not found' }),
          ...std,
        },
      },
    ),
    delete: route(
      'categoryDeleteIcon',
      'Categories',
      'Remove a category icon',
      `**Permission:** \`inventory:update\` and catalog editor. Sets \`icon\` to "" and deletes the file. Returns the category with its product count.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: json('The category with an empty icon.', categoryDoc),
          404: err('Unknown category.', { error: 'Category not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/parent-categories': {
    get: route(
      'parentCategoryList',
      'Categories',
      'List parent categories',
      `**Who:** the catalog admin grouping categories. ${areaGate}

**Mount:** Inventory area only. A user who only has Proposals permissions cannot call this path, even though the handler would also accept \`proposals:view\`. **Route:** \`proposals:view\` or \`inventory:view\` (after the inventory mount has already passed).

Array in \`position\` order. Each row has \`categories\` (a count). At most 20 exist. There is no GET-by-id.

${globalLimit}`,
      {
        responses: {
          200: json('Parent categories.', { type: 'array', items: parentDoc }),
          ...std,
        },
      },
    ),
    post: route(
      'parentCategoryCreate',
      'Categories',
      'Create a parent category',
      `**Permission:** \`inventory:create\` and catalog editor. Mount: Inventory area.

\`name\` required, max 60. \`description\` optional, max 300. At most 20: 400 \`You can have up to 20 parent categories\`. Duplicate name: 409 \`You already have a parent category with that name\`.

Returns the row with \`categories: 0\`. Status 201.

${globalLimit}`,
      {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', maxLength: 60 },
                  description: { type: 'string', maxLength: 300 },
                },
              },
              example: { name: 'Electricals', description: 'Inverters, cabling, protection and storage.' },
            },
          },
        },
        responses: {
          201: json('The parent category.', parentDoc),
          400: validation,
          409: err('Duplicate name.', { error: 'You already have a parent category with that name' }),
          ...std,
        },
      },
    ),
  },

  '/api/parent-categories/reorder': {
    post: route(
      'parentCategoryReorder',
      'Categories',
      'Reorder parent categories',
      `**Permission:** \`inventory:update\` and catalog editor. Same body as category reorder. Returns the parent-category list.

${globalLimit}`,
      {
        requestBody: reorderBody,
        responses: {
          200: json('Parent categories in the new order.', { type: 'array', items: parentDoc }),
          400: err('No ids.', { error: 'Nothing to reorder' }),
          404: err('An id is not 24 hex.', { error: 'Parent category not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/parent-categories/{id}': {
    put: route(
      'parentCategoryUpdate',
      'Categories',
      'Update a parent category',
      `**Permission:** \`inventory:update\` and catalog editor.

Partial: \`name\` and \`description\` only. A sent name that trims to empty is 400 \`Parent category name is required\`. Duplicate name: 409.

There is no GET by id. Use the list.

${globalLimit}`,
      {
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', maxLength: 60 },
                  description: { type: 'string', maxLength: 300 },
                },
              },
            },
          },
        },
        responses: {
          200: json('The parent category. `categories` count is not added on update (the mongoose document is returned).', parentDoc),
          400: validation,
          404: err('Unknown id.', { error: 'Parent category not found' }),
          409: conflict,
          ...std,
        },
      },
    ),
    delete: route(
      'parentCategoryDelete',
      'Categories',
      'Delete a parent category',
      `**Permission:** \`inventory:delete\` and catalog editor.

Categories under it stay, with \`parent\` cleared. Their products stay.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: ok,
          404: err('Unknown id.', { error: 'Parent category not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/products': {
    get: route(
      'productList',
      'Products',
      'List products',
      `**Who:** the designer, invoices, installations, and the catalog page. ${areaGate}

**Mount:** any Proposals, Inventory, Finances, or Installations permission. **Route:** \`proposals:view\`, \`inventory:view\`, \`finances:view\`, or \`tasks:view\`.

Array sorted by name. Inactive products are hidden unless \`includeInactive\` is \`true\` or \`"true"\`. \`category\` filters to one category (404 \`Category not found\` when the id is not 24 hex).

Each product includes \`stock\`, \`price\`, \`lowStock\`, and \`hasBatches\` for **this branch**. \`category\` is an id, not an object.

${globalLimit}`,
      {
        parameters: [
          { name: 'category', in: 'query', schema: oid },
          { name: 'includeInactive', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Pass `true` to include inactive products. Anything else hides them.' },
        ],
        responses: {
          200: json('Products.', { type: 'array', items: productDoc }),
          404: err('`category` is not a valid id.', { error: 'Category not found' }),
          ...std,
        },
      },
    ),
    post: route(
      'productCreate',
      'Products',
      'Create a product',
      `**Permission:** \`inventory:create\` and catalog editor.

\`category\` is required and must be one of yours. The product’s \`type\` becomes the category’s type. Do not send \`type\`, \`stock\`, or prices.

Panel categories require \`watts\` (1–2000), \`length\` and \`width\` (0.2–5 metres). Pole categories default \`shape\` to \`square\`. \`unit\` must be in the company unit list.

While you are creating, the product is new, so the “must be inactive to edit” rule does not apply. It is active unless you send \`isActive: false\`.

Returns the product with stock fields. \`category\` is an id. Status 201.

${globalLimit}`,
      {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { ...productBody, required: ['category'] },
              examples: {
                panel: {
                  summary: 'Panel',
                  value: { category: '665f1c2a3b4d5e6f7a8b9c21', name: 'Adani 540 W', brand: 'Adani', model: 'AS-540', watts: 540, length: 2.278, width: 1.134, unit: 'Panel', gstPercent: 12, warrantyYears: 25, isSerialized: true },
                },
                general: {
                  summary: 'Inverter or other catalog item',
                  value: { category: '665f1c2a3b4d5e6f7a8b9c22', name: 'Growatt 5 kW', brand: 'Growatt', model: 'MIN 5000TL-X', unit: 'Piece', gstPercent: 18, attributes: { capacityKw: '5.0' } },
                },
              },
            },
          },
        },
        responses: {
          201: json('The product, with stock fields (all zero until a batch is received).', productDoc),
          400: validation,
          404: err('Category id is unknown or not 24 hex.', { error: 'Category not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/products/import': {
    post: route(
      'productImport',
      'Products',
      'Import panel rows',
      `**Who:** catalog admin pasting rows the browser already parsed from Excel or CSV. **Permission:** \`inventory:create\` and catalog editor.

**This is JSON, not multipart.** The spreadsheet never hits the server. Body is \`{ category, items }\`.

**Rate limit:** 10 requests per user per 10 minutes (\`import\`), on top of the global IP limit. 429 \`Too many requests. Try again in <n> seconds.\` with \`code: "RATE_LIMITED"\`.

\`company.features.excelImport\` must be true. Otherwise 403 \`Excel import is not enabled for your company\`.

\`category\` must be a solar-panel category. Otherwise 400 \`Panels can only be imported into a solar panel category\`. Empty \`items\`: 400 \`Nothing to import\`. At most 1000 rows are processed; the rest are ignored.

Each item may include the panel fields except \`name\` (name is rebuilt from brand and model): \`brand\`, \`model\`, \`sku\`, \`hsnCode\`, \`gstPercent\`, \`warrantyMonths\`, \`reorderLevel\`, \`isActive\`, \`isSerialized\`, \`description\`, \`unit\`, \`watts\`, \`length\`, \`width\`, \`warrantyYears\`, \`attributes\`. Prices and quantities in the sheet are ignored. Null and "" values are dropped before save. A new row without length/width uses length 1.9 and width 1.05.

A row matches an existing panel in that category when \`brand|model|watts\` is the same, case-insensitive. A match updates that product, which must be inactive: 409 \`Mark “<name>” inactive before you update it from Excel\`. No match creates a product.

Returns \`{ added, updated }\`.

${globalLimit}`,
      {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['category', 'items'],
                properties: {
                  category: oid,
                  items: { type: 'array', maxItems: 1000, items: productBody },
                },
              },
              example: {
                category: '665f1c2a3b4d5e6f7a8b9c21',
                items: [{ brand: 'Waaree', model: 'WS-540', watts: 540, length: 2.278, width: 1.134, warrantyYears: 25 }],
              },
            },
          },
        },
        responses: {
          200: json('How many rows were added or updated.', {
            type: 'object',
            properties: { added: { type: 'integer' }, updated: { type: 'integer' } },
          }, { added: 3, updated: 1 }),
          400: err('Wrong category or empty list.', { error: 'Nothing to import' }),
          403: err('Excel import is off for this company, or the user cannot edit the catalog.', { error: 'Excel import is not enabled for your company' }),
          404: err('Category id is unknown.', { error: 'Category not found' }),
          409: err('An existing match is still active.', { error: 'Mark “Waaree WS-540” inactive before you update it from Excel' }),
          ...std,
        },
      },
    ),
  },

  '/api/products/{id}': {
    get: route(
      'productGet',
      'Products',
      'Get a product',
      `**Read:** \`proposals:view\`, \`inventory:view\`, \`finances:view\`, or \`tasks:view\`, after the four-area mount.

\`category\` is populated (the category object, not an id). Stock fields are for this branch. Inactive products are returned; the list is what hides them.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: json('The product.', productDoc),
          404: err('Unknown id.', { error: 'Product not found' }),
          ...std,
        },
      },
    ),
    put: route(
      'productUpdate',
      'Products',
      'Update a product',
      `**Permission:** \`inventory:update\` and catalog editor.

Partial: every product field is optional. Omitted fields stay, except the service still re-checks panel watts/length/width and the category’s required attributes against the stored values.

**Active products** can only be changed by a body whose single key is \`isActive\` (so you can turn them off). Any other key while \`isActive\` is not false: 409 \`Mark “<name>” inactive before you edit its catalog details\`. Deactivate, edit, then set \`isActive: true\` again.

\`isSerialized\` cannot change after a batch exists (409). \`category\` moves the product and changes its type; typed fields that do not belong to the new type are cleared.

Returns the product with \`category\` populated and stock fields.

${globalLimit}`,
      {
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: productBody, example: { isActive: false } } },
        },
        responses: {
          200: json('The product.', productDoc),
          400: validation,
          404: err('Product or category is unknown.', { error: 'Product not found' }),
          409: err('Still active, or serial tracking is locked.', { error: 'Mark “Adani 540 W” inactive before you edit its catalog details' }),
          ...std,
        },
      },
    ),
    delete: route(
      'productDelete',
      'Products',
      'Delete a product',
      `**Permission:** \`inventory:delete\` and catalog editor.

409 \`This product has stock received, so it can’t be deleted\` when any batch exists. Otherwise deletes the product and its PDFs.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: ok,
          404: err('Unknown id.', { error: 'Product not found' }),
          409: err('Stock exists.', { error: 'This product has stock received, so it can’t be deleted' }),
          ...std,
        },
      },
    ),
  },

  '/api/products/{id}/documents': {
    post: route(
      'productUploadDocument',
      'Products',
      'Attach a product PDF',
      `**Permission:** \`inventory:update\` and catalog editor.

Multipart field \`file\`. One PDF, at most 20 MB. ${uploadRate} The product must be inactive: 409 \`Mark “<name>” inactive before you attach documents\`. At most 10 PDFs: 400 \`A product can keep up to 10 PDFs. Remove one first\`. No file: 400 \`Choose a PDF to upload\`.

The stored name is the original file name without \`.pdf\`, max 200 characters, or \`Document\`. Returns the product (category populated, stock fields). Status 201. If saving fails, the uploaded file is deleted.

${globalLimit}`,
      {
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary', description: 'PDF. Field name `file`. Max 20 MB.' } },
              },
            },
          },
        },
        responses: {
          201: json('The product, including the new document.', productDoc),
          400: err('Missing file, not a PDF, too many PDFs, or too large.', { error: 'Choose a PDF to upload' }),
          404: err('Unknown product.', { error: 'Product not found' }),
          409: err('Product is still active.', { error: 'Mark “Adani 540 W” inactive before you attach documents' }),
          ...std,
        },
      },
    ),
  },

  '/api/products/{id}/documents/{docId}': {
    delete: route(
      'productDeleteDocument',
      'Products',
      'Remove a product PDF',
      `**Permission:** \`inventory:update\` and catalog editor.

\`docId\` is the subdocument id on \`documents\`. The product must be inactive: 409 \`Mark “<name>” inactive before you remove documents\`. Unknown document: 404 \`Document not found\`.

Returns the product.

${globalLimit}`,
      {
        parameters: [
          idParam,
          { name: 'docId', in: 'path', required: true, schema: oid, description: 'Id of one entry in `documents`.' },
        ],
        responses: {
          200: json('The product without that PDF.', productDoc),
          404: err('Product or document is unknown.', { error: 'Document not found' }),
          409: err('Product is still active.', { error: 'Mark “Adani 540 W” inactive before you remove documents' }),
          ...std,
        },
      },
    ),
  },

  '/api/packages': {
    get: route(
      'packageList',
      'Packages',
      'List packages',
      `**Who:** the designer (package picker) and the catalog page. **Mount:** any Proposals or Inventory permission. **Route:** \`proposals:view\` or \`inventory:view\`.

Array, newest first. Each package’s items are filled in with the current product (name, brand, watts, price, spec, itemType, parent group). Packages belong to this branch, not the shared organization catalog. ${branchWrite} applies to writes only.

${globalLimit}`,
      {
        responses: {
          200: json('Packages.', { type: 'array', items: packageDoc }),
          ...std,
        },
      },
    ),
    post: route(
      'packageCreate',
      'Packages',
      'Create a package',
      `**Permission:** \`inventory:create\`. Not restricted to the company admin when the org has branches.

\`name\` required, max 120 (zod) / 140 (column). \`price\` required, 0 to 1e10. \`kw\` optional, 0 to 100000. \`description\` optional; zod allows 1000 but the column is 500. \`items\` optional, at most 100. Lines without \`productId\` are dropped. Each product must be an **active** product in the shared catalog: 400 \`Each package line must use an active product from your company catalog\`.

Returns the enriched package. Status 201.

${globalLimit}`,
      {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'price'],
                properties: {
                  name: { type: 'string', maxLength: 120 },
                  kw: { type: 'number', minimum: 0, maximum: 100000 },
                  price: { type: 'number', minimum: 0, maximum: 1e10 },
                  description: { type: 'string', maxLength: 1000 },
                  items: { type: 'array', maxItems: 100, items: packageItemWrite },
                },
              },
              example: {
                name: '5 kW on-grid',
                kw: 5,
                price: 285000,
                description: 'Panels, inverter, structure',
                items: [{ productId: '665f1c2a3b4d5e6f7a8b9c11', qty: 10, unit: 'Panel' }],
              },
            },
          },
        },
        responses: {
          201: json('The package with product details on each line.', packageDoc),
          400: validation,
          ...std,
        },
      },
    ),
  },

  '/api/packages/{id}': {
    get: route(
      'packageGet',
      'Packages',
      'Get a package',
      `**Read:** \`proposals:view\` or \`inventory:view\`. Same enriched item shape as the list.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: json('The package.', packageDoc),
          404: err('Unknown id.', { error: 'Package not found' }),
          ...std,
        },
      },
    ),
    put: route(
      'packageUpdate',
      'Packages',
      'Update a package',
      `**Permission:** \`inventory:update\`.

The zod schema is **not** partial: \`name\` and \`price\` are required on every PUT. \`kw\`, \`description\`, and \`items\` are optional. Omit \`items\` to leave the lines. Send \`items\` (even \`[]\`) to replace them. Same active-product check as create.

${globalLimit}`,
      {
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'price'],
                properties: {
                  name: { type: 'string', maxLength: 120 },
                  kw: { type: 'number', minimum: 0, maximum: 100000 },
                  price: { type: 'number', minimum: 0, maximum: 1e10 },
                  description: { type: 'string', maxLength: 1000 },
                  items: { type: 'array', maxItems: 100, items: packageItemWrite },
                },
              },
            },
          },
        },
        responses: {
          200: json('The package.', packageDoc),
          400: validation,
          404: err('Unknown id.', { error: 'Package not found' }),
          ...std,
        },
      },
    ),
    delete: route(
      'packageDelete',
      'Packages',
      'Delete a package',
      `**Permission:** \`inventory:delete\`. Proposals that copied the package keep their own snapshot.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: ok,
          404: err('Unknown id.', { error: 'Package not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/installation-charges': {
    get: route(
      'installChargeList',
      'Installation charges',
      'List installation charges',
      `**Who:** the designer’s charge picker, and the catalog page. **Mount:** any Proposals or Inventory permission. **Route:** \`proposals:view\` or \`inventory:view\`.

Array, sorted by name (case-insensitive). There is no GET by id. These rows belong to the branch. ${branchWrite} applies to writes. At most 100.

${globalLimit}`,
      {
        responses: {
          200: json('Charges.', { type: 'array', items: chargeDoc }),
          ...std,
        },
      },
    ),
    post: route(
      'installChargeCreate',
      'Installation charges',
      'Create an installation charge',
      `**Permission:** \`inventory:create\`.

\`name\` required, max 80. \`description\` optional, max 300. \`defaultPrice\` optional, ≥ 0, default 0. \`gstPercent\` optional, 0–100; omitted uses the schema default 18. A blank that zod turns into null is stored as 18. \`sac\` optional, max 8; non-digits are removed.

Duplicate name (case-insensitive): 400 \`You already have an installation charge with this name\` (not 409). At the cap: 400 \`You can add up to 100 installation charges\`.

Status 201.

${globalLimit}`,
      {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', maxLength: 80 },
                  description: { type: 'string', maxLength: 300 },
                  defaultPrice: { type: 'number', minimum: 0, maximum: 1e9 },
                  gstPercent: { type: 'number', minimum: 0, maximum: 100 },
                  sac: { type: 'string', maxLength: 8, description: 'Digits are kept. Other characters are stripped.' },
                },
              },
              example: { name: 'Inverter installation', description: 'Mounting and commissioning', defaultPrice: 8000, gstPercent: 18, sac: '9954' },
            },
          },
        },
        responses: {
          201: json('The charge.', chargeDoc),
          400: validation,
          ...std,
        },
      },
    ),
  },

  '/api/installation-charges/{id}': {
    put: route(
      'installChargeUpdate',
      'Installation charges',
      'Update an installation charge',
      `**Permission:** \`inventory:update\`.

Zod requires \`name\` on every PUT. \`description\`, \`defaultPrice\`, \`gstPercent\`, and \`sac\` are optional: omit one to leave it. The service still requires a non-blank name: 400 \`Charge name is required\`. Duplicate name: 400 \`You already have an installation charge with this name\`.

${globalLimit}`,
      {
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', maxLength: 80 },
                  description: { type: 'string', maxLength: 300 },
                  defaultPrice: { type: 'number', minimum: 0, maximum: 1e9 },
                  gstPercent: { type: 'number', minimum: 0, maximum: 100 },
                  sac: { type: 'string', maxLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          200: json('The charge.', chargeDoc),
          400: validation,
          404: err('Unknown id.', { error: 'Installation charge not found' }),
          ...std,
        },
      },
    ),
    delete: route(
      'installChargeDelete',
      'Installation charges',
      'Delete an installation charge',
      `**Permission:** \`inventory:delete\`. Proposals that already copied the name and price are unchanged.

${globalLimit}`,
      {
        parameters: [idParam],
        responses: {
          200: ok,
          404: err('Unknown id.', { error: 'Installation charge not found' }),
          ...std,
        },
      },
    ),
  },

  '/api/solar': {
    get: route(
      'solarBuildingInsights',
      'Solar',
      'Google Solar building insights',
      `**Who:** the designer, after the site pin is confirmed. **Permission:** \`proposals:view\` (this mount checks that permission directly; it is not the Proposals area gate).

**Rate limit:** 40 requests per user per 10 minutes. 429 uses \`code: "RATE_LIMITED"\`.

Query \`lat\` and \`lng\` are required. Latitude −90…90, longitude −180…180. Anything else: 400 \`Valid lat and lng query parameters are required.\`

The server calls Google \`buildingInsights:findClosest\`, trying imagery quality HIGH, then MEDIUM, LOW, then BASE (with the expanded-coverage experiment). The JSON body is Google’s response, passed through. The yield model reads:

- \`solarPotential.roofSegmentStats[].pitchDegrees\`
- \`solarPotential.roofSegmentStats[].azimuthDegrees\`
- \`solarPotential.roofSegmentStats[].stats.sunshineQuantiles\` (median is the middle value)
- \`solarPotential.roofSegmentStats[].stats.areaMeters2\` (segments under 4 m² are ignored)

Other Google fields (\`center\`, \`boundingBox\`, \`imageryQuality\`, \`imageryDate\`, \`solarPotential.solarPanels\`, panel size, and the rest) are included when Google sends them. Do not assume a field Google omitted.

No building: 404 \`Google Solar API has no data for this building yet.\` with \`code: "NOT_FOUND"\`. Google refused the key: 502 \`The satellite data service refused the request. Contact the platform administrator.\` \`code: "UPSTREAM"\`. Network failure: 502 \`Could not reach the Google Solar API.\` \`code: "NETWORK"\`. Google rate limit: 429. No server key: 500 \`The server has no Google API key configured (GOOGLE_MAPS_API_KEY).\` \`code: "NO_KEY"\`.

Response header \`Cache-Control: private, max-age=3600\`.

${globalLimit}`,
      {
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'number', minimum: -90, maximum: 90 }, example: 18.5204 },
          { name: 'lng', in: 'query', required: true, schema: { type: 'number', minimum: -180, maximum: 180 }, example: 73.8567 },
        ],
        responses: {
          200: json('Google buildingInsights JSON.', { type: 'object', additionalProperties: true }),
          400: err('lat/lng missing or out of range.', { error: 'Valid lat and lng query parameters are required.' }),
          404: err('Google has no building here.', { error: 'Google Solar API has no data for this building yet.', code: 'NOT_FOUND' }),
          502: err('Google or the network failed.', { error: 'The satellite data service is not available right now. Try again in a moment.', code: 'UPSTREAM' }),
          ...std,
        },
      },
    ),
  },

  '/api/solar/model': {
    get: route(
      'solarHouseModel',
      'Solar',
      'Measured roof model',
      `**Who:** a 3D view that wants Google’s roof planes, height grid, and aerial photo. **Permission:** \`proposals:view\`. **Same rate limit as \`GET /api/solar\`:** 40 per user per 10 minutes (the limit is on the \`/api/solar\` mount, so \`/model\` shares it).

Query:

- \`lat\`, \`lng\` — required. Same range check. 400 \`Valid lat and lng are required.\`
- \`outline\` — optional. One or more roof rings the user marked.
  - One ring: \`lat,lng;lat,lng;lat,lng\` (3 to 60 points).
  - Several buildings: rings separated by \`|\`, at most 12 rings.
  - A point must be finite and inside the lat/lng range. Otherwise 400 \`The marked roof area is not valid.\`

Without \`outline\`, the building under the pin is used. With an outline, Google is queried at the middle of the first ring and only faces inside the marks are kept.

The response is **not** the raw Google payload. It is cached for 30 days. Header \`Cache-Control: private, no-cache\` (the browser still revalidates; the server may return the cached model).

\`center\` is in local metres around the requested lat/lng, not a lat/lng. \`planes[].points\` are local metres. \`house\` / \`houses\` may be null or empty when the height map is unavailable; \`planes\` can still be present.

No roof inside the mark: 404 \`Google has no roof data inside the area you marked. Check the box covers your roof and try again.\` \`code: "NO_LAYOUT"\`. No panels: 404 with \`code: "NO_LAYOUT"\` and a message that asks you to cover the roof or move the pin onto the middle. Upstream errors from building insights use the same 404/502 messages as \`GET /api/solar\`.

The photo and height grid are large (the photo is raw RGB, base64, up to 640 px a side).

${globalLimit}`,
      {
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'number' }, example: 18.5204 },
          { name: 'lng', in: 'query', required: true, schema: { type: 'number' }, example: 73.8567 },
          { name: 'outline', in: 'query', required: false, schema: { type: 'string' }, description: '`lat,lng;lat,lng;…` or several rings joined by `|`.', example: '18.52043,73.85665;18.52043,73.85680;18.52050,73.85680' },
        ],
        responses: {
          200: json('Roof planes and optional height mesh.', {
            type: 'object',
            properties: {
              version: { type: 'integer', description: 'Model shape version. Currently 7.' },
              center: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, description: 'Google’s building centre in local metres.' },
              quality: { type: 'string', description: 'Google imagery quality, such as HIGH, MEDIUM, LOW, BASE.' },
              imageryDate: { type: 'object', additionalProperties: true, description: 'Google imagery date object when present.' },
              panel: {
                type: 'object',
                properties: {
                  widthM: { type: 'number' },
                  heightM: { type: 'number' },
                  watts: { type: 'number' },
                },
              },
              maxPanels: { type: 'integer' },
              planes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: '`g0`, `g1`, …' },
                    points: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } } },
                    pitch: { type: 'number' },
                    azimuth: { type: 'number' },
                    height: { type: 'number', description: 'Metres above ground.' },
                    centre: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
                    googlePanels: { type: 'integer' },
                    yearlyEnergyDcKwh: { type: 'number' },
                    sunshineHours: { type: 'number', nullable: true },
                  },
                },
              },
              house: { nullable: true, description: 'First building mesh, or null.' },
              houses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    origin: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
                    ux: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, description: 'Vector across the whole grid.' },
                    uy: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
                    cols: { type: 'integer' },
                    rows: { type: 'integer' },
                    heightsCm: { type: 'array', items: { type: 'integer' }, description: 'Row-major. −1 is not this building. Otherwise centimetres.' },
                    photoSpan: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
                    photo: {
                      type: 'object',
                      properties: {
                        width: { type: 'integer' },
                        height: { type: 'integer' },
                        rgb: { type: 'string', description: 'Base64 of raw RGB bytes (3 bytes per pixel), not a PNG and not a data URL.' },
                      },
                    },
                    footprint: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } }, description: 'Roof outline in local metres.' },
                  },
                },
              },
            },
          }),
          400: err('Bad coordinates or outline.', { error: 'Valid lat and lng are required.' }),
          404: err('No usable roof.', { error: 'Google has no roof layout for this building. Move the pin onto the middle of the roof and try again.', code: 'NO_LAYOUT' }),
          502: err('Google failed.', { error: 'Could not reach the Google Solar API.', code: 'NETWORK' }),
          ...std,
        },
      },
    ),
  },

  '/api/roof-detect': {
    post: route(
      'roofDetect',
      'Solar',
      'Detect a roof outline',
      `**Who:** the designer, when the user asks to trace the roof. **Permission:** \`proposals:update\`.

**Rate limit:** 15 requests per user per 10 minutes. Each call can read a satellite image with Claude.

Send **one** of:

- \`{ lat, lng }\` — find the building under the pin (Google roof mask, else OpenStreetMap, else the model).
- \`{ outline }\` — the user already drew the roof. \`outline\` is 3 to 200 \`{ lat, lng }\` points. The main roof returned is that ring. Only an upper roof inside it may be added. 400 \`The roof outline is not valid.\` or \`The roof outline is too small.\` (area under 4 m²).

If both are sent, \`outline\` wins.

**Response** (header \`Cache-Control: no-store\`):

- \`source\`: \`google\`, \`osm\`, \`ai\`, or \`drawn\`.
- \`ai\`: whether Claude read the picture.
- \`confidence\`: \`low\`, \`medium\`, or \`high\` (whatever the reader returned; the no-AI path uses \`low\` or \`medium\`).
- \`notes\`: a sentence you can show.
- \`storeys\`: 1–5.
- \`parts[]\`: \`role\` is \`main\`, \`upper\`, or \`verandah\` (a drawn outline does not return verandahs). \`points\` are \`{ lat, lng }\`. \`height\` is metres. \`roofType\` is \`flat\`, \`shed\`, \`gable\`, or \`hip\`. Sloped parts add \`pitch\` (degrees). Shed adds \`slopeAz\`. Hip adds \`ends\` (\`hip\`, \`gable\`, or \`kerala\`) and \`overhang\` (metres). Flat adds \`parapetH\` (1, or 0 on a verandah).

No house: 404 \`No house roof was found at this spot. Move the pin onto the house and try again.\` or \`The roof could not be traced. Draw the outline instead.\` \`code: "NO_ROOF"\`. No AI key and no outline: 503 \`Automatic roof detection is not set up yet (the AI key is missing). Draw the roof outline instead.\` \`code: "AI_NOT_CONFIGURED"\`. Bad AI key: 502 \`The AI service key is not valid. Contact the platform administrator.\` \`code: "AI_KEY"\`.

Results are cached, so the same pin or the same drawn ring returns the previous answer.

${globalLimit}`,
      {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  lat: { type: 'number', minimum: -90, maximum: 90 },
                  lng: { type: 'number', minimum: -180, maximum: 180 },
                  outline: { type: 'array', minItems: 3, maxItems: 200, items: latLng },
                },
              },
              examples: {
                pin: { summary: 'Building under a pin', value: { lat: 18.5204, lng: 73.8567 } },
                drawn: {
                  summary: 'User outline',
                  value: { outline: [{ lat: 18.52043, lng: 73.85665 }, { lat: 18.52043, lng: 73.8568 }, { lat: 18.5205, lng: 73.8568 }, { lat: 18.5205, lng: 73.85665 }] },
                },
              },
            },
          },
        },
        responses: {
          200: json('Roof parts.', {
            type: 'object',
            properties: {
              source: { type: 'string', enum: ['google', 'osm', 'ai', 'drawn'] },
              ai: { type: 'boolean' },
              confidence: { type: 'string' },
              notes: { type: 'string' },
              storeys: { type: 'integer', minimum: 1, maximum: 5 },
              parts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    role: { type: 'string', enum: ['main', 'upper', 'verandah'] },
                    points: { type: 'array', items: latLng },
                    height: { type: 'number' },
                    roofType: { type: 'string', enum: ['flat', 'shed', 'gable', 'hip'] },
                    pitch: { type: 'number' },
                    slopeAz: { type: 'number', nullable: true },
                    ends: { type: 'string', enum: ['hip', 'gable', 'kerala'] },
                    overhang: { type: 'number' },
                    parapetH: { type: 'number' },
                  },
                },
              },
            },
          }, {
            source: 'drawn',
            ai: true,
            confidence: 'high',
            notes: '',
            storeys: 1,
            parts: [{
              role: 'main',
              points: [{ lat: 18.52043, lng: 73.85665 }, { lat: 18.52043, lng: 73.8568 }, { lat: 18.5205, lng: 73.8568 }, { lat: 18.5205, lng: 73.85665 }],
              height: 3,
              roofType: 'flat',
              parapetH: 1,
            }],
          }),
          400: err('Bad pin or outline.', { error: 'Valid lat and lng are required.' }),
          404: err('Nothing to trace.', { error: 'No house roof was found at this spot. Move the pin onto the house and try again.', code: 'NO_ROOF' }),
          502: err('AI key rejected.', { error: 'The AI service key is not valid. Contact the platform administrator.', code: 'AI_KEY' }),
          503: err('No AI key and no map outline.', { error: 'Automatic roof detection is not set up yet (the AI key is missing). Draw the roof outline instead.', code: 'AI_NOT_CONFIGURED' }),
          ...std,
        },
      },
    ),
  },

  '/api/staticmap/token': {
    get: route(
      'staticMapToken',
      'Solar',
      'Mint a short-lived map token',
      `**Who:** the signed-in designer (or a client, or a company admin) before an \`<img>\` loads a satellite picture. Images cannot send \`Authorization\`, so the app fetches this token and puts it on the image URL as \`mt\`.

**Auth:** \`Authorization: Bearer\` only. The query token is not accepted on this route.

**Who may call it:** company admin, a client, or anyone with \`proposals:view\` (branch owners pass). Other staff: 403 \`You do not have access to this area\`.

**Rate limit:** the \`/api/staticmap\` mount allows 300 requests **per IP** per 10 minutes. This route shares that bucket with the image route.

Returns \`{ token, expiresInSeconds: 900 }\`. The token lasts 15 minutes, is tied to this user and session, and works only as \`mt\` on \`GET /api/staticmap\`. It is not a login token. Header \`Cache-Control: no-store\`. Renew it before it expires (the app renews every 10 minutes).

${globalLimit}`,
      {
        responses: {
          200: json('Map token.', {
            type: 'object',
            required: ['token', 'expiresInSeconds'],
            properties: {
              token: { type: 'string' },
              expiresInSeconds: { type: 'integer', enum: [900] },
            },
          }, { token: 'eyJ…', expiresInSeconds: 900 }),
          ...std,
        },
      },
    ),
  },

  '/api/staticmap': {
    get: route(
      'staticMapImage',
      'Solar',
      'Satellite image',
      `**Who:** the map, the 3D ground texture, and PDF site images. **Not JSON.** The body is the image bytes. \`Content-Type\` is whatever Google returns, \`image/png\` or \`image/jpeg\`. Header \`Cache-Control: private, max-age=86400\`.

**Auth, either one:**

1. \`Authorization: Bearer <login token>\` — used when the header is present, even if \`mt\` is also set.
2. Query \`mt\` — the token from \`GET /api/staticmap/token\`. Swagger’s Authorize button sends the header; use \`mt\` from an \`<img src>\`. A missing or expired \`mt\`, when there is no Bearer header, is 401 \`This image link has expired. Reload the page.\`

Same viewer rule as the token route. A **client** may only load imagery within about 0.02 degrees (about 2 km) of \`data.origin\` on one of their own proposals that are not drafts. Otherwise 403 \`This location is not part of your proposals\`.

**Rate limit:** 300 per IP per 10 minutes.

**Query**

| Param | Required | Rule |
| --- | --- | --- |
| lat | yes | Centre latitude |
| lng | yes | Centre longitude |
| zoom | no | Default 20. Integer 1–21. |
| w | no | Width in pixels. Default 640. Clamped to 64–640. Google is then asked at scale 2, so the bitmap is twice this. |
| h | no | Height. Same clamp as \`w\`. |
| maptype | no | \`satellite\` (default), \`hybrid\`, or \`roadmap\`. Anything else becomes \`satellite\`. |
| pts | no | Outline \`lat,lng;lat,lng;…\`, at most 80 points. With 3 or more valid points, an amber outline is drawn and the ring is closed. |
| mt | no | Map token. See auth above. |

Bad numbers (non-finite lat/lng, or zoom outside 1–21): 400 \`Invalid parameters.\` Google down or a non-image response: 502 \`The satellite image service is not available right now.\` Google 429 is passed through as 429. No API key: 500 with \`code: "NO_KEY"\`.

${globalLimit}`,
      {
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'lng', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'zoom', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 21, default: 20 } },
          { name: 'w', in: 'query', schema: { type: 'integer', minimum: 64, maximum: 640, default: 640 } },
          { name: 'h', in: 'query', schema: { type: 'integer', minimum: 64, maximum: 640, default: 640 } },
          { name: 'maptype', in: 'query', schema: { type: 'string', enum: ['satellite', 'hybrid', 'roadmap'], default: 'satellite' } },
          { name: 'pts', in: 'query', schema: { type: 'string' }, description: 'Optional outline `lat,lng;lat,lng;…`.' },
          { name: 'mt', in: 'query', schema: { type: 'string' }, description: 'Short-lived map token. Alternative to the Bearer header.' },
        ],
        responses: {
          200: {
            description: 'Image bytes, not JSON. Content-Type is image/png or image/jpeg.',
            content: {
              'image/png': { schema: { type: 'string', format: 'binary' } },
              'image/jpeg': { schema: { type: 'string', format: 'binary' } },
            },
          },
          400: err('lat, lng, or zoom is unusable.', { error: 'Invalid parameters.' }),
          401: { $ref: '#/components/responses/Unauthorized' },
          403: err('Not allowed to view maps, or a client asked for a place that is not near their proposals.', { error: 'This location is not part of your proposals' }),
          429: std[429],
          500: std[500],
          502: err('Google did not return an image.', { error: 'The satellite image service is not available right now.' }),
        },
      },
    ),
  },
};
