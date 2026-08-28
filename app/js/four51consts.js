four51.app.constant("AppConst",{
	debug: true,
	// InteropID of the category used to source the home page's "Featured for your team" grid.
	// Must match the InteropID of a real category created in the admin (not necessarily its display name).
	featuredCategoryInteropID: 'Featured',
	// InteropID of the category that powers the "Browse full catalog" quick-action tile (see
	// categoryView.html) - not a real department, so like featuredCategoryInteropID it's always
	// excluded from "Shop by category".
	allProductsCategoryInteropID: 'all-products',
	// Optional curation for the home page's "Shop by category" tiles. Leave empty to show every
	// top-level category (minus the two above). To highlight only specific departments instead,
	// list their InteropIDs here in the order you want them to appear, e.g.
	// ['apparel-gabe', 'kits-gabe'].
	shopByCategoryInteropIDs: []
});