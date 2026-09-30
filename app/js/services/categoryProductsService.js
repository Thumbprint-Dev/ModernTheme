// Which products are in a category - the lookup behind every "does this product belong to
// category X" rule (coming soon, price notes). Products carry no category reference of their
// own, so this fetches the category's product list and keeps the InteropIDs, once per category
// per visit.
//
// It calls the Products API directly rather than Product.search(): that service keeps ONE
// shared result array, the same array the category page is rendering, and every search empties
// it in place - a background search from here would blank the grid on screen.
four51.app.factory('CategoryProducts', ['$resource', '$451', function($resource, $451) {
	var PAGE_SIZE = 100;
	var MAX_PAGES = 10;
	var cache = {};

	function fetchPage(interopID, page, found) {
		var criteria = { CategoryInteropID: interopID, SearchTerms: '', Page: page, PageSize: PAGE_SIZE };
		return $resource($451.api('Products')).get(criteria).$promise.then(function(result) {
			angular.forEach(result.List, function(product) {
				if (product && product.InteropID) found[product.InteropID] = true;
			});
			if (result.Count > page * PAGE_SIZE && page < MAX_PAGES)
				return fetchPage(interopID, page + 1, found);
			return found;
		});
	}

	// Resolves to { <product InteropID>: true, ... }. Rejects if the lookup fails, and a failed
	// lookup isn't cached, so the next caller tries again.
	function ids(interopID) {
		var key = (interopID || '').toLowerCase();
		if (!cache[key]) {
			cache[key] = fetchPage(interopID, 1, {});
			cache[key].then(null, function() { delete cache[key]; });
		}
		return cache[key];
	}

	return { ids: ids };
}]);
