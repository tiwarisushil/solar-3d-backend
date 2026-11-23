import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './spec.js';

/** Swagger UI and the raw OpenAPI document. Mounted outside the API's strict CSP so the UI can run. */
export function mountDocs(app) {
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });
  // Load the spec by URL. Inlining it runs through String.replace, and any
  // `$` + backtick in a regex (for example `$``) is treated as a replacement
  // pattern, which cuts swagger-ui-init.js in half.
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(null, {
    customSiteTitle: 'Innovbit Solar API',
    swaggerUrl: '/api/openapi.json',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      defaultModelsExpandDepth: 1,
      displayRequestDuration: true,
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  }));
}
