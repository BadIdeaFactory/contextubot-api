import debug from 'debug';

import tmp from 'tmp';
import rrequest from 'request';
import urlParse from 'url-parse';

import express from 'express';
import logger from 'morgan';
// import bodyParser from 'body-parser';
import cors from 'cors';


// const log = debug('contextubot:api');

const app = express();
tmp.setGracefulCleanup();

app.disable('x-powered-by');
app.use(logger('dev', {
  skip: () => app.get('env') === 'test'
}));
// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: false }));

app.use(cors());
app.options('*', cors());

app.get('/', async (req, res) => {
  res.send({ status: 'OK' });
});

app.get('/proxy', function(req, res) {
  const { url } = req.query;
  const parsedUrl = new urlParse(url);
  if (parsedUrl.hostname.endsWith('archive.org')) {
    req.pipe(rrequest(url), {end: true}).pipe(res, {end: true});
  } else {
    res
      .status(418)
      .send({ error: [{ message: 'I\'m a teapot' }] });
  }
});

// Catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// Error handler
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  res
    .status(err.status || 500)
    .send({ error: [{ message: err.message }] });
});

export default app;
