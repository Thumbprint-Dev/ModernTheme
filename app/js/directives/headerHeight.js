// Publishes the sticky header's rendered height as --mt-header-height on <html>, so sticky
// content below it (the cart and checkout order summaries) can sit just under the header
// instead of guessing an offset. A fixed "top: 76px" had the checkout summary sliding 47px
// under the 123px desktop header; the header's height varies by site (logo size, whether a
// category bar renders) and by breakpoint, so it's measured rather than hard-coded.
//
//     <section class="mt-header-sticky-wrap" mt-header-height>
four51.app.directive('mtHeaderHeight', ['$window', function($window) {
	return {
		restrict: 'A',
		link: function(scope, element) {
			var root = $window.document.documentElement;

			function publish() {
				root.style.setProperty('--mt-header-height', element[0].getBoundingClientRect().height + 'px');
			}

			publish();

			// The header re-renders after load (category tree, logo image, the user's name),
			// so follow its size rather than measuring once.
			var observer;
			if ($window.ResizeObserver) {
				observer = new $window.ResizeObserver(publish);
				observer.observe(element[0]);
			} else {
				angular.element($window).on('resize', publish);
			}

			scope.$on('$destroy', function() {
				if (observer) observer.disconnect();
				else angular.element($window).off('resize', publish);
				root.style.removeProperty('--mt-header-height');
			});
		}
	};
}]);
