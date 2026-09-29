// Per-site third-party tags -- Google Analytics, MS Clarity, a Meta pixel, whatever a
// site's marketing asks for. They live in custom-scripts.html beside index.html and
// site.json, pasted in exactly as the vendor supplies them, so adding or swapping a
// tracker is a one-file edit with no theme fork.
//
// The platform owns <!--headscriptToken-->, so there is nowhere in index.html a site
// can put its own tags. This fetches the file once at boot and replays it into the page.
four51.app.factory('CustomScripts', ['$http', '$log', '$document', function($http, $log, $document) {
	var doc = $document[0];

	// Elements that belong in <head>. Everything else (a tracking <img>, an iframe
	// from a GTM <noscript> block that someone unwrapped) goes to the end of <body>.
	var HEAD_TAGS = { SCRIPT: true, LINK: true, META: true, STYLE: true };

	// A missing file should 404, but a host that answers unknown paths with its own
	// page (a 200 error page, or the SPA shell) would otherwise have that page's
	// scripts replayed into this one. A snippet file never carries these.
	var WHOLE_DOCUMENT = /<\s*(html|head|body)[\s>]/i;

	// Scripts added through innerHTML never run, so each one is rebuilt as a real
	// element with the same attributes and body.
	function cloneScript(original) {
		var script = doc.createElement('script');

		angular.forEach(original.attributes, function(attr) {
			script.setAttribute(attr.name, attr.value);
		});
		script.text = original.text;
		script.setAttribute('data-custom-script', '');
		return script;
	}

	// Scripts inserted from JS are async by default, which breaks the one thing a
	// pasted file can reasonably assume: that a plain <script src> has run before the
	// inline block after it. So a blocking external script is waited on before the
	// next node goes in. async/defer ones, and the vendor loaders that inject their
	// own tag (gtag, Clarity), don't hold anything up.
	//
	// Plain callbacks rather than $q: a script's onload fires outside a digest, where
	// Angular 1.2 would not resolve the promise and the rest of the file would stall.
	function insert(node, next) {
		var parent = HEAD_TAGS[node.nodeName] ? doc.head : doc.body;

		if (node.nodeName !== 'SCRIPT') {
			parent.appendChild(doc.importNode(node, true));
			return next();
		}

		var script = cloneScript(node);
		var blocking = script.src && !node.hasAttribute('async') && !node.hasAttribute('defer');

		if (!blocking) {
			parent.appendChild(script);
			return next();
		}

		script.async = false;
		script.onload = next;
		// A blocked or dead vendor URL must not stop the rest of the file.
		script.onerror = function() {
			$log.warn('CustomScripts: failed to load ' + script.src);
			next();
		};
		parent.appendChild(script);
	}

	function apply(html) {
		if (!angular.isString(html) || html.trim() === '') return;
		// Tested with comments removed: the template's own instructions name these tags.
		if (WHOLE_DOCUMENT.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
			$log.warn('CustomScripts: custom-scripts.html looks like a whole page, not a snippet -- ignoring it');
			return;
		}

		// DOMParser keeps parsing inert: nothing loads or runs until it is inserted.
		var parsed = new DOMParser().parseFromString(html, 'text/html');
		var nodes = [];

		angular.forEach([parsed.head, parsed.body], function(section) {
			angular.forEach(section.childNodes, function(node) {
				// Comments and whitespace are the file's own instructions, not content.
				if (node.nodeType === 1) nodes.push(node);
			});
		});

		(function step(i) {
			if (i >= nodes.length) return;
			var next = function() { step(i + 1); };
			try {
				insert(nodes[i], next);
			} catch (e) {
				$log.warn('CustomScripts: could not add <' + nodes[i].nodeName.toLowerCase() + '> -- ' + e.message);
				next();
			}
		})(0);
	}

	// Relative to <base href>, like site.json. A site with no file just gets no tags.
	$http.get('custom-scripts.html', { cache: true }).then(function(response) {
		apply(response.data);
	}, function() {
		$log.info('CustomScripts: no custom-scripts.html for this site');
	});

	return {};
}]);

// Factories are lazy, and nothing else asks for this one -- instantiate it at boot so
// the tags load on every page, the login screen included.
four51.app.run(['CustomScripts', angular.noop]);
