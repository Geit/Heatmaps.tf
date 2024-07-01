const heatmaps = angular.module('heatmaps', ['ngRoute', 'ngAnimate', 'ui.bootstrap']);

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 1024;

heatmaps.run(function ($rootScope) {
  $rootScope.version = '1.07';
});

heatmaps.config([
  '$routeProvider',
  '$locationProvider',
  function ($routeProvider, $locationProvider) {
    $locationProvider.html5Mode(true);
    $routeProvider.when('/', {}).when('/:map', {}).otherwise({
      redirectTo: '/',
    });
  },
]);

heatmaps.controller('HeatmapsGlobal', [
  '$scope',
  '$http',
  '$routeParams',
  '$location',
  '$filter',
  '$modal',
  function ($scope, $http, $routeParams, $location, $filter, $modal) {
    /* 
		Scope Contents:
			activeMap : Integer with the currently active map index
			maps      : A list of all public mapsService
			mapsToList: Integer with the number of maps that can safely be displayed without overlap
			mapData     : Contains additional data, such as the offsets and kill data
	*/
    $scope.activeMap = -1;
    $scope.mapsToList = 5;
    $scope.mapToStartAt = 0;
    $scope.pageTitle = 'Home';
    $scope.copyButton = new ZeroClipboard($('#copy-button')[0]);

    $scope.Math = window.Math;
    // Heatmap Scoped variables
    $scope.currentFilters = {};
    $scope.loadingVisible = true;
    $scope.displayMode = 'killers';
    $scope.userSuppressDataLayer = false;
    // Constants
    var MIN_ZOOM = 1.0;
    var MAX_ZOOM = 10.0;
    // Heatmap variables
    var heatmapData = {};
    heatmapData.zoom = {
      scaleFactor: MIN_ZOOM,
      originX: 0,
      originY: 0,
    };
    heatmapData.isMapLoaded = false;
    heatmapData.isDataLayerDirty = true;
    heatmapData.suppressDataLayer = false;
    var heatmapWebGLCanvas = $('#webgl-canvas')[0];
    var heatmapBackgroundCanvas = $('#overview-canvas')[0];
    var heatmap;
    var backgroundImage = new Image();
    var backgroundImgLoaded = false;

    var requestAnimationFrameShim =
      window.requestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.msRequestAnimationFrame;

    var is_chrome =
      navigator.userAgent.toLowerCase().indexOf('chrome') > -1 &&
      navigator.userAgent.toLowerCase().indexOf('mobile') == -1;
    if (is_chrome) heatmapData.maxKillsPerFrame = 100000;
    else heatmapData.maxKillsPerFrame = 5000;

    $scope.currentFilters.limit = 5000;

    $('#intensity-slider').noUiSlider({
      start: [130],
      range: {
        min: [10],
        '50%': [100],
        max: [1000],
      },
    });

    $('#radius-slider').noUiSlider({
      start: [12],
      range: {
        min: [1],
        '50%': [20],
        '75%': [40],
        max: [100],
      },
    });

    //Location parser
    var pageParams = $location.search();
    if (
      typeof pageParams.radius != 'undefined' &&
      typeof pageParams.intensity != 'undefined' &&
      typeof pageParams.filters != 'undefined'
    ) {
      pageParams.radius = parseFloat(pageParams.radius);
      pageParams.intensity = parseFloat(pageParams.intensity);
      if (!isNaN(pageParams.radius) && !isNaN(pageParams.intensity)) {
        try {
          $('#radius-slider').val(pageParams.radius);
          $('#intensity-slider').val(pageParams.intensity);
          $scope.currentFilters = JSON.parse(pageParams.filters);
          heatmapData.zoom = JSON.parse(pageParams.zoomSettings);
        } catch (e) {}
        $location.search('').replace();
      }
    }
    $http({ method: 'GET', url: '/data/maps.json', cache: true })
      .success(function (maps) {
        for (var i = 0; i < maps.length; i++) {
          maps[i].index = i;
          if (maps[i].name == $routeParams.map) {
            maps[i].isActive = true;
            $scope.activeMap = i;
          }
        }
        $scope.maps = maps;
        if (typeof $routeParams.map == 'undefined') $scope.updateMapList(0);
        else $scope.fetchKillData($routeParams.map);
      })
      .error(function (data, status, headers, config) {
        $scope.openErrorModal('ErrNetwork', 'API responded with status ' + status);
      });

    var recalculateMapListSize = function (scope) {
      if ($(window).width() < 1200) scope.mapsToList = 5;
      else
        scope.mapsToList =
          Math.floor(($('#map-list').innerHeight() - $('#map-list .header').height() - $('#footer').height()) / 70) - 1;
    };

    $scope.updateMapList = function (newMapIndex) {
      if ($scope.activeMap >= 0) $scope.maps[$scope.activeMap].isActive = false;
      $scope.maps[newMapIndex].isActive = true;
      $scope.activeMap = newMapIndex;

      $scope.fetchKillData($scope.maps[newMapIndex].name);
      heatmapData.zoom = { scaleFactor: MIN_ZOOM, originX: 0, originY: 0 };
      $scope.loadingVisible = true;
    };

    $scope.fetchKillData = function (mapName) {
      recalculateMapListSize($scope);
      backgroundImage.src = '/images/maps/' + mapName + '.jpg';
      backgroundImgLoaded = false;
      backgroundImage.onload = () => {
        backgroundImgLoaded = true;
      };
      $scope.loadingVisible = true;
      var url = buildUrl(mapName);

      $http({ method: 'GET', url: url, cache: true })
        .success(function (res) {
          $scope.mapData = res;
          $scope.pageTitle = $scope.mapData.map_data.name;
          heatmapData.isMapLoaded = true;
          heatmapData.isDataLayerDirty = true;
          updateCopyButton();
        })
        .error(function (data, status, headers, config) {
          $scope.openErrorModal('ErrNetwork', 'API responded with status ' + status);
        });
    };

    var buildUrl = function (mapName) {
      var url = '/data/kills/' + mapName + '.json?client=heatmaps-web';

      if ($scope.displayMode == 'killers') url += '&fields=killer_x,killer_y,team';
      else url += '&fields=victim_x,victim_y,team';

      var keys = Object.keys($scope.currentFilters);

      for (var i = 0; i < keys.length; i++) {
        var data = $scope.currentFilters[keys[i]];
        switch (keys[i]) {
          case 'victim_class':
            url += '&victim_class=' + data.join(',');
            break;
          case 'killer_class':
            url += '&killer_class=' + data.join(',');
            break;
          case 'killer_team':
            url += '&killer_team=' + data;
            break;
          case 'limit':
            url += '&limit=' + data;
            break;
          case 'mindist':
            url += '&mindist=' + data;
            break;
          case 'maxdist':
            url += '&maxdist=' + data;
            break;
        }
      }

      return url;
    };

    var setupCanvases = function () {
      heatmapBackgroundCanvas.width = CANVAS_WIDTH;
      heatmapBackgroundCanvas.height = CANVAS_HEIGHT;
      heatmapWebGLCanvas.width = CANVAS_WIDTH;
      heatmapWebGLCanvas.height = CANVAS_HEIGHT;
      var ctx = heatmapBackgroundCanvas.getContext('2d');

      try {
        heatmap = createWebGLHeatmap({ canvas: heatmapWebGLCanvas, intensityToAlpha: true, alphaRange: [0.0, 0.05] });
      } catch (e) {
        $scope.openErrorModal('ErrWebGL', e.message);
      }
      if (typeof heatmap.clear == 'undefined')
        $scope.openErrorModal('ErrWebGL', 'Unknown Error: Data layer creation failed');
    };

    $scope.openErrorModal = function (type, reason) {
      $modal.open({
        templateUrl: 'templates/errorModal.html',
        size: 'lg',
        controller: 'errorModalController',
        resolve: {
          reason: function () {
            return reason;
          },
          type: function () {
            return type;
          },
        },
      });
    };

    $scope.openProviderModal = function (providerName) {
      $modal.open({
        templateUrl: 'templates/providerModal.html',
        size: 'lg',
        controller: 'providerModalController',
        resolve: {
          providerName: function () {
            return providerName;
          },
        },
      });
    };

    $scope.openFiltersModal = function () {
      var filterModal = $modal.open({
        templateUrl: 'templates/filterModalMain.html',
        controller: 'filterModalController',
        size: 'lg',
        resolve: {
          currentFilters: function () {
            return $scope.currentFilters;
          },
        },
      });

      filterModal.result.then(function (result) {
        $scope.currentFilters[result.type] = result.data;
        $scope.fetchKillData($scope.mapData.map_data.name);
      });
    };

    $scope.openAboutModal = function () {
      $modal.open({ templateUrl: 'templates/aboutModal.html', size: 'lg' });
    };

    $scope.stringifyFilter = function (filterName, filterData) {
      switch (filterName) {
        case 'victim_class':
          return 'Victim Class: ' + filterData.join(', ');
        case 'killer_class':
          return 'Killer Class: ' + filterData.join(', ');
        case 'killer_team':
          return 'Killer Team: ' + filterData.toUpperCase();
        case 'limit':
          return 'Result Limit: ' + filterData;
        case 'mindist':
          return 'Minimum Distance: ' + filterData;
        case 'maxdist':
          return 'Maximum Distance: ' + filterData;
        default:
          return 'Unknown Filter Type';
      }
    };

    $scope.removeFilter = function (filterName) {
      delete $scope.currentFilters[filterName];
      $scope.fetchKillData($scope.mapData.map_data.name);
    };

    $scope.mapListCountFilter = function (value) {
      return value.kill_count > 0;
    };

    var updateCopyButton = function () {
      $scope.copyButton.setData(
        'text/plain',
        'https://heatmaps.tf/' +
          $scope.mapData.map_data.name +
          '?radius=' +
          $('#radius-slider').val() +
          '&intensity=' +
          $('#intensity-slider').val() +
          '&filters=' +
          encodeURIComponent(JSON.stringify($scope.currentFilters)) +
          '&zoomSettings=' +
          encodeURIComponent(JSON.stringify(heatmapData.zoom))
      );
    };

    var dataToDraw = [],
      pointsDrawn = 0;

    var getDataInBounds = function () {
      const multiplier = heatmapBackgroundCanvas.width / CANVAS_WIDTH;
      const scale = $scope.mapData.map_data.scale / multiplier;

      var minPoint = -$scope.mapData.map_data.radius,
        maxPointY = CANVAS_HEIGHT + $scope.mapData.map_data.radius,
        maxPointX = CANVAS_WIDTH + $scope.mapData.map_data.radius;

      for (var i = 0; i < $scope.mapData.kills.length; i++) {
        if ($scope.mapData.kills[i][2] == 0 && $scope.displayMode == 'killers') continue;
        var x = ($scope.mapData.kills[i][0] - $scope.mapData.map_data.offset_x) / scale;
        var y = -(($scope.mapData.kills[i][1] - $scope.mapData.map_data.offset_y) / scale);

        x = (x - heatmapData.zoom.originX) * heatmapData.zoom.scaleFactor;
        y = (y - heatmapData.zoom.originY) * heatmapData.zoom.scaleFactor;

        if (x < minPoint || y < minPoint || y > maxPointY || x > maxPointX) continue;

        dataToDraw.push([x, y]);
      }
    };

    var redrawDataLayer = function () {
      if (heatmapData.isDataLayerDirty && typeof heatmap !== 'undefined') {
        pointsDrawn = 0;
        dataToDraw = [];

        heatmap.clear();
        heatmap.update();
        heatmap.display();

        getDataInBounds();
        if (dataToDraw.length == 0) {
          $scope.$apply(function (scope) {
            scope.loadingVisible = false;
          });
        }
        heatmapData.isDataLayerDirty = false;
      }
      if (pointsDrawn != dataToDraw.length) {
        $scope.mapData.map_data.radius =
          Math.round($('#radius-slider').val() * heatmapData.zoom.scaleFactor * 100) / 100;
        $scope.mapData.map_data.intensity = $('#intensity-slider').val() / 1000;

        var pointsToDrawInFrame = Math.min(dataToDraw.length, heatmapData.maxKillsPerFrame + pointsDrawn);

        for (; pointsDrawn < pointsToDrawInFrame; pointsDrawn++) {
          heatmap.addPoint(
            dataToDraw[pointsDrawn][0],
            dataToDraw[pointsDrawn][1],
            $scope.mapData.map_data.radius,
            $scope.mapData.map_data.intensity
          );
        }
        if (pointsDrawn == dataToDraw.length) {
          $scope.$apply(function (scope) {
            scope.loadingVisible = false;
          });
        }
        heatmap.update();
        heatmap.display();
      }
    };

    var redrawBackground = function () {
      if (!heatmapData.isMapLoaded) return requestAnimationFrameShim(redrawBackground);
      var ctx = heatmapBackgroundCanvas.getContext('2d');

      redrawDataLayer();

      ctx.clearRect(0, 0, heatmapBackgroundCanvas.width, heatmapBackgroundCanvas.height);
      if (backgroundImgLoaded)
        ctx.drawImage(
          backgroundImage,
          heatmapData.zoom.originX,
          heatmapData.zoom.originY,
          backgroundImage.width / heatmapData.zoom.scaleFactor,
          backgroundImage.height / heatmapData.zoom.scaleFactor,
          0,
          0,
          heatmapBackgroundCanvas.width,
          heatmapBackgroundCanvas.height
        );

      if(!heatmapData.suppressDataLayer && !$scope.userSuppressDataLayer) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(
        heatmapWebGLCanvas,
        0,
        0,
        heatmapWebGLCanvas.width,
        heatmapWebGLCanvas.height,
        0,
        0,
        heatmapBackgroundCanvas.width,
        heatmapBackgroundCanvas.height
      );
      ctx.globalAlpha = 1.0;
      }
      requestAnimationFrameShim(redrawBackground);
    };
    requestAnimationFrameShim(redrawBackground);

    // JQuery Stuff
    $('#overview-canvas').on('wheel', function (e) {
      if (e.originalEvent.deltaY == 0) return;
      var wheel = e.originalEvent.deltaY < 0 ? 0.3 : -0.3;
      var zoom = Math.pow(1 + Math.abs(wheel) / 2, wheel > 0 ? 1 : -1);

      var spacerOffset = $(this).offset();

      var pageResizeFactor = CANVAS_WIDTH / $('#overview-canvas').width();

      var clientX = (e.originalEvent.clientX - spacerOffset.left) * pageResizeFactor,
        clientY = (e.originalEvent.clientY - spacerOffset.top) * pageResizeFactor;

      var newScaleFactor = heatmapData.zoom.scaleFactor * zoom;

      newScaleFactor = Math.max(Math.min(newScaleFactor, MAX_ZOOM), MIN_ZOOM);

      var ctx = heatmapBackgroundCanvas.getContext('2d');

      heatmapData.zoom.originX =
        clientX / heatmapData.zoom.scaleFactor + heatmapData.zoom.originX - clientX / newScaleFactor;
      heatmapData.zoom.originY =
        clientY / heatmapData.zoom.scaleFactor + heatmapData.zoom.originY - clientY / newScaleFactor;
      heatmapData.zoom.originX = Math.max(
        Math.min(heatmapData.zoom.originX, CANVAS_WIDTH - CANVAS_WIDTH / heatmapData.zoom.scaleFactor),
        0
      );
      heatmapData.zoom.originY = Math.max(
        Math.min(heatmapData.zoom.originY, CANVAS_HEIGHT - CANVAS_HEIGHT / heatmapData.zoom.scaleFactor),
        0
      );

      if (heatmapData.zoom.scaleFactor != newScaleFactor) {
        heatmapData.suppressDataLayer = true;
        if (mouseMoveTimeout !== false) clearTimeout(mouseMoveTimeout);
        mouseMoveTimeout = setTimeout(completeDrag, 100);

        heatmapData.isDataLayerDirty = true;
        if (newScaleFactor == 1) {
          heatmapData.zoom.originX = 0;
          heatmapData.zoom.originY = 0;
        }
      }
      heatmapData.zoom.scaleFactor = newScaleFactor;
      if (heatmapData.zoom.scaleFactor > 1) $(this).css('cursor', 'all-scroll');
      else $(this).css('cursor', 'zoom-in');

      return e.preventDefault();
    });
    var mouseMoveTimeout = false;
    $('#overview-canvas').on('mousemove', function (e) {
      if (leftButtonDown === true) {
        var xDiff = $scope.lastX - e.pageX,
          yDiff = $scope.lastY - e.pageY;
        var pageResizeFactor = CANVAS_WIDTH / $('#overview-canvas').width();
        var originalX = heatmapData.zoom.originX,
          originalY = heatmapData.zoom.originY;
        heatmapData.zoom.originX += (xDiff / heatmapData.zoom.scaleFactor) * pageResizeFactor;
        heatmapData.zoom.originY += (yDiff / heatmapData.zoom.scaleFactor) * pageResizeFactor;
        heatmapData.zoom.originX = Math.max(
          Math.min(heatmapData.zoom.originX, CANVAS_WIDTH - CANVAS_WIDTH / heatmapData.zoom.scaleFactor),
          0
        );
        heatmapData.zoom.originY = Math.max(
          Math.min(heatmapData.zoom.originY, CANVAS_HEIGHT - CANVAS_HEIGHT / heatmapData.zoom.scaleFactor),
          0
        );

        if (originalX != heatmapData.zoom.originX || originalY != heatmapData.zoom.originY) {
          heatmapData.suppressDataLayer = true;
          if (mouseMoveTimeout !== false) clearTimeout(mouseMoveTimeout);

          mouseMoveTimeout = setTimeout(completeDrag, 100);
          heatmapData.isDataLayerDirty = true;
        }
      }
      $scope.lastX = e.pageX;
      $scope.lastY = e.pageY;
    });

    var leftButtonDown = false;
    $(document).mousedown(function (e) {
      if (e.which === 1) leftButtonDown = true;
    });

    $(document).mouseup(function (e) {
      if (e.which === 1) leftButtonDown = false;
    });

    function completeDrag() {
      heatmapData.suppressDataLayer = false;
      updateCopyButton();
    }

    $('.slider').on('slide', function () {
      heatmapData.isDataLayerDirty = true;
      updateCopyButton();
    });

    $(window).resize(function () {
      $scope.$apply(recalculateMapListSize);
    });

    setupCanvases();
  },
]);

heatmaps.controller('filterModalController', [
  '$scope',
  '$http',
  '$modalInstance',
  '$modal',
  'currentFilters',
  function ($scope, $http, $modalInstance, $modal, currentFilters) {
    $scope.currentFilters = currentFilters;
    $scope.currentStage = 'main';
    $scope.currentStageTitle = 'Filter Types';

    $scope.setStage = function (stageId, stageTitle) {
      $scope.currentStage = stageId;
      $scope.currentStageTitle = stageTitle;
    };

    $scope.filters = {
      victim_class: {
        Scout: false,
        Soldier: false,
        Pyro: false,
        Demoman: false,
        Heavy: false,
        Engineer: false,
        Medic: false,
        Sniper: false,
        Spy: false,
      },
      killer_class: {
        Scout: false,
        Soldier: false,
        Pyro: false,
        Demoman: false,
        Heavy: false,
        Engineer: false,
        Medic: false,
        Sniper: false,
        Spy: false,
      },

      killer_team: 'red',
      limit: 3000,
      mindist: 250,
      maxdist: 500,
    };

    $scope.classObjectToArray = function (data) {
      var classes = [],
        keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) if (data[keys[i]]) classes.push(keys[i]);
      return classes;
    };

    $scope.addFilter = function (filterType, data) {
      $modalInstance.close({
        type: filterType,
        data: data,
      });
    };
  },
]);

heatmaps.controller('errorModalController', [
  '$scope',
  '$modalInstance',
  '$modal',
  'reason',
  'type',
  function ($scope, $modalInstance, $modal, reason, type) {
    $scope.reason = reason;
    // ErrNetwork, ErrWebGL
    $scope.type = type;
  },
]);

heatmaps.controller('providerModalController', [
  '$scope',
  '$modalInstance',
  '$modal',
  'providerName',
  function ($scope, $modalInstance, $modal, providerName) {
    $scope.providerName = providerName;
  },
]);

heatmaps.filter('startAt', function () {
  return function (arr, start) {
    if (typeof arr == 'undefined') return;
    return arr.slice(start, arr.length);
  };
});

heatmaps.filter('capitalize', function () {
  return function (input, scope) {
    if (typeof input == 'undefined') return;
    return input.charAt(0).toUpperCase() + input.slice(1);
  };
});

heatmaps.filter('keys', function () {
  return function (input) {
    if (!input) {
      return [];
    }
    return Object.keys(input);
  };
});
