# Coding Guidelines — Drama MUD

## Language & Type Safety

- TypeScript strict mode everywhere; `noImplicitAny` enabled
- No `any` type — use `unknown` and narrow with type guards
- Prefer interfaces for object shapes, type aliases for unions/intersections
- Use branded types for IDs: `type CharacterId = string & { __brand: 'CharacterId' }`

## Naming

- Files: `kebab-case.ts`
- Classes/Interfaces/Types: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Booleans: prefix with `is`, `has`, `can`, `should`

## Module Design

- Named exports only (no `export default` except React page components)
- Barrel exports via `index.ts` per module
- Keep modules small and focused; one concept per file

## Error Handling

- Use `Result<T, E>` pattern for expected failures
- Throw only for unexpected / programmer errors
- Always type error payloads

## LLM Integration

- All LLM calls must go through `engine/src/llm/client.ts`
- System prompts live in `engine/src/llm/prompts.ts`
- Never embed API keys in code; read from `process.env`
- Use streaming where possible for real-time game output

## Testing

- See `testing.md` for full testing conventions
- Minimum: unit tests for all `engine/` pure logic
- Co-locate tests in `__tests__/` subdirectories

## Git

- Commit messages: `type: description` (feat, fix, refactor, docs, test, chore)
- Keep commits atomic — one logical change per commit
