four51.app.directive('orderdetails', ['Order', function(Order) {
	var obj = {
		restrict: 'AE',
		templateUrl: 'partials/controls/orderDetails.html',
		controller: ['$scope', 'Address', function($scope, Address) {
			if ($scope.isEditforApproval) {
				var exists = false;
				angular.forEach($scope.user.CostCenters, function(cc) {
					if (exists) return;
					exists = cc == $scope.currentOrder.CostCenter;
				});
				if (!exists) {
					$scope.user.CostCenters.push({
						'Name': $scope.currentOrder.CostCenter
					});
				}
			}

            $scope.updateCostCenter = updateCostCenter;

            function updateCostCenter() {
                angular.forEach($scope.user.CostCenters, function(cc) {
                   if (cc.Name == $scope.currentOrder.CostCenter && cc.DefaultAddressID) {
                       Address.get(cc.DefaultAddressID, function(address) {
                            if (address.IsShipping) {
                                $scope.currentOrder.ShipAddressID = cc.DefaultAddressID;
                            }
                       });
                   }
                });
                $scope.saveOrderDetails();
            }

            $scope.saveOrderDetails = function() {
                var auto = $scope.currentOrder.autoID;
                Order.save($scope.currentOrder,
                    function(data) {
                        // Read these at response time, not before the request went out - a value
                        // set while this save was in flight would otherwise get clobbered by a
                        // stale pre-request snapshot.
                        var budgetAccountID = $scope.currentOrder.BudgetAccountID;
                        var creditCardID = $scope.currentOrder.CreditCardID;
                        $scope.currentOrder = data;
                        if (budgetAccountID) {
                            $scope.currentOrder.BudgetAccountID = budgetAccountID;
                        }
                        if (creditCardID) {
                            $scope.currentOrder.CreditCardID = creditCardID;
                        }
                        if (auto) {
                            $scope.currentOrder.autoID = true;
                            $scope.currentOrder.ExternalID = 'auto';
                        }
                    },
                    function(ex) {
                        $scope.errorMessage = ex.Message;
                    }
                );
            };
		}]
	};
	return obj;
}]);