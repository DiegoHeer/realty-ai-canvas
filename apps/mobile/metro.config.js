// Metro config for a Bun/Yarn-style monorepo + NativeWind.
// See https://docs.expo.dev/guides/monorepos/ and https://www.nativewind.dev/
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const https = require('https');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// --- Web dev API proxy --------------------------------------------------------
// The Realty Alerts API serves no CORS headers, so the browser blocks direct
// `fetch` from the web bundle. In dev we proxy `/realty-api/*` through the Metro
// dev server (same origin → no CORS) to the real backend. Native talks to the
// API directly and never hits this. Keep PROXY_PREFIX in sync with `API_BASE`
// in packages/data/src/env.ts.
const PROXY_PREFIX = '/realty-api';
const PROXY_TARGET = process.env.EXPO_PUBLIC_API_URL || 'https://api-staging.realty-ai.nl';

function proxyToApi(req, res) {
  const target = new URL(PROXY_TARGET);
  // Forward the browser's headers so authenticated requests keep their
  // `Authorization` / `Content-Type` / `X-Session-Token`, then override the few
  // the upstream edge needs. Strip `accept-encoding` so the upstream replies
  // uncompressed — we only echo `content-type` downstream (not `content-encoding`),
  // so a compressed body would otherwise reach the browser undecodable.
  const headers = {
    ...req.headers,
    accept: 'application/json',
    // The API's edge (Cloudflare) 403s requests without a browser-ish UA.
    'user-agent': 'Mozilla/5.0',
    // Talk to the upstream vhost, not the localhost dev origin (TLS SNI +
    // Cloudflare routing key off Host).
    host: target.hostname,
  };
  delete headers['accept-encoding'];
  const upstream = https.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      method: req.method,
      path: req.url.slice(PROXY_PREFIX.length), // strip prefix, keep path + query
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, {
        'content-type': up.headers['content-type'] || 'application/json',
      });
      up.pipe(res);
    },
  );
  upstream.on('error', (err) => {
    // If the upstream dies mid-stream the headers are already out — writing
    // them again throws ERR_HTTP_HEADERS_SENT and crashes the dev server.
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `Proxy to ${PROXY_TARGET} failed: ${err.message}` }));
  });
  req.pipe(upstream);
}

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    if (req.url && req.url.startsWith(`${PROXY_PREFIX}/`)) {
      return proxyToApi(req, res);
    }
    return middleware(req, res, next);
  },
};

// 1. Watch all files in the monorepo so workspace packages hot-reload.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './src/global.css' });
