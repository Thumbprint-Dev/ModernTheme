four51.app.controller('NavCtrl', ['$location', '$route', '$scope', '$451', '$timeout', 'User', 'SpendingAccount', 'AppConst',
function ($location, $route, $scope, $451, $timeout, User, SpendingAccount, AppConst) {
    // Four51 InteropIDs are unique platform-wide, so Featured/All Products may carry a uniqueness
    // suffix (e.g. "featured-gp") - match by prefix, not exact equality. Mirrors the same
    // exclusion categoryCtrl.js already applies to the home page's "Shop by category" tiles.
    function startsWithInteropID(fullID, prefix) {
        return !!fullID && !!prefix && fullID.toLowerCase().indexOf(prefix.toLowerCase()) === 0;
    }

    // Featured and All Products are utility categories, not real departments - never show them
    // as top-level items in the main nav.
    $scope.isNavCategory = function(cat) {
        return !startsWithInteropID(cat.InteropID, AppConst.featuredCategoryInteropID) && !startsWithInteropID(cat.InteropID, AppConst.allProductsCategoryInteropID);
    };

    $scope.$watch('user', function(user) {
        if (user && user.Type == 'Customer' && user.Permissions.contains('PayByBudgetAccount')) {
            SpendingAccount.query(function(accounts) {
                $scope.primarySpendingAccount = (accounts || []).filter(function(a) { return a.ForPurchase; })[0];
            });
        }
    });

    $scope.doSearch = function(){
        if ($scope.searchTerm)
            $location.path('search/' + $scope.searchTerm);
    };

    $scope.Logout = function(){
        function redirectAnon() {
            if ($scope.isAnon) {
                $timeout(function () {
                    $location.path("/login");
                    location.reload(true);
                }, 500);
            }
        }
        User.logout($scope.user, redirectAnon, function(ex){
            console.log(ex.Message);
            redirectAnon();
        });
    };

    // http://stackoverflow.com/questions/12592472/how-to-highlight-a-current-menu-item-in-angularjs
    $scope.isActive = function(path) {
        var cur_path = $location.path().replace('/', '');
        var result = false;

        if (path instanceof Array) {
            angular.forEach(path, function(p) {
                if (p == cur_path && !result)
                    result = true;
            });
        }
        else {
            if (cur_path == path)
                result = true;
        }
        return result;
    };
    // extension of above isActive in path
    $scope.isInPath = function(path) {
        var cur_path = $location.path().replace('/', '');
        var result = false;

        if(cur_path.indexOf(path) > -1) {
            result = true;
        }
        else {
            result = false;
        }
        return result;
    };

    // Marks a top-nav category as active while the shopper is browsing it or one of its
    // subcategories (e.g. Apparel stays highlighted while on Apparel > Mens), independent of
    // the dropdown itself, which only ever opens on hover/focus - it doesn't stay expanded
    // after navigating to a subcategory.
    $scope.isCategoryActive = function(cat) {
        if ($scope.isInPath(cat.InteropID)) return true;
        var active = false;
        angular.forEach(cat.SubCategories, function(sub) {
            if ($scope.isInPath(sub.InteropID)) active = true;
        });
        return active;
    };

    $scope.Clear = function() {
        localStorage.clear();
    }

    $scope.$on('event:orderUpdate', function(event, order) {
        if (!order || order.Status != 'Unsubmitted') {
            $scope.cartCount = null;
            return;
        }
        // A kit that's still mid-configuration is a real LineItem server-side (the platform
        // requires that to know what needs configuring), but it isn't done yet - don't count it
        // as "added" until KitIsInvalid clears.
        var count = 0;
        angular.forEach(order.LineItems, function(li) {
            if (!(li.IsKitParent && li.KitIsInvalid)) count++;
        });
        $scope.cartCount = count;
    });
}]);