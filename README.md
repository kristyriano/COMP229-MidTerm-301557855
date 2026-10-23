# webapp Mid-Term Test – Campus Lost & Found REST API

Starter project for the Week 7 mid-term. Signup / signin and JWT authentication
are already provided. **Your job is to complete the seven TODO functions in
`controllers/itemController.js`** so the Item REST API behaves as specified
below.

> Rename this folder to `webapp-MidTerm-<YourStudentID>` before you submit
> (e.g. `webapp-MidTerm-300929668`).

---

## 1. Project Setup

### Prerequisites

- Node.js 18+ and npm
- A running MongoDB instance (local `mongod`, Docker, or MongoDB Atlas)

### Install

```bash
npm install
```

### Configure environment variables

Copy `.env.example` to `.env` and edit the values:

```bash
cp .env.example .env
```

```ini
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/webapp_lostfound
JWT_SECRET=replace_this_with_a_long_random_string
JWT_EXPIRES_IN=1d
```

### Run the server

```bash
npm run dev   # auto-restarts on file changes (nodemon)
# or
npm start
```

On a successful start you should see:

```
[db] Connected to MongoDB: webapp_lostfound
[server] Listening on http://localhost:3000
```

Visit `http://localhost:3000/` to see a JSON summary of the available routes.

---

## 2. Project Structure

```
.
├── server.js                 # Express app & bootstrap
├── config/db.js              # Mongoose connection
├── middleware/auth.js        # JWT auth middleware (provided)
├── models/
│   ├── User.js               # User model (provided)
│   └── Item.js               # Item model (provided)
├── controllers/
│   ├── authController.js     # signup/signin/me (provided)
│   └── itemController.js     # 7 TODO functions ← YOU IMPLEMENT
├── routes/
│   ├── authRoutes.js         # /api/auth/* (provided)
│   └── itemRoutes.js         # /api/items/* (provided)
├── .env.example
├── README.md
└── IMPLEMENTATION.md
```

---

## 3. REST API Reference

Base URL: `http://localhost:3000`

### Authentication (provided — do not change)

| Method | URL                | Auth    | Body                             |
|--------|--------------------|---------|----------------------------------|
| POST   | `/api/auth/signup` | Public  | `{ name, email, password }`      |
| POST   | `/api/auth/signin` | Public  | `{ email, password }`            |
| GET    | `/api/auth/me`     | Bearer  | —                                |

Both `signup` and `signin` respond with:

```json
{
  "token": "<JWT>",
  "user": { "_id": "...", "name": "...", "email": "...", "createdAt": "...", "updatedAt": "..." }
}
```

Protected endpoints require the header:

```
Authorization: Bearer <JWT>
```

### Items (you implement the controllers)

| Method | URL                 | Auth    | Description                                           |
|--------|---------------------|---------|-------------------------------------------------------|
| GET    | `/api/items`        | Public  | List all items. Filters: `?type=`, `?category=`       |
| GET    | `/api/items/mine`   | Bearer  | List items owned by the signed-in user                |
| GET    | `/api/items/:id`    | Public  | Get a single item by id                               |
| POST   | `/api/items`        | Bearer  | Create a new item (owner = current user), avoid duplicated items, use title as unique field. |
| PUT    | `/api/items/:id`    | Bearer  | Update an item — **owner only**                       |
| DELETE | `/api/items/mine`   | Bearer  | Delete all items owned by the signed-in user          |
| DELETE | `/api/items/:id`    | Bearer  | Delete an item — **owner only**                       |

#### Required status codes

| Situation                       | Status |
|---------------------------------|--------|
| Success (GET / PUT)             | 200    |
| Success (POST / create)         | 201    |
| Successful delete               | 200 or 204 |
| Invalid request body / bad id   | 400    |
| Missing / invalid JWT           | 401    |
| User is not the item's owner    | 403    |
| Item not found                  | 404    |
| Unexpected server error         | 500    |

### Item schema

| Field         | Type     | Rules                                                                 |
|---------------|----------|-----------------------------------------------------------------------|
| `title`       | String   | required, trimmed                                                     |
| `description` | String   | required, trimmed                                                     |
| `type`        | String   | required; `Lost` or `Found`                                           |
| `category`    | String   | required; `Electronics`, `Clothing`, `Books`, `Accessories`, `Other`  |
| `location`    | String   | required, trimmed                                                     |
| `date`        | Date     | required; date the item was lost / found                              |
| `status`      | String   | `Open` or `Returned`, default `Open`                                  |
| `owner`       | ObjectId | required; reference to the User who created the report (set in code) |
| `createdAt`   | Date     | automatic                                                             |
| `updatedAt`   | Date     | automatic                                                             |

---

## 4. Testing Guidance

You can test with **Postman**, **Thunder Client**, or `curl`. The flow is:

1. **Sign up** a user and copy the returned token.
2. Send that token as `Authorization: Bearer <token>` on protected routes.
3. Create a few items, list them, update one, delete one, etc.

### Example: curl

```bash
# 1. Sign up
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada","email":"ada@my.centennialcollege.ca","password":"secret123"}'

# 2. Sign in
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@my.centennialcollege.ca","password":"secret123"}' | jq -r .token)

# 3. Create an item
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Blue Hydro Flask",
    "description": "Dented bottom, has a sticker of a cat",
    "type": "Found",
    "category": "Accessories",
    "location": "Library 3rd floor",
    "date": "2026-10-20"
  }'

# 4. List all items filtered by type
curl "http://localhost:3000/api/items?type=Found&category=Accessories"

# 5. List mine
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/items/mine

# 6. Update
curl -X PUT http://localhost:3000/api/items/<id> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"Returned"}'

# 7. Delete
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/items/<id>

# 8. Delete all mine
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/items/mine
```

### Postman collection — minimum tests to show the marker

- ✅ Signup returns 201 with a token
- ✅ Signin returns 200 with a token; wrong password returns 401
- ✅ `GET /api/items` returns 200 and respects `?type=` and `?category=`
- ✅ `POST /api/items` without a token returns 401
- ✅ `POST /api/items` with valid body + token returns 201
- ✅ `POST /api/items` missing a required field returns 400
- ✅ `GET /api/items/:id` with a bogus id returns 400; with a valid-but-missing id returns 404
- ✅ `GET /api/items/mine` returns only the current user's items
- ✅ `PUT /api/items/:id` by someone else returns 403
- ✅ `DELETE /api/items/:id` by the owner returns 200/204 and the item is gone
- ✅ `DELETE /api/items/mine` returns a `deletedCount` and empties `GET /api/items/mine`

---

## 5. Submission

1. Rename this folder to `webapp-MidTerm-<YourStudentID>`.
2. Fill in `IMPLEMENTATION.md` (the template is provided).
3. **Do not commit `node_modules/`  The provided `.gitignore`
   already excludes them.
4. Zip the folder (or push to the repo your instructor specifies) and submit.
