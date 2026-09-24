// "Added to cart" confirmation, top right, just below the sticky header. Fades in when any
// add-to-cart path broadcasts event:addedToCart, and fades out on its own after
// VISIBLE_MS - held open while the pointer or keyboard focus is on it, so the View cart
// link can still be reached. One instance, in index.html; callers only broadcast:
//
//     $rootScope.$broadcast('event:addedToCart', { product: p, variant: v, quantity: 2 });
//
// This replaced popping the header mini-cart open for a few seconds, which sat in the same
// corner and needed simulated clicks to drive (ui-bootstrap 0.10's dropdown has no API).
four51.app.directive('mtCartToast', ['$rootScope', '$timeout', '$document', function($rootScope, $timeout, $document) {
	var VISIBLE_MS = 3000;
	var GAP = 12;

	return {
		restrict: 'E',
		scope: {},
		template:
			'<div class="mt-cart-toast" role="status" aria-live="polite">' +
				'<div class="mt-cart-toast-body" ng-if="item">' +
					'<img class="mt-cart-toast-photo" ng-if="item.image" ng-src="{{item.image}}" alt="" />' +
					'<div class="mt-placeholder-photo mt-cart-toast-photo" ng-if="!item.image"></div>' +
					'<div class="mt-cart-toast-info">' +
						'<p class="mt-cart-toast-title"><i class="fa fa-check-circle" aria-hidden="true"></i> {{\'Added to cart\' | r | xlat}}</p>' +
						'<p class="mt-cart-toast-name">{{item.name}}</p>' +
						'<p class="mt-cart-toast-meta" ng-if="item.quantity">{{\'Qty\' | r | xlat}}: {{item.quantity}}</p>' +
					'</div>' +
					'<button type="button" class="mt-cart-toast-close" ng-click="hide()" aria-label="{{\'Close\' | r | xlat}}"><i class="fa fa-times"></i></button>' +
				'</div>' +
				'<a class="mt-cart-toast-link" href="cart" ng-if="item" ng-click="hide()">{{\'View cart\' | r | xlat}} <i class="fa fa-angle-right" aria-hidden="true"></i></a>' +
			'</div>',
		link: function(scope, element) {
			var toast = element[0].querySelector('.mt-cart-toast');
			var hideTimer;

			// Visibility is a plain class toggled here rather than ng-show/ng-class, so ngAnimate
			// stays out of it and the CSS transition alone drives the fade.
			function setVisible(visible) {
				toast.classList[visible ? 'add' : 'remove']('mt-cart-toast-visible');
			}

			// The header is sticky and headroom can slide it away on scroll, so measure where
			// it ends right now instead of hard-coding an offset.
			function positionBelowHeader() {
				var header = $document[0].querySelector('.mt-header-sticky-wrap');
				var bottom = header ? header.getBoundingClientRect().bottom : 0;
				toast.style.top = Math.max(GAP, bottom + GAP) + 'px';
			}

			function scheduleHide() {
				$timeout.cancel(hideTimer);
				hideTimer = $timeout(scope.hide, VISIBLE_MS);
			}

			scope.hide = function() {
				$timeout.cancel(hideTimer);
				setVisible(false);
			};

			var off = $rootScope.$on('event:addedToCart', function(event, added) {
				added = added || {};
				var product = added.product || {};
				var variant = added.variant || {};
				scope.item = {
					name: product.Name || variant.Description || '',
					image: variant.LargeImageUrl || product.SmallImageUrl || product.LargeImageUrl || '',
					quantity: added.quantity
				};
				positionBelowHeader();
				// Restart the entrance even if a previous toast is still showing, so a
				// second add reads as a new confirmation rather than an unchanged box.
				setVisible(false);
				void toast.offsetWidth;
				setVisible(true);
				scheduleHide();
			});

			function hold() { $timeout.cancel(hideTimer); }
			function release() {
				if (toast.contains($document[0].activeElement) || toast.matches(':hover')) return;
				scheduleHide();
			}
			toast.addEventListener('mouseenter', hold);
			toast.addEventListener('mouseleave', release);
			toast.addEventListener('focusin', hold);
			toast.addEventListener('focusout', function() { $timeout(release); });

			scope.$on('$destroy', function() {
				off();
				$timeout.cancel(hideTimer);
			});
		}
	};
}]);
