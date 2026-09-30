// Picks the site.json priceNotes note (if any) for a product on the PDP. The most specific note
// wins: one naming the product (by InteropID or SKU/ExternalID), then one naming a category the
// product is in, then one with no products or categories (every product). Ties go to the note
// listed first. One note per product.
//
// Category notes need to know which products are in each listed category, which products don't
// carry themselves - CategoryProducts looks that up once per category. Until those lookups land,
// forProduct() returns null rather than showing a less specific note and then swapping it.
four51.app.factory('PriceNotes', ['SiteConfig', 'CategoryProducts', '$q', '$log', function(SiteConfig, CategoryProducts, $q, $log) {
	var members = {};
	var ready = false;

	SiteConfig.loaded.then(function(settings) {
		var categories = {};
		angular.forEach(settings.priceNotes, function(note) {
			angular.forEach(note.categories, function(id) { categories[id.toLowerCase()] = id; });
		});
		var lookups = [];
		angular.forEach(categories, function(id, key) {
			lookups.push(CategoryProducts.ids(id).then(function(ids) {
				members[key] = ids;
			}, function() {
				$log.warn('PriceNotes: could not load products for category ' + id);
			}));
		});
		return $q.all(lookups);
	}).then(function() {
		ready = true;
	});

	function inCategory(product, note) {
		for (var i = 0; i < note.categories.length; i++) {
			var ids = members[note.categories[i].toLowerCase()];
			if (ids && ids[product.InteropID]) return true;
		}
		return false;
	}

	function forProduct(product) {
		var notes = SiteConfig.settings.priceNotes;
		if (!product || !notes || !notes.length) return null;
		var interop = (product.InteropID || '').toLowerCase();
		var sku = (product.ExternalID || '').toLowerCase();
		var byProduct = null, byCategory = null, forAll = null;
		var hasCategoryNotes = false;
		angular.forEach(notes, function(note) {
			if (note.categories.length) hasCategoryNotes = true;
			if (!note.products.length && !note.categories.length) {
				if (!forAll) forAll = note;
				return;
			}
			if (!byProduct && note.products.length && (note.products.indexOf(interop) !== -1 || (sku && note.products.indexOf(sku) !== -1)))
				byProduct = note;
			if (!byCategory && note.categories.length && inCategory(product, note))
				byCategory = note;
		});
		if (byProduct) return byProduct;
		if (hasCategoryNotes && !ready) return null;
		return byCategory || forAll;
	}

	return { forProduct: forProduct };
}]);
