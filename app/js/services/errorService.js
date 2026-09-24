four51.app.factory('Error', ['$log', function($log) {
	// Shown instead of a raw server exception. Every API error the theme displays goes through
	// format() below - checkout, cart, add to cart, quick add, order history, addresses - so
	// this one swap covers all of the error modals and inline messages at once.
	var FALLBACK = 'Something went wrong on our end. Please try again, or log out and back in. If it keeps happening, please contact us.';

	// Messages that are the platform's internals leaking out rather than something written for
	// a shopper, e.g. "Object reference not set to an instance of an object. - Error Code:
	// 32872128" (a .NET NullReferenceException). Validation messages the platform writes on
	// purpose ("An address with that name already exists", "The credit card number you entered
	// is invalid") don't match and pass through unchanged.
	var TECHNICAL = /object reference not set|null ?reference|an error has occurred|internal server error|unhandled|exception|stack ?trace|<html|<!doctype|^\s*$/i;

	// friendly text -> the raw server text it replaced. Callers only pass ex.Message on to the
	// page, so this is how an error modal or inline note gets back to what the server actually
	// said, to print it underneath in small type (the technicalError filter) - a shopper's
	// screenshot then still shows the real error for whoever it's reported to. Keyed by the
	// friendly text, which carries the platform's error code when there is one; without a code
	// the entry is simply the most recent such error, which is the one on screen.
	var technical = {};

	function isTechnical(text) {
		return !angular.isString(text) || TECHNICAL.test(text);
	}

	// Keeps the platform's error code, if there is one, so a shopper who does contact support
	// can quote it.
	function friendly(raw) {
		var code = angular.isString(raw) && raw.match(/error code:?\s*(\d+)/i);
		return code ? FALLBACK + ' (Error code ' + code[1] + ')' : FALLBACK;
	}

	var defineError = function(ex) {
		// A request that never got a response (offline, timeout, CORS) has no data; reading
		// ex.data.Message threw here, so the page's error handler never ran and its spinner
		// never stopped.
		ex = ex || {};
		var data = ex.data || {};
		var obj = {
			Message: data.Message || ex.Message || '',
			Detail: data.ExceptionMessage || ex.ExceptionMessage || ex.message,
			Code: { text: data.ExceptionType || ex.ExceptionType || '' },
			StackTrace: data.StackTrace || ex.StackTrace || ''
		}
		obj.Code.text = obj.Code.text.replace('Four51.Framework.', '').replace('DBExceptions+', '');

		if(obj.Message.indexOf("There are three distinct password security levels") !== -1){
			obj.Code.text = "PasswordSecurityException";
		}
		if(obj.Message.indexOf("Account information for that email address cannot be located") !== -1){
			obj.Code.text = "EmailNotFoundException";
		}

		obj.Code.is = function(code) {
			return obj.Code.text.indexOf(code) > -1;
		}

		// Only the text shoppers read is replaced; Code (which callers branch on, e.g.
		// ObjectExistsException) is left alone, and the originals are kept for debugging.
		obj.RawMessage = obj.Message;
		obj.RawDetail = obj.Detail;
		if (isTechnical(obj.Message)) {
			var raw = [obj.RawMessage, isTechnical(obj.RawDetail) && obj.RawDetail !== obj.RawMessage ? obj.RawDetail : '']
				.filter(function(part) { return angular.isString(part) && part.trim() && !/<html|<!doctype/i.test(part); })
				.join(' | ') || (ex.status ? 'HTTP ' + ex.status + (ex.statusText ? ' ' + ex.statusText : '') : 'No response from the server');
			$log.warn('API error shown to the shopper as the generic fallback:', raw);
			obj.Message = friendly(obj.Message);
			technical[obj.Message] = raw;
		}
		// Product/kit pages show Detail. It is often empty (so their error modal showed a blank
		// line) or a raw exception message; fall back to the shopper-facing Message then.
		if (!obj.Detail || isTechnical(obj.Detail)) obj.Detail = obj.Message;

		return obj;
	}

	return {
		format: defineError,
		fallbackMessage: FALLBACK,
		// The raw server text behind a friendly fallback message, or '' for any other message.
		technicalFor: function(message) {
			return (angular.isString(message) && technical[message]) || '';
		}
	}
}]);

// {{message | technicalError}} - the raw server error behind a friendly fallback, for printing
// in small type under it; empty for ordinary messages, so it's safe to put under any error.
four51.app.filter('technicalError', ['Error', function(Error) {
	return function(message) {
		return Error.technicalFor(message);
	};
}]);
