#!/usr/bin/env node

// Local development server for the Modern storefront theme.
//
// Serves this repo's app/ folder -- the same folder Four51 deploys -- and
// forwards /api/* to a real Four51 server, so you can edit a partial or
// custom.css and see the change on refresh without deploying a commit.
//
//   node devserver.mjs
//   node devserver.mjs --port 8080
//   node devserver.mjs --upstream https://thumbprint.Four51OrderCloud.com/WastePro
//
// No dependencies -- Node built-ins only.

import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.join(ROOT, 'app')

// This theme is deployed to many storefronts, so the site it serves is not
// pinned in code. Highest wins: --upstream, then SITE_URL from the environment
// or .env (copy .env.example), then the sandbox below.
const DEFAULT_SITE = {
	name: 'Sandbox',
	url: 'https://thumbprint.four51ordercloud.com/thumbprint_sandbox'
}

// Minimal .env reader -- KEY=value, # comment lines, optional surrounding
// quotes. Kept inline so the server stays dependency-free.
function loadEnvFile(file) {
	const out = {}
	if (!fs.existsSync(file)) return out

	for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
		const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
		if (!match) continue

		let value = match[2].trim()
		if (/^(".*"|'.*')$/s.test(value)) value = value.slice(1, -1)
		out[match[1]] = value
	}
	return out
}

// A real environment variable beats the file, so a one-off
// `SITE_URL=... node devserver.mjs` works without editing .env.
const fileEnv = loadEnvFile(path.join(ROOT, '.env'))
const env = { ...fileEnv, ...process.env }

const SITE = {
	name: env.SITE_NAME || DEFAULT_SITE.name,
	url: env.SITE_URL || DEFAULT_SITE.url
}

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.less': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.eot': 'application/vnd.ms-fontobject',
	'.map': 'application/json; charset=utf-8'
}

function parseArgs(argv) {
	const args = { port: 3000 }
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === '--port' || a === '-p') args.port = Number(argv[++i])
		else if (a === '--upstream' || a === '-u') args.upstream = argv[++i]
		else if (a === '--app-path') args.appPath = argv[++i]
		else if (a === '--allow-orders') args.allowOrders = true
		else if (a === '--verbose' || a === '-v') args.verbose = true
		else if (a === '--help' || a === '-h') args.help = true
	}
	return args
}

const USAGE = `
Usage: node devserver.mjs [options]

Serves app/ as the ${SITE.name} storefront and proxies the API to the real server.

Options:
  -p, --port <n>       Port to listen on (default 3000)
  -u, --upstream <url> Override the API target -- the storefront this theme is
                       deployed to. Defaults to ${SITE.url}
                       (set SITE_NAME/SITE_URL in .env to change that default --
                       see .env.example)
      --app-path <s>   Override the mount / API app name. Defaults to the first
                       path segment of the upstream URL.
      --allow-orders   Permit order submit/approve/decline/repeat. Blocked by
                       default so a dev session cannot place a real order.
  -v, --verbose        Log every request, not just API calls
  -h, --help           Show this help
`.trim()

// Irreversible calls: submitting, approving, declining or repeating an order
// all fire real workflow on the upstream server (see app/js/services/orderService.js).
// Everything else -- login, browsing, cart edits -- stays open so checkout can
// still be exercised right up to the final click.
const BLOCKED_WRITES = [
	{ method: 'PUT', pattern: /^\/api\/[^/]+\/order\/?$/i, what: 'submit order' },
	{ method: 'PUT', pattern: /^\/api\/[^/]+\/order\/approve\//i, what: 'approve order' },
	{ method: 'PUT', pattern: /^\/api\/[^/]+\/order\/decline\//i, what: 'decline order' },
	{ method: 'PUT', pattern: /^\/api\/[^/]+\/order\/repeat\//i, what: 'repeat order' }
]

function blockedWrite(method, urlPath) {
	return BLOCKED_WRITES.find(r => r.method === method.toUpperCase() && r.pattern.test(urlPath))
}

// Four51 puts the session token in the query string (e.g. /Downloadfile.hcf?auth=451 ...).
// Keep it out of the log so a pasted terminal dump cannot leak a live session.
function safeUrl(url) {
	return url.replace(/([?&]auth=)[^&]*/gi, '$1<redacted>')
}

// Site addresses get written down without a scheme (buyersites.json carries
// entries like thumbprint.Four51OrderCloud.com/adt_dealers), so assume https
// rather than failing on a value that is otherwise usable.
function parseUpstream(value, source) {
	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
	try {
		return new URL(withScheme)
	} catch {
		throw new Error(`${source} is not a usable URL: ${value}`)
	}
}

// The deployed site gets its app name from the first path segment
// (see app/js/451.js: four51.apiName()). Nothing on disk pins it, because the
// <base href> is injected at deploy time -- so derive it from the upstream URL.
function resolveAppPath(upstreamUrl, override) {
	if (override) return override
	const seg = upstreamUrl.pathname.split('/').filter(Boolean)[0]
	if (!seg) throw new Error(`Cannot determine app path for ${upstreamUrl.href} -- pass --app-path`)
	return seg
}

// app/index.html ships with two placeholders that Four51 substitutes when it
// deploys the commit. The base tag sets the mount that the Angular router and
// four51.apiName() both read, and four51IsAnonUser is dereferenced by
// js/451.js as it loads -- leave either token raw and the app will not boot.
function injectDeployTokens(html, appPath) {
	return html
		.replace('<!--baseTagToken-->', `<base href="/${appPath}/"/>`)
		.replace('<!--headscriptToken-->', '<script>var four51IsAnonUser = false;</script>')
}

// index.html loads Angular/jQuery/Bootstrap protocol-relative (//host/...),
// which resolves to http:// on a local HTTP server and can fail or warn.
// Pin those to https so the page loads the same way it does in production.
function renderHtml(html, appPath) {
	return injectDeployTokens(html, appPath).replace(/(\s(?:src|href)=")\/\//g, '$1https://')
}

// Cookies from the upstream host are scoped to that domain and marked Secure,
// which the browser would reject on http://localhost. Loosen them so the auth
// cookie survives the hop.
function rewriteSetCookie(values) {
	return values.map(v =>
		v
			.split(/;\s*/)
			.filter(part => {
				const p = part.toLowerCase()
				return !p.startsWith('domain=') && p !== 'secure' && p !== 'samesite=none'
			})
			.join('; ')
	)
}

function send(res, status, body, headers = {}) {
	res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers })
	res.end(body)
}

function main() {
	const args = parseArgs(process.argv.slice(2))

	if (args.help) return console.log(USAGE)

	if (!fs.existsSync(path.join(APP_DIR, 'index.html'))) {
		console.error(`Error: ${path.relative(ROOT, APP_DIR)}/index.html not found. Run this from the theme repo root.`)
		process.exit(1)
	}

	let upstream
	let appPath
	try {
		upstream = args.upstream
			? parseUpstream(args.upstream, '--upstream')
			: parseUpstream(SITE.url, env.SITE_URL ? 'SITE_URL' : 'the built-in default site')
		appPath = resolveAppPath(upstream, args.appPath)
	} catch (err) {
		console.error(`Error: ${err.message}`)
		process.exit(1)
	}

	const mount = `/${appPath}/`
	const agent = new https.Agent({ keepAlive: true })

	function proxyUpstream(req, res, label) {
		const options = {
			protocol: upstream.protocol,
			hostname: upstream.hostname,
			port: upstream.port || 443,
			method: req.method,
			path: req.url,
			agent,
			headers: {
				...req.headers,
				// Upstream vhosts on Host; localhost would 404. Origin/Referer are
				// rewritten so the app looks like it is running on the real domain.
				host: upstream.host,
				origin: upstream.origin,
				referer: upstream.origin + mount
			}
		}
		delete options.headers['accept-encoding'] // pass bodies through undecoded

		const upstreamReq = https.request(options, upstreamRes => {
			const headers = { ...upstreamRes.headers }

			if (headers['set-cookie']) headers['set-cookie'] = rewriteSetCookie(headers['set-cookie'])

			// Keep redirects on the dev server instead of bouncing to production.
			if (headers.location && headers.location.startsWith(upstream.origin))
				headers.location = headers.location.slice(upstream.origin.length)

			console.log(`  ${label} ${upstreamRes.statusCode} ${req.method} ${safeUrl(req.url)}`)
			res.writeHead(upstreamRes.statusCode, headers)
			upstreamRes.pipe(res)
		})

		upstreamReq.on('error', err => {
			console.error(`  ${label} ERR ${req.method} ${safeUrl(req.url)} -- ${err.message}`)
			if (!res.headersSent) send(res, 502, `Proxy error: ${err.message}`)
			else res.end()
		})

		req.pipe(upstreamReq)
	}

	// Production answers page URLs with a trailing slash, and IIS appends it to
	// the raw URL -- after the query string when there is one (/catalog?x=1 ->
	// /catalog?x=1/). Mirror that so local routes land on the same URLs they do
	// once deployed. Files keep their URL; only extensionless routes redirect.
	function needsTrailingSlash(url, urlPath) {
		if (url.endsWith('/')) return false
		return !path.extname(urlPath.split('/').pop())
	}

	function serveStatic(req, res, urlPath) {
		let rel = decodeURIComponent(urlPath.slice(mount.length))
		// A trailing slash still names an app route (/catalog/), not a file --
		// decide before appending index.html so the extension test below holds.
		const appRoute = !path.extname(rel.replace(/\/$/, ''))
		if (rel === '' || rel.endsWith('/')) rel += 'index.html'

		const file = path.join(APP_DIR, rel)
		// Guard against ../ escaping the app directory.
		if (!file.startsWith(APP_DIR + path.sep) && file !== APP_DIR) return send(res, 403, 'Forbidden')

		fs.stat(file, (err, stat) => {
			if (err || !stat.isFile()) {
				// A missing path with no file extension is an app route (e.g. /catalog),
				// so boot the local shell -- sending it upstream would load production's
				// index.html and quietly bypass every local edit.
				if (appRoute) {
					const shell = renderHtml(fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8'), appPath)
					console.log(`  spa  200 ${req.method} ${safeUrl(urlPath)}`)
					res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' })
					return res.end(shell)
				}
				// Assets this repo does not carry -- the favicon, product images, the
				// generated *source.css/js bundles and the .hcf product detail
				// templates are all built or hosted by Four51 -- fall back to the
				// real server so the page still renders.
				return proxyUpstream(req, res, 'up  ')
			}

			const ext = path.extname(file).toLowerCase()
			const type = MIME[ext] || 'application/octet-stream'

			if (args.verbose) console.log(`  file ${req.method} ${urlPath}`)

			if (ext === '.html') {
				const html = renderHtml(fs.readFileSync(file, 'utf8'), appPath)
				res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
				return res.end(html)
			}

			res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
			fs.createReadStream(file).pipe(res)
		})
	}

	const server = http.createServer((req, res) => {
		const queryIndex = req.url.indexOf('?')
		const urlPath = queryIndex === -1 ? req.url : req.url.slice(0, queryIndex)
		const search = queryIndex === -1 ? '' : req.url.slice(queryIndex)

		if (urlPath.startsWith('/api/')) {
			const blocked = !args.allowOrders && blockedWrite(req.method, urlPath)
			if (blocked) {
				console.log(`  BLOCKED  ${req.method} ${urlPath}  (${blocked.what}) -- rerun with --allow-orders to permit`)
				return send(
					res,
					403,
					JSON.stringify({ Message: `Blocked by devserver: "${blocked.what}" would hit ${upstream.host}. Rerun with --allow-orders to permit.` }),
					{ 'content-type': 'application/json; charset=utf-8' }
				)
			}
			return proxyUpstream(req, res, 'api ')
		}
		const isMountRoot = urlPath === mount.slice(0, -1)
		const isPage = urlPath === '/' || urlPath === '' || isMountRoot || urlPath.startsWith(mount)

		// Imitate the production redirect -- the slash goes at the end of the raw
		// URL, so /catalog?x=1 becomes /catalog?x=1/, not /catalog/?x=1.
		if (isPage && needsTrailingSlash(req.url, urlPath)) return send(res, 302, '', { location: `${req.url}/` })

		if (urlPath === '/' || urlPath === '') return send(res, 302, '', { location: mount + search })
		if (isMountRoot) return serveStatic(req, res, mount)
		if (urlPath.startsWith(mount)) return serveStatic(req, res, urlPath)

		// Root-relative assets that ignore <base href> -- product images come through
		// as /Downloadfile.hcf?FileID=...&auth=... -- plus anything else the app asks
		// for outside the mount. Production serves these from the same origin, so
		// forward them rather than 404.
		return proxyUpstream(req, res, 'root')
	})

	server.listen(args.port, () => {
		const source = args.upstream
			? '--upstream override'
			: env.SITE_URL
				? `${fileEnv.SITE_URL && !process.env.SITE_URL ? '.env' : 'environment'} (${SITE.name})`
				: `built-in default (${SITE.name})`
		const orders = args.allowOrders
			? 'ALLOWED  (--allow-orders is set -- a submit here is a real order)'
			: 'blocked  (submit/approve/decline/repeat return 403)'

		console.log(`
  theme     ${path.relative(ROOT, APP_DIR)}/  (edit here, refresh to see it)
  api       ${upstream.origin}/api/${appPath}/*
            ^ from ${source} -- confirm this is the environment you want
  orders    ${orders}

  open      http://localhost:${args.port}${mount}

  Log in with your normal Four51 credentials. Ctrl+C to stop.
`)
	})

	server.on('error', err => {
		if (err.code === 'EADDRINUSE') console.error(`Error: port ${args.port} is already in use. Try --port ${args.port + 1}.`)
		else console.error(`Error: ${err.message}`)
		process.exit(1)
	})
}

main()
