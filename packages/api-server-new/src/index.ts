import express, { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import cors from 'cors';
import 'express-async-errors';

import mapsRouter from './routes/maps';
import killsRouter from './routes/kills';
import linesRouter from './routes/lines';
import { PORT } from './config';

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const message = err.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('\n');

    res.status(400).json({
      message,
    });
    return;
  }
  const { status } = err;

  console.error(err);
  res.status(status || 500).json({
    message: 'Unexpected server error',
  });
};

const createApp = () => {
  const _app = express();

  _app.use(cors());
  _app.use('/data', mapsRouter, killsRouter, linesRouter);
  _app.use(errorHandler);

  return _app;
};

const app = createApp();

app.listen(PORT, () => {
  console.log(`App listening on port http://localhost:${PORT}`);
});
