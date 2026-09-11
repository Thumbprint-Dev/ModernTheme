four51.app.controller('FavoriteProductsCtrl', ['$scope', 'FavoriteProducts',
    function ($scope, FavoriteProducts) {
        $scope.settings = { currentPage: 1, pageSize: 40 };
        $scope.loading = true;
        var loaded = [];

        FavoriteProducts.getAllProducts(function (products) {
            loaded = products;
            $scope.products = products;
            $scope.productCount = products.length;
            $scope.loading = false;
        });

        // Products fetched once into loaded; re-filter it whenever a heart toggle updates
        // $root.favoriteProducts so unfavoriting here updates the grid instantly with no refetch.
        $scope.$watchCollection(function () { return $scope.$root.favoriteProducts; },
            function (newSkus, oldSkus) {
                if (newSkus === oldSkus) return;
                $scope.products = loaded.filter(function (p) {
                    return (newSkus || []).indexOf(p.InteropID) > -1;
                });
                $scope.productCount = $scope.products.length;
            }
        );
    }
]);
