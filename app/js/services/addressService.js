four51.app.factory('Address', ['$resource', '$451', 'Error', function($resource, $451, Error) {
    function _then(fn, data) {
        if (angular.isFunction(fn))
            fn(data);
    }

	function _extend(address) {	}

    var _get = function(id, success) {
		var address = store.get('451Cache.Address.' + id);
	    address ? (function() { _extend(address); _then(success, address); })() :
            $resource($451.api('address/:id'), { id: '@id' }).get({ id: id }).$promise.then(function(add) {
                store.set('451Cache.Address.' + id, add);
	            _extend(add);
                _then(success, add);
            });
    }

    var _save = function(address, success, error) {
        return $resource($451.api('address')).save(address).$promise.then(
		    function(add) {
		        store.remove('451Cache.Addresses');
	            store.set('451Cache.Address.' + add.ID, add);
		        _extend(add);
	            _then(success, add);
	        },
	        function(ex) {
		        error(Error.format(ex));
	        }
        );
    }

    var _delete = function(address, success) {
        return $resource($451.api('address')).delete(address).$promise.then(function() {
	        store.remove('451Cache.Addresses');
            store.remove('451Cache.Address.' + address.ID);
            _then(success);
        });
    }

    // Four51's address verification endpoint (CustomSolutions "Address Verification"). Checks a
    // US address against USPS data without saving anything; a match comes back as
    // { address: { streetAddress, secondaryAddress, city, state, ZIPCode, ZIPPlus4 } }, no
    // match as a response with no address. Sites without the endpoint enabled get an error.
    var _validate = function(address, success, error) {
        return $resource($451.api('address/validate')).save(address).$promise.then(
            function(result) {
                _then(success, result);
            },
            function(ex) {
                error(Error.format(ex));
            }
        );
    }

    return {
        get: _get,
        save: _save,
        delete: _delete,
        validate: _validate
    };
}]);