four51.app.controller('CategoryCtrl', ['$routeParams', '$sce', '$scope', '$451', 'Category', 'Product', 'Nav', 'AppConst', 'Order', 'User', '$modal',
function ($routeParams, $sce, $scope, $451, Category, Product, Nav, AppConst, Order, User, $modal) {
	$scope.isHome = !$routeParams.categoryInteropID;
	$scope.isNotFeaturedCategory = function(cat) {
		return cat.InteropID !== AppConst.featuredCategoryInteropID;
	};
	if ($scope.isHome) {
		// "Featured for your team" pulls from a dedicated real category (see AppConst.featuredCategoryInteropID)
		// rather than a platform-wide "all products" query, which Product.search doesn't support unscoped.
		Product.search(AppConst.featuredCategoryInteropID, null, null, function (products) {
			$scope.featuredProducts = products;
		}, 1, 20);
	}

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
		$scope.currentOrder.LineItems.push(lineItem);
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
				$scope.currentOrder.LineItems.pop();
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
	});

    // panel-nav
    $scope.navStatus = Nav.status;
    $scope.toggleNav = Nav.toggle;
	$scope.$watch('sort', function(s) {
		if (!s) return;
		(s.indexOf('Price') > -1) ?
			$scope.sorter = 'StandardPriceSchedule.PriceBreaks[0].Price' :
			$scope.sorter = s.replace(' DESC', "");
		$scope.direction = s.indexOf('DESC') > -1;
	});
}]);