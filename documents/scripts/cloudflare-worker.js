'use strict';

/**
 * @fileoverview Cloudflare Worker script for proxying GitHub resources.
 *
 * This script is modified from:
 * https://github.com/hunshcn/gh-proxy/blob/master/index.js
 */

/**
 * Base URL for static files such as 404.html, sw.js, and conf.js.
 * @const {string}
 */
const ASSET_URL = 'https://hunshcn.github.io/gh-proxy/';

/**
 * Worker route prefix.
 *
 * For a custom route such as example.com/gh/*, set this to '/gh/'.
 * @const {string}
 */
const PREFIX = '/';

/**
 * Runtime options for the proxy.
 * @const {{jsdelivr: number}}
 */
const Config = {
  /** Whether to redirect branch files to jsDelivr. 0 disables it. */
  jsdelivr: 0,
};

/**
 * Allowlist for proxied URLs.
 *
 * String entries are matched with includes(); RegExp entries are matched with
 * test().
 * @const {!Array<string|RegExp>}
 */
const whiteList = [
  // Allow GitHub URLs for LetsShareAll and Shuery-Shuai repositories.
  /^(?:https?:\/\/)?(?:github\.com|raw\.(?:githubusercontent|github)\.com)\/(?:LetsShareAll|Shuery-Shuai)\//i,
];

/**
 * CORS methods allowed by this worker.
 * @const {string}
 */
const CORS_ALLOW_METHODS = 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS';

/**
 * CORS headers attached to every proxied response.
 * @const {!Object<string, string>}
 */
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': CORS_ALLOW_METHODS,
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*',
  'access-control-max-age': '1728000',
};

/** @const {!RegExp} Matches GitHub release and archive URLs. */
const exp1 =
  /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i;
/** @const {!RegExp} Matches GitHub blob and raw URLs. */
const exp2 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i;
/** @const {!RegExp} Matches GitHub info and git service URLs. */
const exp3 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i;
/** @const {!RegExp} Matches raw.githubusercontent.com-style URLs. */
const exp4 =
  /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+$/i;
/** @const {!RegExp} Matches GitHub gist raw URLs. */
const exp5 =
  /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i;
/** @const {!RegExp} Matches GitHub tag listing URLs. */
const exp6 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*$/i;

/**
 * Creates a response and attaches shared CORS headers.
 *
 * @param {*} body Response body.
 * @param {number=} status HTTP status code.
 * @param {!Object<string, string>=} headers Response headers.
 * @return {!Response} Response with CORS headers.
 */
function makeRes(body, status = 200, headers = {}) {
  return withCors(new Response(body, { status, headers }));
}

/**
 * Creates the response for a CORS preflight request.
 *
 * @param {!Request} req Incoming OPTIONS request.
 * @return {!Response} Empty preflight response.
 */
function makeOptionsRes(req) {
  const headers = new Headers(CORS_HEADERS);
  const requestHeaders = req.headers.get('access-control-request-headers');

  if (requestHeaders) {
    headers.set('access-control-allow-headers', requestHeaders);
  }

  return new Response(null, {
    status: 204,
    headers,
  });
}

/**
 * Adds shared CORS headers to a response while preserving its body and status.
 *
 * @param {!Response} res Response to decorate.
 * @return {!Response} Response with CORS headers.
 */
function withCors(res) {
  const headers = new Headers(res.headers);

  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/**
 * Parses a URL string.
 *
 * @param {string} urlStr URL string to parse.
 * @return {!URL|!Error} Parsed URL, or the parsing error.
 */
function newUrl(urlStr) {
  try {
    return new URL(urlStr);
  } catch (err) {
    return err;
  }
}

/**
 * Handles all fetch events from Cloudflare Workers.
 */
addEventListener('fetch', e => {
  const ret = fetchHandler(e).catch(err =>
    makeRes('cfworker error:\n' + err.stack, 502),
  );
  e.respondWith(ret);
});

/**
 * Checks whether a URL is supported by the proxy rewrite rules.
 *
 * @param {string} u URL to check.
 * @return {boolean} Whether the URL can be proxied or rewritten.
 */
function checkUrl(u) {
  for (let i of [exp1, exp2, exp3, exp4, exp5, exp6]) {
    if (u.search(i) === 0) {
      return true;
    }
  }

  return false;
}

/**
 * Routes an incoming Worker request to a static asset, redirect, or proxy call.
 *
 * @param {!FetchEvent} e Cloudflare fetch event.
 * @return {!Promise<!Response>} Response for the incoming request.
 */
async function fetchHandler(e) {
  const req = e.request;

  if (req.method === 'OPTIONS') {
    return makeOptionsRes(req);
  }

  const urlStr = req.url;
  const urlObj = new URL(urlStr);
  let path = urlObj.searchParams.get('q');

  if (path) {
    return withCors(
      Response.redirect('https://' + urlObj.host + PREFIX + path, 301),
    );
  }

  // Cloudflare Workers collapse '//' in paths, so restore the URL scheme.
  path = urlObj.href
    .slice(urlObj.origin.length + PREFIX.length)
    .replace(/^https?:\/+/, 'https://');

  if (
    path.search(exp1) === 0 ||
    path.search(exp5) === 0 ||
    path.search(exp6) === 0 ||
    path.search(exp3) === 0
  ) {
    return httpHandler(req, path);
  } else if (path.search(exp2) === 0) {
    if (Config.jsdelivr) {
      const newUrl = path
        .replace('/blob/', '@')
        .replace(/^(?:https?:\/\/)?github\.com/, 'https://cdn.jsdelivr.net/gh');
      return withCors(Response.redirect(newUrl, 302));
    } else {
      path = path.replace('/blob/', '/raw/');
      return httpHandler(req, path);
    }
  } else if (path.search(exp4) === 0) {
    if (Config.jsdelivr) {
      const newUrl = path
        .replace(/(?<=com\/.+?\/.+?)\/(.+?\/)/, '@$1')
        .replace(
          /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com/,
          'https://cdn.jsdelivr.net/gh',
        );
      return withCors(Response.redirect(newUrl, 302));
    } else {
      return httpHandler(req, path);
    }
  } else {
    return fetch(ASSET_URL + path).then(withCors);
  }
}

/**
 * Proxies a validated GitHub URL.
 *
 * @param {!Request} req Original incoming request.
 * @param {string} pathname Requested GitHub URL or path.
 * @return {!Promise<!Response>|!Response} Proxied response or an error
 *     response when the allowlist blocks the URL.
 */
function httpHandler(req, pathname) {
  const reqHdrRaw = req.headers;

  const reqHdrNew = new Headers(reqHdrRaw);

  let urlStr = pathname;
  // Allow all URLs when the allowlist is empty.
  let flag = whiteList.length === 0;

  for (const item of whiteList) {
    if (typeof item === 'string' ? urlStr.includes(item) : item.test(urlStr)) {
      flag = true;
      break;
    }
  }

  if (!flag) {
    return makeRes('blocked', 403);
  }

  if (urlStr.search(/^https?:\/\//) !== 0) {
    urlStr = 'https://' + urlStr;
  }

  const urlObj = newUrl(urlStr);

  /** @type {!RequestInit} */
  const reqInit = {
    method: req.method,
    headers: reqHdrNew,
    redirect: 'manual',
    body: req.body,
  };
  return proxy(urlObj, reqInit);
}

/**
 * Fetches the upstream URL and rewrites redirect/security headers for proxying.
 *
 * @param {!URL} urlObj Upstream URL.
 * @param {!RequestInit} reqInit Request options forwarded upstream.
 * @return {!Promise<!Response>} Proxied upstream response.
 */
async function proxy(urlObj, reqInit) {
  const res = await fetch(urlObj.href, reqInit);
  const resHdrOld = res.headers;
  const resHdrNew = new Headers(resHdrOld);

  const status = res.status;

  if (resHdrNew.has('location')) {
    let _location = resHdrNew.get('location');

    if (checkUrl(_location)) resHdrNew.set('location', PREFIX + _location);
    else {
      reqInit.redirect = 'follow';
      return proxy(newUrl(_location), reqInit);
    }
  }

  resHdrNew.delete('content-security-policy');
  resHdrNew.delete('content-security-policy-report-only');
  resHdrNew.delete('clear-site-data');

  return withCors(
    new Response(res.body, {
      status,
      headers: resHdrNew,
    }),
  );
}
