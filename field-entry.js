'use strict';
// The legacy static site is retained only for the registered owner security key.
if (location.hostname === 'jnthhrn8.github.io' && location.hash !== '#owner-login') {
  location.replace('https://forge.tetheredunicorn.com/' + location.hash);
}
