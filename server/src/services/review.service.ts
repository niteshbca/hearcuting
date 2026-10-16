import mongoose, { FilterQuery } from 'mongoose';
import { Review, ReviewDoc } from '../models/Salon';
import { errors } from '../utils/errors';
import { Pagination, buildListResponse } from '../utils/pagination';

export interface ReviewCreateInput {
  name: string;
  rating: number;
  comment: string;
}

export interface ReviewUpdateInput {
  name?: string;
  rating?: number;
  comment?: string;
  isPublished?: boolean;
}

/** Latest published reviews (public gallery). */
export async function listPublished(limit = 50) {
  const clamp = Math.min(100, Math.max(1, Number(limit) || 50));
  return Review.find({ isPublished: true })
    .sort({ createdAt: -1 })
    .limit(clamp)
    .lean();
}

/** Moderation queue for staff — includes unpublished reviews. */
export async function listAdmin(query: { published?: boolean }, pagination: Pagination) {
  const filter: FilterQuery<ReviewDoc> = {};
  if (query.published !== undefined) filter.isPublished = query.published;

  const [items, total] = await Promise.all([
    Review.find(filter).sort(pagination.sort).skip(pagination.skip).limit(pagination.limit).lean(),
    Review.countDocuments(filter),
  ]);
  return buildListResponse(items, total, pagination);
}

/** Public submissions are always unpublished until moderated. */
export async function createReview(input: ReviewCreateInput): Promise<ReviewDoc> {
  return Review.create({
    name: input.name,
    rating: input.rating,
    comment: input.comment,
    source: 'website',
    isPublished: false,
  });
}

export async function updateReview(
  id: string,
  patch: ReviewUpdateInput
): Promise<{ before: Record<string, unknown>; after: ReviewDoc }> {
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Review not found');
  const review = await Review.findById(id);
  if (!review) throw errors.notFound('Review not found');

  const before = review.toObject() as unknown as Record<string, unknown>;
  if (patch.name !== undefined) review.name = patch.name;
  if (patch.rating !== undefined) review.rating = patch.rating;
  if (patch.comment !== undefined) review.comment = patch.comment;
  if (patch.isPublished !== undefined) review.isPublished = patch.isPublished;
  await review.save();
  return { before, after: review };
}

export async function deleteReview(id: string): Promise<ReviewDoc> {
  if (!mongoose.isValidObjectId(id)) throw errors.notFound('Review not found');
  const review = await Review.findByIdAndDelete(id);
  if (!review) throw errors.notFound('Review not found');
  return review;
}
