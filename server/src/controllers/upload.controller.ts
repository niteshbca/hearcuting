import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { env } from '../config/env';
import { errors } from '../utils/errors';

/** Local disk upload; returns a URL served by the API at /uploads/<file>. */
export const uploadSingle = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw errors.badRequest('No file uploaded (field name must be "file")');
  const base = env().CLIENT_ORIGINS.split(',')[0].trim();
  const relative = `/uploads/${file.filename}`;
  res.status(201).json({
    data: {
      url: relative,
      absoluteUrl: `${base.replace(/:\d+$/, '')}:${env().PORT}${relative}`,
      filename: file.filename,
      size: file.size,
      mimeType: file.mimetype,
      provider: 'local',
    },
  });
});
