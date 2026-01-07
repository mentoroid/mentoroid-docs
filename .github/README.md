# GitHub Actions Setup

## Notion Sync Workflow

Automatically syncs API endpoint documentation to the Notion Screen Specifications database, organized by screen.

### How It Works

1. **Mapping file** (`screen-api-mapping.json`) defines which API endpoints belong to which screen
2. When spec files or the mapping changes, the workflow runs
3. For each screen in the mapping, it creates/updates a Notion page with endpoint docs

### Required Secrets

Configure in `Settings > Secrets and variables > Actions`:

| Secret | Value |
|--------|-------|
| `NOTION_API_KEY` | Notion Integration token |
| `NOTION_DATABASE_ID` | `199ccaae70b64aa2b57308a904a8a82d` |

### Creating a Notion Integration

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Create new integration named "Mentoroid Docs Sync"
3. Select Mentoroid workspace
4. Copy the token → use as `NOTION_API_KEY`

### Granting Database Access

1. Open Screen Specifications database in Notion
2. Click `...` menu → "Add connections"
3. Select "Mentoroid Docs Sync"

### Mapping File Structure

Edit `screen-api-mapping.json` to add/update endpoint mappings:

```json
{
  "screens": {
    "Screen Name": {
      "description": "What this screen does",
      "endpoints": [
        {
          "path": "/api/endpoint",
          "method": "GET",
          "source": "api/openapi.yaml"
        },
        {
          "path": "/planned/endpoint",
          "method": "POST",
          "source": "api/openapi.yaml",
          "status": "planned"
        }
      ]
    }
  }
}
```

- `source`: Which OpenAPI spec file contains this endpoint
- `status: "planned"`: Marks endpoints not yet deployed

### Workflow Triggers

- Push to `main` affecting: `*.yaml` specs or `screen-api-mapping.json`
- Manual trigger via Actions tab
