// Assembles the OpenAPI document from backend/src/docs/paths/*.js.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { components, tags } from './components.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'paths');

const PATH_FILES = [
  'auth-public.js',
  'admin-org.js',
  'people.js',
  'design-catalog.js',
  'finance.js',
  'leads.js',
  'projects.js',
];

async function loadPaths() {
  const paths = {};
  const files = PATH_FILES.filter((name) => existsSync(path.join(dir, name)));
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    const extra = mod.default;
    // A path file that is still being written has no export yet. Skip it so the API can boot.
    if (extra == null) continue;
    if (typeof extra !== 'object' || Array.isArray(extra)) throw new Error(`${file} must default-export a paths object`);
    for (const [urlPath, item] of Object.entries(extra)) {
      if (!urlPath.startsWith('/')) throw new Error(`${file}: "${urlPath}" must start with /`);
      if (!item || typeof item !== 'object') throw new Error(`${file}: "${urlPath}" is empty`);
      paths[urlPath] ||= {};
      for (const method of Object.keys(item)) {
        if (paths[urlPath][method]) throw new Error(`Duplicate ${method.toUpperCase()} ${urlPath} (also in ${file})`);
        const op = item[method];
        if (!op.operationId || !op.summary || !op.responses) throw new Error(`${file}: ${method.toUpperCase()} ${urlPath} needs operationId, summary, and responses`);
        paths[urlPath][method] = op;
      }
    }
  }
  return paths;
}

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Innovbit Solar API',
    version: '1.0.0',
    description: `HTTP API for the Innovbit Solar app. Base URL in local development is http://localhost:4000. Interactive docs: http://localhost:4000/api/docs. Raw document: http://localhost:4000/api/openapi.json.

## How every call works

Success responses are the JSON value itself. There is no \`{ data: ... }\` wrapper. Create routes that say 201 return the created record. \`{ ok: true }\` means the action finished and there is nothing else to read.

Errors are always JSON:

\`\`\`json
{ "error": "Message you can show the user", "code": "OPTIONAL", "details": {} }
\`\`\`

| Status | When | What to do |
| --- | --- | --- |
| 400 | Bad JSON, a field failed validation, or a business rule rejected the body | Show \`error\`. If \`code\` is \`VALIDATION\`, \`details.fields\` maps each field path to its message. |
| 401 | No token, expired token, signed out, password changed | Drop the token and open the sign-in screen. |
| 403 | Signed in, but this role or permission cannot do it | Show \`error\`. Do not send the user to sign in. |
| 404 | Id or public token does not exist in this company | Show \`error\`. |
| 409 | Duplicate value, or the record changed under you | Show \`error\` and reload. |
| 413 | Body over 4 MB | The JSON body limit is 4 MB. File routes have their own size limit, named on that route. |
| 429 | Rate limit. \`code\` is \`RATE_LIMITED\` | Wait the number of seconds in \`Retry-After\`. |
| 500 | Unexpected | Show a generic failure. The body is \`{ "error": "Internal server error" }\`. |

A missing route (wrong path) is \`404 { "error": "Not found" }\`.

The whole API allows 1500 requests per IP per 5 minutes. Stricter limits are named on the route.

## Auth

\`POST /api/auth/login\` with \`{ "email", "password" }\` returns a \`token\`. Send it on later calls:

\`Authorization: Bearer <token>\`

Roles inside the token:

- \`superadmin\` — platform console, \`/api/admin/*\` only.
- \`company\` — organization admin, above branches. Calls run against the branch in the token. \`POST /api/auth/branch\` switches it.
- \`branch\` — owner of one branch. Passes every staff permission check. Cannot edit shared masters (catalog, loan/subsidy/installation step templates, branding) when the organization has branches; the company admin does that.
- \`agent\` — staff. Each route names the permission they need, shaped \`area:action\` (for example \`proposals:view\`). A branch owner or company admin skips those checks.
- \`client\` — the customer portal, \`/api/portal/*\` only.

Ids are 24-character hex strings. Timestamps are ISO 8601. Amounts are numbers in the company currency (see the company profile). Phone numbers: an Indian mobile is stored as 10 digits; other countries keep a leading \`+\` and country code. Blank optional strings may be sent as \`""\`.

Zod schemas are loose: extra JSON keys are ignored, not rejected. Send only the fields documented on that route. Partial updates (PATCH/PUT where every field is optional) change only the keys you send; omit a key to leave it as it is. Send \`null\` or \`""\` only where the route says that clears the field.
`,
  },
  servers: [
    { url: '/', description: 'The host you opened these docs on (local default http://localhost:4000)' },
  ],
  tags,
  components,
  security: [{ bearerAuth: [] }],
  paths: await loadPaths(),
};
