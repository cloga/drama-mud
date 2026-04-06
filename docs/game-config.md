# Game Config Format — Drama MUD

## Directory Structure

Each game template is located at `games/<name>/` and contains:

```
games/power-trip-fixed/
├── config.json        # Game metadata
├── world.md           # World setting (used as LLM context)
└── characters.json    # Character definitions
```

## config.json

```json
{
  "name": "power-trip-fixed",
  "displayName": "Power Trip · Fixed Roles",
  "type": "power-trip",
  "roleMode": "fixed",
  "description": "Pure power fantasy from start to finish, with preset characters",
  "maxPlayers": 4,
  "turnLimit": 20
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier |
| `displayName` | string | Display name |
| `type` | `"power-trip" \| "comeback" \| "ghost-scare"` | Game type |
| `roleMode` | `"fixed" \| "open"` | Role mode |
| `description` | string | Short description |
| `maxPlayers` | number | Max players (optional, default 4) |
| `turnLimit` | number | Turn limit (optional, default 20) |

## world.md

Free-form world setting description, included as part of the LLM system prompt.

## characters.json

```json
[
  {
    "id": "char-hero",
    "name": "Character Name",
    "description": "Character identity description",
    "personality": "Personality traits",
    "isNpc": true
  }
]
```

When `roleMode: "fixed"`, players choose a character from the list.
When `roleMode: "open"`, players create their own characters freely; characters.json only defines NPCs.
