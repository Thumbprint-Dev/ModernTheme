// Themed replacement for window.confirm(). The browser's own dialog is unstyled, titled with
// the site's address ("localhost:3000 says" / "www.thebrandedstore.com says") and blocks the
// page; this one matches the error modal and resolves a promise instead.
//
//     ConfirmModal.open({
//         title: 'Remove item?',
//         message: 'Pan Scraper will be taken out of your cart.',
//         image: item.Product.SmallImageUrl,   // optional product thumbnail
//         confirmText: 'Remove',
//         danger: true                         // red confirm button + trash icon
//     }).then(function() { /* confirmed */ });
//
// Cancel, the X, Escape and a backdrop click all reject (nothing to handle - just don't act).
// Focus starts on Cancel, so an accidental Enter never removes anything.
four51.app.factory('ConfirmModal', ['$rootScope', '$compile', '$document', '$q', '$timeout', function($rootScope, $compile, $document, $q, $timeout) {
	var template =
		'<div class="mt-error-modal-backdrop mt-confirm-backdrop" ng-click="cancel()">' +
			'<div class="mt-error-modal mt-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="{{titleID}}" aria-describedby="{{messageID}}" ng-click="$event.stopPropagation()">' +
				'<button type="button" class="mt-error-modal-close" ng-click="cancel()" aria-label="{{\'Close\' | r | xlat}}"><i class="fa fa-times"></i></button>' +
				'<div class="mt-error-modal-head">' +
					'<span class="mt-error-modal-icon" ng-class="{\'mt-confirm-icon-neutral\': !opts.danger}" aria-hidden="true"><i class="fa" ng-class="opts.danger ? \'fa-trash-o\' : \'fa-question\'"></i></span>' +
					'<h2 class="mt-error-modal-title" id="{{titleID}}">{{opts.title | r | xlat}}</h2>' +
				'</div>' +
				'<div class="mt-confirm-body" id="{{messageID}}">' +
					'<img class="mt-confirm-photo" ng-if="opts.image" ng-src="{{opts.image}}" alt="" />' +
					'<p class="mt-error-modal-message">{{opts.message | r | xlat}}</p>' +
				'</div>' +
				'<div class="mt-error-modal-actions mt-confirm-actions">' +
					'<button type="button" class="mt-header-btn mt-confirm-cancel" ng-click="cancel()">{{(opts.cancelText || \'Cancel\') | r | xlat}}</button>' +
					'<button type="button" class="mt-btn-accent" ng-class="{\'mt-confirm-danger\': opts.danger}" ng-click="confirm()">{{(opts.confirmText || \'OK\') | r | xlat}}</button>' +
				'</div>' +
			'</div>' +
		'</div>';

	var open = function(opts) {
		var deferred = $q.defer();
		var scope = $rootScope.$new(true);
		scope.opts = opts || {};
		scope.titleID = 'mt-confirm-title-' + scope.$id;
		scope.messageID = 'mt-confirm-message-' + scope.$id;

		var doc = $document[0];
		var previousFocus = doc.activeElement;
		var element = $compile(template)(scope);
		angular.element(doc.body).append(element);

		function close(confirmed) {
			$document.off('keydown', onKeydown);
			element.remove();
			scope.$destroy();
			if (previousFocus && previousFocus.focus && doc.body.contains(previousFocus)) previousFocus.focus();
			confirmed ? deferred.resolve() : deferred.reject();
		}

		scope.confirm = function() { close(true); };
		scope.cancel = function() { close(false); };

		function onKeydown(e) {
			if (e.key === 'Escape' || e.keyCode === 27) scope.$apply(scope.cancel);
		}
		$document.on('keydown', onKeydown);

		$timeout(function() {
			var cancel = element[0].querySelector('.mt-confirm-cancel');
			if (cancel) cancel.focus();
		});

		return deferred.promise;
	};

	return { open: open };
}]);
