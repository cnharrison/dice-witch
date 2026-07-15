# Dice Witch roll domain

Pure, synchronous roll execution for the Cloudflare runtime. This package accepts normalized notation plus a persisted unsigned 32-bit seed and returns JSON-safe outcomes containing the authoritative total, legacy-compatible output text, and physical dice needed by the renderer.

## Guarantees

- The same notation, repetitions, and seed produce the same complete result.
- User notation errors are returned as sanitized data; programming and contract errors throw.
- Dice count, side count, exploding-dice expectations, repetitions, percentile expansion, and actual post-roll dice count are bounded before rendering.
- Partial multi-roll success matches the legacy behavior: valid expressions remain available when another expression is invalid.
- Roll calculation has no network, storage, timer, Discord, renderer, Node filesystem, or native-module dependency.
- Renderer colors and patterns are deliberately separate and will use their own persisted render seed.

`executeRoll()` does not await or yield. It installs the request's deterministic engine into the parser library only for that synchronous execution and restores the previous engine in `finally`, preventing the library's shared generator from leaking request state.

## Parser compatibility

Dice Witch retains `@dice-roller/rpg-dice-roller` 5.5.1 for production notation semantics. Its declared `mathjs` range currently resolves to a vulnerable release, so npm overrides that one transitive dependency to patched `mathjs` 15.2.0. The Worker-runtime compatibility corpus preserves seeded arithmetic, functions, groups, modifiers, percentile dice, and Fudge dice. A separate 1,750-case comparison against the declared dependency found no output differences.

The upstream ESM bundle includes a dormant `require("crypto")` for its optional Node random engine. Roll-domain consumers alias only that module to `worker-crypto.ts`, which implements the required `randomBytes()` contract with Web Crypto. This keeps the Worker free of broad Node compatibility flags. The adapter and optional engine are exercised inside `workerd`, and a Wrangler dry-run bundles the deterministic roll path successfully.
