// Sleipnir Pro's storefront — the Lemon Squeezy store and product a license
// key must belong to (see licenseCore.cjs's checkMeta). Fill these in from
// the Lemon Squeezy dashboard (Settings ▸ Stores for the store id; the
// product's page for its id; Share ▸ checkout link for the URL). While the
// ids are null, activation refuses every key: an unconfigured build must not
// accept a license from somebody else's store.
module.exports = {
  STORE_ID: null,
  PRODUCT_ID: null,
  CHECKOUT_URL: 'https://andrewsterns.github.io/Sleipnir/#pricing',
  // How many distinct projects the free tier can open (see licenseCore.cjs's
  // projectGate). Pro is unlimited.
  FREE_PROJECT_LIMIT: 3,
}
