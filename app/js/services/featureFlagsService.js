// Feature flags, switched on per browser tab with a pseudo query param on any page:
//
//   /storefront/catalog?feature_flags=new_address_verification,other_flag
//
// The list replaces whatever was set before; `?feature_flags=` (empty) clears them all.
// State lives in sessionStorage, so it survives navigation and reloads in that tab but
// ends with it -- a shared link only turns a flag on for whoever opens it, and nobody is
// left stuck on an experiment. The param is stripped from the URL once read so it does
// not linger in the address bar, in analytics, or in links copied from the page.
//
// In templates: ng-if="feature_flag('new_address_verification')"  -- works in every template,
//               isolate-scope directives included (see the run block below).
// In JS:        inject FeatureFlags, then FeatureFlags.isOn('new_address_verification')
four51.app.factory('FeatureFlags', ['$window', '$log', function($window, $log) {
	var PARAM = 'feature_flags';
	var STORAGE_KEY = 'mt.featureFlags';

	function normalize(name) {
		return String(name || '').trim().toLowerCase();
	}

	// Comma-separated, case-insensitive; blanks and anything that is not a plain
	// identifier-ish name are dropped rather than stored.
	function parse(value) {
		var flags = {};
		String(value || '').split(',').forEach(function(part) {
			var name = normalize(part);
			if (/^[a-z0-9_\-]+$/.test(name)) flags[name] = true;
		});
		return flags;
	}

	// sessionStorage can be missing or throw (privacy modes, blocked site data);
	// flags then simply stay off.
	function load() {
		try {
			return parse($window.sessionStorage.getItem(STORAGE_KEY));
		} catch (e) {
			return {};
		}
	}

	function save(flags) {
		try {
			var names = Object.keys(flags);
			if (names.length) $window.sessionStorage.setItem(STORAGE_KEY, names.join(','));
			else $window.sessionStorage.removeItem(STORAGE_KEY);
		} catch (e) {
			$log.warn('FeatureFlags: sessionStorage unavailable; flags will not persist');
		}
	}

	// The raw feature_flags value in a query string ('?a=1&feature_flags=x,y' -> 'x,y'),
	// '' for a bare `?feature_flags`, or null when the param is absent. Pure -- it takes the
	// string rather than reading $window -- so tests can call it directly.
	// Production rewrites page URLs to end in a slash, which lands after the query
	// (?feature_flags=a,b -> ?feature_flags=a,b/). Angular then re-encodes that slash as
	// %2F while it boots, before this factory reads the URL, so strip both forms.
	function fromUrl(search) {
		var query = (search || '').replace(/^\?/, '').replace(/(?:\/|%2f)+$/i, '');
		var found = null;
		query.split('&').forEach(function(pair) {
			var eq = pair.indexOf('=');
			if (decode(eq < 0 ? pair : pair.slice(0, eq)) !== PARAM) return;
			var value = eq < 0 ? '' : decode(pair.slice(eq + 1));
			if (value !== null) found = value;
		});
		return found;
	}

	// decodeURIComponent throws on a malformed escape (e.g. a stray `%`); null instead, so a
	// bad param on an inbound link is skipped -- as Angular's own $location parsing does --
	// rather than stopping the storefront from booting.
	function decode(part) {
		try {
			return decodeURIComponent(part.replace(/\+/g, ' '));
		} catch (e) {
			return null;
		}
	}

	var flags = load();
	// Read from the raw URL rather than $location, so the param is caught on the very
	// first page load even if a route redirect runs before anything asks for flags.
	var requested = fromUrl($window.location.search);
	if (requested !== null) {
		flags = parse(requested);
		save(flags);
		$log.info('FeatureFlags: ' + (Object.keys(flags).join(', ') || 'all cleared'));
	}

	return {
		PARAM: PARAM,
		isOn: function(name) {
			return flags[normalize(name)] === true;
		},
		list: function() {
			return Object.keys(flags);
		},
		// Exposed for test/node/featureFlagsService.test.js; not meant for app code.
		fromUrl: fromUrl,
		parse: parse
	};
}]);

// Instantiate at boot so the param is read on whatever page it arrives on, expose the
// template helper, and clean the address bar without adding a history entry: drop the param
// and the trailing slash production's URL rewrite leaves at the end of the query string.
four51.app.run(['$rootScope', '$location', 'FeatureFlags', function($rootScope, $location, FeatureFlags) {
	// On the Scope prototype rather than $rootScope itself: isolate scopes (addressInput and
	// the other `scope: {}` directives) are built with `new Scope()` and do not inherit from
	// $rootScope, but they do share its prototype -- so feature_flag() resolves on every scope.
	Object.getPrototypeOf($rootScope).feature_flag = FeatureFlags.isOn;

	// Angular re-encodes the slash as %2F when it boots; left alone, the next load gets
	// another one appended and the URL grows on every reload. Drop it before the first sync.
	var url = $location.url();
	var clean = url.replace(/(?:\/|%2f)+$/i, '');
	var changed = false;
	if (url.indexOf('?') >= 0 && clean !== url) {
		$location.url(clean);
		changed = true;
	}

	if (Object.prototype.hasOwnProperty.call($location.search(), FeatureFlags.PARAM)) {
		$location.search(FeatureFlags.PARAM, null);
		changed = true;
	}

	if (changed) $location.replace();
}]);
