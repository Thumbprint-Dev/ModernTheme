angular.module('OrderCloud-AnonRouter', []);

angular.module('OrderCloud-AnonRouter')

    .run(run)
    .constant('after', 'checkout')
    .constant('publicRoutes', ['login', 'admin', 'conditions', 'contactus'])
    .factory('AnonRouter', AnonRouter)
;

run.$inject = ['$rootScope', '$location', 'User', 'publicRoutes'];
function run($rootScope, $location, User, publicRoutes) {
    $rootScope.$on('$locationChangeStart', function (event, newUrl, oldUrl) {
            var route = newUrl.split('/')[newUrl.split('/').length-1].split('?')[0];
            if (publicRoutes.indexOf(route) == -1) {
                User.get(function(u) {
                    if (u.Type == 'TempCustomer') $location.path('login');
                });
            }
        }
    );
}

AnonRouter.$inject = ['$location', 'User', 'after'];
function AnonRouter($location, User, after) {
    var service = {
        route: _route
    };
    return service;

    function _route() {
        if (after == 'cart' || after == 'checkout') {
            User.get(function(u) {
                $location.path(u.CurrentOrderID ? after : 'catalog');
            });
        }
        else {
            $location.path(after);
        }
    }
}
