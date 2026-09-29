// Products in a "Coming Soon" category can be browsed but not ordered. A category counts when its
// InteropID contains "comingsoon", ignoring case and punctuation - so mm_comingsoon, coming-soon
// and Coming_Soon_2026 all qualify. Moving a product into or out of that category in the Four51
// admin is the whole switch; nothing else needs setting.
//
// Products carry no category reference of their own, so this looks the other way: it takes the
// shopper's category tree (Four51Ctrl hands it over as it loads), finds the coming-soon
// categories, and fetches their product lists once. The product card, quick-add and the PDP
// then check membership with has().
//
// It calls the Products API directly rather than Product.search(): that service keeps ONE
// shared result array, the same array the category page is rendering, and every search empties
// it in place - a background search from here would blank the grid on screen.
four51.app.factory('ComingSoon', ['$resource', '$451', '$q', '$log', '$timeout', function($resource, $451, $q, $log, $timeout) {
	var PAGE_SIZE = 100;
	var MAX_PAGES = 10;

	var ids = {};
	// waiting: no tree seen yet. none: this site has no coming-soon category. loading/ready: as named.
	var state = 'waiting';
	var loadedKey = null;
	var token = 0;

	// Never leave cards waiting forever if the tree never arrives - fall back to normal behaviour.
	$timeout(function() {
		if (state === 'waiting') state = 'none';
	}, 10000);

	function isComingSoonCategory(cat) {
		return !!cat && angular.isString(cat.InteropID) &&
			cat.InteropID.toLowerCase().replace(/[^a-z0-9]/g, '').indexOf('comingsoon') !== -1;
	}

	function collect(categories, out) {
		angular.forEach(categories, function(cat) {
			if (isComingSoonCategory(cat)) out.push(cat.InteropID);
			collect(cat.SubCategories, out);
		});
		return out;
	}

	function fetchCategory(interopID, page, found) {
		var criteria = { CategoryInteropID: interopID, SearchTerms: '', Page: page, PageSize: PAGE_SIZE };
		return $resource($451.api('Products')).get(criteria).$promise.then(function(result) {
			angular.forEach(result.List, function(product) {
				if (product && product.InteropID) found[product.InteropID] = true;
			});
			if (result.Count > page * PAGE_SIZE && page < MAX_PAGES)
				return fetchCategory(interopID, page + 1, found);
			return found;
		});
	}

	function load(tree) {
		var categories = collect(tree, []);
		var key = categories.slice().sort().join(',');
		if (key === loadedKey) return;
		loadedKey = key;

		if (!categories.length) {
			ids = {};
			state = 'none';
			return;
		}

		state = 'loading';
		var mine = ++token;
		var found = {};
		$q.all(categories.map(function(interopID) {
			return fetchCategory(interopID, 1, found).then(null, function() {
				// Fail open: a lookup error shouldn't block every product on the site.
				$log.warn('ComingSoon: could not load products for category ' + interopID);
			});
		})).then(function() {
			if (mine !== token) return;
			ids = found;
			state = 'ready';
		});
	}

	function has(product) {
		var id = angular.isString(product) ? product : (product && product.InteropID);
		return !!id && ids[id] === true;
	}

	// True until we know whether a product is coming soon, so add buttons can stay hidden instead
	// of showing "Add to cart" for a moment and then switching.
	function isPending() {
		return state === 'waiting' || state === 'loading';
	}

	return {
		load: load,
		has: has,
		isPending: isPending
	};
}]);
