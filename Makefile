# Local dev server -- serves app/ from disk, proxies /api/ to a Four51 site.
# usage: make serve [PORT=3000] [UPSTREAM=https://thumbprint.Four51OrderCloud.com/WastePro]

PORT ?= 3000

serve:
	node devserver.mjs --port $(PORT) $(if $(UPSTREAM),--upstream $(UPSTREAM))

help:
	node devserver.mjs --help

# Node's built-in test runner; no install. (The Karma suite in test/unit no longer runs.)
test:
	node --test 'test/node/*.test.js'

.PHONY: serve help test
