import { Router } from 'express';
import { knex } from '../models/knex';

const mapsRouter = Router();

mapsRouter.get('/maps.json', async (req, res) => {
  const data = await knex.select('name', 'kill_count', 'overview_state').from('maps').orderBy('kill_count', 'DESC');

  return res.json(data);
});


mapsRouter.get('/maps/:map.json', async (req, res) => {
  const map = await knex.first().from('maps').where('name', req.params.map).limit(1);

  if(!map)
    return res.status(404);

  return res.json(map);
});

export default mapsRouter;