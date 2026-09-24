// Per-site branding that the platform gives us nowhere to put -- the home page
// hero art and copy, and a nav logo for sites whose Company.LogoUrl is empty.
// Lives in site.json beside index.html so a site can be rebranded by editing one
// deployed file, with no theme fork and no CMS behind it.
four51.app.factory('SiteConfig', ['$http', '$log', '$document', function($http, $log, $document) {
	// The shape of site.json, and the fallback for every key in it. A missing,
	// truncated or partially filled file therefore still renders the stock theme
	// rather than an empty hero.
	var settings = {
		// Falls back to Company.Name once a user loads, but the login page has no user yet -
		// this is what the logo's alt text and its no-logo-uploaded text fallback use there.
		name: '',
		// Overrides the <link rel="icon"> pair in index.html. Blank keeps the
		// platform's storefrontfavicon.ico.
		favicon: '',
		logo: {
			url: '',
			alt: ''
		},
		hero: {
			image: '',
			eyebrow: 'Fall 2026 Collection',
			heading: 'Gear your team for the season ahead.',
			subheading: 'New apparel, drinkware and print kits, priced for your group.',
			// false hides the hero's call-to-action button while keeping its
			// buttonText/buttonHref in the file, ready to switch back on.
			showButton: true,
			buttonText: 'Shop the collection',
			buttonHref: 'catalog'
		},
		address: {
			// false hides the Quick Address (Google Places) field on every address form -
			// checkout's New Address and the Addresses page. It needs a Google Maps key that
			// allows the site's domain; without one it shows "Oops! Something went wrong."
			showQuickAddress: true
		},
		login: {
			// Where "Need an account?" goes. Blank uses the native self-service
			// signup at /admin (partials/userView.html in its TempCustomer branch),
			// which only works on sites that hand anonymous visitors a temp
			// session -- elsewhere, point this at the site's Four51 signup link.
			createAccountUrl: ''
		},
		theme: {
			// Overrides --mt-color-accent / --mt-color-accent-dark from custom.css.
			// Leave blank to keep the theme's own accent.
			accent: '',
			accentDark: '',
			// Overrides --mt-font-body, which drives the theme's page and component
			// roots. Name just the family -- FALLBACK_FONTS is appended behind it,
			// so a visitor without the font lands on the theme's own stack rather
			// than the browser's default serif.
			fontFamily: '',
			// Stylesheet that delivers fontFamily as a webfont, injected as a
			// <link>. Without it, fontFamily renders only for visitors who happen
			// to have the font installed locally.
			fontUrl: ''
		},
		shipping: {
			// The only shipping method names the checkout dropdowns may offer, matched
			// against the Name the API returns, trimmed and case-insensitively. Empty
			// means unrestricted, not "allow nothing" -- a site that has not filled
			// this in keeps everything the platform offers. The platform still decides
			// entitlement; this can only narrow what is shown, never add a method back.
			allowedDomesticMethods: [],
			// Methods offered only when the order ships outside domesticCountries.
			// When this is non-empty it replaces allowedDomesticMethods for an international
			// address, and its entries are suppressed on a domestic one -- the rule
			// is symmetric, so a carrier listed here never appears domestically.
			// Leave it empty and country plays no part at all.
			allowedInternationalMethods: [],
			// Country codes counted as domestic, as the address returns them. Defaults
			// to US alone; note that Canada and Mexico are not domestic here unless a
			// site says so.
			domesticCountries: ['US']
		},
		// Applied to the hero element by ngStyle; recomputed whenever the file lands.
		heroStyle: {}
	};

	// Anything here is written into a CSS custom property, so keep it to values
	// that are unambiguously colours -- no url(), no semicolons, nothing that
	// could carry extra declarations along with it.
	var COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|[a-z]{3,20})$/i;

	// Same reasoning as COLOR, for a value that ends up in a font-family
	// declaration: family names, quotes and commas only. No parens (url()), no
	// semicolon or colon (a second declaration riding along).
	var FONT = /^[\w\s,'"-]+$/;

	// Whether a font stack already ends in a generic family. If it does not, the
	// theme's own stack is appended rather than leaving the browser to fall all
	// the way back to its default serif.
	var GENERIC = /(^|,)\s*(sans-serif|serif|monospace|cursive|fantasy|system-ui)\s*$/i;

	// What custom.css sets --mt-font-body to. Duplicated here on purpose: this is
	// the fallback appended behind a site's own font, and it should not silently
	// change if the stylesheet's default is retuned.
	var FALLBACK_FONTS = "'Inter', 'Droid Sans', sans-serif";

	// These land in a href/src attribute set through the DOM, never innerHTML, so
	// the only real hazard is a scheme that executes.
	var EXECUTABLE_SCHEME = /^\s*(javascript|vbscript):/i;

	function isColor(value) {
		return angular.isString(value) && COLOR.test(value.trim());
	}

	function stringList(value) {
		var output = [];
		angular.forEach(value, function(entry) {
			if (angular.isString(entry) && entry.trim() !== '') output.push(entry.trim());
		});
		return output;
	}

	function isSafeUrl(value) {
		return angular.isString(value) && value.trim() !== '' && !EXECUTABLE_SCHEME.test(value);
	}

	// Hover/pressed states need a darker sibling. Deriving it means a site only
	// has to name one colour; accentDark is there for when the brand has a
	// specific second shade.
	function darken(hex, amount) {
		if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;

		var channels = [1, 3, 5].map(function(i) {
			var value = Math.round(parseInt(hex.substr(i, 2), 16) * (1 - amount));
			return ('0' + value.toString(16)).slice(-2);
		});
		return '#' + channels.join('');
	}

	// Set on <html>, where an inline style beats the :root rule in custom.css --
	// so the stylesheet keeps the theme default and this only has to name what
	// the site changes.
	function applyTheme() {
		var root = $document[0].documentElement;

		applyAccent(root);
		applyFont(root);
	}

	function applyAccent(root) {
		var accent = (settings.theme.accent || '').trim();
		var accentDark = (settings.theme.accentDark || '').trim();

		if (accent && !isColor(accent)) {
			$log.warn('SiteConfig: theme.accent is not a colour, ignoring -- ' + accent);
			return;
		}
		if (!accent) return;

		root.style.setProperty('--mt-color-accent', accent);
		root.style.setProperty('--mt-color-accent-dark', isColor(accentDark) ? accentDark : darken(accent, 0.18));
	}

	// The stylesheet has to land before the family is worth setting, otherwise the
	// first paint uses the fallback and reflows once the webfont arrives. Injecting
	// it here rather than hard-coding a <link> in index.html keeps index.html
	// site-agnostic, which is the whole point of this file.
	function applyFont(root) {
		var family = (settings.theme.fontFamily || '').trim();
		var url = (settings.theme.fontUrl || '').trim();

		if (url) {
			if (isSafeUrl(url)) loadStylesheet(url);
			else $log.warn('SiteConfig: theme.fontUrl is not a usable URL, ignoring -- ' + url);
		}

		if (!family) return;
		if (!FONT.test(family)) {
			$log.warn('SiteConfig: theme.fontFamily is not a font name, ignoring -- ' + family);
			return;
		}

		root.style.setProperty('--mt-font-body', GENERIC.test(family) ? family : family + ', ' + FALLBACK_FONTS);
	}

	function loadStylesheet(url) {
		var doc = $document[0];
		var existing = doc.querySelector('link[data-site-font]');

		if (existing) {
			existing.setAttribute('href', url);
			return;
		}

		var link = doc.createElement('link');
		link.setAttribute('rel', 'stylesheet');
		link.setAttribute('data-site-font', '');
		link.setAttribute('href', url);
		(doc.head || doc.getElementsByTagName('head')[0]).appendChild(link);
	}

	// index.html ships two icon links pointing at storefrontfavicon.ico, both
	// declaring image/x-icon. Repointing them at a PNG means dropping that type,
	// or a browser that trusts it renders nothing.
	function applyFavicon() {
		var url = (settings.favicon || '').trim();

		if (!url) return;
		if (!isSafeUrl(url)) {
			$log.warn('SiteConfig: favicon is not a usable URL, ignoring -- ' + url);
			return;
		}

		var doc = $document[0];
		var links = doc.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');

		if (!links.length) {
			var link = doc.createElement('link');
			link.setAttribute('rel', 'icon');
			(doc.head || doc.getElementsByTagName('head')[0]).appendChild(link);
			links = [link];
		}

		angular.forEach(links, function(link) {
			link.setAttribute('href', url);
			link.removeAttribute('type');
		});
	}

	// One level deep, and blanks are ignored -- a site only names the keys it
	// actually overrides, and clearing a value back to "" restores the default.
	function apply(data) {
		if (data && angular.isString(data.name) && data.name !== '') settings.name = data.name;
		if (data && angular.isString(data.favicon) && data.favicon !== '') settings.favicon = data.favicon;

		// The tab title otherwise stays index.html's static "Storefront" for any page
		// rendered before a user is authenticated (the login screen, public routes) --
		// Four51Ctrl only sets it from Company.Name once a user has actually loaded.
		if (settings.name) $document[0].title = settings.name;

		angular.forEach(settings, function(defaults, section) {
			var overrides = data && data[section];
			if (!angular.isObject(defaults) || !angular.isObject(overrides)) return;

			angular.forEach(defaults, function(value, key) {
				var override = overrides[key];

				// The override has to match the shape of the default it replaces. A key
				// that defaults to a list takes only a list; one that defaults to a
				// string takes only a string. Anything else is ignored, so the key keeps
				// its default and the rest of the file still applies -- the same
				// treatment a blank gets.
				//
				// Without the type check a list written as a bare string ("UPS Ground"
				// instead of ["UPS Ground"]) was stored as a string and then iterated
				// character by character downstream, which threw inside checkout.
				if (angular.isArray(value)) {
					if (angular.isArray(override)) defaults[key] = stringList(override);
					else if (override !== undefined) $log.warn('SiteConfig: ' + section + '.' + key + ' must be a list, ignoring -- ' + angular.toJson(override));
				}
				// A switch takes only a real true/false. A quoted "false" is a non-empty
				// string, which would read as on -- the opposite of what was written.
				else if (typeof value === 'boolean') {
					if (typeof override === 'boolean') defaults[key] = override;
					else if (override !== undefined) $log.warn('SiteConfig: ' + section + '.' + key + ' must be true or false, ignoring -- ' + angular.toJson(override));
				}
				// Lists are taken whole rather than merged, so a site can shorten one as
				// well as extend it. Non-string entries are dropped instead of failing
				// the whole file.
				else if (angular.isString(override) && override !== '') defaults[key] = override;
			});
		});

		settings.heroStyle = settings.hero.image
			? { 'background-image': "url('" + settings.hero.image + "')" }
			: {};

		applyTheme();
		applyFavicon();
	}

	// Templates bind to this same object, so they pick the values up when the
	// request resolves. The URL is relative to <base href>, i.e. the deployed app
	// folder -- the same way partials are loaded.
	var loaded = $http.get('site.json', { cache: true }).then(function(response) {
		apply(response.data);
		return settings;
	}, function() {
		// Not an error worth stopping for: a site that never added the file just
		// gets the theme defaults.
		$log.warn('SiteConfig: site.json missing or unreadable -- using theme defaults');
		return settings;
	});

	return {
		settings: settings,
		loaded: loaded
	};
}]);