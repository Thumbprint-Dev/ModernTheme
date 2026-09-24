four51.app.controller('NavCtrl', ['$location', '$route', '$scope', '$451', '$timeout', '$window', 'User', 'Order', 'SpendingAccount', 'AppConst', 'ConfirmModal',
function ($location, $route, $scope, $451, $timeout, $window, User, Order, SpendingAccount, AppConst, ConfirmModal) {
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

    // Groups (Company > Groups in the admin) are a real array on the user object, each
    // {Name, ID, InteropID, ...} - checked by Name since InteropID is often left blank.
    $scope.isInGroup = function(groupName) {
        return !!($scope.user && $scope.user.Groups && $scope.user.Groups.some(function(g){ return g.Name === groupName; }));
    };

    $scope.$watch('user', function(user) {
        if (user && user.Type == 'Customer' && user.Permissions.contains('PayByBudgetAccount')) {
            SpendingAccount.query(function(accounts) {
                $scope.purchaseSpendingAccounts = (accounts || []).filter(function(a) { return a.ForPurchase; });
            });
        }
    });

    $scope.doSearch = function(){
        if ($scope.searchTerm)
            $location.path('search/' + $scope.searchTerm);
    };

    // Removing straight from the mini-cart, without leaving whatever page the shopper is
    // browsing. Mirrors cartCtrl.js's removeItem(), minus the shipping-recalc/saveChanges
    // afterward - the shopper isn't on the checkout flow here, so there's nothing to resave.
    //
    // Does NOT assign $scope.currentOrder itself, on purpose: <navigation> (this controller)
    // gets its own scope as a SIBLING of ng-view, not an ancestor of it, so an assignment here
    // only ever shadowed nav's own copy - every other page keeps reading Four51Ctrl's real
    // currentOrder, which never changed, so a category-page add-to-cart right after a mini-cart
    // removal sent the server a stale order and came back with a raw "Object reference not set
    // to an instance of an object" exception. Order.deletelineitem already broadcasts
    // event:orderUpdate on every call; Four51Ctrl.js listens for it and updates the one
    // currentOrder every page actually inherits from - this just needs to trigger that.
    //
    // The confirmation is ConfirmModal (services/confirmModal.js), not window.confirm(). Its
    // backdrop click is a document click, so ui-bootstrap closes the mini-cart behind it.
    $scope.removeMinicartItem = function(item){
        if (!$scope.currentOrder) return;
        var orderID = $scope.currentOrder.ID;
        ConfirmModal.open({
            title: 'Remove item?',
            message: item.Product.Name + ' will be removed from your cart.',
            image: (item.Variant && item.Variant.LargeImageUrl) || item.Product.SmallImageUrl,
            confirmText: 'Remove',
            danger: true
        }).then(function() {
            Order.deletelineitem(orderID, item.ID, function(order){
                $scope.$root.$broadcast('event:removedFromCart', { product: item.Product, variant: item.Variant });
                if (!order) {
                    $scope.user.CurrentOrderID = null;
                    User.save($scope.user);
                }
            }, function(ex){
                // Shown by the <mt-error-modal> in nav.html; ex.Message is already the friendly
                // fallback when the server sent a raw exception (services/errorService.js).
                $scope.minicartError = ex.Message;
            });
        }, angular.noop);
    };

    $scope.Logout = function(){
        // Dropping the token on its own just re-renders the login form under
        // whatever URL the user was on -- /catalog, a product page -- which is
        // what made logging out look broken. The old redirect ran on anon sites
        // only, and even there reloaded the page being left, since $location
        // does not write the new URL until the digest. Navigate instead: every
        // site lands on /login with all state re-initialised, and an anon site
        // picks up a fresh temp session on the way back in.
        function goToLogin() {
            $window.location.href = '/' + $451.apiName + '/login';
        }

        User.logout($scope.user, goToLogin, function(ex){
            console.log(ex.Message);
            goToLogin();
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

    // Derived straight from the inherited currentOrder (Four51Ctrl.js owns and syncs it) rather
    // than from event:orderUpdate payloads. Counting whatever order the last broadcast carried
    // left the badge blank after a full page load whenever that init broadcast fired before this
    // controller existed, and wrong whenever an unrelated order was broadcast (Order.get of a
    // history order, a kit's own save) - while the mini-cart, bound to currentOrder, was right.
    $scope.$watch(function() {
        var order = $scope.currentOrder;
        if (!order || order.Status != 'Unsubmitted') return null;
        // A kit that's still mid-configuration is a real LineItem server-side (the platform
        // requires that to know what needs configuring), but it isn't done yet - don't count it
        // as "added" until KitIsInvalid clears.
        var count = 0;
        angular.forEach(order.LineItems, function(li) {
            if (!(li.IsKitParent && li.KitIsInvalid)) count++;
        });
        return count;
    }, function(count) {
        $scope.cartCount = count;
    });
}]);