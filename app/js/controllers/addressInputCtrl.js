four51.app.controller('AddressInputCtrl', ['$scope', '$rootScope', '$location', 'User', 'Address', 'Resources', 'SiteConfig', 'FeatureFlags',
function ($scope, $rootScope, $location, User, Address, Resources, SiteConfig, FeatureFlags) {
    // The addressinput directive has an isolate scope, so the `site` object Four51Ctrl puts on
    // every other page's scope doesn't reach this template - it needs its own reference.
    $scope.site = SiteConfig.settings;

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

    function containsPOBox(address) {
        if (!address) return false;

        // Matches variations of P.O. Box, Post Office Box, Box #, drawer/caller numbers, etc.
        const poBoxRegex = /\b(?:P(?:OST)?\.?\s*O(?:FFICE)?\.?\s*)?B(?:OX|IN)?\b|\bP\b\s*\bO\b/i;

        const street1 = address.Street1 || '';
        const street2 = address.Street2 || '';

        return poBoxRegex.test(street1) || poBoxRegex.test(street2);
    }

    // Address verification (Four51 CustomSolutions "Address Verification"): Save first checks
    // a US address against USPS via Address.validate, and only then saves.
    //  - A match identical to what was typed saves straight away - nothing to choose between.
    //  - A different match, or no match at all, opens the choice modal (addressInput.html):
    //    the suggested address beside the entered one, and the shopper picks which to save.
    //  - Non-US addresses, and any error from the endpoint itself (e.g. a site that doesn't
    //    have it enabled), save as entered, so verification can never block saving.
    $scope.verification = null;
    $scope.poBoxError = false;
    $scope.line2Check = null;
    // Smarty's residential delivery indicator for the current address (true/false, or null
    // when Smarty could not say). Shown beside Save and carried into the verification modal.
    $scope.addressType = null;
    // Smarty's standardized values for blank fields (City/State/Zip), shown as grey
    // placeholder text until the shopper types their own value.
    $scope.fieldHints = {};

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

    // Debounce timers for the PO Box and Address Line 2 checks
    var poBoxCheckTimer = null;
    var line2CheckTimer = null;
    var line2CheckSeq = 0;

    function line2WatchValue() {
        var a = $scope.address || {};
        return [a.Street1, a.Street2, a.City, a.State, a.Zip, a.Country].map(function(part) {
            return (part || '').toString().trim().toUpperCase();
        }).join('|');
    }

    function applyCheck(result) {
        $scope.line2Check = result && result.status != 'valid' ? result : null;
        $scope.addressType = result ? result.residential : null;
        $scope.fieldHints = result && result.suggestions || {};
    }

    function checkLine2() {
        var seq = line2CheckSeq;
        Address.checkLine2(angular.copy($scope.address)).then(function(result) {
            if (seq !== line2CheckSeq) return;
            applyCheck(result);
        }, function() {
            if (seq !== line2CheckSeq) return;
            applyCheck(null);
        });
    }

    function scheduleLine2Check() {
        if (line2CheckTimer) {
            clearTimeout(line2CheckTimer);
            line2CheckTimer = null;
        }
        // A warning, address type or grey suggestion from the previous value must not linger
        // while the user edits.
        line2CheckSeq++;
        $scope.line2Check = null;
        $scope.addressType = null;
        $scope.fieldHints = {};

        if (!$scope.address || $scope.address.IsCustEditable == false) return;
        if (!Address.canCheck($scope.address)) return;

        line2CheckTimer = setTimeout(function() {
            line2CheckTimer = null;
            checkLine2();
        }, 800); // 800ms debounce
    }

    // PO Box validation and the live Address Line 2 check ship behind the
    // new_address_verification flag; when it is off, none of these watches are registered, so
    // the form behaves exactly as it did before.
    if (FeatureFlags.isOn('new_address_verification')) {
        // Watch Street1 and Street2 for changes and debounce PO Box validation
        $scope.$watch(function() {
            return ($scope.address ? $scope.address.Street1 : '') + '|' + ($scope.address ? $scope.address.Street2 : '');
        }, function() {
            if (poBoxCheckTimer) {
                clearTimeout(poBoxCheckTimer);
            }
            poBoxCheckTimer = setTimeout(function() {
                $scope.$apply(function() {
                    $scope.poBoxError = containsPOBox($scope.address);
                });
            }, 500); // 500ms debounce
        });

        // Live Smarty check for Address Line 2. This is advisory: the Save button is not
        // gated on it, and a failed/timed-out request just clears the warning.
        $scope.$watch(line2WatchValue, scheduleLine2Check);

        $scope.useLine2Suggestion = function() {
            if (!$scope.line2Check || !$scope.line2Check.suggestedLine2) return;
            $scope.address.Street2 = $scope.line2Check.suggestedLine2;
        };

        $scope.removeLine2 = function() {
            $scope.address.Street2 = '';
        };
    }

    // The verification modal already has the address strings; ask Smarty for each one's RDI so
    // the suggested and entered cards can show Residential/Commercial. Failure just leaves the
    // label off.
    function lookupResidential(verification, property, address) {
        Address.checkLine2(angular.copy(address)).then(function(result) {
            if ($scope.verification !== verification) return;
            verification[property] = result ? result.residential : null;
        }, function() {
            if ($scope.verification !== verification) return;
            verification[property] = null;
        });
    }

    $scope.save = function() {
        // Check for PO Box before proceeding with verification (new_address_verification flag)
        if (FeatureFlags.isOn('new_address_verification')) {
            if ($scope.address && containsPOBox($scope.address)) {
                $scope.poBoxError = true;
                return;
            }
            $scope.poBoxError = false;
        }

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
                var flagOn = FeatureFlags.isOn('new_address_verification');
                var verification = {
                    suggested: suggested,
                    entered: angular.copy($scope.address),
                    choice: suggested ? 'suggested' : 'entered',
                    suggestedResidential: null,
                    enteredResidential: flagOn ? $scope.addressType : null
                };
                $scope.verification = verification;

                // The live check usually already filled in the entered address. If the shopper
                // hit Save before the debounce ran, look it up now alongside the suggested one.
                if (flagOn) {
                    if (verification.enteredResidential == null)
                        lookupResidential(verification, 'enteredResidential', verification.entered);
                    if (suggested)
                        lookupResidential(verification, 'suggestedResidential', suggested);
                }
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
        if (v.choice == 'suggested' && v.suggested) {
            angular.extend($scope.address, v.suggested);
            $scope.addressType = v.suggestedResidential;
        }
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

    // Clean up timer on controller destruction
    $scope.$on('$destroy', function() {
        if (poBoxCheckTimer) {
            clearTimeout(poBoxCheckTimer);
        }
        if (line2CheckTimer) {
            clearTimeout(line2CheckTimer);
        }
        line2CheckSeq++;
    });
}]);
