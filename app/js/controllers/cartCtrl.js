four51.app.controller('CartViewCtrl', ['$scope', '$rootScope', '$routeParams', '$location', '$451', '$timeout', 'Order', 'OrderConfig', 'User', 'ConfirmModal',
function ($scope, $rootScope, $routeParams, $location, $451, $timeout, Order, OrderConfig, User, ConfirmModal) {
	$scope.isEditforApproval = $routeParams.id != null && $scope.user.Permissions.contains('EditApprovalOrder');
	if ($scope.isEditforApproval) {
		Order.get($routeParams.id, function(order) {
			$scope.currentOrder = order;
			// add cost center if it doesn't exists for the approving user
			var exists = false;
			angular.forEach(order.LineItems, function(li) {
				angular.forEach($scope.user.CostCenters, function(cc) {
					if (exists) return;
					exists = cc == li.CostCenter;
				});
				if (!exists) {
					$scope.user.CostCenters.push({
						'Name': li.CostCenter
					});
				}
			});
		});
	}

	// Every save/remove below assigns "$scope.currentOrder = ..." on THIS scope, shadowing
	// Four51Ctrl's copy from then on - so a mini-cart removal made while this page is open
	// (navCtrl -> Order.deletelineitem -> event:orderUpdate) only ever updated Four51Ctrl's copy.
	// This page kept showing the removed item, and its next autosave sent it back to the server,
	// which answered "Object reference not set to an instance of an object". Take the fresh order
	// whenever an update for this same order arrives with a different set of line items - our own
	// saves broadcast the very object we just assigned, so they never trip this.
	function lineItemIDs(order) {
		var ids = [];
		angular.forEach(order.LineItems, function(li) { ids.push(li.ID); });
		return ids.sort().join(',');
	}
	$scope.$on('event:orderUpdate', function(event, order) {
		if ($scope.isEditforApproval || !$scope.currentOrder || order === $scope.currentOrder) return;
		if (!order) {
			$scope.currentOrder = null;
			return;
		}
		if (order.ID === $scope.currentOrder.ID && lineItemIDs(order) !== lineItemIDs($scope.currentOrder))
			$scope.currentOrder = order;
	});

	// Drives the empty-cart message in cartView.html. Only true once it's known: with a
	// CurrentOrderID the order is still being fetched on page load (Four51Ctrl's init), so a
	// bare !currentOrder check flashed "Your cart is empty" before a full cart appeared.
	$scope.cartIsEmpty = function() {
		if ($scope.isEditforApproval || !$scope.user) return false;
		if (!$scope.user.CurrentOrderID) return true;
		return !!$scope.currentOrder && !($scope.currentOrder.LineItems || []).length;
	};

	$scope.currentDate = new Date();
	$scope.errorMessage = null;
	$scope.continueShopping = function() {
		if (!$scope.cart.$invalid) {
			if (confirm('Do you want to save changes to your order before continuing?') == true)
				$scope.saveChanges(function() { $location.path('catalog') });
		}
		else
			$location.path('catalog');
	};

	// Both confirmations below go through ConfirmModal (services/confirmModal.js) rather than
	// window.confirm(), whose unstyled browser dialog was titled with the site's address.
	$scope.cancelOrder = function() {
		ConfirmModal.open({
			title: 'Clear your cart?',
			message: 'All items will be removed from your cart.',
			confirmText: 'Clear Cart',
			cancelText: 'Keep Items',
			danger: true
		}).then(function() {
			$scope.displayLoadingIndicator = true;
			$scope.actionMessage = null;
			Order.delete($scope.currentOrder,
				function(){
					$scope.currentOrder = null;
					$scope.user.CurrentOrderID = null;
					User.save($scope.user, function(){
						$location.path('catalog');
					});
					$scope.displayLoadingIndicator = false;
					$scope.actionMessage = 'Your Changes Have Been Saved';
				},
				function(ex) {
					$scope.actionMessage = 'An error occurred: ' + ex.Message;
					$scope.displayLoadingIndicator = false;
				}
			);
		}, angular.noop);
	};

	var cleanDate = function(callback){
		angular.forEach($scope.currentOrder.LineItems, function(li){
			if(li.DateNeeded){
			    var newDate = new Date(li.DateNeeded);
				li.DateNeeded = newDate.toDateString();
			}
		});
		if (callback) callback();
	}

	// options.quiet skips the bottom-bar "Your Changes Have Been Saved" - removeItem() confirms
	// with the "Removed from cart" toast instead, and both at once read as two messages.
	$scope.saveChanges = function(callback, options) {
		$scope.actionMessage = null;
		$scope.errorMessage = null;
		if($scope.currentOrder.LineItems.length == $451.filter($scope.currentOrder.LineItems, {Property:'Selected', Value: true}).length) {
			$scope.cancelOrder();
		}
		else {
			$scope.displayLoadingIndicator = true;
			OrderConfig.address($scope.currentOrder, $scope.user);
			cleanDate(function(){
				Order.save($scope.currentOrder,
					function (data) {
						$scope.currentOrder = data;
						$scope.displayLoadingIndicator = false;
						if (callback) callback();
						if (!(options && options.quiet)) $scope.actionMessage = 'Your Changes Have Been Saved';
					},
					function (ex) {
						$scope.errorMessage = ex.Message;
						$scope.displayLoadingIndicator = false;
					}
				);
			});
		}
	};

	// The manual "Save Order" button is hidden in favor of autosaving edits (quantity, date
	// needed, cost center) as the shopper makes them - debounced so rapid edits (e.g. typing a
	// quantity digit by digit) don't fire a save per keystroke.
	var autoSaveTimer;
	$scope.autoSave = function(lineitem) {
		if (lineitem && lineitem.qtyError) return;
		if (autoSaveTimer) $timeout.cancel(autoSaveTimer);
		autoSaveTimer = $timeout(function() {
			$scope.saveChanges();
		}, 800);
	};

	$scope.removeItem = function(item) {
		ConfirmModal.open({
			title: 'Remove item?',
			message: item.Product.Name + ' will be removed from your cart.',
			image: (item.Variant && item.Variant.LargeImageUrl) || item.Product.SmallImageUrl,
			confirmText: 'Remove',
			danger: true
		}).then(function() {
			Order.deletelineitem($scope.currentOrder.ID, item.ID,
				function(order) {
					// The toast lives outside ng-view (index.html), so it still shows when
					// removing the last item sends the shopper on to the catalog.
					$rootScope.$broadcast('event:removedFromCart', { product: item.Product, variant: item.Variant });
					if (!order) {
						$scope.user.CurrentOrderID = null;
						User.save($scope.user, function(){
							$location.path('catalog');
						});
					}
					else{
						$scope.currentOrder = order;
						if(!$scope.isEditforApproval){
							Order.clearshipping($scope.currentOrder);
						}
						$scope.saveChanges(function(){
							$scope.displayLoadingIndicator = false;
						}, { quiet: true });
					}
				},
				function (ex) {
					$scope.errorMessage = ex.Message.replace(/\<<Approval Page>>/g, 'Approval Page');
					$scope.displayLoadingIndicator = false;
				}
			);
		}, angular.noop);
	}

	$scope.checkOut = function() {
		$scope.displayLoadingIndicator = true;
		if (!$scope.isEditforApproval)
			OrderConfig.address($scope.currentOrder, $scope.user);
		cleanDate(function(){
			Order.save($scope.currentOrder,
				function (data) {
					$scope.currentOrder = data;
					$location.path($scope.isEditforApproval ? 'checkout/' + $routeParams.id : 'checkout');
					$scope.displayLoadingIndicator = false;
				},
				function (ex) {
					$scope.errorMessage = ex.Message;
					$scope.displayLoadingIndicator = false;
				}
			);
		});
	};

	$scope.$watch('currentOrder.LineItems', function (newval) {
		var newTotal = 0;
		var newQtyTotal = 0;
		var anyKitInvalid = false;
		if (!$scope.currentOrder) return newTotal;
		angular.forEach($scope.currentOrder.LineItems, function (item) {
			if (item.IsKitParent && item.KitIsInvalid) {
				anyKitInvalid = true;
				return; // still configuring - not yet "in the cart" for totals/counts
			}
			newTotal += item.LineTotal;
			newQtyTotal += (item.Quantity || 0) * (item.Product.QuantityMultiplier || 1);
		});
		$scope.cart.$setValidity('kitValidation', !anyKitInvalid);
		$scope.currentOrder.Subtotal = newTotal;
		$scope.totalItemQuantity = newQtyTotal;
	}, true);

	$scope.copyAddressToAll = function() {
		angular.forEach($scope.currentOrder.LineItems, function(n) {
			n.DateNeeded = $scope.currentOrder.LineItems[0].DateNeeded;
		});
		$scope.autoSave();
	};

	$scope.copyCostCenterToAll = function() {
		angular.forEach($scope.currentOrder.LineItems, function(n) {
			n.CostCenter = $scope.currentOrder.LineItems[0].CostCenter;
		});
		$scope.autoSave();
	};

	$scope.onPrint = function()  {
		window.print();
	};

	$scope.cancelEdit = function() {
		$location.path('order');
	};

    $scope.downloadProof = function(item) {
        window.location = item.Variant.ProofUrl;
    };
}]);