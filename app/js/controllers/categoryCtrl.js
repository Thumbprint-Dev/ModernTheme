four51.app.controller('CategoryCtrl', ['$routeParams', '$sce', '$scope', '$451', 'Category', 'Product', 'Nav', 'AppConst',
function ($routeParams, $sce, $scope, $451, Category, Product, Nav, AppConst) {
	$scope.isHome = !$routeParams.categoryInteropID;
	$scope.isNotFeaturedCategory = function(cat) {
		return cat.InteropID !== AppConst.featuredCategoryInteropID;
	};
	if ($scope.isHome) {
		// "Featured for your team" pulls from a dedicated real category (see AppConst.featuredCategoryInteropID)
		// rather than a platform-wide "all products" query, which Product.search doesn't support unscoped.
		var FEATURED_PAGE_SIZE = 4;
		Product.search(AppConst.featuredCategoryInteropID, null, null, function (products) {
			$scope.featuredProducts = products;
			$scope.featuredPage = 0;
			$scope.featuredTotalPages = Math.ceil((products || []).length / FEATURED_PAGE_SIZE);
		}, 1, 20);
		$scope.featuredNext = function() {
			if ($scope.featuredPage < $scope.featuredTotalPages - 1)
				$scope.featuredPage++;
		};
		$scope.featuredPrev = function() {
			if ($scope.featuredPage > 0)
				$scope.featuredPage--;
		};
	}
	$scope.productLoadingIndicator = true;
	$scope.settings = {
		currentPage: 1,
		pageSize: 40
	};
	$scope.trusted = function(d){
		if(d) return $sce.trustAsHtml(d);
	}

	function _search() {
		$scope.searchLoading = true;
		Product.search($routeParams.categoryInteropID, null, null, function (products, count) {
			$scope.products = products;
			$scope.productCount = count;
			$scope.productLoadingIndicator = false;
			$scope.searchLoading = false;
		}, $scope.settings.currentPage, $scope.settings.pageSize);
	}

	$scope.$watch('settings.currentPage', function(n, o) {
		if (n != o || (n == 1 && o == 1))
			_search();
	});

	if ($routeParams.categoryInteropID) {
	    $scope.categoryLoadingIndicator = true;
        Category.get($routeParams.categoryInteropID, function(cat) {
            $scope.currentCategory = cat;
	        $scope.categoryLoadingIndicator = false;
        });
    }
	else if($scope.tree){
		$scope.currentCategory ={SubCategories:$scope.tree};
	}


	$scope.$on("treeComplete", function(data){
		if (!$routeParams.categoryInteropID) {
			$scope.currentCategory ={SubCategories:$scope.tree};
		}
	});

    // panel-nav
    $scope.navStatus = Nav.status;
    $scope.toggleNav = Nav.toggle;
	$scope.$watch('sort', function(s) {
		if (!s) return;
		(s.indexOf('Price') > -1) ?
			$scope.sorter = 'StandardPriceSchedule.PriceBreaks[0].Price' :
			$scope.sorter = s.replace(' DESC', "");
		$scope.direction = s.indexOf('DESC') > -1;
	});
}]);