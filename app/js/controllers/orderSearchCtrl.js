four51.app.controller('OrderSearchCtrl', ['$scope', '$location', 'OrderSearchCriteria', 'OrderSearch',
	function ($scope,  $location, OrderSearchCriteria, OrderSearch) {
		$scope.settings = {
			currentPage: 1,
			pageSize: 10
		};

		OrderSearchCriteria.query(function(data) {
			$scope.OrderSearchCriteria = data;
			$scope.hasStandardTypes = _hasType(data, 'Standard');
			$scope.hasReplenishmentTypes = _hasType(data, 'Replenishment');
			$scope.hasPriceRequestTypes = _hasType(data, 'PriceRequest');

			// Show the full order list (any status) right away instead of requiring the
			// shopper to click a specific status first - the status is already visible per
			// row via the status pill, so there's nothing gained by starting empty.
			loadAllOrders();
		});

		$scope.$watch('settings.currentPage', function() {
			Query($scope.currentCriteria);
		});

		$scope.OrderSearch = function($event, criteria) {
			if ($event) $event.preventDefault();
			$scope.currentCriteria = criteria;
			Query(criteria);
		};

		// There's no single "any status" filter the server understands - each entry in
		// OrderSearchCriteria is its own real Type+Status bucket, and that's the only field
		// combination confirmed to filter correctly (see OrderSearch.searchAll). So fetch every
		// non-empty bucket and merge them, rather than sending a made-up criteria object the
		// server would likely just ignore. `extra` (Order ID/Shipping Address/dates from the
		// search fields) is merged into each bucket's own request so those still apply.
		function loadAllOrders(extra) {
			var bucketsWithOrders = [];
			angular.forEach($scope.OrderSearchCriteria, function(c) {
				if (c.Count > 0) bucketsWithOrders.push(c);
			});
			if (!bucketsWithOrders.length) return;
			$scope.showNoResults = false;
			$scope.pagedIndicator = true;
			$scope.currentCriteria = null;
			OrderSearch.searchAll(bucketsWithOrders, function(list, count) {
				$scope.orders = list;
				$scope.settings.listCount = count;
				$scope.showNoResults = list.length == 0;
				$scope.pagedIndicator = false;
			}, extra);
			$scope.orderSearchStat = { DisplayName: 'All Orders' };
		}

		// The Status dropdown is bound to the real criteria bucket object (Type/DisplayName/etc,
		// whatever fields Four51 actually returned) rather than a plain string, since that's the
		// only thing confirmed to filter correctly server-side (see OrderSearch.searchAll's
		// comment). Merge it with the typed fields (Order ID, address, dates) into one request -
		// or, if no status is picked ("All Statuses"), go back to showing every bucket merged.
		$scope.runSearch = function($event) {
			if ($event) $event.preventDefault();
			if ($scope.selectedStatus) {
				var combined = angular.extend({}, $scope.selectedStatus, $scope.criteria || {});
				$scope.OrderSearch(null, combined);
			}
			else {
				loadAllOrders($scope.criteria);
			}
		};

		$scope.hasSearchFilters = function() {
			var c = $scope.criteria || {};
			return !!($scope.selectedStatus || c.OrderID || c.ShippingAddress || c.DateRangeFrom || c.DateRangeTo);
		};

		$scope.clearSearch = function() {
			$scope.criteria = {};
			$scope.selectedStatus = null;
			$scope.settings.currentPage = 1;
			loadAllOrders();
		};

		function _hasType(data, type) {
			var hasType = false;
			angular.forEach(data, function(o) {
				if (hasType || o.Type == type && o.Count > 0)
					hasType = true;
			});
			return hasType;
		}

		function Query(criteria) {
			if (!criteria) return;
			$scope.showNoResults = false;
			$scope.pagedIndicator = true;
			OrderSearch.search(criteria, function (list, count) {
				$scope.orders = list;
				$scope.settings.listCount = count;
				$scope.showNoResults = list.length == 0;
				$scope.pagedIndicator = false;
			}, $scope.settings.currentPage, $scope.settings.pageSize);
			$scope.orderSearchStat = criteria;
		}
	}]);