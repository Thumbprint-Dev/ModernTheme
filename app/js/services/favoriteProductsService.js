// favoriteProductsService.js
// Favorites are stored on a Four51 custom user field (a comma-delimited string of product
// InteropIDs) - no separate database, the user record is the store. Same approach used on
// the Risepoint buyer site. FAVORITE_SKUS_FIELD must be enabled (ticked) for this buyer under
// Company > user fields in the Four51 admin, or add()/remove() will throw when the field is
// missing from the user record.
four51.app.factory('FavoriteProducts', ['$resource', '$q', 'User', '$451', function($resource, $q, User, $451) {
    var FAVORITE_SKUS_FIELD = 'FavoriteSKUs';

    function _then(fn, data) {
        if (angular.isFunction(fn)) fn(data);
    }

    // use like `FavoriteProducts.getAll(skus => {...})`
    function getAll(callback) {
        User.get(function(user) {
            var field = user.CustomFields.find(function(f) { return f.Name === FAVORITE_SKUS_FIELD; });
            // field may be absent for users the custom field isn't assigned to (e.g. anon)
            var skus = field && field.Value ? field.Value.split(',') : [];
            _then(callback, skus);
        });
    }

    // Products/:interopID returns inactive products with full, valid data - no Active/
    // IsActive/Status field is sent at all - so the detail endpoint can't tell us whether a
    // product is still active. The catalog search endpoint DOES respect activation and
    // catalog visibility, so "does this SKU come back from a catalog search" is the
    // activation test. Resolves false on error, so a failed check hides the product rather
    // than surfacing a dead one.
    function _isInCatalog(sku) {
        return $resource($451.api('Products')).get({ SearchTerms: sku, Page: 1, PageSize: 100 }).$promise.then(
            function(result) {
                var list = (result && result.List) || [];
                return list.some(function(p) { return p && p.InteropID === sku; });
            },
            function() { return false; }
        );
    }

    // use like `FavoriteProducts.getAllProducts(products => {...})`
    // resolves the stored favorite SKUs into full product objects for display. Anything that
    // fails to load (permission revoked, stale/variant-only SKU) or is no longer in the
    // catalog (deactivated/unassigned) is skipped from display, but the stored SKU is left
    // untouched so a transient failure doesn't silently delete a user's favorite.
    function getAllProducts(callback) {
        getAll(function(skus) {
            if (!skus.length) {
                _then(callback, []);
                return;
            }
            var lookups = skus.map(function(sku) {
                var detail = $resource($451.api('Products/:interopID'), { interopID: '@ID' }).get({ interopID: sku }).$promise.then(
                    function(product) { return product; },
                    function() { return null; }
                );
                return $q.all([detail, _isInCatalog(sku)]).then(function(result) {
                    var product = result[0], isActive = result[1];
                    return (product && product.InteropID && isActive) ? product : null;
                });
            });
            // $q.all preserves order, so the list mirrors the saved favorite order
            $q.all(lookups).then(function(products) {
                _then(callback, products.filter(function(p) { return p; }));
            });
        });
    }

    // use like `FavoriteProducts.add(sku, skus => {...})`
    function add(sku, callback) {
        User.get(function(user) {
            var field = user.CustomFields.find(function(f) { return f.Name === FAVORITE_SKUS_FIELD; });
            var skus = field.Value ? field.Value.split(',') : [];
            if (skus.indexOf(sku) == -1) skus.push(sku);
            field.Value = skus.join(',');
            User.save(user);
            _then(callback, skus);
        });
    }

    // use like `FavoriteProducts.remove(sku, skus => {...})`
    function remove(sku, callback) {
        User.get(function(user) {
            var field = user.CustomFields.find(function(f) { return f.Name === FAVORITE_SKUS_FIELD; });
            if (!field.Value) return;
            var skus = field.Value.split(',').filter(function(item) { return item !== sku; });
            field.Value = skus.join(',');
            User.save(user);
            _then(callback, skus);
        });
    }

    return {
        getAll: getAll,
        getAllProducts: getAllProducts,
        add: add,
        remove: remove
    };
}]);
