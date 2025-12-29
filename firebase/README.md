# Mentoroid Firebase Functions

Cloud Functions for automatic API key management. These functions run in the `mentoroid-backend-dev` Firebase project (region: `asia-southeast1`).

## Overview

The Mentoroid API requires authentication via API keys. This module provides:
1. **Automatic API key generation** when users sign up
2. **API key regeneration** for existing users
3. **API key retrieval** for displaying in the app

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Mentoroid Authentication Flow                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐      ┌─────────────────────┐      ┌──────────────────────┐
│  Mentoroid App   │      │   Firebase Auth     │      │   Firebase Firestore │
│  (Client)        │      │                     │      │                      │
└────────┬─────────┘      └──────────┬──────────┘      └───────────┬──────────┘
         │                           │                             │
         │  1. Sign up with email    │                             │
         │ ─────────────────────────>│                             │
         │                           │                             │
         │  2. Create user doc       │                             │
         │ ──────────────────────────┼────────────────────────────>│
         │                           │                             │
         │                           │   3. onUserCreated trigger  │
         │                           │ <───────────────────────────│
         │                           │                             │
         │                           │   4. Generate API key       │
         │                           │   5. Store in /api_keys     │
         │                           │   6. Update /users/{uid}    │
         │                           │ ────────────────────────────>│
         │                           │                             │
         │  7. getApiKey()           │                             │
         │ ─────────────────────────>│                             │
         │                           │                             │
         │  8. Return API key        │                             │
         │ <─────────────────────────│                             │
         │                           │                             │
         │  9. Use API key with      │                             │
         │     Mentoroid Backend     │                             │
         │ ─────────────────────────────────────────────────────────────────────>
         │                           │                             │    ┌───────┐
         │                           │                             │    │ GCP   │
         │                           │                             │    │Backend│
         │                           │                             │    └───────┘
```

## Functions

### `onUserCreated`

**Trigger:** Firestore document creation in `/users/{userId}`
**Region:** `asia-southeast1`

Automatically generates an API key when a new user document is created:

1. Generates secure API key (format: `mk_<32 hex chars>`)
2. Creates document in `/api_keys/{apiKey}` with user metadata
3. Updates `/users/{userId}` with the `api_key` field

### `regenerateApiKey`

**Type:** Callable function (HTTPS)
**Region:** `asia-southeast1`

Allows authenticated users to regenerate their API key:

- Deactivates the old API key (sets `active: false`)
- Generates a new API key
- Updates all relevant documents

**Returns:**
```json
{
  "success": true,
  "apiKey": "mk_a1b2c3d4e5f6789012345678901234ab",
  "createdAt": "2025-12-14T10:30:00.000Z"
}
```

### `getApiKey`

**Type:** Callable function (HTTPS)
**Region:** `asia-southeast1`

Returns the current user's API key.

**Returns:**
```json
{
  "apiKey": "mk_a1b2c3d4e5f6789012345678901234ab",
  "createdAt": "2025-12-14T10:30:00.000Z"
}
```

## Setup

### Prerequisites

1. Firebase CLI installed:
   ```bash
   npm install -g firebase-tools
   ```

2. Logged into Firebase:
   ```bash
   firebase login
   ```

3. Firebase project upgraded to Blaze plan (required for Cloud Functions)

### Install Dependencies

```bash
cd firebase/functions
npm install
```

### Deploy

```bash
cd firebase
firebase deploy --only functions
```

### Local Testing

```bash
cd firebase
firebase emulators:start --only functions,firestore
```

## Client Integration

### Web/JavaScript (Firebase SDK v9+)

#### Initialize Firebase

```javascript
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "mentoroid-backend-dev.firebaseapp.com",
  projectId: "mentoroid-backend-dev",
  storageBucket: "mentoroid-backend-dev.appspot.com",
  // ... other config
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// IMPORTANT: Connect to asia-southeast1 region
const functions = getFunctions(app, "asia-southeast1");
```

#### User Registration (Triggers API Key Generation)

```javascript
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

async function registerUser(email, password) {
  // 1. Create Firebase Auth user
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // 2. Create user document (triggers onUserCreated function)
  await setDoc(doc(db, "users", user.uid), {
    email: user.email,
    created_at: new Date().toISOString(),
  });

  // 3. Wait briefly for Cloud Function to execute
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 4. API key is now available via getApiKey()
  return user;
}
```

#### Get Current API Key

```javascript
const getApiKeyFn = httpsCallable(functions, "getApiKey");

async function fetchApiKey() {
  try {
    const result = await getApiKeyFn();
    console.log("Your API key:", result.data.apiKey);
    return result.data.apiKey;
  } catch (error) {
    console.error("Error fetching API key:", error);
    throw error;
  }
}
```

#### Regenerate API Key

```javascript
const regenerateApiKeyFn = httpsCallable(functions, "regenerateApiKey");

async function regenerateKey() {
  try {
    const result = await regenerateApiKeyFn();
    console.log("New API key:", result.data.apiKey);
    return result.data.apiKey;
  } catch (error) {
    console.error("Error regenerating API key:", error);
    throw error;
  }
}
```

#### Using the API Key with Mentoroid Backend

```javascript
async function analyzeMatch(matchId, steamId) {
  const apiKey = await fetchApiKey();

  const response = await fetch("https://dev.mentoroid.ai/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,  // Required for all API calls
    },
    body: JSON.stringify({
      match_id: matchId,
      steam_id: steamId,
    }),
  });

  return response.json();
}
```

### React Native / Expo

```javascript
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";

// Initialize with asia-southeast1 region
const functions = getFunctions(app, "asia-southeast1");

// For local development:
// connectFunctionsEmulator(functions, "localhost", 5001);

const getApiKey = httpsCallable(functions, "getApiKey");
const regenerateApiKey = httpsCallable(functions, "regenerateApiKey");
```

### Flutter

```dart
import 'package:cloud_functions/cloud_functions.dart';

final functions = FirebaseFunctions.instanceFor(region: 'asia-southeast1');

Future<String?> getApiKey() async {
  try {
    final result = await functions.httpsCallable('getApiKey').call();
    return result.data['apiKey'];
  } catch (e) {
    print('Error getting API key: $e');
    return null;
  }
}

Future<String?> regenerateApiKey() async {
  try {
    final result = await functions.httpsCallable('regenerateApiKey').call();
    return result.data['apiKey'];
  } catch (e) {
    print('Error regenerating API key: $e');
    return null;
  }
}
```

## Firestore Schema

### `/users/{userId}`

```json
{
  "email": "user@example.com",
  "api_key": "mk_a1b2c3d4e5f6789012345678901234ab",
  "api_key_created_at": "2025-12-14T10:30:00.000Z",
  "created_at": "2025-12-14T10:00:00.000Z"
}
```

### `/api_keys/{apiKey}`

```json
{
  "user_id": "firebase_user_uid",
  "email": "user@example.com",
  "active": true,
  "created_at": "2025-12-14T10:30:00.000Z",
  "rate_limit_tier": "standard",
  "usage": {
    "total_requests": 0,
    "last_request_at": null
  }
}
```

### Rate Limit Tiers

| Tier | Limits |
|------|--------|
| `standard` | 100 req/min (Stats API), 10 req/min (Analyze), 2 req/min (Bulk) |
| `premium` | 500 req/min (Stats API), 50 req/min (Analyze), 10 req/min (Bulk) |

## Security Rules

Recommended Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read their own document
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // API keys are only accessible by Cloud Functions (admin SDK)
    match /api_keys/{apiKey} {
      allow read, write: if false;  // Only admin SDK can access
    }
  }
}
```

## API Key Format

API keys follow this format:

```
mk_<32 hexadecimal characters>
```

Example: `mk_a1b2c3d4e5f6789012345678901234ab`

- Prefix `mk_` identifies it as a Mentoroid key
- 32 hex characters provide 128 bits of entropy
- Keys are case-insensitive

## Error Handling

### Common Errors

| Error Code | Description | Solution |
|------------|-------------|----------|
| `unauthenticated` | User not logged in | Ensure user is authenticated before calling |
| `not-found` | User document doesn't exist | Create user document first |
| `permission-denied` | Insufficient permissions | Check Firestore rules |

### Example Error Handling

```javascript
try {
  const result = await getApiKeyFn();
  return result.data.apiKey;
} catch (error) {
  if (error.code === 'functions/unauthenticated') {
    // Redirect to login
    console.log('Please log in first');
  } else if (error.code === 'functions/not-found') {
    // User document missing - create it
    console.log('Creating user profile...');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Monitoring

View function logs in Firebase Console or via CLI:

```bash
firebase functions:log --only onUserCreated
firebase functions:log --only getApiKey
firebase functions:log --only regenerateApiKey
```

## Related Documentation

- [Mentoroid API Documentation](../functions/gcp/openapi.yaml) - OpenAPI spec for backend
- [GCP Backend README](../functions/gcp/README.md) - Backend service details
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
