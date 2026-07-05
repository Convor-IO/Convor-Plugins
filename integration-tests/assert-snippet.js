'use strict';

/**
 * Shared assertion harness for the Convor widget snippet.
 *
 * The canonical snippet each PHP plugin MUST emit is:
 *
 *   <script src="<apiBase>/widget.js" data-key="<slug>" async></script>
 *
 * `assertSnippetMatches(html, { apiBase, slug })` throws (with a readable
 * diff) when the html does not contain a valid snippet, and returns the
 * matched <script> tag on success.
 */

const DEFAULT_API_BASE = 'https://cdn.convor.io';

/**
 * Build the regex that matches the canonical widget snippet.
 *
 * We are deliberately lenient about attribute ordering and surrounding
 * whitespace, but strict about the parts that matter:
 *  - <script ... src="<apiBase>/widget.js" ...>
 *  - data-key="<slug>"
 *  - the `async` attribute is present
 *  - a closing </script>
 *
 * @param {string} apiBase
 * @param {string} slug
 * @returns {RegExp}
 */
function buildSnippetRegex(apiBase, slug) {
	const escapedApiBase = apiBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// src value: apiBase + optional trailing slash + /widget.js (the slash may
	// already be part of apiBase, so we tolerate exactly one or two slashes).
	const srcPattern = `src=["']${escapedApiBase}\\/*widget\\.js["']`;
	const dataKeyPattern = `data-key=["']${escapedSlug}["']`;
	// <script ... attributes ...> ... </script>. Allow attributes in any order
	// and extra attributes in between.
	return new RegExp(
		`<script\\b[^>]*\\b${srcPattern}[^>]*>[\\s\\S]*?<\\/script>`,
		'i',
	);
}

/**
 * Assert that `html` contains the canonical Convor widget snippet for the
 * given apiBase + slug, with the `async` attribute and a matching data-key.
 *
 * @param {string} html
 * @param {{apiBase?: string, slug?: string}} [opts]
 * @returns {string} The matched <script> tag.
 * @throws {Error} when the snippet is missing or malformed, with a diff.
 */
function assertSnippetMatches(html, opts) {
	const options = opts || {};
	const apiBase = options.apiBase || DEFAULT_API_BASE;
	const slug = options.slug || '';

	if (typeof html !== 'string' || html.length === 0) {
		throw new Error('assertSnippetMatches: html is empty / not a string');
	}

	const regex = buildSnippetRegex(apiBase, slug);

	const scriptMatch = html.match(regex);
	if (!scriptMatch) {
		const expected = `<script src="${apiBase}/widget.js" data-key="${slug}" async></script>`;
		throw new Error(
			`Snippet not found.\nExpected (canonical):\n  ${expected}\n` +
				`Received html:\n${html}\n` +
				`(looked for src=${apiBase}/*.js and the regex: ${regex.source})`,
		);
	}

	const scriptTag = scriptMatch[0];

	// Verify data-key is present and correct.
	const dataKeyRe = new RegExp(
		`data-key=["']${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`,
		'i',
	);
	if (!dataKeyRe.test(scriptTag)) {
		throw new Error(
			`Snippet found but data-key mismatch.\n` +
				`Script tag: ${scriptTag}\nExpected data-key="${slug}"`,
		);
	}

	// Verify async attribute is present.
	if (!/\basync\b/i.test(scriptTag)) {
		throw new Error(
			`Snippet found but missing the 'async' attribute.\nScript tag: ${scriptTag}`,
		);
	}

	return scriptTag;
}

module.exports = {
	assertSnippetMatches,
	buildSnippetRegex,
	DEFAULT_API_BASE,
};
