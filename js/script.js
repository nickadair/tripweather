var map;
var geocoder;
var directionsDisplay;
var directionsService;
var markers = [];
var startMarker, endMarker;
var boundsSet;
var totalDistance, totalDuration;
var nodeTime = new Date();
var infoWindow;

function initialize() {
  boundsSet = false;
  totalDistance = 0;
  startTime = new Date();
  nodeTime = new Date();
  startMarker = null;
  endMarker = null;
  clearMarkers();
  deleteMarkers();
}


function addHours(numOfHours, date = new Date()) {
  date.setTime(date.getTime() + numOfHours * 60 * 60 * 1000);

  return date;
}

function getWeather(marker) {
  var lat = marker.position.lat();
  var lng = marker.position.lng();
  var time = marker.time;
  var url = "https://forecast.weather.gov/MapClick.php?lat=" + lat + "&lon=" + lng + "&FcstType=json";
  var request = new XMLHttpRequest();
  var leavingTime = document.getElementById('leaving-time').value;

  time = addHours(leavingTime, new Date(time));

  request.onreadystatechange = function() {
      if (request.readyState === 4) {
          if (request.status === 200) {
              var fc = JSON.parse(request.responseText);
              for (dt in fc.time.startValidTime) {
                if (new Date(fc.time.startValidTime[dt]) > time) {
                  if (fc.data.text[dt - 1].includes("thunder")) {
                    marker.setIcon("./img/icons/thunderstorm.png");
                  } else if (fc.data.text[dt - 1].includes("rain") || (fc.data.text[dt - 1].includes("shower") && !fc.data.text[dt - 1].includes("snow"))) {
                    marker.setIcon("./img/icons/rainy.png");
                  } else if (fc.data.text[dt - 1].includes("tornado")) {
                    marker.setIcon("./img/icons/tornado.png");
                  } else if (fc.data.text[dt - 1].includes("snow") || fc.data.text[dt - 1].includes("sleet")) {
                    marker.setIcon("./img/icons/snowy.png");
                  } else if (fc.data.text[dt - 1].includes("cloud")) {
                    marker.setIcon("./img/icons/cloudy.png");
                  } else {
                    marker.setIcon("./img/icons/sunny.png");
                  }
                  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                  var day = days[time.getDay()];
                  if (isNaN(fc.location.areaDescription.substring(0,1))) {
                    var location = "<br> Somewhere outside of " + fc.location.areaDescription
                  } else {
                    var location = "<br>" + fc.location.areaDescription
                  }
                  marker.infowindow = new google.maps.InfoWindow({
	                	content: "<h3>" + day + ", " + time.toLocaleString() + location +  "</h3><img style='float: left; vertical-align: middle; margin-right: .25rem;' src='" + fc.data.iconLink[dt - 1] + "'></img>" + "<span>" + fc.data.text[dt - 1] + "</span>"
	              	});           
                  marker.addListener('click', function() {
                  	closeInfoWindows();                  
                    if(!marker.open){
	                    marker.infowindow.open(map, marker);
	                    marker.open = true;
	                }
	                else{
	                    closeInfoWindows();
	                    marker.open = false;
	                }
	                google.maps.event.addListener(map, 'click', function() {
	                    closeInfoWindows();
	                    marker.open = false;
	                });
                  });
                  marker.setTitle(new Date(time).toLocaleString() + " : " + fc.data.text[dt - 1]);
                  break;
                }
              }
          } else {
              marker.forecast = "No data available";
          }
      }
  };

  request.open("GET", url , true);
  request.send(null);
}

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: {lat: 43.074, lng: -89.384},
        zoom: 6,
        disableDefaultUI: true,
        scrollwheel: false
    });
    geocoder = new google.maps.Geocoder();
    directionsDisplay = new google.maps.DirectionsRenderer();
    directionsService = new google.maps.DirectionsService();
}

function addMarker(lat, lng, dt) {
  if (dt == null) {
    marker = new google.maps.Marker({
         position: new google.maps.LatLng(lat, lng),
         map: null
    });
  } else {
    marker = new google.maps.Marker({
         position: new google.maps.LatLng(lat, lng),
         map: null
    });
    marker.time = dt.toString();
  }
  markers.push(marker);
}

function showMarkers() {
    for (var i = 0; i < markers.length; i++) {
        markers[i].setMap(map);
    }
}

function clearMarkers() {
    for (var i = 0; i < markers.length; i++) {
        markers[i].setMap(null);
    }
}

function closeInfoWindows() {
    for (var i = 0; i < markers.length; i++) {
        marker = markers[i];
        if(marker.hasOwnProperty("infowindow")){
		    marker.infowindow.close();
		    marker.open = false;
		}
    }
}

function deleteMarkers() {
    markers = [];
}

function createInitialMarkers() {
    initialize();
    var from = document.getElementById('from').value;
    var to = document.getElementById('to').value;

    if (from == "" || to == "") {
      alert("Missing starting or ending location.");
      document.getElementById('from').focus();
      return false;
    }
    geocoder.geocode( { 'address': from}, function(results, status) {
      if (status == google.maps.GeocoderStatus.OK) {
        saveMarker(results[0].geometry.location, "start");
        geocoder.geocode( { 'address': to}, function(results, status) {
          if (status == google.maps.GeocoderStatus.OK) {
            saveMarker(results[0].geometry.location, "end");
          } else {
            alert("Couldn't find your ending location.");
            document.getElementById('to').value = "";
            document.getElementById('to').focus();
          }
        });
      } else {
        alert("Couldn't find your starting location.");
        document.getElementById('from').value = "";
        document.getElementById('to').value = "";
        document.getElementById('from').focus();
      }
	  });
    setMapBounds();
    saveTotalDistance();
    displayRoute();
}

function saveMarker(location, type) {
  addMarker(location.lat(), location.lng(), null);
  if (type == "start") {
    startMarker = markers[0];
  } else {
    endMarker = markers[1];
  }
}

function setMapBounds() {
  if (endMarker !== null && startMarker !== null) {
    var bounds = new google.maps.LatLngBounds();
    bounds.extend(startMarker.position);
    bounds.extend(endMarker.position);
    map.fitBounds(bounds,10);
    boundsSet = true;
  } else {
      setTimeout(setMapBounds, 100);
  }
}

function saveTotalDistance() {
  if (boundsSet) {
    var service = new google.maps.DistanceMatrixService();
    service.getDistanceMatrix(
    {
      origins: [startMarker.position],
      destinations: [endMarker.position],
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.IMPERIAL,
    }, function(response, status) {
      totalDistance = response.rows[0].elements[0].distance.value / 1609.344;
      label = document.getElementById("information");
      label.innerHTML = "Total distance: " + totalDistance.toFixed(2) + " miles";
      totalDuration = response.rows[0].elements[0].duration.value / 60 / 60;
      label.innerHTML += " | Total driving time: " + totalDuration.toFixed(2) + " hours";
    });
  } else {
    setTimeout(saveTotalDistance, 100);
  }
}

function displayRoute() {
  if (boundsSet) {
    directionsDisplay.setDirections({routes: []});
    directionsDisplay.setMap(map);
    var request = {
        origin : startMarker.position,
        destination : endMarker.position,
        travelMode : google.maps.TravelMode.DRIVING
    };
    directionsService.route(request, function(response, status) {
        if (status == google.maps.DirectionsStatus.OK) {
            directionsDisplay.setDirections(response);            
            createRouteMarkers(response);
        }
    }); 
  } else {
      setTimeout(displayRoute, 100);
  }
}

function createRouteMarkers(response) {
  clearMarkers();
  var m = 1.5 * Math.round(Math.log(totalDistance) / Math.log(2));
  var s = totalDistance / m;
  var t = totalDuration / m;
  var currentNode = startMarker.position;
  var endNode = endMarker.position;
  var leavingTime = document.getElementById('leaving-time').value;


  for (var i = 0; i < response.routes[0].overview_path.length; i++) {
    var nextNode = new google.maps.LatLng(response.routes[0].overview_path[i].lat(), response.routes[0].overview_path[i].lng());
    var currentDistance = (google.maps.geometry.spherical.computeDistanceBetween(currentNode, nextNode) / 1609.344).toFixed(2);
    if (currentDistance >= s) {
      var h = parseInt(t);
      var m = Math.round((t - parseInt(t)) * 60);
      nodeTime.setHours(nodeTime.getHours() + h);
      nodeTime.setMinutes(nodeTime.getMinutes() + m);
      addMarker(nextNode.lat(), nextNode.lng(), nodeTime);
      var distanceToEnd = (google.maps.geometry.spherical.computeDistanceBetween(nextNode, endNode) / 1609.344).toFixed(2);
      if (distanceToEnd < (s * 1.3) ) { break; }
      currentNode = nextNode;
    }
  }

  // Set forecast data on marker
  for (var i = 0; i < markers.length; i++) {
      getWeather(markers[i]);
  }

  showMarkers();
}