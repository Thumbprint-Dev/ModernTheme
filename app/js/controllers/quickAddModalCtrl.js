four51.app.controller('QuickAddModalCtrl', ['$scope', '$rootScope', '$modalInstance', 'product', 'currentOrder', 'ProductDisplayService', 'Order', 'User',
function ($scope, $rootScope, $modalInstance, product, currentOrder, ProductDisplayService, Order, User) {
	// currentOrder is resolved in explicitly; the real, shared currentOrder is kept in sync by
	// Four51Ctrl's event:orderUpdate listener once Order.save below broadcasts. This scope is a
	// child of the opening CategoryCtrl scope (categoryCtrl.js passes scope: $scope), which is
	// what lets $scope.user resolve here at all.
	$scope.currentOrder = currentOrder;
	$scope.settings = { currentPage: 1, pageSize: 10 };
	$scope.LineItem = { Product: product };
	$scope.modalLoading = true;

	User.get(function (user) {
		$scope.user = user;

		// Mirrors kitCtrl.js's setup sequence for the same ProductDisplayService calls.
		ProductDisplayService.setNewLineItemScope($scope);
		ProductDisplayService.setProductViewScope($scope);

		// Kit, VariableText, and the bulk multi-variant list flow (allowAddFromVariantList) all need
		// the full product page - out of scope for this modal. Same for any required custom spec
		// that isn't itself a variant-defining dropdown (free text/date/file specs aren't rendered
		// here in v1).
		$scope.needsFullPdpFallback = product.Type == 'Kit' || product.Type == 'VariableText' || $scope.allowAddFromVariantList;
		if (!$scope.needsFullPdpFallback) {
			angular.forEach($scope.LineItem.Specs, function (s) {
				if (s.Required && !s.DefinesVariant) $scope.needsFullPdpFallback = true;
			});
		}

		if (!$scope.needsFullPdpFallback) {
			var qaPs = $scope.LineItem.PriceSchedule;
			if (qaPs && qaPs.RestrictedQuantity) {
				// Skip defaulting for restricted-quantity price schedules (only specific break
				// quantities allowed via a <select>, not an arbitrary number) - see the matching
				// fix + full explanation in productCtrl.js's setDefaultQty. Exception: with
				// exactly one valid option, selecting it is always safe (it can't mismatch
				// anything) and saves the shopper a dropdown click for a "choice" they don't
				// actually have.
				if (qaPs.PriceBreaks && qaPs.PriceBreaks.length == 1) {
					$scope.LineItem.Quantity = qaPs.PriceBreaks[0].Quantity;
				}
			} else {
				$scope.LineItem.Quantity = (qaPs && qaPs.DefaultQuantity) || 1;
			}
		}

		$scope.modalLoading = false;
	});

	$scope.close = function () {
		$modalInstance.dismiss();
	};

	$scope.confirmAdd = function () {
		$scope.addAttempted = true;
		if ($scope.lineItemErrors && $scope.lineItemErrors.length) {
			return;
		}
		$scope.addToOrderIndicator = true;
		if (!$scope.currentOrder) {
			$scope.currentOrder = {};
		}
		if (!$scope.currentOrder.LineItems) $scope.currentOrder.LineItems = [];
		var pending = ProductDisplayService.addOrMergeLineItem($scope.currentOrder, $scope.LineItem);
		$scope.currentOrder.Type = $scope.LineItem.PriceSchedule.OrderType;
		Order.clearshipping($scope.currentOrder).save($scope.currentOrder,
			function (o) {
				$scope.user.CurrentOrderID = o.ID;
				User.save($scope.user, function () {
					$modalInstance.close(o);
					$rootScope.$broadcast('event:addedToCart', { product: $scope.LineItem.Product, variant: $scope.LineItem.Variant, quantity: $scope.LineItem.Quantity });
				});
			},
			function (ex) {
				pending.undo();
				$scope.addToOrderIndicator = false;
				$scope.errorMessage = ex.Message;
			}
		);
	};
}]);
