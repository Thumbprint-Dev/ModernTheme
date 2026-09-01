four51.app.controller('KitCtrl', ['$scope', '$location', '$routeParams', 'Kit', 'ProductDisplayService', 'Order', 'User', function($scope, $location, $routeParams, Kit, ProductDisplayService, Order, User) {
	$scope.addToOrderText = 'Add Kit to Cart';
	$scope.updateKitLineItemText = 'Update';

	$scope.settings = {
		currentPage: 1,
		pageSize: 10
	};

	// initial load. start from the kit parent
	Kit.get($routeParams.id).then(kitSuccess);

	function kitSuccess(kit) {
		$scope.LineItem = $routeParams.lineitemid ? $scope.currentOrder.LineItems[$routeParams.lineitemid] : {};
		if($routeParams.lineitemid){
			$scope.kitIndex = $routeParams.lineitemid;
		}
		$scope.LineItem.IsKitParent = true;
		$scope.Kit = kit;
		setupProduct(kit.KitParent, null, null, function(){
			if ($scope.LineItem.ID) {
				updateAddToOrderText();
				Kit.mapKitToOrder($scope.Kit, $scope.LineItem);
				var newVariant = store.get("kitItem");
				if(newVariant){
					angular.forEach($scope.Kit.KitItems, function(item){
						if(item.LineItem && item.LineItem.Product && item.LineItem.Product.InteropID === newVariant){
							setCurrent(item);
							store.remove("kitItem");
						}
					});
				} else {
					// Land straight on whatever still needs configuring - whether this is the
					// first visit right after "Start Configuring", or the shopper came back to
					// an in-progress kit from the cart - instead of making them click into the
					// sidebar themselves. A fully-configured kit finds nothing and simply stays
					// on the kit-parent panel.
					var next = findNextUnconfiguredItem();
					if (next) setCurrent(next);
				}
			} else {
				// The server only knows which components actually need configuring once this
				// kit exists as a real order line item - that's what this first save creates.
				// Label it as the first step of the wizard rather than a separate "add to cart"
				// action when there's more to configure after it.
				if (kit.KitHasConfigurableItems) {
					$scope.addToOrderText = 'Start Configuring';
				}
				if (!$scope.LineItem.Quantity && !($scope.LineItem.PriceSchedule && $scope.LineItem.PriceSchedule.RestrictedQuantity)) {
					// Skip defaulting for restricted-quantity price schedules (only specific break
					// quantities allowed via a <select>, not an arbitrary number) - see the matching
					// fix + full explanation in productCtrl.js's setDefaultQty.
					$scope.LineItem.Quantity = ($scope.LineItem.PriceSchedule && $scope.LineItem.PriceSchedule.DefaultQuantity) || 1;
				}
			}
		});
	}

	$scope.saveOrder = saveOrder;
	$scope.saveKitItem = saveItem;
	$scope.setItemAsCurrent = setCurrent;
	$scope.showKitParent = showKitParent;
	$scope.calcVariantLineItems = calcVariantLineItems;
	$scope.selectVariant = selectVariant;
	$scope.searchVariants = searchVariants;
	$scope.$watch('settings.currentPage',changePage);

	function changePage(n,o) {
		if (!$scope.LineItem) return;
		if (n != o || (n == 1 && o == 1))
			setupProduct($scope.LineItem.Product, null, $scope.searchTerm);
	}

	function searchVariants(searchTerm) {
		$scope.searchTerm = searchTerm;
		$scope.settings.currentPage == 1 ?
			setupProduct($scope.LineItem.Product, null, searchTerm) :
			$scope.settings.currentPage = 1;
	}

	function selectVariant(variant) {
		angular.forEach($scope.LineItem.Product.Variants, function(v) {
			if (v.Selected) v.Selected = false;
		});
		variant.Selected = true;
		$scope.LineItem.Variant = variant;
	}

	function setCurrent(item) {
		if (!item.LineItem.IsConfigurable) return;
		$scope.LineItem = item.LineItem;
		$scope.LineItem.Quantity = item.Quantity;
		$scope.ActiveKitItem = item;
		setupProduct(item.LineItem.Product, item.LineItem.Variant);
	}

	// Guides the shopper back to the kit-parent "Order" panel once every configurable
	// component is done. Re-derives LineItem from currentOrder rather than a cached
	// reference, since saveItem() replaces currentOrder (and its pricing) on every save.
	function showKitParent() {
		$scope.ActiveKitItem = null;
		$scope.LineItem = $scope.currentOrder.LineItems[$scope.kitIndex];
		updateAddToOrderText();
		setupProduct($scope.Kit.KitParent, null);
	}

	// $scope.LineItem is the same object as $scope.currentOrder.LineItems[kitIndex] whenever
	// the kit-parent panel is showing, so LineItem.KitIsInvalid (computed by orderService's
	// _extend()) reflects real-time whether anything configurable is still outstanding - not
	// just whether this kit's type is capable of having configurable items.
	function updateAddToOrderText() {
		$scope.addToOrderText = ($scope.Kit.KitHasConfigurableItems && !$scope.LineItem.KitIsInvalid) ?
			'Save & Add to Cart' : 'Update Kit';
	}

	function findNextUnconfiguredItem() {
		var found = null;
		angular.forEach($scope.Kit.KitItems, function(item) {
			if (!found && item.LineItem.IsConfigurable && !item.LineItem.IsConfigured) found = item;
		});
		return found;
	}

	function setupProduct(product, variant, searchTerm, success) {
		// have to empty this because the scope is held in the service singleton and inherits any previous variants
		$scope.variantLineItems = null;
		ProductDisplayService.getProductAndVariant(product.InteropID, variant ? variant.InteropID : null, function (data) {
			$scope.LineItem.Product = data.product;
			//$scope.LineItem.Variant = data.variant; // should never be a variant
			ProductDisplayService.setNewLineItemScope($scope);
			ProductDisplayService.setProductViewScope($scope);
			if ($scope.variantLineItems) {
				angular.forEach($scope.variantLineItems, function(li) {
					li.Quantity = $scope.LineItem.Quantity;
				});
			}
			$scope.setAddToOrderErrors();
			$scope.allowAddToOrder = true;
			if(success) success();
		}, $scope.settings.currentPage, $scope.settings.pageSize, searchTerm);
	}

	function calcVariantLineItems() {
		$scope.variantLineItemsOrderTotal = 0;
		angular.forEach($scope.variantLineItems, function(item){
			$scope.variantLineItemsOrderTotal += item.LineTotal || 0;
		});
	}

	function saveOrder() {
		$scope.addToOrderIndicator = true;
		$scope.showAddToCartErrors = false;

		if ($scope.lineItemErrors && $scope.lineItemErrors.length) {
			$scope.showAddToCartErrors = true;
			$scope.addToOrderIndicator = false;
			return;
		}

		$scope.currentOrder = $scope.currentOrder || {};
		$scope.currentOrder.LineItems = $scope.currentOrder.LineItems || [];
		if (!$scope.LineItem.ID)
			$scope.currentOrder.LineItems.push($scope.LineItem);

		$scope.currentOrder.Type = $scope.LineItem.PriceSchedule.OrderType;
		Kit.saveOrder($scope.currentOrder, success, fail);

		function success(order) {
			$scope.currentOrder = order;
			$scope.kitIndex = $routeParams.lineitemid ? $routeParams.lineitemid : $scope.currentOrder.LineItems.length - 1;
			var currentLineItem = order.LineItems[$scope.kitIndex];
			Kit.mapKitToOrder($scope.Kit, currentLineItem);
			$scope.user.CurrentOrderID = order.ID;
			User.save($scope.user, function () {
				$scope.addToOrderIndicator = false;
				// Go straight to the cart once there's nothing left to configure - either the
				// kit never had configurable items, or everything that did has since been
				// completed (this is the "Save & Add to Cart" click after finishing the last
				// component). KitHasConfigurableItems alone only tells you the kit's TYPE can
				// have configurable items, not whether any are still outstanding right now -
				// currentLineItem.KitIsInvalid (fresh off this save) is what actually answers
				// "is there still something to do."
				if (!$scope.Kit.KitHasConfigurableItems || !currentLineItem.KitIsInvalid){
					$location.path('/cart');
				}
				else{
					$location.path('/kit/' + $routeParams.id + "/" + $scope.kitIndex);
				}
			});
			setupProduct(currentLineItem.Product, currentLineItem.Variant);
		}

		function fail(ex) {
			$scope.addToOrderIndicator = false;
			$scope.lineItemErrors.push(ex.Detail);
			$scope.showAddToCartErrors = true;
		}
	}

	function saveItem() {
		$scope.addToOrderIndicator = true;
		$scope.showAddToCartErrors = false;

		Order.save($scope.currentOrder, success, error);

		function success(order) {
			$scope.kitIndex = $routeParams.lineitemid ? $routeParams.lineitemid : $scope.currentOrder.LineItems.length - 1;
			$scope.currentOrder = order;
			$scope.addToOrderIndicator = false;
			$scope.lineItemErrors = null;
			Kit.mapKitToOrder($scope.Kit,  order.LineItems[$scope.kitIndex]);

			// Guide the shopper straight to whatever still needs configuring instead of
			// leaving them to hunt for it in the sidebar; once nothing's left, drop them
			// back on the kit-parent panel so they can add/update the kit in cart.
			var next = findNextUnconfiguredItem();
			if (next) {
				setCurrent(next);
			} else {
				showKitParent();
			}
		}

		function error(ex) {
			$scope.addToOrderIndicator = false;
			$scope.lineItemErrors.push(ex.Detail);
			$scope.showAddToCartErrors = true;
		}
	}
}]);
