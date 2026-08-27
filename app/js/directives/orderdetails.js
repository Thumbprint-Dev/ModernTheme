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
                        $scope.currentOrder = data;
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