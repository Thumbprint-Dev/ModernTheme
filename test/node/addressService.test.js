// Tests for the Smarty address helpers in app/js/services/addressService.js.
// Run with `make test` (or `node --test test/node/`) -- Node's built-in runner, no install.
//
// interpret() is pure, so most cases are plain response fixtures. checkLine2() is exercised
// with small $q/$httpBackend fakes; no network or Angular boot is needed.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(
	path.join(__dirname, '../../app/js/services/addressService.js'), 'utf8');

function load() {
	const registered = {};
	const four51 = {
		app: {
			factory: (name, deps) => { registered.factory = deps[deps.length - 1]; }
		}
	};
	new Function('four51', SOURCE)(four51);
	return registered;
}

function fakeQ() {
	return {
		when: (value) => Promise.resolve(value),
		defer: () => {
			let resolve, reject;
			const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
			return { promise, resolve, reject };
		}
	};
}

// $httpBackend is the low-level request function Address uses so the call bypasses the global
// $http interceptor. The fake records each call and lets the test answer it.
function makeService(backend) {
	const calls = [];
	const $httpBackend = (method, url, post, callback, headers, timeout) => {
		calls.push({ method, url, post, callback, headers, timeout });
		if (!backend) throw new Error('unexpected Smarty request');
		backend(method, url, post, callback, headers, timeout);
	};

	const service = load().factory({}, {}, { format: () => {} }, fakeQ(), $httpBackend);
	return { service, calls };
}

const { service } = makeService();
const { interpret, canCheck, requestParams } = service;

function query(url) {
	const result = {};
	const raw = url.split('?')[1] || '';
	raw.split('&').forEach((pair) => {
		const eq = pair.indexOf('=');
		const name = eq < 0 ? pair : pair.slice(0, eq);
		const value = eq < 0 ? '' : pair.slice(eq + 1);
		result[decodeURIComponent(name)] = decodeURIComponent(value);
	});
	return result;
}

function candidate(analysis, components, metadata) {
	return {
		analysis: analysis || {},
		components: components || {},
		metadata: metadata || {}
	};
}

function address(overrides) {
	return Object.assign({
		Street1: '2335 S State St',
		Street2: '',
		City: 'Provo',
		State: 'UT',
		Zip: '84606',
		Country: 'US'
	}, overrides || {});
}

test('interpret: no candidate means the address is invalid', () => {
	assert.equal(interpret(address(), []).status, 'invalid-address');
	assert.equal(interpret(address(), null).status, 'invalid-address');
});

test('interpret: enhanced_match=none means the address is invalid', () => {
	const r = interpret(address(), [candidate({
		enhanced_match: 'none',
		dpv_match_code: 'N',
		dpv_footnotes: 'A1'
	})]);
	assert.equal(r.status, 'invalid-address');
});

test('interpret: a clean postal match is valid', () => {
	const r = interpret(address(), [candidate({
		enhanced_match: 'postal-match',
		dpv_match_code: 'Y',
		dpv_footnotes: 'AABB'
	})]);
	assert.equal(r.status, 'valid');
	assert.equal(r.suggestedLine2, '');
	assert.equal(r.canRemove, false);
	assert.equal(r.residential, null);
	assert.deepEqual(r.suggestions, {});
});

test('interpret: suggests Smarty values for blank fields only', () => {
	const r = interpret(address({ Zip: '' }), [candidate({
		enhanced_match: 'postal-match',
		dpv_match_code: 'Y',
		dpv_footnotes: 'AABB'
	}, {
		city_name: 'Provo',
		state_abbreviation: 'UT',
		zipcode: '84606',
		plus4_code: '1234'
	})]);

	assert.equal(r.status, 'valid');
	assert.deepEqual(r.suggestions, { Zip: '84606-1234' });
});

test('interpret: suggests missing city and state when only the ZIP was entered', () => {
	const r = interpret(address({ City: '', State: '', Zip: '84606' }), [candidate({
		enhanced_match: 'postal-match',
		dpv_match_code: 'Y',
		dpv_footnotes: 'AABB'
	}, {
		city_name: 'Provo',
		state_abbreviation: 'UT',
		zipcode: '84606',
		plus4_code: '1234'
	})]);

	assert.deepEqual(r.suggestions, { City: 'Provo', State: 'UT' });
});

test('interpret: a ZIP suggestion falls back to five digits without a plus-4', () => {
	const r = interpret(address({ Zip: '' }), [candidate({
		enhanced_match: 'postal-match',
		dpv_match_code: 'Y',
		dpv_footnotes: 'AABB'
	}, {
		zipcode: '84606'
	})]);

	assert.deepEqual(r.suggestions, { Zip: '84606' });
});

test('interpret: never suggests a field that already has a value', () => {
	const r = interpret(address(), [candidate({
		enhanced_match: 'postal-match',
		dpv_match_code: 'Y',
		dpv_footnotes: 'AABB'
	}, {
		city_name: 'Salt Lake City',
		state_abbreviation: 'UT',
		zipcode: '84101',
		plus4_code: '0001'
	})]);

	assert.deepEqual(r.suggestions, {});
});

test('interpret: invalid and warning results do not suggest blank fields', () => {
	const components = { city_name: 'Provo', state_abbreviation: 'UT', zipcode: '84606' };

	const invalid = interpret(address({ Zip: '' }), [candidate({
		enhanced_match: 'none',
		dpv_match_code: 'N',
		dpv_footnotes: 'A1'
	}, components)]);
	assert.equal(invalid.status, 'invalid-address');
	assert.deepEqual(invalid.suggestions, {});

	const warning = interpret(address({ Zip: '' }), [candidate({
		enhanced_match: 'postal-match,missing-secondary',
		dpv_match_code: 'D',
		dpv_footnotes: 'AABBN1'
	}, components)]);
	assert.equal(warning.status, 'line2-required');
	assert.deepEqual(warning.suggestions, {});
});

test('interpret: reads Smarty\'s residential delivery indicator', () => {
	const residential = interpret(address(), [candidate({
		enhanced_match: 'postal-match',
		dpv_match_code: 'Y',
		dpv_footnotes: 'AABB'
	}, {}, { rdi: 'Residential' })]);
	assert.equal(residential.residential, true);

	const commercial = interpret(address(), [candidate({
		enhanced_match: 'postal-match',
		dpv_match_code: 'Y',
		dpv_footnotes: 'AABB'
	}, {}, { rdi: 'Commercial' })]);
	assert.equal(commercial.residential, false);

	// Older Smarty responses use Y/N, and blank means unknown.
	assert.equal(interpret(address(), [candidate({}, {}, { rdi: 'Y' })]).residential, true);
	assert.equal(interpret(address(), [candidate({}, {}, { rdi: 'N' })]).residential, false);
	assert.equal(interpret(address(), [candidate({}, {}, { rdi: '' })]).residential, null);
});

// Test addresses for the live Smarty behaviour we expect. These use representative candidates
// because the embedded key only answers registered hosts; the assertions cover the mapping
// from Smarty's DPV/RDI fields to the form's status and Residential/Commercial label.
const ADDRESS_CASES = [
	{
		name: '2825 Arcata Ln, Orlando FL 32817',
		address: address({ Street1: '2825 Arcata Ln', Street2: '', City: 'Orlando', State: 'FL', Zip: '32817' }),
		candidates: [candidate(
			{ enhanced_match: 'postal-match', dpv_match_code: 'Y', dpv_footnotes: 'AABB' },
			{},
			{ rdi: 'Residential' }
		)],
		expect: { status: 'valid', residential: true }
	},
	{
		name: '2600 Maitland Center Pkwy Suite 230, Maitland FL 32751',
		address: address({
			Street1: '2600 Maitland Center Pkwy', Street2: 'Suite 230',
			City: 'Maitland', State: 'FL', Zip: '32751'
		}),
		candidates: [candidate(
			{ enhanced_match: 'postal-match', dpv_match_code: 'Y', dpv_footnotes: 'AABB' },
			{ secondary_designator: 'STE', secondary_number: '230' },
			{ rdi: 'Commercial' }
		)],
		expect: { status: 'valid', residential: false }
	},
	{
		name: '1234 Msin St, Orlando FL 32817 (invalid)',
		address: address({ Street1: '1234 Msin St', Street2: '', City: 'Orlando', State: 'FL', Zip: '32817' }),
		candidates: [],
		expect: { status: 'invalid-address', residential: null }
	},
	{
		name: '390 St Johns St, Central Islip NY 11722',
		address: address({
			Street1: '390 St Johns St', Street2: '',
			City: 'Central Islip', State: 'NY', Zip: '11722'
		}),
		candidates: [candidate(
			{ enhanced_match: 'postal-match', dpv_match_code: 'Y', dpv_footnotes: 'AABB' },
			{},
			{ rdi: 'Residential' }
		)],
		expect: { status: 'valid', residential: true }
	},
	{
		name: '1600 Amphitheatre Pkwy, Mountain View CA 94043 (commercial)',
		address: address({
			Street1: '1600 Amphitheatre Pkwy', Street2: '',
			City: 'Mountain View', State: 'CA', Zip: '94043'
		}),
		candidates: [candidate(
			{ enhanced_match: 'postal-match', dpv_match_code: 'Y', dpv_footnotes: 'AABB' },
			{},
			{ rdi: 'Commercial' }
		)],
		expect: { status: 'valid', residential: false }
	},
	{
		name: '1 Infinite Loop, Cupertino CA 95014 (commercial)',
		address: address({
			Street1: '1 Infinite Loop', Street2: '',
			City: 'Cupertino', State: 'CA', Zip: '95014'
		}),
		candidates: [candidate(
			{ enhanced_match: 'postal-match', dpv_match_code: 'Y', dpv_footnotes: 'AABB' },
			{},
			{ rdi: 'Commercial' }
		)],
		expect: { status: 'valid', residential: false }
	},
	{
		name: 'PO Box 4735, Tulsa OK 74159 (PO Boxes are RDI Residential)',
		address: address({ Street1: 'PO Box 4735', Street2: '', City: 'Tulsa', State: 'OK', Zip: '74159' }),
		candidates: [candidate(
			{ enhanced_match: 'postal-match', dpv_match_code: 'Y', dpv_footnotes: 'AABB' },
			{},
			{ rdi: 'Residential' }
		)],
		expect: { status: 'valid', residential: true }
	},
	{
		name: '122 Mast Rd, Lee NH (unit required)',
		address: address({ Street1: '122 Mast Rd', Street2: '', City: 'Lee', State: 'NH', Zip: '03861' }),
		candidates: [candidate(
			{ enhanced_match: 'postal-match,missing-secondary', dpv_match_code: 'D', dpv_footnotes: 'AABBN1' },
			{},
			{ rdi: 'Residential' }
		)],
		expect: { status: 'line2-required', residential: true }
	},
	{
		name: '2478 E Michigan St, Orlando FL 32806 (building may have suites)',
		address: address({
			Street1: '2478 E Michigan St', Street2: '',
			City: 'Orlando', State: 'FL', Zip: '32806'
		}),
		candidates: [candidate(
			{ enhanced_match: 'postal-match', dpv_match_code: 'Y', dpv_footnotes: 'AABB', footnotes: 'H#' },
			{},
			{ rdi: 'Commercial' }
		)],
		expect: { status: 'line2-suggested', residential: false }
	},
	{
		name: '3331 Erie Ave Apt 2, Cincinnati OH 45208 (unknown unit)',
		address: address({
			Street1: '3331 Erie Ave', Street2: 'Apt 2',
			City: 'Cincinnati', State: 'OH', Zip: '45208'
		}),
		candidates: [candidate(
			{ enhanced_match: 'postal-match,unknown-secondary', dpv_match_code: 'S', dpv_footnotes: 'AABBCC' },
			{},
			{ rdi: 'Residential' }
		)],
		expect: { status: 'line2-remove', residential: true }
	}
];

test('test addresses: expected status and Residential/Commercial label', async (t) => {
	for (const testCase of ADDRESS_CASES) {
		await t.test(testCase.name, () => {
			const r = interpret(testCase.address, testCase.candidates);
			assert.equal(r.status, testCase.expect.status);
			assert.equal(r.residential, testCase.expect.residential);
		});
	}
});

test('test addresses: each one is sent to Smarty as entered', async (t) => {
	for (const testCase of ADDRESS_CASES) {
		await t.test(testCase.name, () => {
			const params = requestParams(testCase.address);
			assert.equal(params.street, testCase.address.Street1);
			assert.equal(params.secondary, testCase.address.Street2);
			assert.equal(params.city, testCase.address.City);
			assert.equal(params.state, testCase.address.State);
			assert.equal(params.zipcode, testCase.address.Zip);
		});
	}
});

test('interpret: a clean non-postal match is valid', () => {
	const r = interpret(address(), [candidate({
		enhanced_match: 'non-postal-match',
		dpv_match_code: 'N',
		dpv_footnotes: 'A1'
	})]);
	assert.equal(r.status, 'valid');
});

test('interpret: missing secondary without N1 is a soft suggestion', () => {
	const r = interpret(address(), [candidate({
		enhanced_match: 'postal-match,missing-secondary',
		dpv_match_code: 'Y',
		dpv_footnotes: 'AABB'
	})]);
	assert.equal(r.status, 'line2-suggested');
});

test('interpret: missing secondary with N1 means a unit is required', () => {
	const r = interpret(address(), [candidate({
		enhanced_match: 'postal-match,missing-secondary',
		dpv_match_code: 'D',
		dpv_footnotes: 'AABBN1'
	})]);
	assert.equal(r.status, 'line2-required');
});

test('interpret: non-postal missing secondary is a soft suggestion', () => {
	const r = interpret(address(), [candidate({
		enhanced_match: 'non-postal-match,missing-secondary',
		dpv_match_code: 'N',
		dpv_footnotes: 'A1'
	})]);
	assert.equal(r.status, 'line2-suggested');
});

test('interpret: an H# building without a unit is a soft suggestion', () => {
	// 2478 E Michigan St, Orlando FL 32806: USPS confirms the base address, but the ZIP+4
	// is a building that can have suites, so Smarty returns footnotes "H#" rather than N1.
	const r = interpret(address({
		Street1: '2478 E Michigan St',
		Street2: '',
		City: 'Orlando',
		State: 'FL',
		Zip: '32806'
	}), [candidate({
		enhanced_match: 'postal-match',
		dpv_match_code: 'Y',
		dpv_footnotes: 'AABB',
		footnotes: 'H#'
	})]);

	assert.equal(r.status, 'line2-suggested');
});

test('interpret: H# with a unit already supplied is not a suggestion', () => {
	const typedIntoLine2 = interpret(address({ Street2: 'Suite 230' }), [candidate({
		enhanced_match: 'postal-match',
		dpv_match_code: 'Y',
		dpv_footnotes: 'AABB',
		footnotes: 'H#'
	})]);
	assert.equal(typedIntoLine2.status, 'valid');

	const typedIntoStreet1 = interpret(address({
		Street1: '2478 E Michigan St. Suite 230',
		Street2: ''
	}), [candidate({
		enhanced_match: 'postal-match,unknown-secondary',
		dpv_match_code: 'S',
		dpv_footnotes: 'AAC1',
		footnotes: 'H#'
	})]);
	assert.equal(typedIntoStreet1.status, 'valid');
});

test('interpret: unknown secondary + C1 suggests the established unit', () => {
	const r = interpret(address({ Street2: 'Apt 3410' }), [candidate({
		enhanced_match: 'postal-match,unknown-secondary',
		dpv_match_code: 'S',
		dpv_footnotes: 'AAC1'
	}, {
		secondary_designator: 'APT',
		secondary_number: '3410 - 3502'
	})]);

	assert.equal(r.status, 'line2-invalid');
	assert.equal(r.suggestedLine2, 'APT 3410 - 3502');
	assert.equal(r.canRemove, false);
});

test('interpret: unknown secondary + C1 without an established unit still warns', () => {
	const r = interpret(address({ Street2: 'Apt 3410' }), [candidate({
		enhanced_match: 'postal-match,unknown-secondary',
		dpv_match_code: 'S',
		dpv_footnotes: 'AAC1'
	})]);

	assert.equal(r.status, 'line2-invalid');
	assert.equal(r.suggestedLine2, '');
	assert.equal(r.canRemove, false);
});

test('interpret: a unit typed into Street1 is not reported as an empty Line 2 error', () => {
	// 2478 E Michigan St. Suite 230: Smarty parses the suite out of Street1 and reports an
	// unknown secondary, but Line 2 is empty, so there is nothing to correct there.
	const r = interpret(address({
		Street1: '2478 E Michigan St. Suite 230',
		Street2: ''
	}), [candidate({
		enhanced_match: 'postal-match,unknown-secondary',
		dpv_match_code: 'S',
		dpv_footnotes: 'AAC1'
	}, {
		secondary_designator: 'STE',
		secondary_number: '230'
	})]);

	assert.equal(r.status, 'valid');
	assert.equal(r.suggestedLine2, '');
	assert.equal(r.canRemove, false);
});

test('interpret: an empty Line 2 is never given a Line 2 correction', () => {
	const r = interpret(address({ Street2: '' }), [candidate({
		enhanced_match: 'postal-match,unknown-secondary',
		dpv_match_code: 'S',
		dpv_footnotes: 'AABBCC'
	})]);

	assert.equal(r.status, 'valid');
	assert.equal(r.suggestedLine2, '');
	assert.equal(r.canRemove, false);
});

test('interpret: unknown secondary + CC can offer removal', () => {
	const r = interpret(address({ Street2: 'Apt 2' }), [candidate({
		enhanced_match: 'postal-match,unknown-secondary',
		dpv_match_code: 'S',
		dpv_footnotes: 'AABBCC'
	})]);

	assert.equal(r.status, 'line2-remove');
	assert.equal(r.canRemove, true);
});

test('interpret: unknown secondary + CC with a different established unit suggests it too', () => {
	const r = interpret(address({ Street2: 'Apt 2' }), [candidate({
		enhanced_match: 'postal-match,unknown-secondary',
		dpv_match_code: 'S',
		dpv_footnotes: 'AABBCC'
	}, {
		secondary_designator: 'STE',
		secondary_number: '300'
	})]);

	assert.equal(r.status, 'line2-invalid');
	assert.equal(r.suggestedLine2, 'STE 300');
	assert.equal(r.canRemove, true);
});

test('interpret: ignored line 2 can be removed', () => {
	const r = interpret(address({ Street2: 'Attn: Receiving' }), [candidate({
		enhanced_match: 'postal-match,ignored-input',
		dpv_match_code: 'Y',
		dpv_footnotes: 'AABB'
	})]);

	assert.equal(r.status, 'line2-remove');
	assert.equal(r.canRemove, true);
});

test('interpret: ignored-input does not warn when the same unit was used', () => {
	const r = interpret(address({ Street2: 'Ste 300' }), [candidate({
		enhanced_match: 'postal-match,ignored-input',
		dpv_match_code: 'Y',
		dpv_footnotes: 'AABB'
	}, {
		secondary_designator: 'STE',
		secondary_number: '300'
	})]);

	assert.equal(r.status, 'valid');
});

test('interpret: ignored line 2 with an established unit suggests the unit', () => {
	const r = interpret(address({ Street2: 'Bldg 5' }), [candidate({
		enhanced_match: 'postal-match,ignored-input',
		dpv_match_code: 'Y',
		dpv_footnotes: 'AABB'
	}, {
		secondary_designator: 'STE',
		secondary_number: '101'
	})]);

	assert.equal(r.status, 'line2-invalid');
	assert.equal(r.suggestedLine2, 'STE 101');
	assert.equal(r.canRemove, true);
});

test('interpret: equivalent secondary formatting is not offered back as a correction', () => {
	const r = interpret(address({ Street2: 'apt 3410-3502' }), [candidate({
		enhanced_match: 'postal-match,unknown-secondary',
		dpv_match_code: 'S',
		dpv_footnotes: 'AAC1'
	}, {
		secondary_designator: 'APT',
		secondary_number: '3410 - 3502'
	})]);

	assert.equal(r.status, 'line2-invalid');
	assert.equal(r.suggestedLine2, '');
});

test('interpret: extra secondary pieces are composed into the suggestion', () => {
	const r = interpret(address({ Street2: 'Suite 9' }), [candidate({
		enhanced_match: 'postal-match,unknown-secondary',
		dpv_match_code: 'S',
		dpv_footnotes: 'AAC1'
	}, {
		extra_secondary_designator: 'BLDG',
		extra_secondary_number: 'E-5',
		secondary_designator: 'STE',
		secondary_number: '101'
	})]);

	assert.equal(r.suggestedLine2, 'BLDG E-5, STE 101');
});

test('interpret: a designator without a number is not a suggestion', () => {
	const r = interpret(address({ Street2: 'Apt 2' }), [candidate({
		enhanced_match: 'postal-match,unknown-secondary',
		dpv_match_code: 'S',
		dpv_footnotes: 'AAC1'
	}, {
		secondary_designator: 'APT',
		secondary_number: ''
	})]);

	assert.equal(r.status, 'line2-invalid');
	assert.equal(r.suggestedLine2, '');
});

test('interpret: falls back to DPV fields when enhanced_match is absent', async (t) => {
	const cases = [
		['Y', 'AABB', 'valid'],
		['N', 'A1', 'invalid-address'],
		['S', 'AABBCC', 'line2-remove'],
		['S', 'AAC1', 'line2-invalid'],
		['D', 'AABBN1', 'line2-required']
	];
	for (const [dpv, footnotes, expected] of cases) {
		await t.test(`${dpv} / ${footnotes}`, () => {
			const r = interpret(address({ Street2: dpv === 'D' ? '' : 'Apt 2' }), [candidate({
				dpv_match_code: dpv,
				dpv_footnotes: footnotes
			})]);
			assert.equal(r.status, expected);
		});
	}
});

test('interpret: DPV S/D still flags line 2 when enhanced_match is less specific', async (t) => {
	await t.test('S with a line 2 can be removed when CC says it is not required', () => {
		const r = interpret(address({ Street2: 'Apt 2' }), [candidate({
			enhanced_match: 'postal-match',
			dpv_match_code: 'S',
			dpv_footnotes: 'AABBCC'
		})]);
		assert.equal(r.status, 'line2-remove');
	});

	await t.test('D with no line 2 needs a unit', () => {
		const r = interpret(address(), [candidate({
			enhanced_match: 'postal-match',
			dpv_match_code: 'D',
			dpv_footnotes: 'AABBN1'
		})]);
		assert.equal(r.status, 'line2-required');
	});
});

test('interpret: a response without analysis does not warn', () => {
	const r = interpret(address({ Street2: 'Apt 2' }), [{ delivery_line_1: '2335 S State St' }]);
	assert.equal(r.status, 'valid');
});

test('canCheck: needs a US address with a street and ZIP or city/state', () => {
	assert.equal(canCheck(address()), true);
	assert.equal(canCheck(address({ Zip: '', City: 'Provo', State: 'UT' })), true);
	assert.equal(canCheck(address({ Zip: '', City: '', State: '' })), false);
	assert.equal(canCheck(address({ Country: 'CA' })), false);
	assert.equal(canCheck(address({ Country: '' })), false);
	assert.equal(canCheck(address({ Street1: '  ' })), false);
	assert.equal(canCheck(null), false);
});

test('requestParams: sends line 2 as secondary with enhanced matching', () => {
	const params = requestParams(address({
		Street1: ' 2335 S State St ',
		Street2: ' Ste 300 ',
		City: ' Provo ',
		State: ' UT ',
		Zip: ' 84606 '
	}));

	assert.equal(params.street, '2335 S State St');
	assert.equal(params.secondary, 'Ste 300');
	assert.equal(params.city, 'Provo');
	assert.equal(params.state, 'UT');
	assert.equal(params.zipcode, '84606');
	assert.equal(params.candidates, 5);
	assert.equal(params.match, 'enhanced');
	assert.ok(params.key);
});

test('checkLine2: unusable address resolves null without a request', async () => {
	const made = makeService();
	const result = await made.service.checkLine2(address({ Country: 'CA' }));
	assert.equal(result, null);
	assert.equal(made.calls.length, 0);
});

test('checkLine2: a valid match resolves its Residential/Commercial label', async () => {
	const made = makeService((method, url, post, callback) => {
		callback(200, JSON.stringify([candidate({
			enhanced_match: 'postal-match',
			dpv_match_code: 'Y',
			dpv_footnotes: 'AABB'
		}, {}, { rdi: 'Residential' })]));
	});

	const result = await made.service.checkLine2(address());
	assert.equal(result.status, 'valid');
	assert.equal(result.residential, true);
});

test('checkLine2: a building without a unit resolves a soft suite suggestion', async () => {
	const made = makeService((method, url, post, callback) => {
		callback(200, JSON.stringify([candidate({
			enhanced_match: 'postal-match',
			dpv_match_code: 'Y',
			dpv_footnotes: 'AABB',
			footnotes: 'H#'
		}, {}, { rdi: 'Commercial' })]));
	});

	const result = await made.service.checkLine2(address({
		Street1: '2478 E Michigan St',
		City: 'Orlando',
		State: 'FL',
		Zip: '32806'
	}));
	assert.equal(result.status, 'line2-suggested');
	assert.equal(result.residential, false);
	assert.equal(result.canRemove, false);
});

test('checkLine2: a valid match resolves suggestions for blank fields', async () => {
	const made = makeService((method, url, post, callback) => {
		callback(200, JSON.stringify([candidate({
			enhanced_match: 'postal-match',
			dpv_match_code: 'Y',
			dpv_footnotes: 'AABB'
		}, {
			city_name: 'Provo',
			state_abbreviation: 'UT',
			zipcode: '84606',
			plus4_code: '1234'
		})]));
	});

	const result = await made.service.checkLine2(address({ Zip: '' }));
	assert.deepEqual(result.suggestions, { Zip: '84606-1234' });
});

test('checkLine2: a warning resolves with the interpretation', async () => {
	const made = makeService((method, url, post, callback) => {
		callback(200, JSON.stringify([candidate({
			enhanced_match: 'postal-match,unknown-secondary',
			dpv_match_code: 'S',
			dpv_footnotes: 'AABBCC'
		})]));
	});

	const result = await made.service.checkLine2(address({ Street2: 'Apt 2' }));
	assert.equal(result.status, 'line2-remove');
	assert.equal(result.canRemove, true);
});

test('checkLine2: calls Smarty through the interceptor-free backend', async () => {
	const made = makeService((method, url, post, callback) => callback(200, '[]'));
	await made.service.checkLine2(address({
		Street1: ' 2335 S State St ',
		Street2: ' Ste 300 ',
		City: ' Provo ',
		State: ' UT ',
		Zip: ' 84606 '
	}));

	assert.equal(made.calls.length, 1);
	const call = made.calls[0];
	assert.equal(call.method, 'GET');
	assert.equal(call.timeout, 10000);
	assert.equal(call.headers.Accept, 'application/json');

	const params = query(call.url);
	assert.ok(params.key);
	assert.equal(params.street, '2335 S State St');
	assert.equal(params.secondary, 'Ste 300');
	assert.equal(params.city, 'Provo');
	assert.equal(params.state, 'UT');
	assert.equal(params.zipcode, '84606');
	assert.equal(params.candidates, '5');
	assert.equal(params.match, 'enhanced');
});

test('checkLine2: HTTP, parsing or transport failures resolve null', async () => {
	const statusFailure = makeService((method, url, post, callback) => callback(500, 'nope'));
	assert.equal(await statusFailure.service.checkLine2(address()), null);

	const malformed = makeService((method, url, post, callback) => callback(200, '{not json'));
	assert.equal(await malformed.service.checkLine2(address()), null);

	const thrown = makeService(() => { throw new Error('blocked'); });
	assert.equal(await thrown.service.checkLine2(address()), null);
});
