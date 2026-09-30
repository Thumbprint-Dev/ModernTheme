four51.app.controller('Four51Ctrl', ['$scope', '$route', '$rootScope', '$timeout', '$document', '$window', '$location', '$451', 'User', 'Order', 'Security', 'OrderConfig', 'Category', 'AppConst','XLATService', 'GoogleAnalytics', 'FavoriteProducts', 'SiteConfig', 'publicRoutes', 'ComingSoon', 'PriceNotes',
function ($scope, $route, $rootScope, $timeout, $document, $window, $location, $451, User, Order, Security, OrderConfig, Category, AppConst, XLATService, GoogleAnalytics, FavoriteProducts, SiteConfig, publicRoutes, ComingSoon, PriceNotes) {
	$scope.AppConst = AppConst;
	// On $root, like the favorites helpers below: the product card partial is ng-included, and a
	// child scope there can't shadow a $root property.
	$scope.$root.comingSoon = ComingSoon;
	// Cart and checkout order summaries read site.json price notes through this (priceNoteService.js).
	$scope.$root.priceNotes = PriceNotes;
	// This controller sits on <html>, so every view and directive below it -- the
	// nav logo, the home hero -- reads site.json off the inherited `site` object.
	$scope.site = SiteConfig.settings;
	$scope.scroll = 0;
	$scope.isAnon = $451.isAnon; //need to know this before we have access to the user object
	$scope.Four51User = Security;
	// This used to auto-provision a guest (TempCustomer) session for ANY unauthenticated page
	// load, regardless of destination - so a logged-out shopper landing on, say, /catalog would
	// silently become a guest and see the storefront instead of being asked to log in. Now it
	// only does that on the routes meant to be reachable without an account (the same list
	// AnonRouter already treats as public); anything else goes straight to /login.
	if ($451.isAnon && !Security.isAuthenticated()) {
		var currentRoute = $location.path().replace(/^\/+/, '').split('/')[0];
		if (publicRoutes.indexOf(currentRoute) > -1) {
			var tempUser = {
				Username: null,
				Password: null,
				Email: null
			};
			User.login(tempUser,function (u) {
				location.reload();
			});
		} else {
			$location.path('/login');
		}
	}

	// fix Bootstrap fixed-top and fixed-bottom from jumping around on mobile input when virtual keyboard appears
	if ($(window).width() < 960) {
		$(document)
			.on('focus', ':input:not("button")', function (e) {
				$('.navbar-fixed-bottom, .headroom.navbar-fixed-top').css("position", "relative");
			})
			.on('blur', ':input', function (e) {
				$('.navbar-fixed-bottom, .headroom.navbar-fixed-top').css("position", "fixed");
			});
	}

	function init() {
		if (Security.isAuthenticated()) {
			User.get(function (user) {
				$scope.user = user;
				$scope.user.Culture.CurrencyPrefix = XLATService.getCurrentLanguage(user.CultureUI, user.Culture.Name)[1];
				$scope.user.Culture.DateFormat = XLATService.getCurrentLanguage(user.CultureUI, user.Culture.Name)[2];

				if (user.Company && user.Company.Name) {
					$document[0].title = user.Company.Name + ' - ' + $window.location.hostname;
				}

				if (!$scope.user.TermsAccepted)
					$location.path('conditions');

				if (user.CurrentOrderID) {
					Order.get(user.CurrentOrderID, function (ordr) {
						$scope.currentOrder = ordr;
						OrderConfig.costcenter(ordr, user);
					});
				}
				else
					$scope.currentOrder = null;

				if (user.Company.GoogleAnalyticsCode) {
					GoogleAnalytics.analyticsLogin(user.Company.GoogleAnalyticsCode);
				}

			});
			Category.tree(function (data) {
				$scope.tree = data;
				ComingSoon.load(data);
				$scope.$broadcast("treeComplete", data);
			});

			// Favoriting helpers live on $scope.$root, not $scope: directives like the
			// mtProductCard partial's ng-include create child scopes that would shadow a
			// plain $scope property, so every template that renders a heart button reads
			// through $root instead.
			$scope.$root.favoriteProducts = $scope.$root.favoriteProducts || [];
			FavoriteProducts.getAll(function (skus) {
				$scope.$root.favoriteProducts = skus;
			});
			$scope.$root.addFavorite = function (sku) {
				FavoriteProducts.add(sku, function (skus) {
					$scope.$root.favoriteProducts = skus;
				});
			};
			$scope.$root.removeFavorite = function (sku) {
				FavoriteProducts.remove(sku, function (skus) {
					$scope.$root.favoriteProducts = skus;
				});
			};
			$scope.$root.isFavorite = function (sku) {
				return $scope.$root.favoriteProducts.indexOf(sku) > -1;
			};
		}
	}

	try {
		trackJs.configure({
			trackAjaxFail: false
		});
	}
	catch(ex) {}

	$scope.errorSection = '';

	function cleanup() {
		Security.clear();
	}

	$scope.$on('event:auth-loginConfirmed', function(){
		$route.reload();
	});
	$scope.$on("$routeChangeSuccess", init);
	$scope.$on('event:auth-loginRequired', cleanup);

	// $scope.currentOrder is set here (init(), above) and inherited by every other controller
	// via the normal prototypal scope chain - navCtrl.js is the one exception, since <navigation>
	// gets its own controller scope as a SIBLING of ng-view, not a descendant of it. Any update
	// navCtrl.js made directly to "$scope.currentOrder" (e.g. removing a mini-cart item) was only
	// ever shadowing nav's own local copy - the real value here, that every other page actually
	// reads, never changed. A category-page add-to-cart right after a mini-cart removal then sent
	// the server a stale order (still referencing an already-deleted line item, or a deleted
	// order's now-invalid ID), which came back as a raw "Object reference not set to an instance
	// of an object" exception. Order.deletelineitem/save/etc. already broadcast this event on
	// every mutation (orderService.js's _then helper) - listening for it HERE, on the scope that
	// actually owns currentOrder, is what makes every other page see the update too. Guarded by
	// CurrentOrderID so an approver opening someone else's order (Order History) never overwrites
	// this shopper's own cart.
	$scope.$on('event:orderUpdate', function(event, order) {
		if (!order || order.Status != 'Unsubmitted') {
			if (!order || ($scope.currentOrder && order.ID === $scope.currentOrder.ID))
				$scope.currentOrder = null;
			return;
		}
		if ($scope.user && order.ID === $scope.user.CurrentOrderID) {
			$scope.currentOrder = order;
		}
	});

	// Timeout timer value
	var TimeOutTimerValue = 30*60*1000;

	// Start a timeout
	var TimeOut_Thread = $timeout(function(){ LogoutByTimer() } , TimeOutTimerValue);
	var bodyElement = angular.element($document);

	angular.forEach(['keydown', 'keyup', 'click', 'mousemove', 'DOMMouseScroll', 'mousewheel', 'mousedown', 'touchstart', 'touchmove', 'scroll', 'focus'],
		function(EventName) {
			bodyElement.bind(EventName, function (e) { TimeOut_Resetter(e) });
		});

	// Same destination as the Log Out menu item (navCtrl): a session dropped on
	// the idle timer and left sitting on the page is the same broken-looking
	// state, and more confusing for not having been asked for.
	function LogoutByTimer(){
		function goToLogin() {
			$window.location.href = '/' + $451.apiName + '/login';
		}

		User.logout($scope.user, goToLogin, function(ex){
			console.log(ex.Message);
			goToLogin();
		});
	}

	function TimeOut_Resetter(e){
		/// Stop the pending timeout
		$timeout.cancel(TimeOut_Thread);

		/// Reset the timeout
		TimeOut_Thread = $timeout(function(){ LogoutByTimer() } , TimeOutTimerValue);
	}
}]);