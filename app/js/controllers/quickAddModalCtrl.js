four51.app.controller('QuickAddModalCtrl', ['$scope', '$modalInstance', 'product', 'currentOrder', 'ProductDisplayService', 'Order', 'User',
function ($scope, $modalInstance, product, currentOrder, ProductDisplayService, Order, User) {
	// currentOrder is passed in as a snapshot rather than inherited via scope prototypal chaining,
	// so the result is handed back to the opener explicitly via $modalInstance.close(order) instead
	// of relying on a child scope reassignment that would never actually reach the caller's scope.
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
			$scope.LineItem.Quantity = ($scope.LineItem.PriceSchedule && $scope.LineItem.PriceSchedule.DefaultQuantity) || 1;
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
