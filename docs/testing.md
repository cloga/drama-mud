# Testing Conventions — Drama MUD

## Framework

- **Vitest** for all packages
- Config: each package has its own `vitest.config.ts`

## Structure

- Co-locate tests: `src/__tests__/module-name.test.ts`
- Test file mirrors source file name: `character.ts` → `__tests__/character.test.ts`

## Principles

- Test behavior, not implementation
- Each test should be independent — no shared mutable state
- Use descriptive `describe` / `it` blocks in English

## Running

```bash
pnpm test          # all packages
pnpm --filter @drama-mud/engine test   # engine only
pnpm test -- --watch                    # watch mode
```

## Coverage

- Aim for high coverage on `engine/` (core game logic)
- Server/client coverage is secondary during early development
