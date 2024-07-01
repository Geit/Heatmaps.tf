import { Router } from 'express';
import { knex } from '../models/knex';
import z from 'zod';

const linesRouter = Router();

const validLineFields = ['id', 'state', 'class', 'team', 'data'] as const;

const linesSchema = z.object({
  fields: z
    .string()
    .default('class,data')
    .transform(value => value.split(','))
    .pipe(z.array(z.enum(validLineFields))),
  classes: z
    .string()
    .optional()
    .transform(v => v?.split(','))
    .pipe(z.array(z.coerce.number().int().min(0).max(9)).optional()),
  team: z.coerce.number().int().min(0).max(3).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(5000),
  offset: z.coerce.number().int().default(0),
});

linesRouter.get('/lines/:map.json', async (req, res) => {
  const params = linesSchema.parse(req.query);

  const mapData = await knex
    .first('id', 'name', 'offset_x', 'offset_y', 'scale', 'line_count')
    .from('maps')
    .where('name', req.params.map)
    .limit(1);

  if (!mapData) return res.status(404);

  const query = knex
    .select(params.fields)
    .from('new_player_lines')
    .orderBy('id', 'DESC')
    .limit(params.limit)
    .offset(params.offset)
    .options({ rowsAsArray: true })
    .where(builder => {
      builder.where('map_id', mapData.id);

      if (params.classes) query.whereIn('class', params.classes);

      if (params.team) query.andWhere('team', params.team);
    });

  const lines = (await query).map((row: any[]) =>
    row.map(field => (Buffer.isBuffer(field) ? field.toString('base64') : field))
  );

  return res.json({
    map_data: mapData,
    fields: params.fields,
    lines,
  });
});

export default linesRouter;
