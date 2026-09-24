four51.app.controller('CheckOutViewCtrl', ['$scope', '$routeParams', '$location', '$route', '$filter', '$rootScope', '$451', 'User', 'Order', 'OrderConfig', 'AddressList', 'GoogleAnalytics',
function ($scope, $routeParams, $location, $route, $filter, $rootScope, $451, User, Order, OrderConfig, AddressList, GoogleAnalytics) {
	$scope.errorSection = 'open';

	// Same shadowing hazard as cartCtrl.js: saveChanges() below assigns currentOrder on this
	// scope, so a mini-cart removal made mid-checkout never reached it, and submitting sent the
	// deleted line item back to the server. Reload the route instead of swapping the order in
	// place - the shipping/billing/payment directives hold references into it, and a reload
	// re-reads the fresh, inherited order (or bounces to the catalog if the cart is now empty).
	// Keyed on the set of line item IDs, so the directives' own shipping/payment saves - which
	// never add or remove lines - don't trigger it.
	function lineItemIDs(order) {
		var ids = [];
		angular.forEach(order.LineItems, function(li) { ids.push(li.ID); });
		return ids.sort().join(',');
	}
	$scope.$on('event:orderUpdate', function(event, order) {
		if ($scope.isEditforApproval || $scope.submitClicked || !$scope.currentOrder || order === $scope.currentOrder) return;
		if (!order || (order.ID === $scope.currentOrder.ID && lineItemIDs(order) !== lineItemIDs($scope.currentOrder)))
			$route.reload();
	});

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
				// Navigate only once the user save lands. The route change re-runs Four51Ctrl's
				// init(), which reloads the cart from the cached user's CurrentOrderID - leaving
				// early let it read the stale ID and put the just-submitted order back in the cart.
				// currentOrder is cleared by that same init(); nulling it here would only shadow
				// the inherited value on this scope, not clear the cart.
				var orderID = data.ID;
				$scope.user.CurrentOrderID = null;
				function goToConfirmation() {
					$scope.displayLoadingIndicator = false;
					$location.path('/order/new/' + orderID);
				}
				User.save($scope.user, goToConfirmation, goToConfirmation);
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
				// Read these at response time, not from the pre-request cache - a value set while
				// this save was in flight would otherwise get clobbered by a stale snapshot.
				var budgetAccountID = $scope.currentOrder.BudgetAccountID;
				var creditCardID = $scope.currentOrder.CreditCardID;
		        $scope.currentOrder = data;
				if(cache.CreditCard){
					$scope.currentOrder.CreditCard = cache.CreditCard;
				}
				if(budgetAccountID){
					$scope.currentOrder.BudgetAccountID = budgetAccountID;
				}
				if(creditCardID){
					$scope.currentOrder.CreditCardID = creditCardID;
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
			// Lists what's missing in a modal (checkOutView.html) - the bottom-bar badge it
			// replaces showed only a count until expanded, easy to miss below the fold.
			$scope.showCheckoutErrors = true;
			return;
		}
		$scope.submitClicked = true;
		saveChanges(function(data){
			submitOrder();
		});
	};
}]);