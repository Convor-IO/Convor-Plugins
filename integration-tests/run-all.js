'use strict';

/**
 * Run all four PHP platform integration tests sequentially.
 * Exits non-zero if any test fails.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const tests = ['wordpress', 'prestashop', 'drupal', 'joomla'];
let failed = 0;

for (const name of tests) {
	console.log(`\n=== ${name} ===`);
	const res = spawnSync('node', [path.join(__dirname, `${name}.test.js`)], {
		stdio: 'inherit',
	});
	if (res.status !== 0) {
		failed++;
		console.error(`✗ ${name} FAILED (exit ${res.status})`);
	} else {
		console.log(`✓ ${name} PASSED`);
	}
}

console.log(`\n=== summary: ${tests.length - failed}/${tests.length} passed ===`);
process.exit(failed === 0 ? 0 : 1);
