/**
 * Thin Cloudflare Worker slot for zero-waste (future BFF).
 * Local: `cd workers/api && npx wrangler deploy`
 * CI (repo root Builds): `npx wrangler deploy` with root wrangler.jsonc
 */

export default {
	async fetch(): Promise<Response> {
		return new Response("Hello from zero-waste-api");
	},
};
