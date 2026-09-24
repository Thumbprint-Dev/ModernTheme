four51.app.controller('ProductCtrl', ['$scope', '$rootScope', '$routeParams', '$route', '$location', '$451', 'Product', 'ProductDisplayService', 'Order', 'Variant', 'User', 'AppConst',
function ($scope, $rootScope, $routeParams, $route, $location, $451, Product, ProductDisplayService, Order, Variant, User, AppConst) {
    $scope.isEditforApproval = $routeParams.orderID && $scope.user.Permissions.contains('EditApprovalOrder');
    if ($scope.isEditforApproval) {
        Order.get($routeParams.orderID, function(order) {
            $scope.currentOrder = order;
        });
    }

    // Four51 InteropIDs are unique platform-wide, so Featured/All Products may carry a
    // uniqueness suffix (e.g. "featured-gp") - match by prefix. Mirrors the same helper
    // navCtrl.js/categoryCtrl.js already use to keep those utility categories out of the nav
    // and the home page's category tiles - a breadcrumb shouldn't show them either.
    function startsWithInteropID(fullID, prefix) {
        return !!fullID && !!prefix && fullID.toLowerCase().indexOf(prefix.toLowerCase()) === 0;
    }

    // Products carry no category reference of their own - the catalog listing (mtProductCard.html)
    // appends ?cat=<InteropID> to the product link, and this resolves that leaf category's
    // ancestor chain from the already-loaded nav tree ($scope.tree, set in Four51Ctrl.js).
    // Arriving without that query param (search, a direct link, a related-product click) just
    // means no breadcrumb category shows - there's nothing to reconstruct it from.
    $scope.categoryPath = function(){
        var catID = $location.search().cat;
        if (!catID || !$scope.tree) return [];
        var path = null;
        angular.forEach($scope.tree, function(cat){
            if (path) return;
            if (cat.InteropID === catID) path = [cat];
            else angular.forEach(cat.SubCategories, function(sub){
                if (!path && sub.InteropID === catID) path = [cat, sub];
            });
        });
        if (!path) return [];
        return path.filter(function(cat){
            return !startsWithInteropID(cat.InteropID, AppConst.featuredCategoryInteropID) &&
                   !startsWithInteropID(cat.InteropID, AppConst.allProductsCategoryInteropID);
        });
    };

    $scope.selected = 1;
    $scope.LineItem = {};
	$scope.addToOrderText = "Add To Cart";
	$scope.loadingIndicator = true;
	$scope.loadingImage = true;
	$scope.searchTerm = null;
	$scope.settings = {
		currentPage: 1,
		pageSize: 10
	};

	$scope.calcVariantLineItems = function(i){
		$scope.variantLineItemsOrderTotal = 0;
		angular.forEach($scope.variantLineItems, function(item){
			$scope.variantLineItemsOrderTotal += item.LineTotal || 0;
		})
	};
	$scope.outOfInventory = function(){
		var li = $scope.LineItem;
		if ($scope.allowAddFromVariantList || !li.Product || !li.PriceSchedule) return false;
		if (!(li.Variant || li.Product.Variants.length == 0)) return false;
		if (li.Product.AllowExceedInventory) return false;
		if (li.PriceSchedule.OrderType == 'Replenishment') return false;
		if (!$scope.isInventoryTracked(li.Product, li.Variant)) return false;
		return $scope.inventoryDisplay(li.Product, li.Variant) <= 0;
	};
	function setDefaultQty(lineitem) {
		// Restricted-quantity price schedules only allow specific break quantities (e.g. 100 /
		// 250 / 500 / 1000) via a <select>, not an arbitrary number - defaulting to 1 here set a
		// value that matched none of those options, so quantityfield.js's <select> showed blank
		// (Angular can't select an option that doesn't exist) while the real underlying value
		// (1) still failed the MinQuantity check, showing a "must be equal or greater than 100"
		// error before the customer had touched the page. Leaving Quantity unset instead lets
		// the field start genuinely empty, matching what the dropdown shows, with no error until
		// the customer actually picks a quantity.
		if (lineitem.PriceSchedule && lineitem.PriceSchedule.RestrictedQuantity) {
			// Exception: with exactly one valid option, selecting it is always safe (it can't
			// mismatch anything) and saves the shopper a dropdown click for a "choice" they
			// don't actually have.
			var breaks = lineitem.PriceSchedule.PriceBreaks;
			if (breaks && breaks.length == 1)
				$scope.LineItem.Quantity = breaks[0].Quantity;
			return;
		}
		if (lineitem.PriceSchedule && lineitem.PriceSchedule.DefaultQuantity != 0)
			$scope.LineItem.Quantity = lineitem.PriceSchedule.DefaultQuantity;
		else
			$scope.LineItem.Quantity = 1;
	}
	function init(searchTerm, callback) {
		ProductDisplayService.getProductAndVariant($routeParams.productInteropID, $routeParams.variantInteropID, function (data) {
			$scope.LineItem.Product = data.product;
			$scope.LineItem.Variant = data.variant;
			ProductDisplayService.setNewLineItemScope($scope);
			ProductDisplayService.setProductViewScope($scope);
			setDefaultQty($scope.LineItem);
			$scope.$broadcast('ProductGetComplete');
			$scope.loadingIndicator = false;
			$scope.setAddToOrderErrors();
			if (angular.isFunction(callback))
				callback();
		}, $scope.settings.currentPage, $scope.settings.pageSize, searchTerm);
	}
	$scope.$watch('settings.currentPage', function(n, o) {
		if (n != o || (n == 1 && o == 1))
			init($scope.searchTerm);
	});

	$scope.searchVariants = function(searchTerm) {
		$scope.searchTerm = searchTerm;
		$scope.settings.currentPage == 1 ?
			init(searchTerm) :
			$scope.settings.currentPage = 1;
	};

	$scope.deleteVariant = function(v, redirect) {
		if (!v.IsMpowerVariant) return;
		// doing this because at times the variant is a large amount of data and not necessary to send all that.
		var d = {
			"ProductInteropID": $scope.LineItem.Product.InteropID,
			"InteropID": v.InteropID
		};
		Variant.delete(d,
			function() {
				redirect ? $location.path('/product/' + $scope.LineItem.Product.InteropID) : $route.reload();
			},
			function(ex) {
				if ($scope.lineItemErrors.indexOf(ex.Message) == -1) $scope.lineItemErrors.unshift(ex.Message);
				$scope.showAddToCartErrors = true;
			}
		);
	}

	// What the "Added to cart" toast shows. The variant-list flow can add several variants at
	// once, so it reports the product with their combined quantity rather than one variant's.
	function addedToCartDetails() {
		if ($scope.allowAddFromVariantList) {
			var quantity = 0;
			angular.forEach($scope.variantLineItems, function(item) {
				if (item.Quantity > 0) quantity += Number(item.Quantity);
			});
			return { product: $scope.LineItem.Product, quantity: quantity };
		}
		return { product: $scope.LineItem.Product, variant: $scope.LineItem.Variant, quantity: $scope.LineItem.Quantity };
	}

	// Uses a local "order" variable rather than reading/writing $scope.currentOrder throughout,
	// on purpose - this controller (productCtrl.js, via ng-view) is a real descendant of
	// Four51Ctrl's scope, so the old "if (!$scope.currentOrder) $scope.currentOrder = {}"
	// pattern, the moment it ran once with no existing cart, created a permanent OWN property on
	// THIS scope that shadows Four51Ctrl's inherited one from then on - this page would stop
	// picking up Four51Ctrl's own event:orderUpdate-driven updates (e.g. a mini-cart removal)
	// for the rest of its lifetime, exactly the bug fixed in categoryCtrl.js's
	// addSimpleProductToCart (see that comment for the full trace - same class of bug, same fix).
	// Order.save's own event:orderUpdate broadcast (fires on success too) keeps the real,
	// inherited currentOrder in sync without this controller ever touching it directly.
	$scope.addToOrder = function(){
		if($scope.lineItemErrors && $scope.lineItemErrors.length){
			$scope.showAddToCartErrors = true;
			return;
		}
		var order = $scope.currentOrder || { LineItems: [] };
		if (!order.LineItems)
			order.LineItems = [];
		var pendingAdds = [];
		if($scope.allowAddFromVariantList){
			angular.forEach($scope.variantLineItems, function(item){
				if(item.Quantity > 0){
					pendingAdds.push(ProductDisplayService.addOrMergeLineItem(order, item));
					order.Type = item.PriceSchedule.OrderType;
				}
			});
		}else{
			pendingAdds.push(ProductDisplayService.addOrMergeLineItem(order, $scope.LineItem));
			order.Type = $scope.LineItem.PriceSchedule.OrderType;
		}
		$scope.addToOrderIndicator = true;
		// shipper rates are not recalcuated when a line item is added. clearing out the shipper to force new selection, like 1.0
		Order.clearshipping(order).
			save(order,
				function(o){
					$scope.user.CurrentOrderID = o.ID;
					User.save($scope.user, function(){
						$scope.addToOrderIndicator = false;
						// Editing a line item on an order already under approval is a "make the
						// change and go back to reviewing it" flow, not exploratory shopping -
						// keep sending that case to the order. A normal add-to-cart stays on the
						// page and lets the shopper keep browsing; the "Added to cart" toast
						// (directives/cartToast.js) confirms it instead of forcing a jump to /cart.
						if ($scope.isEditforApproval) {
							$location.path('/cart/' + o.ID);
						} else {
							$rootScope.$broadcast('event:addedToCart', addedToCartDetails());
						}
					});
				},
				function(ex) {
					angular.forEach(pendingAdds, function(pending) { pending.undo(); });
					$scope.addToOrderIndicator = false;
					$scope.lineItemErrors.push(ex.Detail);
					$scope.showAddToCartErrors = true;
					//$route.reload();
				}
		);
	};

	$scope.setOrderType = function(type) {
		$scope.loadingIndicator = true;
		$scope.currentOrder = { 'Type': type };
		init(null, function() {
			$scope.loadingIndicator = false;
		});
	};

	$scope.$on('event:imageLoaded', function(event, result) {
		$scope.loadingImage = false;
		$scope.$apply();
	});
}]);