// Retail ("compare at") pricing for site.json comparePricing. Display only: Four51's own price is
// always what's charged; this works out a higher retail price from it so the theme can show it
// struck through, plus the order's total savings.
//
// The model is a discount: the real price is discountPercent off retail, so
// retail = price / (1 - discountPercent / 100), rounded to the cent. At 15%, $10.00 shows a
// retail price of $11.76. Order savings are each line's retail total minus its real total.
//
// Which percentage applies uses the same rules as price notes: an override naming the product
// (InteropID or SKU) beats one naming a category the product is in, which beats the site-wide
// discountPercent; ties go to the override listed first. 0 means no retail price for that product.
// Category overrides need CategoryProducts lookups; until they land, products that might match
// one get no retail price, so a site-wide figure never shows first and then changes.
four51.app.factory('ComparePricing', ['SiteConfig', 'CategoryProducts', '$q', '$log', '$filter', function(SiteConfig, CategoryProducts, $q, $log, $filter) {
	var members = {};
	var ready = false;

	SiteConfig.loaded.then(function(settings) {
		var categories = {};
		angular.forEach(settings.comparePricing.overrides, function(entry) {
			angular.forEach(entry.categories, function(id) { categories[id.toLowerCase()] = id; });
		});
		var lookups = [];
		angular.forEach(categories, function(id, key) {
			lookups.push(CategoryProducts.ids(id).then(function(ids) {
				members[key] = ids;
			}, function() {
				$log.warn('ComparePricing: could not load products for category ' + id);
			}));
		});
		return $q.all(lookups);
	}).then(function() {
		ready = true;
	});

	function config() {
		return SiteConfig.settings.comparePricing;
	}

	function round(n) {
		return Math.round((n + 1e-9) * 100) / 100;
	}

	function inCategory(product, entry) {
		for (var i = 0; i < entry.categories.length; i++) {
			var ids = members[entry.categories[i].toLowerCase()];
			if (ids && ids[product.InteropID]) return true;
		}
		return false;
	}

	// The discount for a product as a fraction (0.15), or null when it has none, the feature is
	// off, or a category override is still being looked up.
	function discountFor(product) {
		var cfg = config();
		if (!cfg || !cfg.enabled || !product) return null;
		var interop = (product.InteropID || '').toLowerCase();
		var sku = (product.ExternalID || '').toLowerCase();
		var byProduct = null, byCategory = null, hasCategoryOverrides = false;
		angular.forEach(cfg.overrides, function(entry) {
			if (entry.categories.length) hasCategoryOverrides = true;
			if (!byProduct && entry.products.length && (entry.products.indexOf(interop) !== -1 || (sku && entry.products.indexOf(sku) !== -1)))
				byProduct = entry;
			if (!byCategory && entry.categories.length && inCategory(product, entry))
				byCategory = entry;
		});
		var pct;
		if (byProduct) pct = byProduct.discountPercent;
		else if (hasCategoryOverrides && !ready) return null;
		else pct = byCategory ? byCategory.discountPercent : cfg.discountPercent;
		return pct > 0 ? pct / 100 : null;
	}

	function retailFrom(amount, discount) {
		if (discount === null || !(amount > 0)) return null;
		return round(amount / (1 - discount));
	}

	// Struck-through retail price for a real price shown next to it (a unit price, a price
	// break, a line total), or null when none should show.
	function retail(price, product) {
		if (!config().showRetailPrice) return null;
		return retailFrom(price, discountFor(product));
	}

	// "Your price" label for products that have a retail price, or '' when none should show.
	function saleLabel(product) {
		var cfg = config();
		return cfg.showSaleLabel && discountFor(product) !== null ? cfg.saleLabel : '';
	}

	function retailLabel() {
		return config().retailLabel;
	}

	// Total savings across the order's lines, or null when there are none to show. Kit parents
	// still being configured are skipped, matching how the cart totals its subtotal.
	function orderSavings(order) {
		if (!config().showOrderSavings || !order || !order.LineItems) return null;
		var total = 0;
		angular.forEach(order.LineItems, function(li) {
			if (li.IsKitParent && li.KitIsInvalid) return;
			var retailTotal = retailFrom(li.LineTotal, discountFor(li.Product));
			if (retailTotal !== null) total += retailTotal - li.LineTotal;
		});
		total = round(total);
		return total > 0 ? total : null;
	}

	// savingsText with {amount} filled in, e.g. "You saved $5.00!", or '' when there are none.
	function savingsText(order) {
		var amount = orderSavings(order);
		if (amount === null) return '';
		var formatted = $filter('culturecurrency')(amount);
		var text = config().savingsText;
		return text.indexOf('{amount}') !== -1 ? text.replace('{amount}', formatted) : text + ' ' + formatted;
	}

	return {
		retail: retail,
		saleLabel: saleLabel,
		retailLabel: retailLabel,
		orderSavings: orderSavings,
		savingsText: savingsText
	};
}]);
