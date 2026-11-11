four51.app.factory('Address', ['$resource', '$451', 'Error', '$q', '$httpBackend', function($resource, $451, Error, $q, $httpBackend) {
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

    // Smarty US Street API check for Address Line 2 (apartment / suite).
    //
    // This is advisory only. The form still saves through Address.validate; a Smarty timeout,
    // CORS failure or rejected key resolves to null, so the check can never block or fail a save.
    //
    // The key is Smarty's embedded demo key. It is public by design and only works from hosts
    // registered with Smarty, so an unregistered storefront simply gets no warnings.
    //
    // $httpBackend, not $http: the global $http interceptor attaches the Four51 Authorization
    // header and treats a 401/403 as a storefront login problem, neither of which applies here.
    //
    // The response is interpreted with the rules Smarty documents under "How to interpret raw
    // data output" on the US Street API reference page:
    //   enhanced_match=none                  -> the whole address is not real
    //   enhanced_match=missing-secondary     -> a unit is needed (when N1, or for non-postal)
    //   enhanced_match=unknown-secondary     -> the submitted unit was not recognized
    //   enhanced_match=ignored-input         -> the submitted unit was not used
    //   dpv_footnotes=CC / C1                -> unknown unit, not required / required
    //   dpv_match_code=S / D                 -> unknown / missing secondary
    var ENDPOINT = 'https://us-street.api.smarty.com/street-address';
    var EMBEDDED_KEY = '300466841662623224' // '292432932736885811' // old one from jwong@thumbprint acct

    function text(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    }

    function upper(value) {
        return text(value).toUpperCase();
    }

    function values(value) {
        if (Object.prototype.toString.call(value) === '[object Array]') value = value.join(',');
        return text(value).toLowerCase().split(',').map(function(part) {
            return part.trim();
        }).filter(function(part) {
            return !!part;
        });
    }

    function has(list, name) {
        return list.indexOf(name) !== -1;
    }

    // CASS footnotes are '#'-delimited single-letter codes ("H#M#"). H means the ZIP+4 is a
    // building, so there may be suites even when USPS does not require one.
    function footnoteHas(value, code) {
        var footnotes = upper(value);
        return !!footnotes && footnotes.split('#').indexOf(code) !== -1;
    }

    // Smarty returns the established secondary in pieces. Keep the designator with its
    // number: secondary_designator "APT" + secondary_number "3410 - 3502" -> "APT 3410 - 3502".
    function joinSecondary(designator, number) {
        var value = text(number);
        if (!value) return '';
        var label = text(designator);
        return label ? label + ' ' + value : value;
    }

    function suggestedSecondary(candidate) {
        var components = candidate && candidate.components;
        if (!components) return '';

        var parts = [];
        var extra = joinSecondary(components.extra_secondary_designator, components.extra_secondary_number);
        var secondary = joinSecondary(components.secondary_designator, components.secondary_number);
        if (extra) parts.push(extra);
        if (secondary) parts.push(secondary);
        return parts.join(', ');
    }

    // Ignore the differences that do not change what the shopper typed -- spacing, case and
    // the spaces around a hyphen -- so "Apt 3410-3502" is not offered back as a correction.
    function secondaryKey(value) {
        return upper(value)
            .replace(/[.#,]/g, '')
            .replace(/\s*-\s*/g, '-')
            .replace(/\s+/g, ' ');
    }

    // Smarty's residential delivery indicator (RDI): "Residential", "Commercial", or blank
    // when the address is invalid or there is not enough information. Accept the older Y/N
    // spelling too.
    function residentialFrom(candidate) {
        var rdi = upper(candidate && candidate.metadata && candidate.metadata.rdi);
        if (rdi === 'RESIDENTIAL' || rdi === 'Y') return true;
        if (rdi === 'COMMERCIAL' || rdi === 'N') return false;
        return null;
    }

    // Standardized values for the fields the shopper left blank. The form shows these as grey
    // placeholder text so a missing ZIP or city can be filled from the address Smarty matched.
    // Fields that already have a value are never offered, so a suggestion cannot overwrite an
    // edit. Line 2 has its own correction/removal flow.
    function missingFields(address, candidate) {
        var components = candidate && candidate.components;
        if (!components) return {};

        var suggestions = {};
        if (!text(address && address.City)) suggestions.City = text(components.city_name);
        if (!text(address && address.State)) suggestions.State = text(components.state_abbreviation);
        if (!text(address && address.Zip)) {
            var zip = text(components.zipcode);
            var plus4 = text(components.plus4_code);
            suggestions.Zip = zip && plus4 ? zip + '-' + plus4 : zip;
        }

        Object.keys(suggestions).forEach(function(field) {
            if (!suggestions[field]) delete suggestions[field];
        });
        return suggestions;
    }

    // Pure so it can be tested without Angular or the network. Returns:
    //   valid              no warning
    //   invalid-address    Smarty found no real address
    //   line2-invalid      the submitted line 2 was not recognized (suggestedLine2 may help)
    //   line2-remove       the submitted line 2 was not recognized and is not required
    //   line2-required     the address needs a unit and line 2 is empty
    //   line2-suggested    the address may have a unit, but one is not required (soft hint)
    // canRemove is true when dropping line 2 is a safe action to offer.
    // residential is true/false from Smarty's RDI, or null when Smarty did not say.
    // suggestions holds Smarty's values for blank City/State/Zip fields, or {} when the
    // address is not a valid match.
    function interpret(address, candidates) {
        var residential = null;
        var suggestions = {};

        function result(status, extra) {
            var value = {
                status: status,
                suggestedLine2: '',
                canRemove: false,
                residential: residential,
                suggestions: status === 'valid' ? suggestions : {}
            };
            if (extra) {
                Object.keys(extra).forEach(function(key) {
                    value[key] = extra[key];
                });
            }
            return value;
        }

        var list = Object.prototype.toString.call(candidates) === '[object Array]' ? candidates :
            (candidates ? [candidates] : []);
        var top = list[0];
        if (!top) return result('invalid-address');

        residential = residentialFrom(top);
        suggestions = missingFields(address, top);
        var analysis = top.analysis;
        if (!analysis) return result('valid');

        var submitted = text(address && address.Street2);
        var enhanced = values(analysis.enhanced_match);
        var footnotes = upper(analysis.dpv_footnotes);
        var dpv = upper(analysis.dpv_match_code);
        var established = suggestedSecondary(top);
        var suggestion = established && secondaryKey(established) !== secondaryKey(submitted) ? established : '';
        var hasEnhanced = enhanced.length > 0;

        if (has(enhanced, 'none')) return result('invalid-address');

        // enhanced_match is only present with match=enhanced, but the DPV fields are always
        // present. Use every documented signal: either can flag a bad/missing secondary.
        // Only a submitted Line 2 can be "unknown" or "ignored": when the unit was typed into
        // Street1 instead, Smarty still parses it, but there is nothing wrong with the (empty)
        // Line 2 to warn about.
        var unknown = !!submitted && (has(enhanced, 'unknown-secondary') || dpv === 'S' ||
            /(?:CC|C1)/.test(footnotes));
        var missing = has(enhanced, 'missing-secondary') || dpv === 'D' ||
            (!submitted && /N1/.test(footnotes));
        var ignored = !!submitted && has(enhanced, 'ignored-input');

        if (unknown) {
            if (/C1/.test(footnotes)) {
                return result('line2-invalid', { suggestedLine2: suggestion });
            }
            if (/CC/.test(footnotes)) {
                return result(suggestion ? 'line2-invalid' : 'line2-remove', {
                    suggestedLine2: suggestion,
                    canRemove: true
                });
            }
            return result('line2-invalid', {
                suggestedLine2: suggestion,
                canRemove: dpv === 'S'
            });
        }

        if (missing) {
            if (!submitted) {
                // N1 / D means USPS requires a unit. missing-secondary alone (or a non-postal
                // match) only means one may exist, so suggest it without blocking.
                if (dpv === 'D' || /N1/.test(footnotes)) return result('line2-required');
                return result('line2-suggested');
            }
            // A line 2 was supplied but Smarty still considers the secondary missing.
            return result('line2-invalid', { suggestedLine2: suggestion });
        }

        // USPS footnote H# means the ZIP+4 is a building whose address did not include a
        // secondary, so suites may exist even when USPS does not require one. It is a soft
        // hint only; when a secondary was supplied (even inside Street1), Smarty reports it as
        // an unknown secondary, and there is nothing to prompt for.
        var suppliedSecondary = has(enhanced, 'unknown-secondary') || dpv === 'S';
        if (!submitted && !suppliedSecondary && footnoteHas(analysis.footnotes, 'H'))
            return result('line2-suggested');

        if (submitted && ignored) {
            // If Smarty echoed the same unit it used, ignored-input was about something else.
            if (established && !suggestion) return result('valid');
            return result(suggestion ? 'line2-invalid' : 'line2-remove', {
                suggestedLine2: suggestion,
                canRemove: true
            });
        }

        if (has(enhanced, 'postal-match') || has(enhanced, 'non-postal-match')) {
            return result('valid');
        }

        // No enhanced_match at all: trust the DPV code, and stay quiet when it is ambiguous.
        if (!hasEnhanced) {
            if (dpv === 'Y') return result('valid');
            if (dpv === 'N') return result('invalid-address');
        }

        return result('valid');
    }

    function canCheck(address) {
        if (!address) return false;
        if (upper(address.Country) !== 'US') return false;
        if (!text(address.Street1)) return false;
        return !!text(address.Zip) || (!!text(address.City) && !!text(address.State));
    }

    function requestParams(address) {
        return {
            key: EMBEDDED_KEY,
            street: text(address.Street1),
            secondary: text(address.Street2),
            city: text(address.City),
            state: text(address.State),
            zipcode: text(address.Zip),
            candidates: 5,
            match: 'enhanced'
        };
    }

    function endpointUrl(params) {
        var query = Object.keys(params).map(function(name) {
            return encodeURIComponent(name) + '=' + encodeURIComponent(params[name]);
        });
        return ENDPOINT + '?' + query.join('&');
    }

    function checkLine2(address) {
        if (!canCheck(address)) return $q.when(null);

        var deferred = $q.defer();
        var settled = false;

        function finish(result) {
            if (settled) return;
            settled = true;
            deferred.resolve(result);
        }

        function onResponse(status, body) {
            if (status < 200 || status >= 300) {
                finish(null);
                return;
            }
            try {
                var data = typeof body === 'string' ? JSON.parse(body) : body;
                finish(interpret(address, data));
            } catch (e) {
                finish(null);
            }
        }

        try {
            // A low-level request that does not pass through the global $http interceptor.
            $httpBackend('GET', endpointUrl(requestParams(address)), null, onResponse,
                { Accept: 'application/json' }, 10000);
        } catch (e) {
            finish(null);
        }

        return deferred.promise;
    }

    return {
        get: _get,
        save: _save,
        delete: _delete,
        validate: _validate,
        checkLine2: checkLine2,
        canCheck: canCheck,
        interpret: interpret,
        requestParams: requestParams
    };
}]);
