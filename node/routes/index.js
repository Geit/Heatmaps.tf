var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/home.html', function(req, res) {
  res.sendfile('views/home.html');
});
router.get('*', function(req, res) {
  res.sendfile('views/index.html');
});

module.exports = router;
