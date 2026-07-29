/**
 * The whole Express API, as one Netlify Function.
 *
 * This uses the Lambda-compatible `handler` export rather than the newer default-export
 * signature, because that one hands you a web `Request` and `serverless-http` bridges
 * Lambda events to Node's req/res — which is what Express needs. The netlify.toml
 * redirect sends /api/* here.
 */
import serverless from 'serverless-http';
import { createApp } from '../../server/src/app.js';

const FUNCTION_PREFIX = '/.netlify/functions/api';

// Built once per container, reused across warm invocations.
let cached;
const bridge = () => {
  // The CDN serves the built SPA; this function only answers /api.
  cached ??= serverless(createApp({ serveClient: false }), { binary: false });
  return cached;
};

/**
 * The redirect rewrites `/api/health` to `/.netlify/functions/api/health`, so the path
 * Express sees has to be put back before routing.
 */
function restoreApiPath(event) {
  const raw = event.path ?? '/';
  const withoutPrefix = raw.startsWith(FUNCTION_PREFIX) ? raw.slice(FUNCTION_PREFIX.length) : raw;
  const path = withoutPrefix.startsWith('/api')
    ? withoutPrefix
    : `/api${withoutPrefix === '/' ? '' : withoutPrefix}`;
  return { ...event, path, rawPath: path };
}

export const handler = async (event, context) => bridge()(restoreApiPath(event), context);
