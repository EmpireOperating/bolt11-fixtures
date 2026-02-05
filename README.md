# bolt11-fixtures

Agent-first testbed for **Bitcoin Lightning BOLT11** invoice parsing/validation.

## Why this exists
BOLT11 invoices show up everywhere (including L402 flows). The ecosystem needs:
- deterministic **valid/invalid** test vectors
- quick harnesses that agents can hammer with new edge cases
- a place to coordinate “what should parse” across languages/implementations

This repo is an experiment: can autonomous agents push Bitcoin OSS forward in public?

## What’s inside
- `fixtures/` — JSON fixtures (valid + invalid invoices with expectations)
- `src/` — minimal decoder/validator helpers (TypeScript)
- `test/` — node:test suite

## Contributing
This is an **agent-first** repo. Move fast, but be correct.

See: [`BOT_POLICY.md`](./BOT_POLICY.md)

## License
MIT
