import { Router } from 'express';
import { knex } from '../models/knex';
import z from 'zod';

const killsRouter = Router();

const validKillFields = [
  'id',
  'timestamp',
  'killer_class',
  'killer_weapon',
  'killer_x',
  'killer_y',
  'killer_z',
  'victim_class',
  'victim_x',
  'victim_y',
  'victim_z',
  'customkill',
  'damagebits',
  'death_flags',
  'team',
] as const;

const killsSchema = z.object({
  fields: z
    .string()
    .default('victim_x,victim_y,team')
    .transform(value => value.split(','))
    .pipe(z.array(z.enum(validKillFields))),
  victim_class: z.array(z.number().int().min(0).max(9)).min(1).optional(),
  killer_class: z.array(z.number().int().min(0).max(9)).min(1).optional(),
  killer_team: z.coerce.number().int().min(0).max(3).optional(),
  min_dist: z.coerce.number().int().min(1).optional(),
  max_dist: z.coerce.number().int().min(2).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(5000).co,
  offset: z.coerce.number().int().default(0),
});

killsRouter.get('/kills/:map.json', async (req, res) => {
  const params = killsSchema.parse(req.query);

  const mapData = await knex
    .first('id', 'name', 'offset_x', 'offset_y', 'scale', 'kill_count')
    .from('maps')
    .where('name', req.params.map)
    .limit(1);

  if (!mapData) return res.status(404);

  const query = knex
    .select(params.fields)
    .from('kills')
    .orderBy('id', 'DESC')
    .limit(params.limit)
    .offset(params.offset)
    .options({ rowsAsArray: true })
    .where(builder => {
      builder.where('map_id', mapData.id);

      if (params.victim_class) query.whereIn('victim_class', params.victim_class);

      if (params.killer_class) query.whereIn('killer_class', params.killer_class);

      if (params.killer_team) query.andWhere('team', params.killer_team);

      if (params.min_dist) query.andWhere('distance', '>=', params.min_dist).andWhere('team', '!=', 0);

      if (params.max_dist) query.andWhere('distance', '<=', params.max_dist).andWhere('team', '!=', 0);
    });

  return res.json({
    map_data: mapData,
    fields: params.fields,
    kills: await query,
  });
});

export default killsRouter;
