four51.app.controller('CheckOutViewCtrl', ['$scope', '$routeParams', '$location', '$filter', '$rootScope', '$451', 'User', 'Order', 'OrderConfig', 'AddressList', 'GoogleAnalytics',
function ($scope, $routeParams, $location, $filter, $rootScope, $451, User, Order, OrderConfig, AddressList, GoogleAnalytics) {
	$scope.errorSection = 'open';

	$scope.isEditforApproval = $routeParams.id != null && $scope.user.Permissions.contains('EditApprovalOrder');
	if ($scope.isEditforApproval) {
		Order.get($routeParams.id, function(order) {
			$scope.currentOrder = order;
		});
	}

	if (!$scope.currentOrder) {
        $location.path('catalog');
    }

	$scope.hasOrderConfig = OrderConfig.hasConfig($scope.currentOrder, $scope.user);

    function submitOrder() {
	    $scope.displayLoadingIndicator = true;
		$scope.submitClicked = true;
	    $scope.errorMessage = null;
        Order.submit($scope.currentOrder,
	        function(data) {
				if ($scope.user.Company.GoogleAnalyticsCode) {
					GoogleAnalytics.ecommerce(data, $scope.user);
				}
				$scope.user.CurrentOrderID = null;
				User.save($scope.user, function(data) {
			        $scope.user = data;
	                $scope.displayLoadingIndicator = false;
		        });
		        $scope.currentOrder = null;
				$location.path('/order/new/' + data.ID);
	        },
	        function(ex) {
				$scope.submitClicked = false;
		        $scope.errorMessage = ex.Message;
		        $scope.displayLoadingIndicator = false;
		        $scope.shippingUpdatingIndicator = false;
		        $scope.shippingFetchIndicator = false;
	        }
        );
    };

	$scope.$watch('currentOrder.CostCenter', function() {
		OrderConfig.address($scope.currentOrder, $scope.user);
	});

	$scope.$watch('currentOrder.LineItems',function(item){
		if(!item)return;
		if($scope.user.ShipMethod && $scope.user.ShipMethod.DefaultShipperAccountNumber){
			angular.forEach($scope.currentOrder.LineItems, function(li){
				li.ShipAccount = $scope.user.ShipMethod.DefaultShipperAccountNumber;
			});
		}
	});

	$scope.$watch('currentOrder.LineItems[0].ShipAccount',function(val){
		if(!val)return;
		if(!$scope.currentOrder.IsMultipleShip()){
			angular.forEach($scope.currentOrder.LineItems, function(li){
				li.ShipAccount = val;
			});
		}
	});

    function saveChanges(callback) {
	    $scope.displayLoadingIndicator = true;
	    $scope.errorMessage = null;
	    $scope.actionMessage = null;
	    var auto = $scope.currentOrder.autoID;
		var cache = angular.copy($scope.currentOrder);
	    Order.save($scope.currentOrder,
	        function(data) {
		        $scope.currentOrder = data;
				if(cache.CreditCard){
					$scope.currentOrder.CreditCard = cache.CreditCard;
				}
				if(cache.BudgetAccountID){
					$scope.currentOrder.BudgetAccountID = cache.BudgetAccountID;
				}
				if(cache.CreditCardID){
					$scope.currentOrder.CreditCardID = cache.CreditCardID;
				}
		        if (auto) {
			        $scope.currentOrder.autoID = true;
			        $scope.currentOrder.ExternalID = 'auto';
		        }
		        $scope.displayLoadingIndicator = false;
		        if (callback) callback($scope.currentOrder);
		        else{
					$scope.actionMessage = "Your changes have been saved";
				}
	        },
	        function(ex) {
		        $scope.currentOrder.ExternalID = null;
		        $scope.errorMessage = ex.Message;
		        $scope.displayLoadingIndicator = false;
		        $scope.shippingUpdatingIndicator = false;
		        $scope.shippingFetchIndicator = false;
	        }
        );
    };

    $scope.continueShopping = function() {
	    if (confirm('Do you want to save changes to your order before continuing?') == true)
	        saveChanges(function() { $location.path('catalog') });
        else
		    $location.path('catalog');
    };

	$scope.submitOrder = function() {
		$scope.submitAttempted = true;
		if ($scope.cart_order.$invalid || $scope.cart_shipping.$invalid || $scope.cart_billing.$invalid) {
			return;
		}
		$scope.submitClicked = true;
		saveChanges(function(data){
			submitOrder();
		});
	};
}]);