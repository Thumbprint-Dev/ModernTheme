// Tests for app/js/services/featureFlagsService.js.
// Run with `make test` (or `node --test test/node/`) -- Node's built-in runner, no install.
//
// The service is a plain browser script that registers itself on the global `four51.app`,
// so it is loaded here as-is against a stub that captures what it registers; Angular itself
// is not needed. $window, $log and $location are small fakes.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(
	path.join(__dirname, '../../app/js/services/featureFlagsService.js'), 'utf8');
const STORAGE_KEY = 'mt.featureFlags';

function load() {
	const registered = {};
	const four51 = {
		app: {
			factory: (name, deps) => { registered.factory = deps[deps.length - 1]; },
			run: (deps) => { registered.run = deps[deps.length - 1]; }
		}
	};
	new Function('four51', SOURCE)(four51);
	return registered;
}

function fakeStorage(initial, { throws = false } = {}) {
	const data = Object.assign({}, initial);
	const guard = () => { if (throws) throw new Error('SecurityError: storage disabled'); };
	return {
		data,
		getItem: (k) => { guard(); return k in data ? data[k] : null; },
		setItem: (k, v) => { guard(); data[k] = String(v); },
		removeItem: (k) => { guard(); delete data[k]; }
	};
}

const quietLog = { info() {}, warn() {} };

// Instantiates the service as Angular would on a page loaded at `search`.
function boot(search, { stored, storageThrows } = {}) {
	const storage = fakeStorage(stored ? { [STORAGE_KEY]: stored } : {}, { throws: storageThrows });
	const service = load().factory({ location: { search }, sessionStorage: storage }, quietLog);
	return { service, storage };
}

// The service's pure helpers, from a boot with no param and nothing stored.
const { fromUrl, parse } = boot('').service;

test('fromUrl: param absent', async (t) => {
	for (const search of [undefined, null, '', '?', '?a=1', '?a=1&b=2', '?a&b']) {
		await t.test(JSON.stringify(search), () => assert.equal(fromUrl(search), null));
	}
});

test('fromUrl: reads the raw value', async (t) => {
	const cases = [
		['?feature_flags=test', 'test'],
		['?feature_flags=a,b,c', 'a,b,c'],
		['feature_flags=test', 'test'], // no leading '?'
		['?a=1&feature_flags=test', 'test'], // last
		['?feature_flags=test&a=1', 'test'], // first
		['?a=1&feature_flags=test&b=2', 'test'], // middle
		['?feature_flags=a=b', 'a=b'], // only the first '=' splits
		['?feature_flags=a,,b,', 'a,,b,'] // left for parse() to clean up
	];
	for (const [search, expected] of cases) {
		await t.test(search, () => assert.equal(fromUrl(search), expected));
	}
});

test('fromUrl: trailing slashes from the URL rewrite are stripped', async (t) => {
	const cases = [
		['?feature_flags=a,b/', 'a,b'], // production appends the slash after the query
		['?feature_flags=test//', 'test'],
		['?feature_flags=test///', 'test'],
		['?feature_flags=test%2F', 'test'], // Angular re-encodes it before we read the URL
		['?feature_flags=test%2f', 'test'],
		['?feature_flags=test%2F/', 'test'],
		['?feature_flags=test/%2F', 'test'],
		['?feature_flags=test%2F%2F', 'test'],
		['?a=1&feature_flags=test/', 'test'],
		['?feature_flags=test&a=1/', 'test'], // slash closes the whole query string
		['?a=1&feature_flags=test%2F', 'test'],
		['?feature_flags=a%2Cb/', 'a,b'], // stripped before decoding
		['?feature_flags=a%2Cb%2F', 'a,b'],
		['?feature_flags/', ''], // still "clear", not absent
		['?feature_flags%2F', ''],
		['?/', null]
	];
	for (const [search, expected] of cases) {
		await t.test(search, () => assert.equal(fromUrl(search), expected));
	}
});

test('fromUrl: empty or bare param means "clear", not absent', () => {
	assert.equal(fromUrl('?feature_flags='), '');
	assert.equal(fromUrl('?feature_flags'), '');
	assert.equal(fromUrl('?a=1&feature_flags&b=2'), '');
});

test('fromUrl: decodes the key and value', () => {
	assert.equal(fromUrl('?feature_flags=a%2Cb'), 'a,b');
	assert.equal(fromUrl('?feature_flags=a+b'), 'a b');
	assert.equal(fromUrl('?feature%5Fflags=test'), 'test');
});

test('fromUrl: repeated param - the last one wins', () => {
	assert.equal(fromUrl('?feature_flags=a&feature_flags=b'), 'b');
	assert.equal(fromUrl('?feature_flags=a&feature_flags='), '');
});

test('fromUrl: only the exact key matches', () => {
	assert.equal(fromUrl('?feature_flags_x=test'), null);
	assert.equal(fromUrl('?xfeature_flags=test'), null);
	assert.equal(fromUrl('?FEATURE_FLAGS=test'), null);
	assert.equal(fromUrl('?feature_flags%20=test'), null);
});

// A bad percent-escape anywhere in an inbound link must never throw: the service is
// instantiated in a run block, so an exception there stops the whole storefront booting.
// Angular's own $location parsing skips such pairs (tryDecodeURIComponent); so must we.
test('fromUrl: malformed percent-encoding never throws', async (t) => {
	const cases = [
		['?utm_x=%E0%A4%A', null], // bad value on another param
		['?%E0%A4%A=1', null], // bad key on another param
		['?utm%=x', null], // stray % in another key
		['?utm%=x&feature_flags=test', 'test'], // ...does not hide a good param after it
		['?feature_flags=test&utm%=x', 'test'], // ...or before it
		['?feature_flags=%E0', null], // bad value on our own param: ignored, not "clear"
		['?feature_flags=test&feature_flags=%E0', 'test'] // ...and does not override a good one
	];
	for (const [search, expected] of cases) {
		await t.test(search, () => assert.equal(fromUrl(search), expected));
	}
});

test('parse: normalizes, filters and de-duplicates names', () => {
	assert.deepEqual(Object.keys(parse('test')), ['test']);
	assert.deepEqual(Object.keys(parse(' Test , NEW_address-verification ')), ['test', 'new_address-verification']);
	assert.deepEqual(Object.keys(parse('a,,b,')), ['a', 'b']);
	assert.deepEqual(Object.keys(parse('a,A,a')), ['a']);
	assert.deepEqual(Object.keys(parse('ok,bad name,bad!,<script>,ok2')), ['ok', 'ok2']);
	assert.deepEqual(parse(''), {});
	assert.deepEqual(parse(null), {});
	assert.deepEqual(parse(undefined), {});
});

test('service: no param and nothing stored -> no flags', () => {
	const { service, storage } = boot('?a=1');
	assert.deepEqual(service.list(), []);
	assert.equal(service.isOn('test'), false);
	assert.deepEqual(storage.data, {});
});

test('service: the param turns flags on and saves them', () => {
	const { service, storage } = boot('?feature_flags=test,Other');
	assert.deepEqual(service.list(), ['test', 'other']);
	assert.equal(storage.data[STORAGE_KEY], 'test,other');
});

test('service: a trailing-slash URL still enables every flag', () => {
	for (const search of ['?feature_flags=test,Other/', '?feature_flags=test,Other%2F']) {
		const { service, storage } = boot(search);
		assert.deepEqual(service.list(), ['test', 'other'], search);
		assert.equal(storage.data[STORAGE_KEY], 'test,other', search);
	}
});

test('service: isOn is case- and whitespace-insensitive, and false for unknown names', () => {
	const { service } = boot('?feature_flags=test');
	assert.equal(service.isOn('test'), true);
	assert.equal(service.isOn('TEST'), true);
	assert.equal(service.isOn(' test '), true);
	assert.equal(service.isOn('other'), false);
	assert.equal(service.isOn(''), false);
	assert.equal(service.isOn(undefined), false);
	assert.equal(service.isOn('hasOwnProperty'), false);
});

test('service: stored flags persist on pages without the param', () => {
	const { service } = boot('?a=1', { stored: 'test,other' });
	assert.deepEqual(service.list(), ['test', 'other']);
});

test('service: the param replaces stored flags rather than adding to them', () => {
	const { service, storage } = boot('?feature_flags=new', { stored: 'test' });
	assert.deepEqual(service.list(), ['new']);
	assert.equal(storage.data[STORAGE_KEY], 'new');
});

test('service: an empty or bare param clears everything, storage included', () => {
	for (const search of ['?feature_flags=', '?feature_flags', '?feature_flags=,bad name,']) {
		const { service, storage } = boot(search, { stored: 'test' });
		assert.deepEqual(service.list(), [], search);
		assert.equal(STORAGE_KEY in storage.data, false, search);
	}
});

test('service: invalid names in stored data are dropped on load', () => {
	const { service } = boot('', { stored: 'test,bad name' });
	assert.deepEqual(service.list(), ['test']);
});

test('service: unusable sessionStorage leaves flags working for that page', () => {
	assert.deepEqual(boot('', { storageThrows: true }).service.list(), []);
	const { service } = boot('?feature_flags=test', { storageThrows: true });
	assert.equal(service.isOn('test'), true);
});

test('service: a malformed inbound link does not stop it booting', () => {
	assert.doesNotThrow(() => boot('?utm%=x'));
	const { service } = boot('?feature_flags=%E0', { stored: 'test' });
	assert.deepEqual(service.list(), ['test']); // bad value ignored, stored flags kept
});

test('run block: feature_flag() reaches isolate scopes, and the URL is cleaned', async (t) => {
	// Angular's Scope: child scopes inherit from $rootScope, isolate scopes are `new Scope()`
	// and share only its prototype.
	function Scope() {}
	const makeRun = () => load().run;

	// Minimal $location: `url()` reads/writes the composed URL and re-parses its query;
	// `search()` reads/writes that query; `replace()` is recorded so the test sees it.
	function fakeLocation(url) {
		const calls = [];
		const parseQuery = () => {
			const query = {};
			const raw = url.split('#')[0].split('?')[1] || '';
			for (const pair of raw.split('&')) {
				if (!pair) continue;
				const eq = pair.indexOf('=');
				const decode = (s) => decodeURIComponent(s.replace(/\+/g, ' '));
				query[decode(eq < 0 ? pair : pair.slice(0, eq))] = eq < 0 ? true : decode(pair.slice(eq + 1));
			}
			return query;
		};
		let query = parseQuery();
		const $location = {
			url: (next) => {
				if (next === undefined) return url;
				url = next;
				query = parseQuery();
				calls.push(['url', next]);
				return $location;
			},
			search: (...args) => {
				if (!args.length) return query;
				if (args[1] === null) delete query[args[0]];
				else query[args[0]] = args[1];
				calls.push(args);
				return $location;
			},
			replace: () => {
				calls.push('replace');
				return $location;
			}
		};
		return { $location, calls, query: () => query };
	}

	function runAt(url) {
		const fake = fakeLocation(url);
		makeRun()(new Scope(), fake.$location, boot('').service);
		return fake;
	}

	await t.test('helper on the shared prototype', () => {
		const $rootScope = new Scope();
		const isolate = new Scope();
		const { service } = boot('?feature_flags=test');
		makeRun()($rootScope, fakeLocation('/catalog?feature_flags=test').$location, service);
		assert.equal(isolate.feature_flag('test'), true);
		assert.equal(Object.create($rootScope).feature_flag('test'), true);
		assert.equal(isolate.feature_flag('other'), false);
	});

	await t.test('strips feature_flags without a history entry, only when present', () => {
		let result = runAt('/catalog?feature_flags=test&a=1');
		assert.deepEqual(result.calls, [['feature_flags', null], 'replace']);
		assert.deepEqual(result.query(), { a: '1' });

		result = runAt('/catalog?a=1');
		assert.deepEqual(result.calls, []);
		assert.deepEqual(result.query(), { a: '1' });
	});

	await t.test('drops the trailing slash production appends to the query', () => {
		const cases = [
			['/catalog?_=1%2F', [['url', '/catalog?_=1'], 'replace']],
			['/catalog?_=1%2F%2F', [['url', '/catalog?_=1'], 'replace']],
			['/catalog?a=1&_=2%2F', [['url', '/catalog?a=1&_=2'], 'replace']],
			['/catalog?_=1', []], // no artifact, leave the URL alone
			['/catalog/', []], // a slash on the path is not the artifact
			['/catalog?feature_flags%2F', [['url', '/catalog?feature_flags'], ['feature_flags', null], 'replace']]
		];
		for (const [url, expected] of cases) {
			assert.deepEqual(runAt(url).calls, expected, url);
		}
	});

	await t.test('handles the param and the slash in one pass', () => {
		const { query, calls } = runAt('/catalog?feature_flags=test,other&_=1%2F');
		assert.deepEqual(calls, [
			['url', '/catalog?feature_flags=test,other&_=1'],
			['feature_flags', null],
			'replace'
		]);
		assert.deepEqual(query(), { _: '1' });
	});
});
