four51.app.controller('CategoryCtrl', ['$routeParams', '$sce', '$scope', '$451', 'Category', 'Product', 'AppConst', 'Order', 'User', '$modal', 'ProductDisplayService',
function ($routeParams, $sce, $scope, $451, Category, Product, AppConst, Order, User, $modal, ProductDisplayService) {
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
	$scope.canQuickAdd = function(product) {
		return product && product.Type != 'VariableText' && product.Type != 'Kit';
	};

	function addSimpleProductToCart(product) {
		if (!$scope.currentOrder) {
			$scope.currentOrder = {};
			$scope.currentOrder.LineItems = [];
		}
		if (!$scope.currentOrder.LineItems) $scope.currentOrder.LineItems = [];
		var lineItem = {
			Product: product,
			PriceSchedule: product.StandardPriceSchedule,
			Quantity: 1
		};
		var pending = ProductDisplayService.addOrMergeLineItem($scope.currentOrder, lineItem);
		$scope.currentOrder.Type = lineItem.PriceSchedule.OrderType;
		Order.clearshipping($scope.currentOrder).save($scope.currentOrder,
			function(o) {
				$scope.currentOrder = o;
				$scope.quickAddIndicator[product.InteropID] = false;
				$scope.user.CurrentOrderID = o.ID;
				User.save($scope.user, function(u) {
					$scope.user = u;
				});
			},
			function(ex) {
				pending.undo();
				$scope.quickAddIndicator[product.InteropID] = false;
				$scope.quickAddNeedsOptions[product.InteropID] = true;
			}
		);
	}

	function openQuickAddModal(product) {
		$scope.quickAddIndicator[product.InteropID] = false;
		$modal.open({
			templateUrl: 'partials/controls/quickAddModal.html',
			controller: 'QuickAddModalCtrl',
			resolve: {
				product: function() { return product; },
				currentOrder: function() { return $scope.currentOrder; }
			}
		}).result.then(function(updatedOrder) {
			$scope.currentOrder = updatedOrder;
		}, angular.noop);
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