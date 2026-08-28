four51.app.controller('CategoryCtrl', ['$routeParams', '$sce', '$scope', '$451', 'Category', 'Product', 'Nav', 'AppConst', 'Order', 'User',
function ($routeParams, $sce, $scope, $451, Category, Product, Nav, AppConst, Order, User) {
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
	// products. The real decision happens in needsFullPdp(), against the authoritative product
	// fetched via Product.get() (same call productCtrl.js's PDP flow uses), every time a card is
	// clicked. This replaces an earlier version that trusted the list-level VariantCount and let a
	// product that actually needed Location/Size options through, which failed server-side and
	// briefly showed the customer a raw server exception - see git history for that hotfix.
	//
	// A product with real variants or specs still falls back to "Select Options" -> the full
	// product page for now; a modal for the simple variant-selection case is a planned follow-up.
	$scope.quickAddIndicator = {};
	$scope.quickAddNeedsOptions = {};
	$scope.canQuickAdd = function(product) {
		return product && product.Type != 'VariableText' && product.Type != 'Kit';
	};

	function needsFullPdp(product) {
		if (product.Type == 'Kit' || product.Type == 'VariableText') return true;
		if (product.VariantCount > 0) return true;
		var needsSpec = false;
		angular.forEach(product.Specs, function(s) {
			if (s.Required) needsSpec = true;
		});
		return needsSpec;
	}

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

	$scope.quickAddToCart = function(product) {
		$scope.quickAddNeedsOptions[product.InteropID] = false;
		$scope.quickAddIndicator[product.InteropID] = true;
		Product.clearCache().get(product.InteropID, function(fullProduct) {
			if (needsFullPdp(fullProduct)) {
				$scope.quickAddIndicator[product.InteropID] = false;
				$scope.quickAddNeedsOptions[product.InteropID] = true;
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