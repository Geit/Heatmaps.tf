var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var mysql      = require('mysql2');
var compression = require('compression');

var data = require('./routes/data');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());


app.use('/data', data);

var db_config = {
  host     : 'geit.co.uk',
  user     : 'heatmaps-read',
  password : '',
  database : 'heatmaps'
};

var connectToDB = function(){
	global.mysqlConnection = mysql.createConnection(db_config)
	global.mysqlConnection.connect();

	global.mysqlConnection.on('error', function(err) {
		if(err.code == 'PROTOCOL_CONNECTION_LOST')
			connectToDB();
		else
			throw err;
	});
};

connectToDB();


/// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

/// error handlers

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.send(404);
});


module.exports = app;
