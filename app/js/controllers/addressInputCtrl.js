four51.app.controller('AddressInputCtrl', ['$scope', '$rootScope', '$location', 'User', 'Address', 'Resources',
function ($scope, $rootScope, $location, User, Address, Resources) {
    var persistAddress = function(success) {
	    $scope.objectExists = false;
        if(!$scope.address.State){
            $scope.address.State  =  '';
        }
        Address.save($scope.address,
	        function(address) {
                $rootScope.$broadcast('event:AddressSaved', address);
                if (success) success(address);
            },
	        function(ex) {
	            if (ex.Code.is('ObjectExistsException'))
	                $scope.objectExists = true;
	            }
        );
    };

    // There is deliberately no autosave here. Every field in addressInput.html used to
    // call an autoSaveIfValid() on ng-blur (and ng-change on the selects and
    // checkboxes), so tabbing out of a field persisted the address mid-edit -- a
    // half-typed street line could be written to the address book, and each save
    // broadcast event:AddressSaved, which reassigns the order's Ship/BillAddressID and
    // closes the form underneath the shopper. Saving happens on submit only.
    function saveAndReturn() {
        persistAddress(function() {
            $location.path($scope.return);
        });
    }

    // Address verification (Four51 CustomSolutions "Address Verification"): Save first checks
    // a US address against USPS via Address.validate, and only then saves.
    //  - A match identical to what was typed saves straight away - nothing to choose between.
    //  - A different match, or no match at all, opens the choice modal (addressInput.html):
    //    the suggested address beside the entered one, and the shopper picks which to save.
    //  - Non-US addresses, and any error from the endpoint itself (e.g. a site that doesn't
    //    have it enabled), save as entered, so verification can never block saving.
    $scope.verification = null;

    function lines(a) {
        return [a.Street1, a.Street2, a.City, a.State, a.Zip].map(function(part) {
            return (part || '').toString().trim().toUpperCase().replace(/\s+/g, ' ');
        }).join('|');
    }

    // Only a response carrying a ZIP+4 is a real USPS match. For an address it can't find, the
    // endpoint doesn't return "no address" - it echoes the input back uppercased with an empty
    // ZIPPlus4 (seen live: "99999 Nowhere Imaginary Rd" came back as-is). The CustomSolutions
    // code offered that echo as a "verified" suggestion; here it counts as unverified.
    function suggestionFrom(result, entered) {
        var match = result && result.address;
        if (!match || !match.streetAddress || !match.ZIPPlus4) return null;
        return {
            Street1: match.streetAddress,
            Street2: match.secondaryAddress || '',
            City: match.city,
            State: match.state,
            Zip: match.ZIPCode + '-' + match.ZIPPlus4,
            Country: entered.Country
        };
    }

    $scope.save = function() {
        if (!$scope.address || $scope.address.Country != 'US') {
            saveAndReturn();
            return;
        }
        $scope.verifying = true;
        Address.validate($scope.address,
            function(result) {
                $scope.verifying = false;
                var suggested = suggestionFrom(result, $scope.address);
                // A plain ZIP matching the first five digits of a ZIP+4 is the same address.
                if (suggested && lines(suggested).replace(/-\d{4}$/, '') == lines($scope.address).replace(/-\d{4}$/, '')) {
                    saveAndReturn();
                    return;
                }
                $scope.verification = {
                    suggested: suggested,
                    entered: angular.copy($scope.address),
                    choice: suggested ? 'suggested' : 'entered'
                };
            },
            function() {
                $scope.verifying = false;
                saveAndReturn();
            }
        );
    };

    // Copies the chosen lines onto the bound address rather than replacing the object, so the
    // checkout/addresses page that passed it in keeps the same reference.
    $scope.useVerifiedAddress = function() {
        var v = $scope.verification;
        if (v.choice == 'suggested' && v.suggested)
            angular.extend($scope.address, v.suggested);
        $scope.verification = null;
        saveAndReturn();
    };

    $scope.cancelVerification = function() {
        $scope.verification = null;
    };

    $scope.delete = function() {
        Address.delete(this.address, function() {
            $location.path($scope.return);
        });
    };

	$scope.cancel = function() {
		$scope.return ? $location.path($scope.return) : $rootScope.$broadcast('event:AddressCancel');
	};

    $scope.countries = Resources.countries;
    $scope.states = Resources.states;

    $scope.country = function(item) {
        return $scope.address != null ? $scope.address.Country == item.country : false;
    };
    $scope.hasStates = function() {
        return $scope.address != null ? $scope.address.Country == 'US' || $scope.address.Country == 'CA' || $scope.address.Country == 'NL' : false;
    };

    $scope.isPhoneRequired = function() {
        return ($scope.user.Permissions.contains('BillingAddressPhoneRequired') && $scope.address.IsBilling) || ($scope.user.Permissions.contains('ShipAddressPhoneRequired') && $scope.address.IsShipping) || ($scope.user.Permissions.contains('BillingAddressPhoneRequired') && $scope.user.Permissions.contains('ShipAddressPhoneRequired'));
    };

    var streetComplete = null;
    var streetNum = null;
    var streetName = null;
    var tempShipping = null;
    var tempBilling = null;

    $scope.$watch('addressobj', function(newval, oldval) {
        if (newval != oldval){
            $scope.address.IsShipping   ? (tempShipping = true) : '';
            $scope.address.IsBilling    ? (tempBilling = true)  : '';
            $scope.address = {'Country':"US"};
            tempShipping    ? $scope.address.IsShipping = tempShipping  : '';
            tempBilling     ? $scope.address.IsBilling  = tempBilling   : '';
            streetComplete  = null;
            streetNum       = null;
            streetName      = null;
            $scope.makeAddress(newval);
        }
    }, true);

    $scope.makeAddress = function(addressobj){
        $scope.address.AddressName = addressobj.name;
        addressobj.formatted_phone_number ? $scope.address.Phone = addressobj.formatted_phone_number : '';
            angular.forEach(addressobj.address_components, function(component){
                component.types[0] == 'street_number'   ? (streetNum = component.long_name)     : null;
                component.types[0] == 'route'           ? (streetName = component.long_name)    : null;
                if (streetNum || streetName){
                    if (streetNum && streetName){
                        streetComplete = streetNum + ' ' + streetName;
                    }
                    else if (streetNum){
                        streetComplete = streetNum;
                    }
                    else{
                        streetComplete = streetName;
                    }
                    $scope.address.Street1 = streetComplete;
                }
                component.types[0] == 'locality'                    ? ($scope.address.City = component.long_name)       : '';
                component.types[0] == 'administrative_area_level_1' ? ($scope.address.State = component.short_name)     : '';
                component.types[0] == 'country'                     ? ($scope.address.Country = component.short_name)   : '';
                component.types[0] == 'postal_code'                 ? ($scope.address.Zip = component.short_name)       : '';
        });
        // Deliberately does not save. Picking a suggestion only fills the fields in;
        // nothing is persisted until the form is submitted, same as typing them by hand.
    }
}]);