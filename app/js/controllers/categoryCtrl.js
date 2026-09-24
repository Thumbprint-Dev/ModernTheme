four51.app.controller('CategoryCtrl', ['$routeParams', '$sce', '$scope', '$rootScope', '$451', 'Category', 'Product', 'AppConst', 'Order', 'User', '$modal', 'ProductDisplayService',
function ($routeParams, $sce, $scope, $rootScope, $451, Category, Product, AppConst, Order, User, $modal, ProductDisplayService) {
	$scope.isHome = !$routeParams.categoryInteropID;

	// Computes the home page's "Shop by category" tiles and the "Browse full catalog" tile's
	// target category, both derived from the same top-level tree. Featured and All Products are
	// never real departments, so they're always excluded from "Shop by category"; an optional
	// curated list (AppConst.shopByCategoryInteropIDs) can further narrow + order which
	// departments show there instead of defaulting to "all of them".
	// Case-insensitive: the real Featured category's InteropID in this tenant's data turned out
	// to be lowercase ("featured") even though AppConst.featuredCategoryInteropID is 'Featured'.
	// Product.search's server-side category lookup apparently tolerates that mismatch, but a
	// strict === comparison does not, and silently let Featured show up in Shop by category
	// instead of being excluded like it always should have been. Applying this everywhere an
	// InteropID gets compared here so the same class of mismatch cannot bite again.
	function sameInteropID(a, b) {
		return !!a && !!b && a.toLowerCase() === b.toLowerCase();
	}

	// Four51 InteropIDs must be unique across the ENTIRE platform, not just this tenant - an admin
	// can't always use the literal "featured"/"all-products" string if another site already
	// claimed it, so Four51 appends a uniqueness suffix instead (the same pattern already visible
	// on every other category in this tenant, e.g. "apparel-gabe", "kits-gabe"). Match these two
	// special categories by PREFIX, not exact equality, so e.g. "all-products-gabe" still matches
	// the intended "all-products" category. The curated shopByCategoryInteropIDs list below still
	// uses exact matching (sameInteropID) - those are specific department names an admin
	// configures precisely, not a platform-reserved name subject to this collision.
	function startsWithInteropID(fullID, prefix) {
		return !!fullID && !!prefix && fullID.toLowerCase().indexOf(prefix.toLowerCase()) === 0;
	}

	function computeHomeCategoryLists() {
		if (!$scope.tree) return;

		$scope.featuredCategory = $scope.tree.filter(function(cat) { return startsWithInteropID(cat.InteropID, AppConst.featuredCategoryInteropID); })[0];
		$scope.allProductsCategory = $scope.tree.filter(function(cat) { return startsWithInteropID(cat.InteropID, AppConst.allProductsCategoryInteropID); })[0];

		var eligible = $scope.tree.filter(function(cat) {
			return !startsWithInteropID(cat.InteropID, AppConst.featuredCategoryInteropID) && !startsWithInteropID(cat.InteropID, AppConst.allProductsCategoryInteropID);
		});

		if (AppConst.shopByCategoryInteropIDs && AppConst.shopByCategoryInteropIDs.length) {
			eligible = AppConst.shopByCategoryInteropIDs
				.map(function(id) { return eligible.filter(function(cat) { return sameInteropID(cat.InteropID, id); })[0]; })
				.filter(Boolean);
		}
		$scope.shopByCategories = eligible;

		// With fewer than 4 categories, a fixed col-sm-3 grid leaves empty space on the right
		// instead of filling the row - widen the columns so 1-2 categories fill a 2-up row and
		// 3 fill a 3-up row. .mt-dept-tile's aspect-ratio:1/1 (custom.css) keeps every tile
		// square automatically as its column width changes, so this alone is enough to preserve
		// the 1:1 ratio without any other layout changes.
		$scope.deptTileClass = eligible.length <= 2 ? 'col-sm-6' : (eligible.length == 3 ? 'col-sm-4' : 'col-sm-3');

		// Deferred until the real featured category (with its actual, possibly-suffixed
		// InteropID) is resolved above, rather than searching on the bare config prefix directly -
		// guarded so this only ever fires once even though computeHomeCategoryLists() re-runs
		// whenever the tree reloads.
		if ($scope.isHome && $scope.featuredCategory && !$scope.featuredProductsFetched) {
			$scope.featuredProductsFetched = true;
			Product.search($scope.featuredCategory.InteropID, null, null, function (products) {
				$scope.featuredProducts = products;
			}, 1, 20);
		}
	}
	computeHomeCategoryLists();

	// Quick add-to-cart from a product card (home featured carousel and PLP grid). Product.search()
	// list results don't reliably carry VariantCount/Specs the way the full product detail fetch
	// does, so we never decide "can this be quick-added" from list data - canQuickAdd() below is
	// only a pre-fetch optimization to skip an unnecessary request for obviously non-simple
	// products. The real decision happens against the authoritative product fetched via
	// Product.get() (same call productCtrl.js's PDP flow uses), every time a card is clicked. This
	// replaces an earlier version that trusted the list-level VariantCount and let a product that
	// actually needed Location/Size options through, which failed server-side and briefly showed
	// the customer a raw server exception - see git history for that hotfix.
	//
	// Kit and VariableText products still fall back to "Select Options" -> the full product page
	// directly, since those are multi-step flows that don't fit a modal. Anything else with
	// variants/specs opens QuickAddModalCtrl, which fetches the same ProductDisplayService setup
	// the real PDP uses and shows its own "Select Options" fallback if it turns out the product
	// needs something the modal can't handle either (a bulk multi-variant list, or a required
	// custom spec that isn't itself a variant-defining dropdown).
	$scope.quickAddIndicator = {};
	$scope.quickAddNeedsOptions = {};
	// A real Order.save() failure on a simple (variant-less) product - wrong price schedule
	// state, a quantity restriction, an approval-workflow rule, anything server-side - is a
	// different failure mode from "this product genuinely needs the full PDP to choose
	// options," and showing the "needs options" UI for it is actively misleading on a product
	// that has no options at all. Keyed by InteropID like the other two, holding the server's
	// own message instead of a generic label.
	$scope.quickAddError = {};
	$scope.canQuickAdd = function(product) {
		return product && product.Type != 'VariableText' && product.Type != 'Kit';
	};

	// Card-level mirror of productCtrl.js's outOfInventory(), against the lighter
	// Product.search() list shape instead of a LineItem/Variant wrapper. Only meaningful for a
	// simple (variant-less) product - a card for a product with variants has no selected variant
	// to check inventory against, same as the PDP before one's chosen, so it's left showing a
	// normal Add to Cart button (quick-add opens the modal, where a variant gets picked).
	$scope.productOutOfInventory = function(product) {
		if (!product || !product.StandardPriceSchedule) return false;
		if (product.Variants && product.Variants.length > 0) return false;
		if (product.AllowExceedInventory) return false;
		if (product.StandardPriceSchedule.OrderType == 'Replenishment') return false;
		if (!product.InventoryEnabled) return false;
		return (product.QuantityAvailable > 0 ? product.QuantityAvailable : 0) <= 0;
	};

	// Neither function below assigns $scope.currentOrder itself, on purpose - this controller
	// (categoryCtrl.js, via ng-view) is a real descendant of Four51Ctrl's scope, so a direct
	// assignment here does work for this page's OWN reads, but it also permanently SHADOWS the
	// inherited value from that point on: this scope stops picking up Four51Ctrl's own
	// event:orderUpdate-driven updates (see that listener there), since a shadowing own-property
	// always wins over inheritance once set. First add-to-cart on a page looked fine (nothing
	// shadowed yet), but removing that item from the mini-cart afterward correctly updated
	// Four51Ctrl's real currentOrder while this scope's now-shadowed copy stayed frozen on the
	// stale order - so a second add-to-cart merged into a LineItem the server had already
	// deleted, and came back with a raw "Object reference not set to an instance of an object"
	// exception. Using a local variable here instead, and letting Order.save's own
	// event:orderUpdate broadcast (it fires on success too, not just failure) update the real,
	// inherited currentOrder, keeps this page in sync indefinitely instead of just once.
	function addSimpleProductToCart(product) {
		var order = $scope.currentOrder || { LineItems: [] };
		if (!order.LineItems) order.LineItems = [];
		var lineItem = {
			Product: product,
			PriceSchedule: product.StandardPriceSchedule,
			Quantity: 1
		};
		var pending = ProductDisplayService.addOrMergeLineItem(order, lineItem);
		order.Type = lineItem.PriceSchedule.OrderType;
		Order.clearshipping(order).save(order,
			function(o) {
				$scope.quickAddIndicator[product.InteropID] = false;
				$scope.user.CurrentOrderID = o.ID;
				$rootScope.$broadcast('event:addedToCart', { product: product, quantity: lineItem.Quantity });
				// Merges the server's response into the EXISTING user object instead of
				// replacing $scope.user with it - the same shadowing bug as currentOrder above,
				// just one property over: "$scope.user = u" creates an own property on this
				// (descendant) scope that disconnects it from Four51Ctrl's real $scope.user from
				// that point on. The first add-to-cart in a page session still worked (Four51Ctrl's
				// event:orderUpdate guard checks $scope.user.CurrentOrderID before this callback's
				// own User.save had returned and shadowed it), but any add after that mutated only
				// this scope's now-disconnected copy - Four51Ctrl's real user.CurrentOrderID never
				// updated, so its guard silently stopped matching and currentOrder stopped syncing,
				// while cartCount (computed straight from the broadcast, no such guard) kept
				// updating - exactly the "badge says 1, mini-cart says empty" split reported live.
				User.save($scope.user, function(u) {
					angular.extend($scope.user, u);
				});
			},
			function(ex) {
				pending.undo();
				$scope.quickAddIndicator[product.InteropID] = false;
				$scope.quickAddError[product.InteropID] = (ex && (ex.Detail || ex.Message)) || 'Unable to add to cart.';
			}
		);
	}

	function openQuickAddModal(product) {
		$scope.quickAddIndicator[product.InteropID] = false;
		$modal.open({
			// Without an explicit scope, ui-bootstrap 0.10 parents the modal's scope to $rootScope -
			// ABOVE Four51Ctrl on <html> - so the modal never inherits $scope.user, and
			// QuickAddModalCtrl's "$scope.user.CurrentOrderID = o.ID" threw a TypeError right after
			// the order had already saved server-side: modal stuck on its spinner, mini-cart never
			// updated (the throw also skipped Order.save's event:orderUpdate broadcast).
			scope: $scope,
			templateUrl: 'partials/controls/quickAddModal.html',
			controller: 'QuickAddModalCtrl',
			resolve: {
				product: function() { return product; },
				currentOrder: function() { return $scope.currentOrder; }
			}
		}).result.then(angular.noop, angular.noop);
	}

	function hasVariantOrSpec(product) {
		if (product.VariantCount > 0) return true;
		var found = false;
		angular.forEach(product.Specs, function(s) {
			if (s.CanSetForLineItem || s.DefinesVariant) found = true;
		});
		return found;
	}

	$scope.quickAddToCart = function(product) {
		$scope.quickAddNeedsOptions[product.InteropID] = false;
		$scope.quickAddError[product.InteropID] = null;
		$scope.quickAddIndicator[product.InteropID] = true;
		Product.clearCache().get(product.InteropID, function(fullProduct) {
			if (fullProduct.Type == 'Kit' || fullProduct.Type == 'VariableText') {
				$scope.quickAddIndicator[product.InteropID] = false;
				$scope.quickAddNeedsOptions[product.InteropID] = true;
				return;
			}
			if (hasVariantOrSpec(fullProduct)) {
				openQuickAddModal(fullProduct);
				return;
			}
			addSimpleProductToCart(fullProduct);
		});
	};
	$scope.productLoadingIndicator = true;
	$scope.settings = {
		currentPage: 1,
		pageSize: 40
	};
	$scope.trusted = function(d){
		if(d) return $sce.trustAsHtml(d);
	}

	function _search() {
		$scope.searchLoading = true;
		Product.search($routeParams.categoryInteropID, null, null, function (products, count) {
			$scope.products = products;
			$scope.productCount = count;
			$scope.productLoadingIndicator = false;
			$scope.searchLoading = false;
		}, $scope.settings.currentPage, $scope.settings.pageSize);
	}

	$scope.$watch('settings.currentPage', function(n, o) {
		if (n != o || (n == 1 && o == 1))
			_search();
	});

	if ($routeParams.categoryInteropID) {
	    $scope.categoryLoadingIndicator = true;
        Category.get($routeParams.categoryInteropID, function(cat) {
            $scope.currentCategory = cat;
	        $scope.categoryLoadingIndicator = false;
        });
    }
	else if($scope.tree){
		$scope.currentCategory ={SubCategories:$scope.tree};
	}


	$scope.$on("treeComplete", function(data){
		if (!$routeParams.categoryInteropID) {
			$scope.currentCategory ={SubCategories:$scope.tree};
		}
		computeHomeCategoryLists();
	});

	// Bound via ng-model to an object property (not a bare "sort" primitive) since the PLP
	// section renders inside an ng-if (".mt-plp"), which creates its own child scope - a bare
	// ng-model="sort" would shadow this controller's own $scope.sort on that child scope instead
	// of updating it, so this $watch would never fire and the sort dropdown would silently do
	// nothing. Binding through a shared object (sortSelection) sidesteps that, since descendant
	// scopes read/write the same object via the prototype chain regardless of how many scopes
	// sit in between.
	$scope.sortSelection = {};
	$scope.$watch('sortSelection.value', function(s) {
		if (!s) return;
		(s.indexOf('Price') > -1) ?
			$scope.sorter = 'StandardPriceSchedule.PriceBreaks[0].Price' :
			$scope.sorter = s.replace(' DESC', "");
		$scope.direction = s.indexOf('DESC') > -1;
	});
}]);