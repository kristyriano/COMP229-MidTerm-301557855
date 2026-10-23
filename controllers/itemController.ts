// ============================================================================
// Item Controller — COMP229 Mid-Term (Kris – Campus Lost & Found)
// ============================================================================
// Status codes used across the controller:
//   200 OK            -> successful GET / PUT / DELETE
//   201 Created       -> successful POST
//   400 Bad Request   -> invalid id, invalid body, invalid filter value
//   401 Unauthorized  -> handled by requireAuth middleware (missing/invalid JWT)
//   403 Forbidden     -> signed-in user is not the item's owner
//   404 Not Found     -> item id is valid but does not exist
//   409 Conflict      -> an item with the same title already exists
//   500               -> anything unexpected (forwarded to errorHandler)
// ============================================================================

import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Item, { ITEM_TYPES, ITEM_CATEGORIES, ITEM_STATUSES } from '../models/Item.js';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<Response | void>;

// Only these fields can come from the client. `owner`, `_id`, `createdAt`,
// `updatedAt` are NEVER taken from req.body (prevents ownership spoofing).
const EDITABLE_FIELDS = ['title', 'description', 'type', 'category', 'location', 'date', 'status'] as const;
const REQUIRED_FIELDS = ['title', 'description', 'type', 'category', 'location', 'date'] as const;

type ItemInput = Partial<Record<(typeof EDITABLE_FIELDS)[number], unknown>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Copies only the allowed fields from the request body. */
function pickEditable(body: Record<string, unknown>): ItemInput {
  const data: ItemInput = {};
  for (const key of EDITABLE_FIELDS) {
    if (body[key] !== undefined) {
      data[key] = typeof body[key] === 'string' ? (body[key] as string).trim() : body[key];
    }
  }
  return data;
}

/**
 * HTTP-level input validation (before Mongoose).
 * `partial = true` is used for PUT, where the client may send only some fields.
 * Returns an array of human-readable error messages (empty = valid).
 */
function validateItemInput(data: ItemInput, partial: boolean): string[] {
  const errors: string[] = [];

  if (!partial) {
    for (const field of REQUIRED_FIELDS) {
      if (data[field] === undefined || data[field] === '') {
        errors.push(`${field} is required`);
      }
    }
  }

  for (const field of ['title', 'description', 'location'] as const) {
    const value = data[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length === 0) {
      errors.push(`${field} must be a non-empty string`);
    } else if (value.length > (field === 'description' ? 1000 : 120)) {
      errors.push(`${field} is too long`);
    }
  }

  if (data.type !== undefined && !ITEM_TYPES.includes(data.type as never)) {
    errors.push(`type must be one of: ${ITEM_TYPES.join(', ')}`);
  }
  if (data.category !== undefined && !ITEM_CATEGORIES.includes(data.category as never)) {
    errors.push(`category must be one of: ${ITEM_CATEGORIES.join(', ')}`);
  }
  if (data.status !== undefined && !ITEM_STATUSES.includes(data.status as never)) {
    errors.push(`status must be one of: ${ITEM_STATUSES.join(', ')}`);
  }
  if (data.date !== undefined) {
    const d = new Date(data.date as string);
    if (typeof data.date !== 'string' || Number.isNaN(d.getTime())) {
      errors.push('date must be a valid date (e.g. 2026-10-20)');
    }
  }

  return [...new Set(errors)];
}

/** Escapes regex special characters so a title can be matched literally. */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive duplicate-title lookup ("Blue Bottle" == "blue bottle"). */
function findByTitle(title: string, excludeId?: unknown) {
  const filter: Record<string, unknown> = { title: new RegExp(`^${escapeRegex(title)}$`, 'i') };
  if (excludeId) filter._id = { $ne: excludeId };
  return Item.findOne(filter);
}

function isMongoDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

// ---------------------------------------------------------------------------
// GET /api/items  (public)  — filters: ?type=  ?category=
// ---------------------------------------------------------------------------
export const listItems: AsyncHandler = async (req, res, next) => {
  try {
    const { type, category } = req.query;
    const filter: Record<string, string> = {};

    if (type !== undefined) {
      if (typeof type !== 'string' || !ITEM_TYPES.includes(type as never)) {
        return res.status(400).json({ error: `type must be one of: ${ITEM_TYPES.join(', ')}` });
      }
      filter.type = type;
    }
    if (category !== undefined) {
      if (typeof category !== 'string' || !ITEM_CATEGORIES.includes(category as never)) {
        return res.status(400).json({ error: `category must be one of: ${ITEM_CATEGORIES.join(', ')}` });
      }
      filter.category = category;
    }

    const items = await Item.find(filter).sort({ createdAt: -1 });
    return res.status(200).json(items);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/items/mine  (Bearer)
// ---------------------------------------------------------------------------
export const listMyItems: AsyncHandler = async (req, res, next) => {
  try {
    // req.userId is set by requireAuth from the verified JWT
    const items = await Item.find({ owner: req.userId }).sort({ createdAt: -1 });
    return res.status(200).json(items);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// GET /api/items/:id  (public)
// ---------------------------------------------------------------------------
export const getItemById: AsyncHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isObjectIdOrHexString(id)) {
      return res.status(400).json({ error: 'Invalid item id' });
    }

    const item = await Item.findById(id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    return res.status(200).json(item);
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// POST /api/items  (Bearer) — owner = current user, title must be unique
// ---------------------------------------------------------------------------
export const createItem: AsyncHandler = async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    const data = pickEditable(req.body);
    const errors = validateItemInput(data, false);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    // Avoid duplicated items: title is the unique field
    const duplicate = await findByTitle(data.title as string);
    if (duplicate) {
      return res.status(409).json({ error: `An item titled "${data.title}" already exists` });
    }

    const item = await Item.create({ ...data, owner: req.userId });
    return res.status(201).json(item);
  } catch (err) {
    const error = err as Error;
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    if (isMongoDuplicateKey(err)) {
      // Safety net in case two requests race past the findByTitle check
      return res.status(409).json({ error: 'An item with this title already exists' });
    }
    next(err);
  }
};

// ---------------------------------------------------------------------------
// PUT /api/items/:id  (Bearer) — owner only
// ---------------------------------------------------------------------------
export const updateItem: AsyncHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isObjectIdOrHexString(id)) {
      return res.status(400).json({ error: 'Invalid item id' });
    }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    const data = pickEditable(req.body);
    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        error: `Provide at least one field to update: ${EDITABLE_FIELDS.join(', ')}`,
      });
    }
    const errors = validateItemInput(data, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const item = await Item.findById(id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Ownership check: compare the item's owner with the user from the JWT
    if (!item.owner.equals(req.userId)) {
      return res.status(403).json({ error: 'Forbidden: you can only update your own items' });
    }

    if (data.title !== undefined) {
      const duplicate = await findByTitle(data.title as string, item._id);
      if (duplicate) {
        return res.status(409).json({ error: `An item titled "${data.title}" already exists` });
      }
    }

    item.set(data);
    await item.save(); // save() runs the schema validators
    return res.status(200).json(item);
  } catch (err) {
    const error = err as Error;
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    if (isMongoDuplicateKey(err)) {
      return res.status(409).json({ error: 'An item with this title already exists' });
    }
    next(err);
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/items/mine  (Bearer)
// ---------------------------------------------------------------------------
export const deleteMyItems: AsyncHandler = async (req, res, next) => {
  try {
    const result = await Item.deleteMany({ owner: req.userId });
    return res.status(200).json({
      message: 'All of your items were deleted',
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/items/:id  (Bearer) — owner only
// ---------------------------------------------------------------------------
export const deleteItem: AsyncHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isObjectIdOrHexString(id)) {
      return res.status(400).json({ error: 'Invalid item id' });
    }

    const item = await Item.findById(id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (!item.owner.equals(req.userId)) {
      return res.status(403).json({ error: 'Forbidden: you can only delete your own items' });
    }

    await item.deleteOne();
    return res.status(200).json({ message: 'Item deleted', id: item._id });
  } catch (err) {
    next(err);
  }
};

// Re-exported so the Item model can also be imported from here if needed.
export { Item };
