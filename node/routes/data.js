var express = require('express');
var router = express.Router();
var underscore = require("underscore");	

var valid_kill_fields = ['id', 'timestamp', 'killer_class', 'killer_weapon', 'killer_x', 'killer_y', 'killer_z', 'victim_class', 'victim_x', 'victim_y', 'victim_z', 'customkill', 'damagebits', 'death_flags', 'team'];
var class_mapping = {
	unknown: 	0,
	scout: 		1,
	sniper: 	2,
	soldier: 	3,
	demoman: 	4,
	medic:		5,
	heavy: 		6,
	pyro: 		7,
	spy: 		8,
	engineer: 	9
};

var classStringToIndexArray = function(classes){
	classes = classes.toLowerCase().split(',');
	classes = underscore.map(classes, function(val){
		return class_mapping[val];
	});
	classes = underscore.filter(classes, underscore.isNumber);
	
	return classes;
};

var teams = {
	teamless: 0,
	spectator:1,
	red: 2,
	blu: 3
}

router.get('/', function(req, res) {
	res.render('api_doc', { title: 'API Documentation' });
});

router.get('/maps.json', function(req, res) {
	// Respond with a list of maps
	global.mysqlConnection.query('SELECT name, kill_count FROM maps WHERE overview_state = 2 ORDER BY kill_count DESC', function(err, results) {
		if(err) throw err;
		res.json(results);
	});
});

router.get('/kills/', function(req, res){
	res.redirect('/data/');
})

router.get('/kills/:map.json', function(req, res) {
	
	global.mysqlConnection.query('SELECT `maps`.`name`, `maps`.`offset_x`, `maps`.`offset_y`, `maps`.`scale`, `maps`.`kill_count` FROM maps WHERE name = ? AND overview_state = 2 LIMIT 1', [req.param('map')], function(err, results) {
		if(results.length == 0) return res.status(404).json({error: 404, description: 'map not found'});
		var mapData = results[0];
		
		// Fields to return
		var fields = [];
		if(typeof(req.param('fields')) != 'undefined')
		{
			var fields_temp = String(req.param('fields', '')).replace(/\s+/g, '').split(',');
			fields = underscore.intersection(fields_temp, valid_kill_fields);
		}
		
		if(fields.length == 0) fields = ['victim_x', 'victim_y', 'team'];
		fields = underscore.unique(fields);	
		
		// Result count to return
		var limit = "";
		if(typeof(req.param('limit')) != 'undefined')
		{
			var limit_num = Math.floor(parseInt(req.param('limit')));
			if(!isNaN(limit_num))
				limit = "LIMIT " + limit_num;
			if(typeof(req.param('offset')) != 'undefined')
			{
				var offset_num = Math.floor(parseInt(req.param('offset')));
				if(!isNaN(offset_num))
					limit += " OFFSET " + offset_num;
			}
		}
		
		//WHERE components
		var where = "";
		
		// VICTIM CLASS
		if(typeof(req.param('victim_class')) != 'undefined') {
			var classes = classStringToIndexArray(req.param('victim_class'));
			if(classes.length > 0)
				where += " AND victim_class IN (" + classes.join(',') + ") ";
		}
		
		// KILLER CLASS
		if(typeof(req.param('killer_class')) != 'undefined') {
			var classes = classStringToIndexArray(req.param('killer_class'));
			if(classes.length > 0)
				where += " AND killer_class IN (" + classes.join(',') + ") ";
		}
		
		// KILLER TEAM
		if(typeof(req.param('killer_team')) != 'undefined') { 
			var team = teams[req.param('killer_team').toLowerCase()];
			if(underscore.isNumber(team))
				where += " AND team = " + team + " ";
		}
		
		// KILLER TEAM
		if(typeof(req.param('killer_team')) != 'undefined') {
			var team = teams[req.param('killer_team').toLowerCase()];
			if(underscore.isNumber(team))
				where += " AND team = " + team + " ";
		}
		
		// MINIMUM DISTANCE
		if(typeof(req.param('mindist')) != 'undefined') {
			var mindist_num = parseInt(req.param('mindist'));
			if(!isNaN(mindist_num))
				where += " AND distance > " + mindist_num + " ";
		}
		
		// MAXIMUM DISTANCE
		if(typeof(req.param('maxdist')) != 'undefined') {
			var maxdist_num = parseInt(req.param('maxdist'));
			if(!isNaN(maxdist_num))
				where += " AND distance < " + maxdist_num + " ";
		}
		
		if(typeof(req.param('maxdist')) != 'undefined' || typeof(req.param('mindist')) != 'undefined') {
			where += " AND team != 0 ";
		}
		
		
		// PERFORM QUERY
		var query = 'SELECT ?? FROM kills WHERE map_id = (SELECT id FROM maps WHERE name = ? ) ' 
			+ where + 
			' ORDER BY id DESC ' + limit;
		query = global.mysqlConnection.format(query, [fields, req.param('map')]);
		console.log(query);
		
		var options = {
			sql: query, 
			rowsAsArray: true
		};
		
		global.mysqlConnection.query(options, function(err, results) {
			if (err) throw err;
			var response = { map_data: mapData, fields: fields, kills: results};
			res.json(response);
			//res.json(1);
		});
	});
});	

module.exports = router;
