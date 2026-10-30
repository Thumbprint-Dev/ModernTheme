four51.app.directive('orderbilling', ['Address', 'AddressList', 'Order', function(Address, AddressList, Order) {
	var obj = {
		restrict: 'AE',
		templateUrl: 'partials/controls/orderBilling.html',
		controller: ['$scope', function($scope) {
			$scope.saveOrderBilling = function() {
				Order.save($scope.currentOrder,
					function(data) {
						// Read these at response time, not before the request went out - a value
						// set while this save was in flight would otherwise get clobbered by a
						// stale pre-request snapshot.
						var billAddressID = $scope.currentOrder.BillAddressID;
						var budgetAccountID = $scope.currentOrder.BudgetAccountID;
						var creditCardID = $scope.currentOrder.CreditCardID;
						// A freshly-typed (not yet saved as a reusable CreditCardID) card lives
						// only on this raw CreditCard object - the API doesn't echo it back on the
						// order, so without this it silently disappeared any time a billing field
						// autosaved (e.g. blurring the bill-to name) while the card was filled in.
						var creditCard = $scope.currentOrder.CreditCard;
						$scope.currentOrder = data;
						$scope.currentOrder.BillAddressID = billAddressID;
						if (budgetAccountID) {
							$scope.currentOrder.BudgetAccountID = budgetAccountID;
						}
						if (creditCardID) {
							$scope.currentOrder.CreditCardID = creditCardID;
						}
						if (creditCard) {
							$scope.currentOrder.CreditCard = creditCard;
						}
					},
					function(ex) {
						$scope.errorMessage = ex.Message;
					}
				);
			};

			AddressList.clear();
			AddressList.billing(function(list) {
				$scope.billaddresses = list;

				if ($scope.currentOrder) {
					if (list.length == 1 && !$scope.currentOrder.BillAddressID) {
						$scope.currentOrder.BillAddressID = list[0].ID;
					}
					if ($scope.isEditforApproval) {
						if (!AddressList.contains($scope.currentOrder.BillAddress))
							$scope.billaddresses.push($scope.currentOrder.BillAddress);
					}
				}
			});
			$scope.billaddress = { Country: 'US', IsShipping: false, IsBilling: true };

			// Pushes a resolved address into the displayed card, plus the bill-to name copy
			// that goes with it. Shared by the BillAddressID watch and the
			// event:AddressSaved handler: editing an existing address keeps the same ID,
			// so the watch never re-fires and the card would otherwise keep showing the
			// values from before the edit until the page was reloaded.
			function applyBillAddress(add) {
				if (!add) return;

				if ($scope.user.Permissions.contains('EditBillToName') && !add.IsCustEditable) {
					$scope.currentOrder.BillFirstName = add.FirstName;
					$scope.currentOrder.BillLastName = add.LastName;
				}
				$scope.BillAddress = add;
			}

			$scope.editBillAddress = function() {
				$scope.billaddress = angular.copy($scope.BillAddress);
				$scope.billaddressform = true;
			};

			$scope.$on('event:AddressSaved', function(event, address) {
				if (address.IsBilling) {
					$scope.currentOrder.BillAddressID = address.ID;
					// Assigning the same ID back does not trip the watch, so refresh the
					// displayed address here rather than relying on it.
					applyBillAddress(address);
					$scope.billaddressform = false;
				}

				AddressList.billing(function(list) {
					$scope.billaddresses = list;
					if ($scope.isEditforApproval) {
						$scope.billaddresses.push($scope.currentOrder.BillAddress);
					}
				});
				$scope.billaddress = { Country: 'US', IsShipping: false, IsBilling: true };
			});

			$scope.$watch('currentOrder.BillAddressID', function(newValue) {
				if (newValue) {
					Address.get(newValue, applyBillAddress);
				}
			});

			$scope.$on('event:AddressCancel', function(event) {
				$scope.billaddressform = false;
			});
		}]
	};
	return obj;
}]);

four51.app.directive('billingmessage', function() {
	var obj = {
		restrict: 'E',
		templateUrl: 'partials/messages/billing.html'
	};
	return obj;
});

// Payment section of checkout (partials/controls/orderPayment.html): the payment selector on its
// own, last on the page. No scope of its own, like the other checkout sections, so its
// cart_billing form registers on the checkout scope where CheckOutViewCtrl and the summary read it.
four51.app.directive('orderpayment', function() {
	return {
		restrict: 'E',
		templateUrl: 'partials/controls/orderPayment.html'
	};
});
