four51.app.directive('creditcard', function() {
	var obj = {
		restrict: 'E',
		templateUrl: 'partials/controls/creditCard.html',
		controller: ['$scope', function($scope) {
			function validateType(type) {
				if (!type) // denotes a type we dont' even support.
					return true;
				if (type == 'AmericanExpress')
					return $scope.user.Permissions.contains('PayByAmex');
				else
					return $scope.user.Permissions.contains('PayBy' + type);
			}

			function digitsOnly(value) {
				return value ? String(value).replace(/[\s-]/g, '') : '';
			}

			// Luhn checksum on the digit string - the old version did the arithmetic on a parsed
			// Number, which loses precision past 16 digits.
			function validateNumber(number) {
				if (!/^\d{12,19}$/.test(number)) return false;
				var sum = 0, double = false;
				for (var i = number.length - 1; i >= 0; i--) {
					var digit = +number.charAt(i);
					if (double) {
						digit *= 2;
						if (digit > 9) digit -= 9;
					}
					sum += digit;
					double = !double;
				}
				return sum % 10 === 0;
			}

			// ui-mask="99/99" stores MMYY without the slash.
			function validateExpiration(date) {
				var value = digitsOnly(date);
				if (value.length != 4) return false;
				var month = parseInt(value.substring(0, 2), 10);
				var year = parseInt(value.substring(2, 4), 10) + 2000;
				var now = new Date();
				if (month < 1 || month > 12) return false;
				return year > now.getFullYear() || (year == now.getFullYear() && month >= now.getMonth() + 1);
			}

			function validateCvn(cvn, type) {
				var value = String(cvn);
				if (!/^\d+$/.test(value)) return false;
				if (type == 'AmericanExpress') return value.length == 4;
				return type ? value.length == 3 : (value.length == 3 || value.length == 4);
			}

			function setFieldValidity(fieldName, key, valid) {
				var field = $scope.cart_billing && $scope.cart_billing[fieldName];
				if (field) field.$setValidity(key, valid);
			}

			function cardEntryActive() {
				return !!($scope.currentOrder && $scope.currentOrder.PaymentMethod == 'CreditCard' && !$scope.currentOrder.CreditCardID);
			}

			// Validity lives on each input, not on cart_billing itself, and is cleared whenever
			// card entry isn't in use. The old form-level errors outlived the card fields: typing
			// a bad number and then switching to a PO or a saved card left cart_billing invalid,
			// which kept Submit Order disabled with nothing on screen to fix. Empty fields are
			// left to ng-required so they read as "still needed", not as mistakes.
			function validateCard() {
				var active = cardEntryActive();
				var card = ($scope.currentOrder && $scope.currentOrder.CreditCard) || {};
				var number = digitsOnly(card.AccountNumber);
				setFieldValidity('creditCardNumber', 'creditCardNumber', !active || !number || validateNumber(number));
				setFieldValidity('creditCardNumber', 'creditCardType', !active || !number || validateType(card.Type));
				setFieldValidity('expirationDate', 'expDate', !active || !card.ExpirationDate || validateExpiration(card.ExpirationDate));
				setFieldValidity('cvnNumber', 'cvnNumber', !active || !card.CVN || validateCvn(card.CVN, card.Type));
			}

			$scope.$watch(function() {
				var card = ($scope.currentOrder && $scope.currentOrder.CreditCard) || {};
				return [cardEntryActive(), card.AccountNumber, card.Type, card.ExpirationDate, card.CVN].join('|');
			}, validateCard);

			$scope.$watch('currentOrder.CreditCard.AccountNumber', function(ccnumber) {
				//http://tamas.io/custom-angularjs-filter-to-determine-credit-card-type/
				if (!ccnumber) return;
				$scope.currentOrder.CreditCard.Type = null;
				$scope.creditCardIconUrl = null;
				if (ccnumber.length >= 4) {
					var cardType;
					if(/^(34)|^(37)/.test(ccnumber)) {
						cardType = "AmericanExpress";
					}
					if(/^30[0-5]/.test(ccnumber)) {
						cardType = "DinersClub"; //Carte Blanche
					}
					if(/^(2014)|^(2149)/.test(ccnumber)) {
						cardType = "DinersClub"; //enRoute
					}
					if(/^36/.test(ccnumber)) {
						cardType = "DinersClub"; //International
					}
					if(/^(6011)|^(622(1(2[6-9]|[3-9][0-9])|[2-8][0-9]{2}|9([01][0-9]|2[0-5])))|^(64[4-9])|^65/.test(ccnumber)) {
						cardType = "Discover";
					}
					if(/^35(2[89]|[3-8][0-9])/.test(ccnumber)) {
						cardType = "JCB";
					}
					if(/^(6304)|^(6706)|^(6771)|^(6709)/.test(ccnumber)) {
						cardType = "Laser"; //Laser
					}
					if(/^(5018)|^(5020)|^(5038)|^(5893)|^(6304)|^(6759)|^(6761)|^(6762)|^(6763)|^(0604)/.test(ccnumber)) {
						cardType = "Switch"; //Maestro
					}
					if(/^5[1-5]/.test(ccnumber)) {
						cardType = "MasterCard";
					}
					if (/^4/.test(ccnumber)) {
						cardType = "Visa";
					}
					if (/^(4026)|^(417500)|^(4405)|^(4508)|^(4844)|^(4913)|^(4917)/.test(ccnumber)) {
						cardType = "Electron"; //Visa Electron
					}
					$scope.currentOrder.CreditCard.Type = cardType;
					$scope.creditCardIconUrl = cardType ? 'css/images/CreditCardIcons/' + cardType + '.png' : null;
				}
			});

			$scope.friendlyName = function(type) {
				switch(type) {
					case 'AmericanExpress':
						return 'American Express'
					case 'DinersClub':
						return 'Diners Club'
					default:
						return type;
				}
			}
		}]
	};
	return obj;
});
