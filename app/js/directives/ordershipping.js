four51.app.directive('ordershipping', ['Order', 'Shipper', 'Address', 'AddressList', '$filter', 'SiteConfig', function(Order, Shipper, Address, AddressList, $filter, SiteConfig) {
	var obj = {
		restrict: 'AE',
		templateUrl: 'partials/controls/orderShipping.html',
		controller: ['$scope', function($scope) {
			// Every Shipper.query result goes through here so $scope.shippers is the
			// one filtered source. Filtering in the template instead would leave the
			// raw list behind the name -> object lookup in updateShipper and behind
			// the "is the saved shipper still available" check below -- a method
			// hidden by site.json would vanish from the dropdown while staying
			// selected on the order.
			//
			// Gated on SiteConfig.loaded because site.json is fetched too: a fast
			// shipper response could otherwise be filtered against an empty hide
			// list. The promise always resolves, a missing file included.
			function setShippers(list, onReady) {
				SiteConfig.loaded.then(function() {
					shipCountry(function(country) {
						$scope.shippers = $filter('visibleshippers')(list, country);
						if (onReady) onReady($scope.shippers);
					});
				});
			}

			// The country the order ships to, for the international rules in
			// visibleshippers. Resolved here rather than inside the filter: the live
			// stores that do this (shipperFilter in CapitalVacationsUniforms and
			// Everstory) call Address.get from inside the filter and return before the
			// callback fires, so the first digest yields an empty list and it only
			// fills in once a later digest happens to re-run -- and they re-request the
			// address on every digest. A filter has to be synchronous; this is the spot
			// where waiting is legitimate, and it runs once per shipper fetch.
			//
			// Order-level address on purpose. Rates are quoted for the order and
			// $scope.shippers is shared by both selects, so per-line-item addresses in
			// multiple-ship mode do not get their own list -- same as the live stores.
			// Pushes a resolved address into the displayed card, plus the ship-to name
			// copy that goes with it. Shared by the ShipAddressID watch and the
			// event:AddressSaved handler: editing an existing address keeps the same ID,
			// so the watch never re-fires and the card would otherwise keep showing the
			// values from before the edit until the page was reloaded.
			function applyShipAddress(add) {
				if (!add) return;

				if ($scope.user.Permissions.contains('EditShipToName') && !add.IsCustEditable) {
					angular.forEach($scope.currentOrder.LineItems, function(item) {
						item.ShipFirstName = add.FirstName;
						item.ShipLastName = add.LastName;
					});
				}
				$scope.orderShipAddress = add;
			}

			function shipCountry(done) {
				var addressID = $scope.currentOrder && $scope.currentOrder.ShipAddressID;

				if (!addressID) return done('');
				Address.get(addressID, function(address) {
					done(address && address.Country ? address.Country : '');
				});
			}

			AddressList.clear();
			AddressList.shipping(function(list) {
				$scope.shipaddresses = list;

				if ($scope.currentOrder) {
					if (list.length == 1 && !$scope.currentOrder.ShipAddressID) {
						$scope.currentOrder.ShipAddressID = list[0].ID;
					}
					if ($scope.isEditforApproval) {
						if (!AddressList.contains($scope.currentOrder.ShipAddress))
							$scope.shipaddresses.push($scope.currentOrder.ShipAddress);
					}
				}
			});
			$scope.shipaddress = { Country: 'US', IsShipping: true, IsBilling: false };

			$scope.editShipAddress = function() {
				$scope.shipaddress = angular.copy($scope.orderShipAddress);
				$scope.shipaddressform = true;
			};

			$scope.$on('event:AddressCancel', function() {
				$scope.shipaddressform = false;
			});
			$scope.$on('event:AddressSaved', function(event, address) {
				if (address.IsShipping) {
					$scope.currentOrder.ShipAddressID = address.ID;
					// Assigning the same ID back does not trip the watch, so refresh the
					// displayed address here rather than relying on it.
					applyShipAddress(address);
					if (!$scope.shipToMultipleAddresses)
						$scope.setShipAddressAtOrderLevel();
					$scope.shipaddressform = false;
				}

				AddressList.shipping(function(list) {
					$scope.shipaddresses = list;
					if ($scope.isEditforApproval) {
						$scope.shipaddresses.push($scope.currentOrder.ShipAddress);
						$scope.shipaddresses.push($scope.currentOrder.BillAddress);
					}
				});
				$scope.shipaddress = { Country: 'US', IsShipping: true, IsBilling: false };
			});

			var saveChanges = function(callback, error) {
				$scope.errorMessage = null;
				var auto = $scope.currentOrder.autoID;
				Order.save($scope.currentOrder,
					function(data) {
                        //Due to order save race condition, BillAddressID was being set to null.
                        //Read these at response time, not before the request went out - otherwise
                        //a value set while this save was in flight (e.g. spending account derived
                        //once SpendingAccounts loaded) gets clobbered by a stale pre-request snapshot.
                        var billAddressID = $scope.currentOrder.BillAddressID;
                        var budgetAccountID = $scope.currentOrder.BudgetAccountID;
                        var creditCardID = $scope.currentOrder.CreditCardID;
                        // A freshly-typed (not yet saved as a reusable CreditCardID) card lives
                        // only on this raw CreditCard object - the API doesn't echo it back.
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
						$scope.displayLoadingIndicator = false;
						if (auto) {
							$scope.currentOrder.autoID = true;
							$scope.currentOrder.ExternalID = 'auto';
						}
						if (callback) callback($scope.currentOrder);
					},
					function(ex) {
						if (auto)
							$scope.currentOrder.ExternalID = auto;
						$scope.errorMessage = ex.Message;
						$scope.shippingUpdatingIndicator = false;
						$scope.shippingFetchIndicator = false;
						if (error) error(ex);
					}
				);
			};

			Shipper.query($scope.currentOrder, function(list) {
				setShippers(list, function(shippers) {
					// sometimes the current shipper is not longer available. we need to clear the shipping information in that case
					// Checked against the filtered list on purpose: a method the site
					// hides is, for this order, exactly as unavailable as one the API
					// stopped returning, so it gets cleared and re-picked the same way.
					var exists = false;
					angular.forEach(shippers, function(s) {
						if (!exists && $scope.currentOrder.LineItems[0].ShipperID == s.ID)
							exists = true;
					});
					if (!exists) {
						Order.clearshipping($scope.currentOrder);
					}
				});
			});

			$scope.setMultipleShipAddress = function() {
				$scope.currentOrder.forceMultipleShip(true);
				angular.forEach($scope.currentOrder.LineItems, function(li, i) {
					if (i == 0) return;
					li.ShipAddressID = null;
					li.ShipFirstName = null;
					li.ShipLastName = null;
					li.ShipperID = null;
					li.ShipperName = null;
					li.ShipAccount = null;
				});
			}

			$scope.setSingleShipAddress = function() {
				$scope.currentOrder.forceMultipleShip(false);
				angular.forEach($scope.currentOrder.LineItems, function(li) {
					li.ShipAddressID = $scope.currentOrder.LineItems[0].ShipAddressID;
					li.ShipFirstName = $scope.currentOrder.LineItems[0].ShipFirstName;
					li.ShipLastName = $scope.currentOrder.LineItems[0].ShipLastName;
					li.ShipperID = $scope.currentOrder.LineItems[0].ShipperID;
					li.ShipAccount = $scope.currentOrder.LineItems[0].ShipAccount;
				});
			};

			$scope.$watch('currentOrder.ShipAddressID', function(newValue) {
				$scope.orderShipAddress = {};
				if ($scope.currentOrder) {
					$scope.currentOrder.ShipFirstName = null;
					$scope.currentOrder.ShipLastName = null;
					angular.forEach($scope.currentOrder.LineItems, function(item) {
						item.ShipFirstName = null;
						item.ShipLastName = null;
					});
				}

				if (newValue) {
					Address.get(newValue, applyShipAddress);
                    if (!$scope.currentOrder.IsMultipleShip()) {
                        $scope.setShipAddressAtOrderLevel();
                    }
				}
			});

			$scope.$watch('currentOrder.LineItems[0].ShipFirstName', function(newValue) {
				var shipFirstName = newValue;
				if ($scope.currentOrder) {
					angular.forEach($scope.currentOrder.LineItems, function(item) {
						item.ShipFirstName = shipFirstName;
					});
				}
			});

			$scope.$watch('currentOrder.LineItems[0].ShipLastName', function(newValue) {
				var shipLastName = newValue;
				if ($scope.currentOrder) {
					angular.forEach($scope.currentOrder.LineItems, function(item) {
						item.ShipLastName = shipLastName;
					});
				}
			});

			$scope.setShipAddressAtLineItem = function(item) {
				item.ShipFirstName = null;
				item.ShipLastName = null;
				saveChanges(
					function(order) {
						Shipper.query(order,
							function(list) {
								setShippers(list);
							}
						);
					},
					function(ex) {
						item.ShipAddressID = null;
					}
				);
			};

			$scope.setShipAddressAtOrderLevel = function() {
				$scope.shippingFetchIndicator = true;
				$scope.currentOrder.ShipperName = null;
				$scope.currentOrder.Shipper = null;
				$scope.currentOrder.ShipperID = null;
				angular.forEach($scope.currentOrder.LineItems, function(li) {
					li.ShipAddressID = $scope.currentOrder.ShipAddressID;
					li.ShipFirstName = null;
					li.ShipLastName = null;
					li.ShipperName = null;
					li.Shipper = null;
					li.ShipperID = null;
				});
				saveChanges(
					function(order) {
						Shipper.query(order, function(list) {
							setShippers(list, function() {
								$scope.shippingFetchIndicator = false;
							});
						});
					},
					function(ex) {
						$scope.currentOrder.ShipAddressID = null;
						angular.forEach($scope.currentOrder.LineItems, function(li) {
							li.ShipAddressID = null;
						});
					}
				);
			};
			$scope.updateShipper = function(li) {
				$scope.shippingUpdatingIndicator = true;
				$scope.shippingFetchIndicator = true;
				if (!li) { // at the order level
					angular.forEach($scope.shippers, function(s) {
						if (s.Name == $scope.currentOrder.LineItems[0].ShipperName)
							$scope.currentOrder.Shipper = s;
					});

					angular.forEach($scope.currentOrder.LineItems, function(item) {
						item.ShipperName = $scope.currentOrder.Shipper ? $scope.currentOrder.Shipper.Name : null;
						item.ShipperID = $scope.currentOrder.Shipper ? $scope.currentOrder.Shipper.ID : null;
					});

					saveChanges(function() {
						$scope.shippingUpdatingIndicator = false;
						$scope.shippingFetchIndicator = false;
					});
				}
				else { // at the lineitem level for multiple shipping
					angular.forEach($scope.shippers, function(s) {
						if (s.Name == li.ShipperName)
							li.Shipper = s;
					});
					if (li.Shipper.Name) li.ShipperName = li.Shipper.Name;
					if (li.Shipper.ID) li.ShipperID = li.Shipper.ID;
					saveChanges(function() {
						$scope.shippingUpdatingIndicator = false;
						$scope.shippingFetchIndicator = false;
					});
				}
			};

			$scope.$on('event:AddressCancel', function(event) {
				$scope.addressform = false;
			});
		}]
	};
	return obj;
}]);

four51.app.directive('shippingmessage', function() {
	var obj = {
		restrict: 'E',
		templateUrl: 'partials/messages/shipping.html'
	};
	return obj;
});