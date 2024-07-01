var heatmaps = angular.module('heatmaps', ['ngRoute', 'ngAnimate', 'ui.bootstrap']);

heatmaps.run(function($rootScope) {
    $rootScope.version = '1.07';
});

heatmaps.config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
	$locationProvider
	.html5Mode(true);
    $routeProvider.
		when('/', {
		}).
		when('/:map', {
		}).
		otherwise({
			redirectTo: '/'
		});
  }]);

heatmaps.controller('HeatmapsGlobal', 
	['$scope', '$http', '$routeParams', '$location', '$filter', '$modal', 
	function($scope, $http, $routeParams, $location, $filter, $modal) {
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
	$scope.pageTitle = "Home";
	$scope.copyButton = new ZeroClipboard( $('#copy-button')[0] );
	
	
	
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
		originY: 0
	};
	heatmapData.isMapLoaded = false;
	heatmapData.isDataLayerDirty = true;
	heatmapData.suppressDataLayer = false;
	var heatmapWebGLCanvas = $('#webgl-canvas')[0];
	var heatmapBackgroundCanvas = $('#overview-canvas')[0];
	var heatmap;
	var backgroundImage = new Image();
	var backgroundImgLoaded = false;
	
	var requestAnimationFrameShim = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;
	
	var is_chrome = (navigator.userAgent.toLowerCase().indexOf('chrome') > -1 && navigator.userAgent.toLowerCase().indexOf('mobile') == -1);
	if(is_chrome) 
		heatmapData.maxKillsPerFrame = 100000;
	else
		heatmapData.maxKillsPerFrame = 5000;
	
	$scope.currentFilters.limit =  5000;
	
	
	
	$('#intensity-slider').noUiSlider({
		start: [ 130 ],
		range: {
			'min': [  10 ],
			'50%': [  100 ],
			'max': [ 1000 ]
		}
	});
	
	$('#radius-slider').noUiSlider({
		start: [ 12 ],
		range: {
			'min': [  1 ],
			'50%': [  20 ],
			'75%': [  40 ],
			'max': [ 100 ]
		}
	});
	
	//Location parser
	var pageParams = $location.search();
	if(typeof(pageParams.radius) != "undefined" && typeof(pageParams.intensity) != "undefined"  && typeof(pageParams.filters) != "undefined") {
		pageParams.radius = parseFloat(pageParams.radius);
		pageParams.intensity = parseFloat(pageParams.intensity);
		if(!isNaN(pageParams.radius) && !isNaN(pageParams.intensity)) {
			try
			{
				$('#radius-slider').val(pageParams.radius);
				$('#intensity-slider').val(pageParams.intensity);
				$scope.currentFilters = JSON.parse(pageParams.filters);
				heatmapData.zoom = JSON.parse(pageParams.zoomSettings);
			}
			catch(e){}
			$location.search("").replace();
		}
	}
	$http({method: 'GET', url: '/data/maps.json', cache: true}).success(function(maps) {
		for(var i = 0; i < maps.length; i++) {
			maps[i].index = i;
			if(maps[i].name == $routeParams.map) {
				maps[i].isActive = true;
				$scope.activeMap = i;
			}
		}
		$scope.maps = maps;
		if(typeof($routeParams.map) == "undefined")
			$scope.updateMapList(0);
		else
			$scope.fetchKillData($routeParams.map);
	}).
    error(function(data, status, headers, config) {
		$scope.openErrorModal('ErrNetwork', 'API responded with status ' + status);
    });
	
	var recalculateMapListSize = function (scope){
		if($(window).width() < 1200)
			scope.mapsToList = 5;
		else
		scope.mapsToList = Math.floor(($('#map-list').innerHeight() - $('#map-list .header').height() - $('#footer').height()) / 70) - 1;
	};
	
	$scope.updateMapList = function(newMapIndex) {
		if($scope.activeMap >= 0)
			$scope.maps[$scope.activeMap].isActive = false;
		$scope.maps[newMapIndex].isActive = true;
		$scope.activeMap = newMapIndex;
		
		$scope.fetchKillData($scope.maps[newMapIndex].name);
		heatmapData.zoom = {scaleFactor: MIN_ZOOM,originX: 0,originY: 0};
		$scope.loadingVisible = true;
	}
	
	$scope.fetchKillData = function(mapName) {
		recalculateMapListSize($scope);
		backgroundImage.src = '/images/maps/' + mapName + '.jpg';
		backgroundImgLoaded = false;
		backgroundImage.onload = () => { backgroundImgLoaded = true };
		$scope.loadingVisible = true;
		var url = buildUrl(mapName);
		
		$http({method: 'GET', url: url, cache: true}).
		success(function(res) {
			$scope.mapData = res;
			$scope.pageTitle = $scope.mapData.map_data.name;
			heatmapData.isMapLoaded = true;
			heatmapData.isDataLayerDirty = true;
			updateCopyButton();
		}).
		error(function(data, status, headers, config) {
			$scope.openErrorModal('ErrNetwork', 'API responded with status ' + status);
		});
	}
	
	var buildUrl = function(mapName)
	{		
		var url = '/data/kills/' + mapName + '.json?client=heatmaps-web';
		
		if($scope.displayMode == 'killers')
			url += '&fields=killer_x,killer_y,team';
		else
			url += '&fields=victim_x,victim_y,team';
		
		var keys = Object.keys($scope.currentFilters);
		
		for(var i = 0; i < keys.length; i++) {
			var data = $scope.currentFilters[keys[i]];
			switch(keys[i])
			{
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
	}
	
	var setupCanvases = function() {
		heatmapBackgroundCanvas.width = 1280;
		heatmapBackgroundCanvas.height = 1024;
		heatmapWebGLCanvas.width = 1280;
		heatmapWebGLCanvas.height = 1024;
		var ctx = heatmapBackgroundCanvas.getContext('2d');
			
		try {
			heatmap = createWebGLHeatmap({canvas: heatmapWebGLCanvas, intensityToAlpha:true, alphaRange: [0.0, 0.05]});
		} catch(e) {
			$scope.openErrorModal('ErrWebGL', e.message);
		}
		if(typeof(heatmap.clear) == "undefined")
			$scope.openErrorModal('ErrWebGL', 'Unknown Error: Data layer creation failed');
	} 
	
	$scope.openErrorModal = function(type, reason){
		$modal.open({
			templateUrl: 'templates/errorModal.html',
			size: 'lg',
			controller: 'errorModalController',
			resolve: {
				reason : function() {
					return reason;
				},
				type : function() {
					return type;
				}
			}
		});
	};
	
	$scope.openProviderModal = function(providerName){
		$modal.open({
			templateUrl: 'templates/providerModal.html',
			size: 'lg',
			controller: 'providerModalController',
			resolve: {
				providerName : function() {
					return providerName;
				}
			}
		});
	}
	
	$scope.openFiltersModal = function(){
		var filterModal = $modal.open({
			templateUrl: 'templates/filterModalMain.html',
			controller: 'filterModalController',
			size: 'lg',
			resolve: {
				currentFilters: function () {
				  return $scope.currentFilters;
				}
			}
		});
		
		filterModal.result.then(function (result) {
			$scope.currentFilters[result.type] = result.data;
			$scope.fetchKillData($scope.mapData.map_data.name);
		});
	};
	
	$scope.openAboutModal = function(){
		$modal.open({templateUrl: 'templates/aboutModal.html', size:'lg'})
	};
	
	$scope.stringifyFilter = function(filterName, filterData) {		
		switch(filterName){
			case 'victim_class':
				return "Victim Class: " + filterData.join(', ');
			case 'killer_class':
				return "Killer Class: " + filterData.join(', ');
			case 'killer_team':
				return "Killer Team: " + filterData.toUpperCase();
			case 'limit':
				return "Result Limit: " + filterData;
			case 'mindist':
				return "Minimum Distance: " + filterData;
			case 'maxdist':
				return "Maximum Distance: " + filterData;
			default:
				return "Unknown Filter Type";
		}
	}
	
	$scope.removeFilter = function(filterName) {
		delete $scope.currentFilters[filterName];
		$scope.fetchKillData($scope.mapData.map_data.name);

	}
	
	$scope.mapListCountFilter = function(value){ return value.kill_count > 0};
	
	var updateCopyButton = function(){
		$scope.copyButton.setData("text/plain", 'http://heatmaps.tf/' + $scope.mapData.map_data.name + '?radius=' + $("#radius-slider").val() + '&intensity=' + $("#intensity-slider").val() + '&filters=' + encodeURIComponent(JSON.stringify($scope.currentFilters)) + '&zoomSettings=' + encodeURIComponent(JSON.stringify(heatmapData.zoom)));
	}
	
	var dataToDraw = [],
		pointsDrawn = 0,
		wasClean = true;
		
	var getDataInBounds = function(){
		var multiplier = heatmapBackgroundCanvas.width/1280;
		var scale = $scope.mapData.map_data.scale/multiplier;
		
		var minPoint = - $scope.mapData.map_data.radius,
			maxPointY = 1024 + $scope.mapData.map_data.radius,
			maxPointX = 1280 + $scope.mapData.map_data.radius;
		
		var ctx = heatmapBackgroundCanvas.getContext('2d');
		console.log(heatmapData);
		for(var i = 0; i < $scope.mapData.kills.length; i++)
		{
			if($scope.mapData.kills[i][2] == 0 && $scope.displayMode == 'killers') continue;
			var x = ($scope.mapData.kills[i][0] - $scope.mapData.map_data.offset_x) / scale;
			var y = -(($scope.mapData.kills[i][1] - $scope.mapData.map_data.offset_y) / scale);			
			
			x = (x - heatmapData.zoom.originX) * heatmapData.zoom.scaleFactor;
			y = (y - heatmapData.zoom.originY) * heatmapData.zoom.scaleFactor;
			
			if(x < minPoint || y < minPoint || y > maxPointY || x > maxPointX) continue;
			
			dataToDraw.push([x, y]);
		}
	}
	
	var redrawDataLayer = function(){
		if (heatmapData.isDataLayerDirty && typeof(heatmap) != "undefined") {
			pointsDrawn = 0;
			dataToDraw = [];
			
			heatmap.clear();
			heatmap.update();
			heatmap.display();	
			
			getDataInBounds();
			if(dataToDraw.length == 0) {
				$scope.$apply(function(scope){
					scope.loadingVisible = false;
				});
			}
			heatmapData.isDataLayerDirty = false;
		}
		if (pointsDrawn != dataToDraw.length) {
			$scope.mapData.map_data.radius = Math.round(($("#radius-slider").val() * heatmapData.zoom.scaleFactor) * 100 ) /  100;
			$scope.mapData.map_data.intensity = $("#intensity-slider").val()/1000;
			
			var ctx = heatmapBackgroundCanvas.getContext('2d');
			var pointsToDrawInFrame = Math.min(dataToDraw.length, heatmapData.maxKillsPerFrame + pointsDrawn);
			
			for(; pointsDrawn < pointsToDrawInFrame; pointsDrawn++)
			{
				heatmap.addPoint(dataToDraw[pointsDrawn][0], dataToDraw[pointsDrawn][1], $scope.mapData.map_data.radius, $scope.mapData.map_data.intensity);
			}
			if(pointsDrawn == dataToDraw.length){
				$scope.$apply(function(scope){
					scope.loadingVisible = false;
				});
			}
			heatmap.update();
			heatmap.display();	
		}
	}
	
	var redrawBackground = function (){
		if(!heatmapData.isMapLoaded) return requestAnimationFrameShim(redrawBackground);
		var ctx = heatmapBackgroundCanvas.getContext('2d');
		
		redrawDataLayer();
		
		ctx.clearRect(0, 0, heatmapBackgroundCanvas.width, heatmapBackgroundCanvas.height);		
		if(backgroundImgLoaded)
			ctx.drawImage(backgroundImage, heatmapData.zoom.originX, heatmapData.zoom.originY, backgroundImage.width/heatmapData.zoom.scaleFactor, backgroundImage.height/heatmapData.zoom.scaleFactor, 0, 0, heatmapBackgroundCanvas.width, heatmapBackgroundCanvas.height);			

		//if(!heatmapData.suppressDataLayer && !$scope.userSuppressDataLayer) {
			ctx.globalAlpha = 0.5;
			ctx.drawImage(heatmapWebGLCanvas, 0, 0, heatmapWebGLCanvas.width, heatmapWebGLCanvas.height, 0, 0, heatmapBackgroundCanvas.width, heatmapBackgroundCanvas.height);
			ctx.globalAlpha = 1.0;
		//}				
		requestAnimationFrameShim(redrawBackground);
	}
	requestAnimationFrameShim(redrawBackground);
	
	// JQuery Stuff
	$('#overview-canvas').on('wheel', function(e){
		if(e.originalEvent.deltaY == 0) return;
		var wheel = e.originalEvent.deltaY < 0 ? .3 : - .3;
		var zoom = Math.pow(1 + Math.abs(wheel)/2 , wheel > 0 ? 1 : -1);
		
		var spacerOffset = $(this).offset();
		
		var pageResizeFactor = 1280/$('#overview-canvas').width();
		
		var clientX = (e.originalEvent.clientX - spacerOffset.left) * pageResizeFactor,
			clientY = (e.originalEvent.clientY - spacerOffset.top) * pageResizeFactor;
			
		var newScaleFactor = heatmapData.zoom.scaleFactor * zoom;
		
		newScaleFactor = Math.max(Math.min(newScaleFactor, MAX_ZOOM), MIN_ZOOM);
		
		var ctx = heatmapBackgroundCanvas.getContext('2d');
		
		
		heatmapData.zoom.originX = ( clientX / heatmapData.zoom.scaleFactor + heatmapData.zoom.originX - clientX / newScaleFactor );
		heatmapData.zoom.originY = ( clientY / heatmapData.zoom.scaleFactor + heatmapData.zoom.originY - clientY / newScaleFactor );
		heatmapData.zoom.originX = Math.max(Math.min(heatmapData.zoom.originX, 1280 - (1280/heatmapData.zoom.scaleFactor)), 0);
		heatmapData.zoom.originY = Math.max(Math.min(heatmapData.zoom.originY, 1024 - (1024/heatmapData.zoom.scaleFactor)), 0);
		
		if(heatmapData.zoom.scaleFactor !=  newScaleFactor) {
			heatmapData.suppressDataLayer = true;
			if(mouseMoveTimeout !== false)
				clearTimeout(mouseMoveTimeout);
			mouseMoveTimeout = setTimeout(completeDrag, 100);
			
			heatmapData.isDataLayerDirty = true;
			if(newScaleFactor == 1) {
				heatmapData.zoom.originX = 0;
				heatmapData.zoom.originY = 0;
			}
		}
		heatmapData.zoom.scaleFactor =  newScaleFactor;
		if(heatmapData.zoom.scaleFactor > 1) $(this).css('cursor', 'all-scroll');
		else $(this).css('cursor', 'zoom-in');
		
		return e.preventDefault();
	});
	var mouseMoveTimeout  = false;
	$('#overview-canvas').on('mousemove', function(e){
		if(leftButtonDown === true) {
			
			var xDiff = $scope.lastX - e.pageX,
				yDiff = $scope.lastY - e.pageY;
			var pageResizeFactor = 1280/$('#overview-canvas').width();
			var originalX = heatmapData.zoom.originX,
				originalY = heatmapData.zoom.originY;
			heatmapData.zoom.originX += (xDiff / heatmapData.zoom.scaleFactor * pageResizeFactor);
			heatmapData.zoom.originY += (yDiff / heatmapData.zoom.scaleFactor * pageResizeFactor);
			heatmapData.zoom.originX = Math.max(Math.min(heatmapData.zoom.originX, 1280 - (1280/heatmapData.zoom.scaleFactor)), 0);
			heatmapData.zoom.originY = Math.max(Math.min(heatmapData.zoom.originY, 1024 - (1024/heatmapData.zoom.scaleFactor)), 0);
			
			if(originalX != heatmapData.zoom.originX || originalY != heatmapData.zoom.originY)
			{
				heatmapData.suppressDataLayer = true;
				if(mouseMoveTimeout !== false)
					clearTimeout(mouseMoveTimeout);
				
				mouseMoveTimeout = setTimeout(completeDrag, 100);
				heatmapData.isDataLayerDirty = true;
			}
		}
		$scope.lastX = e.pageX;
		$scope.lastY = e.pageY;
	});
	
	var leftButtonDown = false;
    $(document).mousedown(function(e){
        if(e.which === 1) leftButtonDown = true;
    });
	
    $(document).mouseup(function(e){
        if(e.which === 1) leftButtonDown = false;
    });
	
	function completeDrag() {
		heatmapData.suppressDataLayer = false;
		updateCopyButton();
	} 
	
	$('.slider').on('slide', function(){
		heatmapData.isDataLayerDirty = true;
		updateCopyButton(); 
	});
	
	$(window).resize(function(){		
		$scope.$apply(recalculateMapListSize);
	});
	
	setupCanvases();
}]);

heatmaps.controller('filterModalController', ['$scope', '$http', '$modalInstance', '$modal', 'currentFilters', function($scope, $http, $modalInstance, $modal, currentFilters) {
	$scope.currentFilters = currentFilters;
	$scope.currentStage = 'main';
	$scope.currentStageTitle = 'Filter Types';
	
	$scope.setStage = function (stageId, stageTitle)
	{
		$scope.currentStage = stageId;
		$scope.currentStageTitle =  stageTitle;
	}
	
	$scope.filters = {
		victim_class : {
			Scout: false,
			Soldier: false,
			Pyro: false,
			Demoman: false,
			Heavy: false,
			Engineer: false,
			Medic: false,
			Sniper: false,
			Spy: false
		},
		killer_class : {
			Scout: false,
			Soldier: false,
			Pyro: false,
			Demoman: false,
			Heavy: false,
			Engineer: false,
			Medic: false,
			Sniper: false,
			Spy: false
		},
		
		killer_team : 'red',
		limit: 3000,
		mindist: 250,
		maxdist: 500
	}
	
	$scope.classObjectToArray = function(data){
		var classes = [],
			keys = Object.keys(data);
		for(var i = 0; i < keys.length; i++)
			if(data[keys[i]]) classes.push(keys[i]);
		return classes;
	}
	
	$scope.addFilter = function( filterType, data ) {
		$modalInstance.close({
			type: filterType,
			data: data
		});
	}
	
}]);

heatmaps.controller('errorModalController', ['$scope', '$modalInstance', '$modal', 'reason', 'type', function($scope, $modalInstance, $modal, reason, type) {
	$scope.reason = reason;
	// ErrNetwork, ErrWebGL
	$scope.type = type;
}]);

heatmaps.controller('providerModalController', ['$scope', '$modalInstance', '$modal', 'providerName', function($scope, $modalInstance, $modal, providerName) {
	$scope.providerName = providerName;
}]);

heatmaps.filter('startAt', function() {
	return function(arr, start) {
		if(typeof(arr) == "undefined") return;
		return arr.slice(start, arr.length);
	};
});

heatmaps.filter('capitalize', function() {
	return function(input, scope) {
		if(typeof(input) == "undefined") return;
		return input.charAt(0).toUpperCase() + input.slice(1);
	};
});

heatmaps.filter('keys', function() {
	return function(input) {
		if (!input) {
			return [];
		}
		return Object.keys(input);
	}
});

/*!
* ZeroClipboard
* The ZeroClipboard library provides an easy way to copy text to the clipboard using an invisible Adobe Flash movie and a JavaScript interface.
* Copyright (c) 2014 Jon Rohan, James M. Greene
* Licensed MIT
* http://zeroclipboard.org/
* v2.1.6
*/
!function(a,b){"use strict";var c,d,e=a,f=e.document,g=e.navigator,h=e.setTimeout,i=e.encodeURIComponent,j=e.ActiveXObject,k=e.Error,l=e.Number.parseInt||e.parseInt,m=e.Number.parseFloat||e.parseFloat,n=e.Number.isNaN||e.isNaN,o=e.Math.round,p=e.Date.now,q=e.Object.keys,r=e.Object.defineProperty,s=e.Object.prototype.hasOwnProperty,t=e.Array.prototype.slice,u=function(){var a=function(a){return a};if("function"==typeof e.wrap&&"function"==typeof e.unwrap)try{var b=f.createElement("div"),c=e.unwrap(b);1===b.nodeType&&c&&1===c.nodeType&&(a=e.unwrap)}catch(d){}return a}(),v=function(a){return t.call(a,0)},w=function(){var a,c,d,e,f,g,h=v(arguments),i=h[0]||{};for(a=1,c=h.length;c>a;a++)if(null!=(d=h[a]))for(e in d)s.call(d,e)&&(f=i[e],g=d[e],i!==g&&g!==b&&(i[e]=g));return i},x=function(a){var b,c,d,e;if("object"!=typeof a||null==a)b=a;else if("number"==typeof a.length)for(b=[],c=0,d=a.length;d>c;c++)s.call(a,c)&&(b[c]=x(a[c]));else{b={};for(e in a)s.call(a,e)&&(b[e]=x(a[e]))}return b},y=function(a,b){for(var c={},d=0,e=b.length;e>d;d++)b[d]in a&&(c[b[d]]=a[b[d]]);return c},z=function(a,b){var c={};for(var d in a)-1===b.indexOf(d)&&(c[d]=a[d]);return c},A=function(a){if(a)for(var b in a)s.call(a,b)&&delete a[b];return a},B=function(a,b){if(a&&1===a.nodeType&&a.ownerDocument&&b&&(1===b.nodeType&&b.ownerDocument&&b.ownerDocument===a.ownerDocument||9===b.nodeType&&!b.ownerDocument&&b===a.ownerDocument))do{if(a===b)return!0;a=a.parentNode}while(a);return!1},C=function(a){var b;return"string"==typeof a&&a&&(b=a.split("#")[0].split("?")[0],b=a.slice(0,a.lastIndexOf("/")+1)),b},D=function(a){var b,c;return"string"==typeof a&&a&&(c=a.match(/^(?:|[^:@]*@|.+\)@(?=http[s]?|file)|.+?\s+(?: at |@)(?:[^:\(]+ )*[\(]?)((?:http[s]?|file):\/\/[\/]?.+?\/[^:\)]*?)(?::\d+)(?::\d+)?/),c&&c[1]?b=c[1]:(c=a.match(/\)@((?:http[s]?|file):\/\/[\/]?.+?\/[^:\)]*?)(?::\d+)(?::\d+)?/),c&&c[1]&&(b=c[1]))),b},E=function(){var a,b;try{throw new k}catch(c){b=c}return b&&(a=b.sourceURL||b.fileName||D(b.stack)),a},F=function(){var a,c,d;if(f.currentScript&&(a=f.currentScript.src))return a;if(c=f.getElementsByTagName("script"),1===c.length)return c[0].src||b;if("readyState"in c[0])for(d=c.length;d--;)if("interactive"===c[d].readyState&&(a=c[d].src))return a;return"loading"===f.readyState&&(a=c[c.length-1].src)?a:(a=E())?a:b},G=function(){var a,c,d,e=f.getElementsByTagName("script");for(a=e.length;a--;){if(!(d=e[a].src)){c=null;break}if(d=C(d),null==c)c=d;else if(c!==d){c=null;break}}return c||b},H=function(){var a=C(F())||G()||"";return a+"ZeroClipboard.swf"},I={bridge:null,version:"0.0.0",pluginType:"unknown",disabled:null,outdated:null,unavailable:null,deactivated:null,overdue:null,ready:null},J="11.0.0",K={},L={},M=null,N={ready:"Flash communication is established",error:{"flash-disabled":"Flash is disabled or not installed","flash-outdated":"Flash is too outdated to support ZeroClipboard","flash-unavailable":"Flash is unable to communicate bidirectionally with JavaScript","flash-deactivated":"Flash is too outdated for your browser and/or is configured as click-to-activate","flash-overdue":"Flash communication was established but NOT within the acceptable time limit"}},O={swfPath:H(),trustedDomains:a.location.host?[a.location.host]:[],cacheBust:!0,forceEnhancedClipboard:!1,flashLoadTimeout:3e4,autoActivate:!0,bubbleEvents:!0,containerId:"global-zeroclipboard-html-bridge",containerClass:"global-zeroclipboard-container",swfObjectId:"global-zeroclipboard-flash-bridge",hoverClass:"zeroclipboard-is-hover",activeClass:"zeroclipboard-is-active",forceHandCursor:!1,title:null,zIndex:999999999},P=function(a){if("object"==typeof a&&null!==a)for(var b in a)if(s.call(a,b))if(/^(?:forceHandCursor|title|zIndex|bubbleEvents)$/.test(b))O[b]=a[b];else if(null==I.bridge)if("containerId"===b||"swfObjectId"===b){if(!cb(a[b]))throw new Error("The specified `"+b+"` value is not valid as an HTML4 Element ID");O[b]=a[b]}else O[b]=a[b];{if("string"!=typeof a||!a)return x(O);if(s.call(O,a))return O[a]}},Q=function(){return{browser:y(g,["userAgent","platform","appName"]),flash:z(I,["bridge"]),zeroclipboard:{version:Fb.version,config:Fb.config()}}},R=function(){return!!(I.disabled||I.outdated||I.unavailable||I.deactivated)},S=function(a,b){var c,d,e,f={};if("string"==typeof a&&a)e=a.toLowerCase().split(/\s+/);else if("object"==typeof a&&a&&"undefined"==typeof b)for(c in a)s.call(a,c)&&"string"==typeof c&&c&&"function"==typeof a[c]&&Fb.on(c,a[c]);if(e&&e.length){for(c=0,d=e.length;d>c;c++)a=e[c].replace(/^on/,""),f[a]=!0,K[a]||(K[a]=[]),K[a].push(b);if(f.ready&&I.ready&&Fb.emit({type:"ready"}),f.error){var g=["disabled","outdated","unavailable","deactivated","overdue"];for(c=0,d=g.length;d>c;c++)if(I[g[c]]===!0){Fb.emit({type:"error",name:"flash-"+g[c]});break}}}return Fb},T=function(a,b){var c,d,e,f,g;if(0===arguments.length)f=q(K);else if("string"==typeof a&&a)f=a.split(/\s+/);else if("object"==typeof a&&a&&"undefined"==typeof b)for(c in a)s.call(a,c)&&"string"==typeof c&&c&&"function"==typeof a[c]&&Fb.off(c,a[c]);if(f&&f.length)for(c=0,d=f.length;d>c;c++)if(a=f[c].toLowerCase().replace(/^on/,""),g=K[a],g&&g.length)if(b)for(e=g.indexOf(b);-1!==e;)g.splice(e,1),e=g.indexOf(b,e);else g.length=0;return Fb},U=function(a){var b;return b="string"==typeof a&&a?x(K[a])||null:x(K)},V=function(a){var b,c,d;return a=db(a),a&&!jb(a)?"ready"===a.type&&I.overdue===!0?Fb.emit({type:"error",name:"flash-overdue"}):(b=w({},a),ib.call(this,b),"copy"===a.type&&(d=pb(L),c=d.data,M=d.formatMap),c):void 0},W=function(){if("boolean"!=typeof I.ready&&(I.ready=!1),!Fb.isFlashUnusable()&&null===I.bridge){var a=O.flashLoadTimeout;"number"==typeof a&&a>=0&&h(function(){"boolean"!=typeof I.deactivated&&(I.deactivated=!0),I.deactivated===!0&&Fb.emit({type:"error",name:"flash-deactivated"})},a),I.overdue=!1,nb()}},X=function(){Fb.clearData(),Fb.blur(),Fb.emit("destroy"),ob(),Fb.off()},Y=function(a,b){var c;if("object"==typeof a&&a&&"undefined"==typeof b)c=a,Fb.clearData();else{if("string"!=typeof a||!a)return;c={},c[a]=b}for(var d in c)"string"==typeof d&&d&&s.call(c,d)&&"string"==typeof c[d]&&c[d]&&(L[d]=c[d])},Z=function(a){"undefined"==typeof a?(A(L),M=null):"string"==typeof a&&s.call(L,a)&&delete L[a]},$=function(a){return"undefined"==typeof a?x(L):"string"==typeof a&&s.call(L,a)?L[a]:void 0},_=function(a){if(a&&1===a.nodeType){c&&(xb(c,O.activeClass),c!==a&&xb(c,O.hoverClass)),c=a,wb(a,O.hoverClass);var b=a.getAttribute("title")||O.title;if("string"==typeof b&&b){var d=mb(I.bridge);d&&d.setAttribute("title",b)}var e=O.forceHandCursor===!0||"pointer"===yb(a,"cursor");Cb(e),Bb()}},ab=function(){var a=mb(I.bridge);a&&(a.removeAttribute("title"),a.style.left="0px",a.style.top="-9999px",a.style.width="1px",a.style.top="1px"),c&&(xb(c,O.hoverClass),xb(c,O.activeClass),c=null)},bb=function(){return c||null},cb=function(a){return"string"==typeof a&&a&&/^[A-Za-z][A-Za-z0-9_:\-\.]*$/.test(a)},db=function(a){var b;if("string"==typeof a&&a?(b=a,a={}):"object"==typeof a&&a&&"string"==typeof a.type&&a.type&&(b=a.type),b){!a.target&&/^(copy|aftercopy|_click)$/.test(b.toLowerCase())&&(a.target=d),w(a,{type:b.toLowerCase(),target:a.target||c||null,relatedTarget:a.relatedTarget||null,currentTarget:I&&I.bridge||null,timeStamp:a.timeStamp||p()||null});var e=N[a.type];return"error"===a.type&&a.name&&e&&(e=e[a.name]),e&&(a.message=e),"ready"===a.type&&w(a,{target:null,version:I.version}),"error"===a.type&&(/^flash-(disabled|outdated|unavailable|deactivated|overdue)$/.test(a.name)&&w(a,{target:null,minimumVersion:J}),/^flash-(outdated|unavailable|deactivated|overdue)$/.test(a.name)&&w(a,{version:I.version})),"copy"===a.type&&(a.clipboardData={setData:Fb.setData,clearData:Fb.clearData}),"aftercopy"===a.type&&(a=qb(a,M)),a.target&&!a.relatedTarget&&(a.relatedTarget=eb(a.target)),a=fb(a)}},eb=function(a){var b=a&&a.getAttribute&&a.getAttribute("data-clipboard-target");return b?f.getElementById(b):null},fb=function(a){if(a&&/^_(?:click|mouse(?:over|out|down|up|move))$/.test(a.type)){var c=a.target,d="_mouseover"===a.type&&a.relatedTarget?a.relatedTarget:b,g="_mouseout"===a.type&&a.relatedTarget?a.relatedTarget:b,h=Ab(c),i=e.screenLeft||e.screenX||0,j=e.screenTop||e.screenY||0,k=f.body.scrollLeft+f.documentElement.scrollLeft,l=f.body.scrollTop+f.documentElement.scrollTop,m=h.left+("number"==typeof a._stageX?a._stageX:0),n=h.top+("number"==typeof a._stageY?a._stageY:0),o=m-k,p=n-l,q=i+o,r=j+p,s="number"==typeof a.movementX?a.movementX:0,t="number"==typeof a.movementY?a.movementY:0;delete a._stageX,delete a._stageY,w(a,{srcElement:c,fromElement:d,toElement:g,screenX:q,screenY:r,pageX:m,pageY:n,clientX:o,clientY:p,x:o,y:p,movementX:s,movementY:t,offsetX:0,offsetY:0,layerX:0,layerY:0})}return a},gb=function(a){var b=a&&"string"==typeof a.type&&a.type||"";return!/^(?:(?:before)?copy|destroy)$/.test(b)},hb=function(a,b,c,d){d?h(function(){a.apply(b,c)},0):a.apply(b,c)},ib=function(a){if("object"==typeof a&&a&&a.type){var b=gb(a),c=K["*"]||[],d=K[a.type]||[],f=c.concat(d);if(f&&f.length){var g,h,i,j,k,l=this;for(g=0,h=f.length;h>g;g++)i=f[g],j=l,"string"==typeof i&&"function"==typeof e[i]&&(i=e[i]),"object"==typeof i&&i&&"function"==typeof i.handleEvent&&(j=i,i=i.handleEvent),"function"==typeof i&&(k=w({},a),hb(i,j,[k],b))}return this}},jb=function(a){var b=a.target||c||null,e="swf"===a._source;delete a._source;var f=["flash-disabled","flash-outdated","flash-unavailable","flash-deactivated","flash-overdue"];switch(a.type){case"error":-1!==f.indexOf(a.name)&&w(I,{disabled:"flash-disabled"===a.name,outdated:"flash-outdated"===a.name,unavailable:"flash-unavailable"===a.name,deactivated:"flash-deactivated"===a.name,overdue:"flash-overdue"===a.name,ready:!1});break;case"ready":var g=I.deactivated===!0;w(I,{disabled:!1,outdated:!1,unavailable:!1,deactivated:!1,overdue:g,ready:!g});break;case"beforecopy":d=b;break;case"copy":var h,i,j=a.relatedTarget;!L["text/html"]&&!L["text/plain"]&&j&&(i=j.value||j.outerHTML||j.innerHTML)&&(h=j.value||j.textContent||j.innerText)?(a.clipboardData.clearData(),a.clipboardData.setData("text/plain",h),i!==h&&a.clipboardData.setData("text/html",i)):!L["text/plain"]&&a.target&&(h=a.target.getAttribute("data-clipboard-text"))&&(a.clipboardData.clearData(),a.clipboardData.setData("text/plain",h));break;case"aftercopy":Fb.clearData(),b&&b!==vb()&&b.focus&&b.focus();break;case"_mouseover":Fb.focus(b),O.bubbleEvents===!0&&e&&(b&&b!==a.relatedTarget&&!B(a.relatedTarget,b)&&kb(w({},a,{type:"mouseenter",bubbles:!1,cancelable:!1})),kb(w({},a,{type:"mouseover"})));break;case"_mouseout":Fb.blur(),O.bubbleEvents===!0&&e&&(b&&b!==a.relatedTarget&&!B(a.relatedTarget,b)&&kb(w({},a,{type:"mouseleave",bubbles:!1,cancelable:!1})),kb(w({},a,{type:"mouseout"})));break;case"_mousedown":wb(b,O.activeClass),O.bubbleEvents===!0&&e&&kb(w({},a,{type:a.type.slice(1)}));break;case"_mouseup":xb(b,O.activeClass),O.bubbleEvents===!0&&e&&kb(w({},a,{type:a.type.slice(1)}));break;case"_click":d=null,O.bubbleEvents===!0&&e&&kb(w({},a,{type:a.type.slice(1)}));break;case"_mousemove":O.bubbleEvents===!0&&e&&kb(w({},a,{type:a.type.slice(1)}))}return/^_(?:click|mouse(?:over|out|down|up|move))$/.test(a.type)?!0:void 0},kb=function(a){if(a&&"string"==typeof a.type&&a){var b,c=a.target||null,d=c&&c.ownerDocument||f,g={view:d.defaultView||e,canBubble:!0,cancelable:!0,detail:"click"===a.type?1:0,button:"number"==typeof a.which?a.which-1:"number"==typeof a.button?a.button:d.createEvent?0:1},h=w(g,a);c&&d.createEvent&&c.dispatchEvent&&(h=[h.type,h.canBubble,h.cancelable,h.view,h.detail,h.screenX,h.screenY,h.clientX,h.clientY,h.ctrlKey,h.altKey,h.shiftKey,h.metaKey,h.button,h.relatedTarget],b=d.createEvent("MouseEvents"),b.initMouseEvent&&(b.initMouseEvent.apply(b,h),b._source="js",c.dispatchEvent(b)))}},lb=function(){var a=f.createElement("div");return a.id=O.containerId,a.className=O.containerClass,a.style.position="absolute",a.style.left="0px",a.style.top="-9999px",a.style.width="1px",a.style.height="1px",a.style.zIndex=""+Db(O.zIndex),a},mb=function(a){for(var b=a&&a.parentNode;b&&"OBJECT"===b.nodeName&&b.parentNode;)b=b.parentNode;return b||null},nb=function(){var a,b=I.bridge,c=mb(b);if(!b){var d=ub(e.location.host,O),g="never"===d?"none":"all",h=sb(O),i=O.swfPath+rb(O.swfPath,O);c=lb();var j=f.createElement("div");c.appendChild(j),f.body.appendChild(c);var k=f.createElement("div"),l="activex"===I.pluginType;k.innerHTML='<object id="'+O.swfObjectId+'" name="'+O.swfObjectId+'" width="100%" height="100%" '+(l?'classid="clsid:d27cdb6e-ae6d-11cf-96b8-444553540000"':'type="application/x-shockwave-flash" data="'+i+'"')+">"+(l?'<param name="movie" value="'+i+'"/>':"")+'<param name="allowScriptAccess" value="'+d+'"/><param name="allowNetworking" value="'+g+'"/><param name="menu" value="false"/><param name="wmode" value="transparent"/><param name="flashvars" value="'+h+'"/></object>',b=k.firstChild,k=null,u(b).ZeroClipboard=Fb,c.replaceChild(b,j)}return b||(b=f[O.swfObjectId],b&&(a=b.length)&&(b=b[a-1]),!b&&c&&(b=c.firstChild)),I.bridge=b||null,b},ob=function(){var a=I.bridge;if(a){var b=mb(a);b&&("activex"===I.pluginType&&"readyState"in a?(a.style.display="none",function c(){if(4===a.readyState){for(var d in a)"function"==typeof a[d]&&(a[d]=null);a.parentNode&&a.parentNode.removeChild(a),b.parentNode&&b.parentNode.removeChild(b)}else h(c,10)}()):(a.parentNode&&a.parentNode.removeChild(a),b.parentNode&&b.parentNode.removeChild(b))),I.ready=null,I.bridge=null,I.deactivated=null}},pb=function(a){var b={},c={};if("object"==typeof a&&a){for(var d in a)if(d&&s.call(a,d)&&"string"==typeof a[d]&&a[d])switch(d.toLowerCase()){case"text/plain":case"text":case"air:text":case"flash:text":b.text=a[d],c.text=d;break;case"text/html":case"html":case"air:html":case"flash:html":b.html=a[d],c.html=d;break;case"application/rtf":case"text/rtf":case"rtf":case"richtext":case"air:rtf":case"flash:rtf":b.rtf=a[d],c.rtf=d}return{data:b,formatMap:c}}},qb=function(a,b){if("object"!=typeof a||!a||"object"!=typeof b||!b)return a;var c={};for(var d in a)if(s.call(a,d)){if("success"!==d&&"data"!==d){c[d]=a[d];continue}c[d]={};var e=a[d];for(var f in e)f&&s.call(e,f)&&s.call(b,f)&&(c[d][b[f]]=e[f])}return c},rb=function(a,b){var c=null==b||b&&b.cacheBust===!0;return c?(-1===a.indexOf("?")?"?":"&")+"noCache="+p():""},sb=function(a){var b,c,d,f,g="",h=[];if(a.trustedDomains&&("string"==typeof a.trustedDomains?f=[a.trustedDomains]:"object"==typeof a.trustedDomains&&"length"in a.trustedDomains&&(f=a.trustedDomains)),f&&f.length)for(b=0,c=f.length;c>b;b++)if(s.call(f,b)&&f[b]&&"string"==typeof f[b]){if(d=tb(f[b]),!d)continue;if("*"===d){h.length=0,h.push(d);break}h.push.apply(h,[d,"//"+d,e.location.protocol+"//"+d])}return h.length&&(g+="trustedOrigins="+i(h.join(","))),a.forceEnhancedClipboard===!0&&(g+=(g?"&":"")+"forceEnhancedClipboard=true"),"string"==typeof a.swfObjectId&&a.swfObjectId&&(g+=(g?"&":"")+"swfObjectId="+i(a.swfObjectId)),g},tb=function(a){if(null==a||""===a)return null;if(a=a.replace(/^\s+|\s+$/g,""),""===a)return null;var b=a.indexOf("//");a=-1===b?a:a.slice(b+2);var c=a.indexOf("/");return a=-1===c?a:-1===b||0===c?null:a.slice(0,c),a&&".swf"===a.slice(-4).toLowerCase()?null:a||null},ub=function(){var a=function(a){var b,c,d,e=[];if("string"==typeof a&&(a=[a]),"object"!=typeof a||!a||"number"!=typeof a.length)return e;for(b=0,c=a.length;c>b;b++)if(s.call(a,b)&&(d=tb(a[b]))){if("*"===d){e.length=0,e.push("*");break}-1===e.indexOf(d)&&e.push(d)}return e};return function(b,c){var d=tb(c.swfPath);null===d&&(d=b);var e=a(c.trustedDomains),f=e.length;if(f>0){if(1===f&&"*"===e[0])return"always";if(-1!==e.indexOf(b))return 1===f&&b===d?"sameDomain":"always"}return"never"}}(),vb=function(){try{return f.activeElement}catch(a){return null}},wb=function(a,b){if(!a||1!==a.nodeType)return a;if(a.classList)return a.classList.contains(b)||a.classList.add(b),a;if(b&&"string"==typeof b){var c=(b||"").split(/\s+/);if(1===a.nodeType)if(a.className){for(var d=" "+a.className+" ",e=a.className,f=0,g=c.length;g>f;f++)d.indexOf(" "+c[f]+" ")<0&&(e+=" "+c[f]);a.className=e.replace(/^\s+|\s+$/g,"")}else a.className=b}return a},xb=function(a,b){if(!a||1!==a.nodeType)return a;if(a.classList)return a.classList.contains(b)&&a.classList.remove(b),a;if("string"==typeof b&&b){var c=b.split(/\s+/);if(1===a.nodeType&&a.className){for(var d=(" "+a.className+" ").replace(/[\n\t]/g," "),e=0,f=c.length;f>e;e++)d=d.replace(" "+c[e]+" "," ");a.className=d.replace(/^\s+|\s+$/g,"")}}return a},yb=function(a,b){var c=e.getComputedStyle(a,null).getPropertyValue(b);return"cursor"!==b||c&&"auto"!==c||"A"!==a.nodeName?c:"pointer"},zb=function(){var a,b,c,d=1;return"function"==typeof f.body.getBoundingClientRect&&(a=f.body.getBoundingClientRect(),b=a.right-a.left,c=f.body.offsetWidth,d=o(b/c*100)/100),d},Ab=function(a){var b={left:0,top:0,width:0,height:0};if(a.getBoundingClientRect){var c,d,g,h=a.getBoundingClientRect();"pageXOffset"in e&&"pageYOffset"in e?(c=e.pageXOffset,d=e.pageYOffset):(g=zb(),c=o(f.documentElement.scrollLeft/g),d=o(f.documentElement.scrollTop/g));var i=f.documentElement.clientLeft||0,j=f.documentElement.clientTop||0;b.left=h.left+c-i,b.top=h.top+d-j,b.width="width"in h?h.width:h.right-h.left,b.height="height"in h?h.height:h.bottom-h.top}return b},Bb=function(){var a;if(c&&(a=mb(I.bridge))){var b=Ab(c);w(a.style,{width:b.width+"px",height:b.height+"px",top:b.top+"px",left:b.left+"px",zIndex:""+Db(O.zIndex)})}},Cb=function(a){I.ready===!0&&(I.bridge&&"function"==typeof I.bridge.setHandCursor?I.bridge.setHandCursor(a):I.ready=!1)},Db=function(a){if(/^(?:auto|inherit)$/.test(a))return a;var b;return"number"!=typeof a||n(a)?"string"==typeof a&&(b=Db(l(a,10))):b=a,"number"==typeof b?b:"auto"},Eb=function(a){function b(a){var b=a.match(/[\d]+/g);return b.length=3,b.join(".")}function c(a){return!!a&&(a=a.toLowerCase())&&(/^(pepflashplayer\.dll|libpepflashplayer\.so|pepperflashplayer\.plugin)$/.test(a)||"chrome.plugin"===a.slice(-13))}function d(a){a&&(i=!0,a.version&&(l=b(a.version)),!l&&a.description&&(l=b(a.description)),a.filename&&(k=c(a.filename)))}var e,f,h,i=!1,j=!1,k=!1,l="";if(g.plugins&&g.plugins.length)e=g.plugins["Shockwave Flash"],d(e),g.plugins["Shockwave Flash 2.0"]&&(i=!0,l="2.0.0.11");else if(g.mimeTypes&&g.mimeTypes.length)h=g.mimeTypes["application/x-shockwave-flash"],e=h&&h.enabledPlugin,d(e);else if("undefined"!=typeof a){j=!0;try{f=new a("ShockwaveFlash.ShockwaveFlash.7"),i=!0,l=b(f.GetVariable("$version"))}catch(n){try{f=new a("ShockwaveFlash.ShockwaveFlash.6"),i=!0,l="6.0.21"}catch(o){try{f=new a("ShockwaveFlash.ShockwaveFlash"),i=!0,l=b(f.GetVariable("$version"))}catch(p){j=!1}}}}I.disabled=i!==!0,I.outdated=l&&m(l)<m(J),I.version=l||"0.0.0",I.pluginType=k?"pepper":j?"activex":i?"netscape":"unknown"};Eb(j);var Fb=function(){return this instanceof Fb?void("function"==typeof Fb._createClient&&Fb._createClient.apply(this,v(arguments))):new Fb};r(Fb,"version",{value:"2.1.6",writable:!1,configurable:!0,enumerable:!0}),Fb.config=function(){return P.apply(this,v(arguments))},Fb.state=function(){return Q.apply(this,v(arguments))},Fb.isFlashUnusable=function(){return R.apply(this,v(arguments))},Fb.on=function(){return S.apply(this,v(arguments))},Fb.off=function(){return T.apply(this,v(arguments))},Fb.handlers=function(){return U.apply(this,v(arguments))},Fb.emit=function(){return V.apply(this,v(arguments))},Fb.create=function(){return W.apply(this,v(arguments))},Fb.destroy=function(){return X.apply(this,v(arguments))},Fb.setData=function(){return Y.apply(this,v(arguments))},Fb.clearData=function(){return Z.apply(this,v(arguments))},Fb.getData=function(){return $.apply(this,v(arguments))},Fb.focus=Fb.activate=function(){return _.apply(this,v(arguments))},Fb.blur=Fb.deactivate=function(){return ab.apply(this,v(arguments))},Fb.activeElement=function(){return bb.apply(this,v(arguments))};var Gb=0,Hb={},Ib=0,Jb={},Kb={};w(O,{autoActivate:!0});var Lb=function(a){var b=this;b.id=""+Gb++,Hb[b.id]={instance:b,elements:[],handlers:{}},a&&b.clip(a),Fb.on("*",function(a){return b.emit(a)}),Fb.on("destroy",function(){b.destroy()}),Fb.create()},Mb=function(a,b){var c,d,e,f={},g=Hb[this.id]&&Hb[this.id].handlers;if("string"==typeof a&&a)e=a.toLowerCase().split(/\s+/);else if("object"==typeof a&&a&&"undefined"==typeof b)for(c in a)s.call(a,c)&&"string"==typeof c&&c&&"function"==typeof a[c]&&this.on(c,a[c]);if(e&&e.length){for(c=0,d=e.length;d>c;c++)a=e[c].replace(/^on/,""),f[a]=!0,g[a]||(g[a]=[]),g[a].push(b);if(f.ready&&I.ready&&this.emit({type:"ready",client:this}),f.error){var h=["disabled","outdated","unavailable","deactivated","overdue"];for(c=0,d=h.length;d>c;c++)if(I[h[c]]){this.emit({type:"error",name:"flash-"+h[c],client:this});break}}}return this},Nb=function(a,b){var c,d,e,f,g,h=Hb[this.id]&&Hb[this.id].handlers;if(0===arguments.length)f=q(h);else if("string"==typeof a&&a)f=a.split(/\s+/);else if("object"==typeof a&&a&&"undefined"==typeof b)for(c in a)s.call(a,c)&&"string"==typeof c&&c&&"function"==typeof a[c]&&this.off(c,a[c]);if(f&&f.length)for(c=0,d=f.length;d>c;c++)if(a=f[c].toLowerCase().replace(/^on/,""),g=h[a],g&&g.length)if(b)for(e=g.indexOf(b);-1!==e;)g.splice(e,1),e=g.indexOf(b,e);else g.length=0;return this},Ob=function(a){var b=null,c=Hb[this.id]&&Hb[this.id].handlers;return c&&(b="string"==typeof a&&a?c[a]?c[a].slice(0):[]:x(c)),b},Pb=function(a){if(Ub.call(this,a)){"object"==typeof a&&a&&"string"==typeof a.type&&a.type&&(a=w({},a));var b=w({},db(a),{client:this});Vb.call(this,b)}return this},Qb=function(a){a=Wb(a);for(var b=0;b<a.length;b++)if(s.call(a,b)&&a[b]&&1===a[b].nodeType){a[b].zcClippingId?-1===Jb[a[b].zcClippingId].indexOf(this.id)&&Jb[a[b].zcClippingId].push(this.id):(a[b].zcClippingId="zcClippingId_"+Ib++,Jb[a[b].zcClippingId]=[this.id],O.autoActivate===!0&&Xb(a[b]));var c=Hb[this.id]&&Hb[this.id].elements;-1===c.indexOf(a[b])&&c.push(a[b])}return this},Rb=function(a){var b=Hb[this.id];if(!b)return this;var c,d=b.elements;a="undefined"==typeof a?d.slice(0):Wb(a);for(var e=a.length;e--;)if(s.call(a,e)&&a[e]&&1===a[e].nodeType){for(c=0;-1!==(c=d.indexOf(a[e],c));)d.splice(c,1);var f=Jb[a[e].zcClippingId];if(f){for(c=0;-1!==(c=f.indexOf(this.id,c));)f.splice(c,1);0===f.length&&(O.autoActivate===!0&&Yb(a[e]),delete a[e].zcClippingId)}}return this},Sb=function(){var a=Hb[this.id];return a&&a.elements?a.elements.slice(0):[]},Tb=function(){this.unclip(),this.off(),delete Hb[this.id]},Ub=function(a){if(!a||!a.type)return!1;if(a.client&&a.client!==this)return!1;var b=Hb[this.id]&&Hb[this.id].elements,c=!!b&&b.length>0,d=!a.target||c&&-1!==b.indexOf(a.target),e=a.relatedTarget&&c&&-1!==b.indexOf(a.relatedTarget),f=a.client&&a.client===this;return d||e||f?!0:!1},Vb=function(a){if("object"==typeof a&&a&&a.type){var b=gb(a),c=Hb[this.id]&&Hb[this.id].handlers["*"]||[],d=Hb[this.id]&&Hb[this.id].handlers[a.type]||[],f=c.concat(d);if(f&&f.length){var g,h,i,j,k,l=this;for(g=0,h=f.length;h>g;g++)i=f[g],j=l,"string"==typeof i&&"function"==typeof e[i]&&(i=e[i]),"object"==typeof i&&i&&"function"==typeof i.handleEvent&&(j=i,i=i.handleEvent),"function"==typeof i&&(k=w({},a),hb(i,j,[k],b))}return this}},Wb=function(a){return"string"==typeof a&&(a=[]),"number"!=typeof a.length?[a]:a},Xb=function(a){if(a&&1===a.nodeType){var b=function(a){(a||(a=e.event))&&("js"!==a._source&&(a.stopImmediatePropagation(),a.preventDefault()),delete a._source)},c=function(c){(c||(c=e.event))&&(b(c),Fb.focus(a))};a.addEventListener("mouseover",c,!1),a.addEventListener("mouseout",b,!1),a.addEventListener("mouseenter",b,!1),a.addEventListener("mouseleave",b,!1),a.addEventListener("mousemove",b,!1),Kb[a.zcClippingId]={mouseover:c,mouseout:b,mouseenter:b,mouseleave:b,mousemove:b}}},Yb=function(a){if(a&&1===a.nodeType){var b=Kb[a.zcClippingId];if("object"==typeof b&&b){for(var c,d,e=["move","leave","enter","out","over"],f=0,g=e.length;g>f;f++)c="mouse"+e[f],d=b[c],"function"==typeof d&&a.removeEventListener(c,d,!1);delete Kb[a.zcClippingId]}}};Fb._createClient=function(){Lb.apply(this,v(arguments))},Fb.prototype.on=function(){return Mb.apply(this,v(arguments))},Fb.prototype.off=function(){return Nb.apply(this,v(arguments))},Fb.prototype.handlers=function(){return Ob.apply(this,v(arguments))},Fb.prototype.emit=function(){return Pb.apply(this,v(arguments))},Fb.prototype.clip=function(){return Qb.apply(this,v(arguments))},Fb.prototype.unclip=function(){return Rb.apply(this,v(arguments))},Fb.prototype.elements=function(){return Sb.apply(this,v(arguments))},Fb.prototype.destroy=function(){return Tb.apply(this,v(arguments))},Fb.prototype.setText=function(a){return Fb.setData("text/plain",a),this},Fb.prototype.setHtml=function(a){return Fb.setData("text/html",a),this},Fb.prototype.setRichText=function(a){return Fb.setData("application/rtf",a),this},Fb.prototype.setData=function(){return Fb.setData.apply(this,v(arguments)),this},Fb.prototype.clearData=function(){return Fb.clearData.apply(this,v(arguments)),this},Fb.prototype.getData=function(){return Fb.getData.apply(this,v(arguments))},"function"==typeof define&&define.amd?define(function(){return Fb}):"object"==typeof module&&module&&"object"==typeof module.exports&&module.exports?module.exports=Fb:a.ZeroClipboard=Fb}(function(){return this||window}());
//# sourceMappingURL=ZeroClipboard.min.map

/*

$.Link (part of noUiSlider) - WTFPL */
(function(c){function m(a,c,d){if((a[c]||a[d])&&a[c]===a[d])throw Error("(Link) '"+c+"' can't match '"+d+"'.'");}function r(a){void 0===a&&(a={});if("object"!==typeof a)throw Error("(Format) 'format' option must be an object.");var h={};c(u).each(function(c,n){if(void 0===a[n])h[n]=A[c];else if(typeof a[n]===typeof A[c]){if("decimals"===n&&(0>a[n]||7<a[n]))throw Error("(Format) 'format.decimals' option must be between 0 and 7.");h[n]=a[n]}else throw Error("(Format) 'format."+n+"' must be a "+typeof A[c]+
".");});m(h,"mark","thousand");m(h,"prefix","negative");m(h,"prefix","negativeBefore");this.r=h}function k(a,h){"object"!==typeof a&&c.error("(Link) Initialize with an object.");return new k.prototype.p(a.target||function(){},a.method,a.format||{},h)}var u="decimals mark thousand prefix postfix encoder decoder negative negativeBefore to from".split(" "),A=[2,".","","","",function(a){return a},function(a){return a},"-","",function(a){return a},function(a){return a}];r.prototype.a=function(a){return this.r[a]};
r.prototype.L=function(a){function c(a){return a.split("").reverse().join("")}a=this.a("encoder")(a);var d=this.a("decimals"),n="",k="",m="",r="";0===parseFloat(a.toFixed(d))&&(a="0");0>a&&(n=this.a("negative"),k=this.a("negativeBefore"));a=Math.abs(a).toFixed(d).toString();a=a.split(".");this.a("thousand")?(m=c(a[0]).match(/.{1,3}/g),m=c(m.join(c(this.a("thousand"))))):m=a[0];this.a("mark")&&1<a.length&&(r=this.a("mark")+a[1]);return this.a("to")(k+this.a("prefix")+n+m+r+this.a("postfix"))};r.prototype.w=
function(a){function c(a){return a.replace(/[\-\/\\\^$*+?.()|\[\]{}]/g,"\\$&")}var d;if(null===a||void 0===a)return!1;a=this.a("from")(a);a=a.toString();d=a.replace(RegExp("^"+c(this.a("negativeBefore"))),"");a!==d?(a=d,d="-"):d="";a=a.replace(RegExp("^"+c(this.a("prefix"))),"");this.a("negative")&&(d="",a=a.replace(RegExp("^"+c(this.a("negative"))),"-"));a=a.replace(RegExp(c(this.a("postfix"))+"$"),"").replace(RegExp(c(this.a("thousand")),"g"),"").replace(this.a("mark"),".");a=this.a("decoder")(parseFloat(d+
a));return isNaN(a)?!1:a};k.prototype.K=function(a,h){this.method=h||"html";this.j=c(a.replace("-tooltip-","")||"<div/>")[0]};k.prototype.H=function(a){this.method="val";this.j=document.createElement("input");this.j.name=a;this.j.type="hidden"};k.prototype.G=function(a){function h(a,c){return[c?null:a,c?a:null]}var d=this;this.method="val";this.target=a.on("change",function(a){d.B.val(h(c(a.target).val(),d.t),{link:d,set:!0})})};k.prototype.p=function(a,h,d,k){this.g=d;this.update=!k;if("string"===
typeof a&&0===a.indexOf("-tooltip-"))this.K(a,h);else if("string"===typeof a&&0!==a.indexOf("-"))this.H(a);else if("function"===typeof a)this.target=!1,this.method=a;else{if(a instanceof c||c.zepto&&c.zepto.isZ(a)){if(!h){if(a.is("input, select, textarea")){this.G(a);return}h="html"}if("function"===typeof h||"string"===typeof h&&a[h]){this.method=h;this.target=a;return}}throw new RangeError("(Link) Invalid Link.");}};k.prototype.write=function(a,c,d,k){if(!this.update||!1!==k)if(this.u=a,this.F=a=
this.format(a),"function"===typeof this.method)this.method.call(this.target[0]||d[0],a,c,d);else this.target[this.method](a,c,d)};k.prototype.q=function(a){this.g=new r(c.extend({},a,this.g instanceof r?this.g.r:this.g))};k.prototype.J=function(a){this.B=a};k.prototype.I=function(a){this.t=a};k.prototype.format=function(a){return this.g.L(a)};k.prototype.A=function(a){return this.g.w(a)};k.prototype.p.prototype=k.prototype;c.Link=k})(window.jQuery||window.Zepto);/*

$.fn.noUiSlider - WTFPL - refreshless.com/nouislider/ */
(function(c){function m(e){return"number"===typeof e&&!isNaN(e)&&isFinite(e)}function r(e){return c.isArray(e)?e:[e]}function k(e,b){e.addClass(b);setTimeout(function(){e.removeClass(b)},300)}function u(e,b){return 100*b/(e[1]-e[0])}function A(e,b){if(b>=e.d.slice(-1)[0])return 100;for(var a=1,c,f,d;b>=e.d[a];)a++;c=e.d[a-1];f=e.d[a];d=e.c[a-1];c=[c,f];return d+u(c,0>c[0]?b+Math.abs(c[0]):b-c[0])/(100/(e.c[a]-d))}function a(e,b){if(100<=b)return e.d.slice(-1)[0];for(var a=1,c,f,d;b>=e.c[a];)a++;c=
e.d[a-1];f=e.d[a];d=e.c[a-1];c=[c,f];return 100/(e.c[a]-d)*(b-d)*(c[1]-c[0])/100+c[0]}function h(a,b){for(var c=1,g;(a.dir?100-b:b)>=a.c[c];)c++;if(a.m)return g=a.c[c-1],c=a.c[c],b-g>(c-g)/2?c:g;a.h[c-1]?(g=a.h[c-1],c=a.c[c-1]+Math.round((b-a.c[c-1])/g)*g):c=b;return c}function d(a,b){if(!m(b))throw Error("noUiSlider: 'step' is not numeric.");a.h[0]=b}function n(a,b){if("object"!==typeof b||c.isArray(b))throw Error("noUiSlider: 'range' is not an object.");if(void 0===b.min||void 0===b.max)throw Error("noUiSlider: Missing 'min' or 'max' in 'range'.");
c.each(b,function(b,g){var d;"number"===typeof g&&(g=[g]);if(!c.isArray(g))throw Error("noUiSlider: 'range' contains invalid value.");d="min"===b?0:"max"===b?100:parseFloat(b);if(!m(d)||!m(g[0]))throw Error("noUiSlider: 'range' value isn't numeric.");a.c.push(d);a.d.push(g[0]);d?a.h.push(isNaN(g[1])?!1:g[1]):isNaN(g[1])||(a.h[0]=g[1])});c.each(a.h,function(b,c){if(!c)return!0;a.h[b]=u([a.d[b],a.d[b+1]],c)/(100/(a.c[b+1]-a.c[b]))})}function E(a,b){"number"===typeof b&&(b=[b]);if(!c.isArray(b)||!b.length||
2<b.length)throw Error("noUiSlider: 'start' option is incorrect.");a.b=b.length;a.start=b}function I(a,b){a.m=b;if("boolean"!==typeof b)throw Error("noUiSlider: 'snap' option must be a boolean.");}function J(a,b){if("lower"===b&&1===a.b)a.i=1;else if("upper"===b&&1===a.b)a.i=2;else if(!0===b&&2===a.b)a.i=3;else if(!1===b)a.i=0;else throw Error("noUiSlider: 'connect' option doesn't match handle count.");}function D(a,b){switch(b){case "horizontal":a.k=0;break;case "vertical":a.k=1;break;default:throw Error("noUiSlider: 'orientation' option is invalid.");
}}function K(a,b){if(2<a.c.length)throw Error("noUiSlider: 'margin' option is only supported on linear sliders.");a.margin=u(a.d,b);if(!m(b))throw Error("noUiSlider: 'margin' option must be numeric.");}function L(a,b){switch(b){case "ltr":a.dir=0;break;case "rtl":a.dir=1;a.i=[0,2,1,3][a.i];break;default:throw Error("noUiSlider: 'direction' option was not recognized.");}}function M(a,b){if("string"!==typeof b)throw Error("noUiSlider: 'behaviour' must be a string containing options.");var c=0<=b.indexOf("snap");
a.n={s:0<=b.indexOf("tap")||c,extend:0<=b.indexOf("extend"),v:0<=b.indexOf("drag"),fixed:0<=b.indexOf("fixed"),m:c}}function N(a,b,d){a.o=[b.lower,b.upper];a.g=b.format;c.each(a.o,function(a,e){if(!c.isArray(e))throw Error("noUiSlider: 'serialization."+(a?"upper":"lower")+"' must be an array.");c.each(e,function(){if(!(this instanceof c.Link))throw Error("noUiSlider: 'serialization."+(a?"upper":"lower")+"' can only contain Link instances.");this.I(a);this.J(d);this.q(b.format)})});a.dir&&1<a.b&&a.o.reverse()}
function O(a,b){var f={c:[],d:[],h:[!1],margin:0},g;g={step:{e:!1,f:d},start:{e:!0,f:E},connect:{e:!0,f:J},direction:{e:!0,f:L},range:{e:!0,f:n},snap:{e:!1,f:I},orientation:{e:!1,f:D},margin:{e:!1,f:K},behaviour:{e:!0,f:M},serialization:{e:!0,f:N}};a=c.extend({connect:!1,direction:"ltr",behaviour:"tap",orientation:"horizontal"},a);a.serialization=c.extend({lower:[],upper:[],format:{}},a.serialization);c.each(g,function(c,d){if(void 0===a[c]){if(d.e)throw Error("noUiSlider: '"+c+"' is required.");
return!0}d.f(f,a[c],b)});f.style=f.k?"top":"left";return f}function P(a,b){var d=c("<div><div/></div>").addClass(f[2]),g=["-lower","-upper"];a.dir&&g.reverse();d.children().addClass(f[3]+" "+f[3]+g[b]);return d}function Q(a,b){b.j&&(b=new c.Link({target:c(b.j).clone().appendTo(a),method:b.method,format:b.g},!0));return b}function R(a,b){var d,f=[];for(d=0;d<a.b;d++){var k=f,h=d,m=a.o[d],n=b[d].children(),r=a.g,s=void 0,v=[],s=new c.Link({},!0);s.q(r);v.push(s);for(s=0;s<m.length;s++)v.push(Q(n,m[s]));
k[h]=v}return f}function S(a,b,c){switch(a){case 1:b.addClass(f[7]);c[0].addClass(f[6]);break;case 3:c[1].addClass(f[6]);case 2:c[0].addClass(f[7]);case 0:b.addClass(f[6])}}function T(a,b){var c,d=[];for(c=0;c<a.b;c++)d.push(P(a,c).appendTo(b));return d}function U(a,b){b.addClass([f[0],f[8+a.dir],f[4+a.k]].join(" "));return c("<div/>").appendTo(b).addClass(f[1])}function V(d,b,m){function g(){return t[["width","height"][b.k]]()}function n(a){var b,c=[q.val()];for(b=0;b<a.length;b++)q.trigger(a[b],
c)}function u(d,p,e){var g=d[0]!==l[0][0]?1:0,H=x[0]+b.margin,k=x[1]-b.margin;e&&1<l.length&&(p=g?Math.max(p,H):Math.min(p,k));100>p&&(p=h(b,p));p=Math.max(Math.min(parseFloat(p.toFixed(7)),100),0);if(p===x[g])return 1===l.length?!1:p===H||p===k?0:!1;d.css(b.style,p+"%");d.is(":first-child")&&d.toggleClass(f[17],50<p);x[g]=p;b.dir&&(p=100-p);c(y[g]).each(function(){this.write(a(b,p),d.children(),q)});return!0}function B(a,b,c){c||k(q,f[14]);u(a,b,!1);n(["slide","set","change"])}function w(a,c,d,e){a=
a.replace(/\s/g,".nui ")+".nui";c.on(a,function(a){var c=q.attr("disabled");if(q.hasClass(f[14])||void 0!==c&&null!==c)return!1;a.preventDefault();var c=0===a.type.indexOf("touch"),p=0===a.type.indexOf("mouse"),F=0===a.type.indexOf("pointer"),g,k,l=a;0===a.type.indexOf("MSPointer")&&(F=!0);a.originalEvent&&(a=a.originalEvent);c&&(g=a.changedTouches[0].pageX,k=a.changedTouches[0].pageY);if(p||F)F||void 0!==window.pageXOffset||(window.pageXOffset=document.documentElement.scrollLeft,window.pageYOffset=
document.documentElement.scrollTop),g=a.clientX+window.pageXOffset,k=a.clientY+window.pageYOffset;l.C=[g,k];l.cursor=p;a=l;a.l=a.C[b.k];d(a,e)})}function C(a,c){var b=c.b||l,d,e=!1,e=100*(a.l-c.start)/g(),f=b[0][0]!==l[0][0]?1:0;var k=c.D;d=e+k[0];e+=k[1];1<b.length?(0>d&&(e+=Math.abs(d)),100<e&&(d-=e-100),d=[Math.max(Math.min(d,100),0),Math.max(Math.min(e,100),0)]):d=[d,e];e=u(b[0],d[f],1===b.length);1<b.length&&(e=u(b[1],d[f?0:1],!1)||e);e&&n(["slide"])}function s(a){c("."+f[15]).removeClass(f[15]);
a.cursor&&c("body").css("cursor","").off(".nui");G.off(".nui");q.removeClass(f[12]);n(["set","change"])}function v(a,b){1===b.b.length&&b.b[0].children().addClass(f[15]);a.stopPropagation();w(z.move,G,C,{start:a.l,b:b.b,D:[x[0],x[l.length-1]]});w(z.end,G,s,null);a.cursor&&(c("body").css("cursor",c(a.target).css("cursor")),1<l.length&&q.addClass(f[12]),c("body").on("selectstart.nui",!1))}function D(a){var d=a.l,e=0;a.stopPropagation();c.each(l,function(){e+=this.offset()[b.style]});e=d<e/2||1===l.length?
0:1;d-=t.offset()[b.style];d=100*d/g();B(l[e],d,b.n.m);b.n.m&&v(a,{b:[l[e]]})}function E(a){var c=(a=a.l<t.offset()[b.style])?0:100;a=a?0:l.length-1;B(l[a],c,!1)}var q=c(d),x=[-1,-1],t,y,l;if(q.hasClass(f[0]))throw Error("Slider was already initialized.");t=U(b,q);l=T(b,t);y=R(b,l);S(b.i,q,l);(function(a){var b;if(!a.fixed)for(b=0;b<l.length;b++)w(z.start,l[b].children(),v,{b:[l[b]]});a.s&&w(z.start,t,D,{b:l});a.extend&&(q.addClass(f[16]),a.s&&w(z.start,q,E,{b:l}));a.v&&(b=t.find("."+f[7]).addClass(f[10]),
a.fixed&&(b=b.add(t.children().not(b).children())),w(z.start,b,v,{b:l}))})(b.n);d.vSet=function(){var a=Array.prototype.slice.call(arguments,0),d,e,g,h,m,s,t=r(a[0]);"object"===typeof a[1]?(d=a[1].set,e=a[1].link,g=a[1].update,h=a[1].animate):!0===a[1]&&(d=!0);b.dir&&1<b.b&&t.reverse();h&&k(q,f[14]);a=1<l.length?3:1;1===t.length&&(a=1);for(m=0;m<a;m++)h=e||y[m%2][0],h=h.A(t[m%2]),!1!==h&&(h=A(b,h),b.dir&&(h=100-h),!0!==u(l[m%2],h,!0)&&c(y[m%2]).each(function(a){if(!a)return s=this.u,!0;this.write(s,
l[m%2].children(),q,g)}));!0===d&&n(["set"]);return this};d.vGet=function(){var a,c=[];for(a=0;a<b.b;a++)c[a]=y[a][0].F;return 1===c.length?c[0]:b.dir?c.reverse():c};d.destroy=function(){c.each(y,function(){c.each(this,function(){this.target&&this.target.off(".nui")})});c(this).off(".nui").removeClass(f.join(" ")).empty();return m};q.val(b.start)}function W(a){if(!this.length)throw Error("noUiSlider: Can't initialize slider on empty selection.");var b=O(a,this);return this.each(function(){V(this,
b,a)})}function X(a){return this.each(function(){var b=c(this).val(),d=this.destroy(),f=c.extend({},d,a);c(this).noUiSlider(f);d.start===f.start&&c(this).val(b)})}function B(){return this[0][arguments.length?"vSet":"vGet"].apply(this[0],arguments)}var G=c(document),C=c.fn.val,z=window.navigator.pointerEnabled?{start:"pointerdown",move:"pointermove",end:"pointerup"}:window.navigator.msPointerEnabled?{start:"MSPointerDown",move:"MSPointerMove",end:"MSPointerUp"}:{start:"mousedown touchstart",move:"mousemove touchmove",
end:"mouseup touchend"},f="noUi-target noUi-base noUi-origin noUi-handle noUi-horizontal noUi-vertical noUi-background noUi-connect noUi-ltr noUi-rtl noUi-dragable  noUi-state-drag  noUi-state-tap noUi-active noUi-extended noUi-stacking".split(" ");c.fn.val=function(){var a=arguments,b=c(this[0]);return arguments.length?this.each(function(){(c(this).hasClass(f[0])?B:C).apply(c(this),a)}):(b.hasClass(f[0])?B:C).call(b)};c.noUiSlider={Link:c.Link};c.fn.noUiSlider=function(a,b){return(b?X:W).call(this,
a)}})(window.jQuery||window.Zepto);