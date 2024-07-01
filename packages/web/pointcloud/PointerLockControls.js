/**
 * @author mrdoob / http://mrdoob.com/
 */

THREE.PointerLockControls = function ( camera ) {

	var scope = this;

	camera.rotation.set( 0, 0, 0 );
	camera.matrixAutoUpdate = false;
	var moveSpeed = 200;
	var lastDelta = 0;


	var moveForward = false;
	var moveBackward = false;
	var moveLeft = false;
	var moveRight = false;
	var moveDown = false;
	var moveUp = false;

	var prevTime = performance.now();

	var PI_2 = Math.PI / 2;

	var onMouseMove = function ( event ) {

		if ( scope.enabled === false ) return;

		var movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
		var movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

		
        addRotation(-movementX , -movementY); 
	};
	
	var addRotation = function(x, y){
		var MouseSensitivity = 0.01;
		x *= MouseSensitivity;
        y *= MouseSensitivity;

		camera.rotation.set(
			camera.rotation.x + x,
			Math.max(Math.min(camera.rotation.y + y, Math.PI / 2 - 0.1), -Math.PI / 2 + 0.1),
			0
		);
		updateMatrix();
	}
	
	var updateMatrix = function(){
		var lookat = new THREE.Vector3(
			Math.sin(camera.rotation.x) * Math.cos(camera.rotation.y),
			Math.sin(camera.rotation.y),
			Math.cos(camera.rotation.x) * Math.cos(camera.rotation.y)
		);


		camera.matrix = new THREE.Matrix4().lookAt(camera.position, new THREE.Vector3().addVectors(camera.position, lookat), camera.up).setPosition(camera.position);
		camera.matrixWorldNeedsUpdate = true;
	}
	
	var move = function(x, y, z)
	{
		var offset = new THREE.Vector3();
		//BUG: Movement speed on the X axis tends to zero when looking directly up/down
		var forward = new THREE.Vector3(
			(Math.sin(camera.rotation.x) * Math.cos(camera.rotation.y)),
			(Math.sin(camera.rotation.y)),
			(Math.cos(camera.rotation.x) * Math.cos(camera.rotation.y))
		);
	
        
		var right = new THREE.Vector3(
			-(Math.cos(camera.rotation.x)),
			0,
			(Math.sin(camera.rotation.x))
		);
		offset.addVectors(right.multiplyScalar(x), forward.multiplyScalar(y));
		offset.y += z;

		camera.position.add(offset);
		updateMatrix();
	}
	
	var onKeyDown = function ( event ) {
		if ( scope.enabled === false ) return;
		
		switch ( event.keyCode ) {

			case 38: // up
			case 87: // w
				moveForward = true;
				event.preventDefault();break;

			case 37: // left
			case 65: // a
				moveLeft = true; 
				event.preventDefault();break;
				
			case 40: // down
			case 83: // s
				moveBackward = true;
				event.preventDefault();break;

			case 39: // right
			case 68: // d
				moveRight = true;
				event.preventDefault();break;

			case 32: // space
				moveUp = true;
				event.preventDefault();break;
			case 18: //alt
				moveDown = true;
				event.preventDefault();break;
			case 16: //shift
				moveSpeed = 2000;
				event.preventDefault();break;
				
		}

	};

	var onKeyUp = function ( event ) {
		if ( scope.enabled === false ) return;
		switch( event.keyCode ) {

			case 38: // up
			case 87: // w
				moveForward = false;
				break;

			case 37: // left
			case 65: // a
				moveLeft = false;
				break;

			case 40: // down
			case 83: // s
				moveBackward = false;
				break;

			case 39: // right
			case 68: // d
				moveRight = false;
				break;
			case 32: // space
				moveUp = false;
				break;
			case 18: //alt
				moveDown = false;
				break;
			case 16: //shift
				moveSpeed = 400;
				break;
		}

	};
	
	var onBlur = function(event){
		moveDown = false;
		moveLeft = false;
		moveRight = false;
		moveUp = false;
		moveSpeed = 400;
	}

	document.addEventListener( 'mousemove', onMouseMove, false );
	document.addEventListener( 'keydown', onKeyDown, false );
	document.addEventListener( 'keyup', onKeyUp, false );
	window.addEventListener('blur', onBlur, false);

	this.enabled = false;
	this.prevEnabled = true;
	
	

	this.getDirection = function() {

		// assumes the camera itself is not rotated

		var direction = new THREE.Vector3( 0, 0, -1 );
		var rotation = new THREE.Euler( 0, 0, 0, "YXZ" );

		return function( v ) {

			rotation.set( pitchObject.rotation.x, yawObject.rotation.y, 0 );

			v.copy( direction ).applyEuler( rotation );

			return v;

		}

	}();

	this.update = function () {
		
		if ( scope.enabled === false ) return scope.prevEnabled = false;
		if(!scope.prevEnabled) {
			prevTime = performance.now();
			scope.prevEnabled = true;
		}

		var time = performance.now();
		var delta = ( time - prevTime ) / 1000;
		lastDelta = delta;
		if(delta < 0.5)
		{
			var MovementSpeed = moveSpeed * lastDelta;
			if ( moveForward ) move(0, MovementSpeed, 0);
			if ( moveBackward ) move(0, -MovementSpeed, 0);

			if ( moveLeft ) move(-MovementSpeed, 0, 0);
			if ( moveRight ) move(MovementSpeed, 0, 0);
		}

		prevTime = time;
	};

};
