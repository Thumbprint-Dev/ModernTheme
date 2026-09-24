// Error messages shown as a modal the shopper closes themselves. They used to go through
// alertShow's flash in the fixed bottom bar, which faded out on its own a moment later -
// easy to miss entirely, and gone before a long message could be read.
//
// A single server message (a declined card, an approval rule, a failed save):
//
//     <mt-error-modal message="errorMessage"></mt-error-modal>
//     <mt-error-modal message="couponError" heading="Coupon not applied"></mt-error-modal>
//
// Or any content of the page's own, opened by a flag - checkout's list of missing details:
//
//     <mt-error-modal open="showCheckoutErrors" heading="Some details are missing">
//         <ul class="mt-error-modal-list">...</ul>
//     </mt-error-modal>
//
// The content is transcluded, so it binds to the page's scope, not this directive's.
// heading is optional plain text and defaults to "Something went wrong".
//
// Closing writes null/false back to the bound expression, so the page's own "clear the
// error before the next request" handling keeps working, and the same message arriving
// again on a retry reopens the modal rather than being swallowed as an unchanged value.
four51.app.directive('mtErrorModal', ['$document', '$timeout', function($document, $timeout) {
	return {
		restrict: 'E',
		transclude: true,
		scope: {
			message: '=?',
			open: '=?',
			heading: '@'
		},
		// ng-show rather than ng-if on the backdrop: ngTransclude inside an ngIf in a
		// directive's own template is unreliable on Angular 1.2.
		template:
			'<div class="mt-error-modal-backdrop" ng-show="isOpen()" ng-click="close()">' +
				'<div class="mt-error-modal" role="alertdialog" aria-modal="true" aria-labelledby="{{titleID}}" aria-describedby="{{bodyID}}" ng-click="$event.stopPropagation()">' +
					'<button type="button" class="mt-error-modal-close" ng-click="close()" aria-label="{{\'Close\' | r | xlat}}">' +
						'<i class="fa fa-times"></i>' +
					'</button>' +
					'<div class="mt-error-modal-head">' +
						'<span class="mt-error-modal-icon" aria-hidden="true"><i class="fa fa-exclamation"></i></span>' +
						'<h2 class="mt-error-modal-title" id="{{titleID}}">{{(heading || \'Something went wrong\') | r | xlat}}</h2>' +
					'</div>' +
					'<div id="{{bodyID}}">' +
						// ng-bind-html because some platform messages carry markup (checkout already
						// rendered them this way); ngSanitize strips anything executable.
						'<p class="mt-error-modal-message" ng-if="message" ng-bind-html="message | r | xlat"></p>' +
						'<div ng-transclude></div>' +
					'</div>' +
					'<div class="mt-error-modal-actions">' +
						'<button type="button" class="mt-btn-accent" ng-click="close()">{{\'OK\' | r | xlat}}</button>' +
					'</div>' +
				'</div>' +
			'</div>',
		link: function(scope, element) {
			scope.titleID = 'mt-error-modal-title-' + scope.$id;
			scope.bodyID = 'mt-error-modal-body-' + scope.$id;

			scope.isOpen = function() {
				return !!(scope.message || scope.open);
			};

			scope.close = function() {
				if (scope.message) scope.message = null;
				if (scope.open) scope.open = false;
			};

			function onKeydown(e) {
				if (scope.isOpen() && (e.key === 'Escape' || e.keyCode === 27))
					scope.$apply(scope.close);
			}
			$document.on('keydown', onKeydown);
			scope.$on('$destroy', function() {
				$document.off('keydown', onKeydown);
			});

			// Move focus into the modal so Enter/Space on the OK button dismisses it, and
			// screen readers announce the alertdialog.
			scope.$watch('isOpen()', function(isOpen) {
				if (!isOpen) return;
				$timeout(function() {
					var ok = element[0].querySelector('.mt-error-modal-actions .mt-btn-accent');
					if (ok) ok.focus();
				});
			});
		}
	};
}]);
