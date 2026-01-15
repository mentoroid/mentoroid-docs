# Mentoroid Pub/Sub Architecture

Complete documentation for running the Mentoroid user data pipeline with Pub/Sub-based asynchronous processing.

## Overview

The Mentoroid backend uses a Pub/Sub-driven architecture to process match analysis asynchronously. This enables scalable, fault-tolerant processing of Dota 2 match data.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL CONSUMERS                                     │
│         (Mobile App / Web Dashboard / Binary Desktop Client)                     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌─────────────────┐                ┌─────────────────┐
          │   ORCHESTRATOR  │                │    STATS API    │
          │   (Write API)   │                │   (Read API)    │
          │   Port: 58081   │                │   Port: 58084   │
          └────────┬────────┘                └─────────────────┘
                   │                                   ▲
                   │ Pub/Sub                           │ GCS Read
                   ▼                                   │
          ┌─────────────────┐                          │
          │  PGA TRIGGER    │                          │
          │   SERVICE       │                          │
          │   Port: 58085   │                          │
          └────────┬────────┘                          │
                   │ HTTP / Pub/Sub                    │
                   ▼                                   │
          ┌─────────────────┐                          │
          │ REPLAY FETCHER  │                          │
          │   Port: 58082   │                          │
          └────────┬────────┘                          │
                   │ HTTP                              │
                   ▼                                   │
          ┌─────────────────┐                          │
          │  PGA ANALYZER   │                          │
          │   (10GB RAM)    │                          │
          │   Port: 58083   │                          │
          └────────┬────────┘                          │
                   │ Pub/Sub                           │
                   ▼                                   │
          ┌─────────────────┐                          │
          │   AGGREGATE     │──────────────────────────┘
          │    SERVICE      │
          │   Port: 58086   │
          └────────┬────────┘
                   │ HTTP / Pub/Sub
          ┌────────┴────────┐
          ▼                 ▼
┌─────────────────┐  ┌─────────────────┐
│    PROFILE      │  │   PGA LLM       │
│   GENERATOR     │  │   GENERATOR     │
│   Port: 58087   │  │   Port: 58088   │
└─────────────────┘  └─────────────────┘
```

## Two Processing Paths

| Path | Trigger | Use Case | Processing Mode |
|------|---------|----------|-----------------|
| **Path A** | `POST /signup` | First-time user registration | Bulk (14 days of matches) |
| **Path B** | `POST /match` | Live match from Binary client | Single (1 match) |

---

## Quick Start

### Prerequisites

- Docker with **12GB+ RAM** (for PGA Analyzer Java parser)
- API Keys: `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY`

### Start Services

```bash
cd mentoroid-backend/local-dev

# Copy environment file
cp .env.example .env
# Edit .env and add your API keys

# Start all services
docker-compose up -d

# Wait for services to be healthy (~60 seconds)
docker-compose ps

# Verify services
curl http://localhost:58081/health  # Orchestrator
curl http://localhost:58084/health  # Stats API
```

---

## Path A: First-Time User Signup

### Endpoint

```
POST http://localhost:58081/signup
```

### Request

```bash
curl -X POST http://localhost:58081/signup \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "steam_id": "76561198047160218"
  }'
```

### Response

```json
{
    "status": "success",
    "message": "User registered, processing historical matches",
    "steam_id": "76561198047160218",
    "matches_found": 15,
    "matches_added": 15
}
```

### What Happens

1. **Orchestrator** creates manifest in GCS: `user_manifests/{steam_id}.json`
2. **Orchestrator** fetches last 14 days of matches from Steam API
3. **Orchestrator** gets detailed match data (KDA, GPM, net_worth, hero_damage, tower_damage)
4. **Orchestrator** publishes to `pga-trigger` topic
5. **PGA Trigger Service** creates progress file: `{steam_id}_progress.json`
6. **PGA Trigger Service** publishes each match to `match-analysis-queue`
7. **Replay Fetcher** waits for DEM file, calls PGA Analyzer
8. **PGA Analyzer** runs deep analysis, writes to `player_pga/{steam_id}/output_pga/{match_id}.json`
9. **PGA Analyzer** publishes result to `pga-results` topic
10. **Aggregate Service** updates manifest (status: success, adds pga_data)
11. **Aggregate Service** when ALL complete, publishes to `pga-aggregation-complete`
12. **Profile Generator** creates profile: `player_profiles/{steam_id}/profile_stats_webapi_pga.json`

---

## Path B: Live Match from Binary

### Endpoint

```
POST http://localhost:58081/match
```

### Request

```bash
curl -X POST http://localhost:58081/match \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "steam_id": "76561198047160218",
    "match_id": "8600000099",
    "hero_id": 74,
    "hero_facet": 2,
    "Facet_Selected": "Reflective Counter",
    "Win": "Win",
    "game_time": 2340.5,
    "date": "2026-01-06",
    "networth": 32000,
    "xpm": 750.5,
    "lasthit": 320,
    "denies": 18,
    "death_participant": 0.15,
    "sentry_ward": 2,
    "observer_ward": 4,
    "kill_participant": 0.72,
    "kill": 15,
    "death": 3,
    "assist": 12
  }'
```

### Response

```json
{
    "status": "success",
    "message": "Match received and queued for processing",
    "match_id": "8600000099"
}
```

### What Happens

Same as Path A but for a single match. Profile regenerated after PGA completes.

---

## Pub/Sub Topics

### Topic Configuration

| Topic | Publisher | Subscriber | Message Schema |
|-------|-----------|------------|----------------|
| `pga-trigger` | Orchestrator | PGA Trigger Service | See below |
| `match-analysis-queue` | PGA Trigger | Replay Fetcher | See below |
| `pga-results` | PGA Analyzer | Aggregate Service | See below |
| `pga-aggregation-complete` | Aggregate Service | Profile Generator, PGA LLM Generator | See below |

### Message Schemas

#### pga-trigger Topic

```json
{
    "steam_id": "76561198047160218",
    "request_type": "bulk",
    "match_ids": ["8576409405", "8576409406"],
    "timestamp": "2026-01-09T10:00:00Z"
}
```

#### match-analysis-queue Topic

```json
{
    "match_id": "8576409405",
    "steam_id": "76561198047160218",
    "timestamp": "2026-01-09T10:00:01Z"
}
```

#### pga-results Topic

```json
{
    "match_id": "8576409405",
    "steam_id": "76561198047160218",
    "status": "success",
    "pga_data": {
        "mentoroid_score": 6.17,
        "role": "Soft Support",
        "lane_dominance_score": 5.52,
        "teamfight_score": 5.21,
        "farm_efficiency": 1.36
    },
    "timestamp": "2026-01-09T10:15:00Z"
}
```

#### pga-aggregation-complete Topic

```json
{
    "steam_id": "76561198047160218",
    "total_processed": 11,
    "successful": 11,
    "failed": 0,
    "timestamp": "2026-01-09T11:30:00Z"
}
```

---

## GCS Storage Structure

```
gs://mentoroid-pga-dev/
│
├── userdata/dota2/
│   │
│   ├── user_manifests/
│   │   ├── {steam_id}.json              # Master manifest with all matches
│   │   └── {steam_id}_progress.json     # Bulk processing progress
│   │
│   ├── player_profiles/
│   │   └── {steam_id}/
│   │       ├── profile_stats_webapi_pga.json   # Quantitative stats
│   │       └── profile_llm.json                # AI insights
│   │
│   ├── player_pga/
│   │   └── {steam_id}/
│   │       ├── output_pga/
│   │       │   └── {match_id}.json      # PGA analysis results
│   │       └── output_llm/
│   │           └── {match_id}.json      # LLM match summaries
│   │
│   └── player_history/
│       └── {steam_id}.json              # Aggregated history (latest 50)
│
└── system-data/
    └── dem_cache/{match_id}.dem.bz2     # Cached DEM files
```

---

## Service Ports (Local Development)

| Service | External Port | Internal Port | Container Name |
|---------|---------------|---------------|----------------|
| **Orchestrator** | `58081` | `8080` | `mentoroid-orchestrator` |
| **Replay Fetcher** | `58082` | `8080` | `mentoroid-replay-fetcher` |
| **PGA Analyzer** | `58083` | `8080` | `mentoroid-pga-analyzer` |
| **Stats API** | `58084` | `8080` | `mentoroid-stats-api` |
| **PGA Trigger Service** | `58085` | `8080` | `mentoroid-pga-trigger` |
| **Aggregate Service** | `58086` | `8080` | `mentoroid-aggregate` |
| **Profile Generator** | `58087` | `8080` | `mentoroid-profile-generator` |
| **PGA LLM Generator** | `58088` | `8080` | `mentoroid-pga-llm-generator` |
| **GCS Emulator** | `54443` | `4443` | `mentoroid-gcs` |
| **Pub/Sub Emulator** | `58089` | `8089` | `mentoroid-pubsub` |

---

## Environment Variables

### Required for All Services

```bash
PROJECT_ID=mentoroid-local
BUCKET_NAME=mentoroid-local
ENVIRONMENT=local
RUNTIME_ENV=local
STORAGE_EMULATOR_HOST=http://gcs:4443
PUBSUB_EMULATOR_HOST=pubsub:8089
```

### Service-Specific

#### Orchestrator
```bash
REPLAY_FETCHER_URL=http://replay-fetcher:8080
PGA_TRIGGER_URL=http://pga-trigger-service:8080
PGA_TRIGGER_TOPIC=pga-trigger
STEAM_API_KEY=your_steam_api_key
```

#### PGA Analyzer
```bash
AGGREGATE_SERVICE_URL=http://aggregate-service:8080
PGA_RESULTS_TOPIC=pga-results
```

#### Aggregate Service
```bash
PROFILE_GENERATOR_URL=http://profile-generator:8080
AGGREGATION_COMPLETE_TOPIC=pga-aggregation-complete
```

#### Profile Generator / PGA LLM Generator
```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Checking Progress

> **Note:** Orchestrator (58081) has `/user-*` endpoints for workflow status.
> Stats API (58084) has `/player/*` endpoints for production reads.
> Use Stats API endpoints for frontend integration.

### Get User Manifest (Orchestrator)

```bash
curl http://localhost:58081/user-manifest/76561198047160218 \
  -H "X-API-Key: your-api-key"
```

### Get User Profile (Stats API - recommended for production)

```bash
curl http://localhost:58084/player/76561198047160218 \
  -H "X-API-Key: your-api-key"
```

### Get Match History

```bash
curl "http://localhost:58084/player/76561198047160218/history?limit=20" \
  -H "X-API-Key: your-api-key"
```

### Get Individual Match PGA

```bash
curl http://localhost:58084/player/76561198047160218/pga/8576409405 \
  -H "X-API-Key: your-api-key"
```

---

## Production URLs

| Environment | Orchestrator | Stats API |
|-------------|--------------|-----------|
| **Dev** | `https://dev.mentoroid.ai` | `https://asia-southeast1-mentoroid-app-dev.cloudfunctions.net/stats-api-dev` |
| **Prod** | `https://api.mentoroid.ai` | `https://asia-southeast1-mentoroid-app.cloudfunctions.net/stats-api` |

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `User already registered` | Called `/signup` for existing user | Use `/match` for subsequent matches |
| `User not registered` | Called `/match` before `/signup` | Call `/signup` first |
| `Steam API key not configured` | Missing `STEAM_API_KEY` | Add to `.env` file |
| `Invalid steam_id format` | Steam ID not 17 digits starting with 7656 | Use correct Steam 64-bit ID |

---

## Related Documentation

- [Cloud API Reference](../api/) - Stats API and Orchestrator endpoints
- [Firebase Integration](../firebase/README.md) - API key management
- [In-Game API](../in-game/) - Real-time coaching endpoints
