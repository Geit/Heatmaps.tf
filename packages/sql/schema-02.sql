-- --------------------------------------------------------
-- Host:                         lamia.geit.co.uk
-- Server version:               10.0.14-MariaDB-log - MariaDB Server
-- Server OS:                    Linux
-- HeidiSQL Version:             9.1.0.4867
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8mb4 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;

-- Dumping structure for table heatmaps.kills
CREATE TABLE IF NOT EXISTS `kills` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `map_id` int(10) unsigned DEFAULT NULL,
  `timestamp` int(10) unsigned DEFAULT NULL,
  `killer_class` tinyint(3) unsigned DEFAULT NULL,
  `killer_weapon` smallint(5) DEFAULT NULL,
  `killer_x` float DEFAULT NULL,
  `killer_y` float DEFAULT NULL,
  `killer_z` float DEFAULT NULL,
  `victim_class` tinyint(3) unsigned DEFAULT NULL,
  `victim_x` float DEFAULT NULL,
  `victim_y` float DEFAULT NULL,
  `victim_z` float DEFAULT NULL,
  `customkill` int(10) unsigned DEFAULT NULL,
  `damagebits` int(10) unsigned DEFAULT NULL,
  `death_flags` int(10) unsigned DEFAULT NULL,
  `team` tinyint(3) unsigned DEFAULT NULL,
  `distance_squared` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `map_id` (`map_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Data exporting was unselected.


-- Dumping structure for table heatmaps.maps
CREATE TABLE IF NOT EXISTS `maps` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(128) NOT NULL,
  `game` varchar(43) NOT NULL,
  `last_seen` int(11) NOT NULL,
  `overview_state` tinyint(3) NOT NULL DEFAULT '0',
  `offset_x` float DEFAULT NULL,
  `offset_y` float DEFAULT NULL,
  `scale` float DEFAULT NULL,
  `kill_count` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `overview_state` (`overview_state`),
  KEY `kill_count` (`kill_count`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Data exporting was unselected.


-- Dumping structure for trigger heatmaps.kills_before_insert
SET @OLDTMP_SQL_MODE=@@SQL_MODE, SQL_MODE='';
DELIMITER //
CREATE TRIGGER `kills_before_insert` BEFORE INSERT ON `kills` FOR EACH ROW BEGIN
	SET NEW.distance_squared = POW(NEW.killer_x-NEW.victim_x, 2) + POW(NEW.killer_y-NEW.victim_y, 2) + POW(NEW.killer_z-NEW.victim_z, 2);
	UPDATE maps SET kill_count=kill_count+1 WHERE id=NEW.map_id;
END//
DELIMITER ;
SET SQL_MODE=@OLDTMP_SQL_MODE;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IF(@OLD_FOREIGN_KEY_CHECKS IS NULL, 1, @OLD_FOREIGN_KEY_CHECKS) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
