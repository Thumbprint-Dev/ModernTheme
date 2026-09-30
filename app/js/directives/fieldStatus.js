// Tags a form field with its fill-in state so checkout can show what's left to complete:
//   mt-fs-needed - required and still empty (a soft highlight from the start)
//   mt-fs-error  - invalid and the shopper has already left the field
//   mt-fs-valid  - required, filled in and valid (shows a check)
// A field that's invalid but still being typed into gets no state, so a half-typed card
// number doesn't turn red mid-entry. The classes are only styled inside .mt-checkout.
four51.app.directive('mtFieldStatus', ['$timeout', function($timeout) {
	var STATES = ['needed', 'error', 'valid'];

	function isEmpty(value) {
		return value === undefined || value === null || value === '' ||
			(angular.isString(value) && !value.trim());
	}

	return {
		restrict: 'A',
		require: 'ngModel',
		link: function(scope, element, attrs, ngModel) {
			function currentState() {
				var empty = isEmpty(ngModel.$viewValue);
				if (ngModel.$invalid) {
					if (ngModel.$touched) return 'error';
					return empty ? 'needed' : '';
				}
				return !empty && attrs.required ? 'valid' : '';
			}

			scope.$watch(currentState, function(state) {
				angular.forEach(STATES, function(name) {
					element.toggleClass('mt-fs-' + name, name == state);
				});
			});

			// AngularJS 1.2 has no $touched; set the same flag 1.3+ uses so templates can gate
			// error messages on it too.
			element.on('blur', function() {
				if (ngModel.$touched) return;
				$timeout(function() {
					ngModel.$touched = true;
				});
			});
		}
	};
}]);
