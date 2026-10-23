# IMPLEMENTATION.md — Kris – Campus Lost & Found API

## Student

- **Name:** Kristy Riano
- **Student ID:** 301557855
- **Section:**
- **Date:** October 2026

---

## 1. Environment

- Node version (`node -v`): v22+
- MongoDB (local / Atlas / Docker): local MongoDB (`mongodb://127.0.0.1:27017/kris_lostfound`)
- How you ran the server: `npm run dev` (tsx watch) — listening on **port 8080**

---

## 2. Endpoint Checklist

### GET `/api/items`
- Filters supported: `?type=` (Lost/Found) and `?category=` (Electronics, Clothing, Books, Accessories, Other). Both can be combined.
- Status codes: 200 with an array (newest first); 400 if a filter value is not one of the allowed values.
- Notes: Public route, no token required.

### GET `/api/items/mine`
- How you scope to the signed-in user: `Item.find({ owner: req.userId })`; `req.userId` comes from the verified JWT set by `requireAuth`.
- Status codes: 200; 401 without/invalid token.
- Notes: Declared before `/:id` so Express does not treat "mine" as an id.

### GET `/api/items/:id`
- How you validate `:id`: `mongoose.isObjectIdOrHexString(id)` before querying.
- Status codes (valid id / invalid id / not found): 200 / 400 / 404.

### POST `/api/items`
- How you set `owner`: always from `req.userId` (the token), never from the body.
- How validation errors are returned: HTTP-level validation first (required fields, enums, valid date, lengths) → `400 { error, details: [...] }`; Mongoose `ValidationError` is also mapped to 400.
- Status codes: 201 created / 400 invalid body / 401 no token / 409 duplicated title.
- Notes: Title is the unique field: `unique: true` in the schema plus a case-insensitive check before creating; duplicate-key error 11000 is also mapped to 409.

### PUT `/api/items/:id`
- How you check ownership: load the item, then `item.owner.equals(req.userId)`; if false → 403.
- Which fields you allow to be updated: title, description, type, category, location, date, status (whitelist). `owner`, `_id` and timestamps are ignored.
- Status codes (invalid id / not found / not owner / success): 400 / 404 / 403 / 200 (409 if the new title already exists).
- Notes: Uses `item.set()` + `item.save()` so schema validators run.

### DELETE `/api/items/mine`
- Query used: `Item.deleteMany({ owner: req.userId })`.
- Response shape: `200 { message, deletedCount }`.

### DELETE `/api/items/:id`
- How you check ownership: same as PUT (`item.owner.equals(req.userId)`).
- Status codes: 200 `{ message, id }` / 400 invalid id / 401 no token / 403 not owner / 404 not found.

---

## 3. Testing

- Tool used: Postman
- Collection file: `Kris-LostFound.postman_collection.json` (saves tokenA, tokenB and itemId automatically)
- Which scenarios you verified:
  - [x] Signup / signin happy path
  - [x] Signin with wrong password → 401
  - [x] Protected route without token → 401
  - [x] Create item with missing required field → 400
  - [x] Create item success → 201
  - [x] Create item with duplicated title → 409
  - [x] List all + filters (`?type=`, `?category=`)
  - [x] Get by invalid id → 400
  - [x] Get by missing id → 404
  - [x] List mine returns only my items
  - [x] Update by non-owner → 403
  - [x] Update by owner → 200
  - [x] Delete by non-owner → 403
  - [x] Delete by owner → 200
  - [x] Delete /mine empties my list

---

## 4. Known Issues / Things I Would Improve

- Add pagination to `GET /api/items`.
- Use a validation library (Zod / express-validator) instead of manual checks.

---

## 5. References

- Mongoose docs: https://mongoosejs.com/docs/
- Express docs: https://expressjs.com/
