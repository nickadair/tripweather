var map;
var geocoder;
var directionsDisplay;
var directionsService;
var markers = [];
var startMarker, endMarker;
var infoWindow; // Shared InfoWindow instance

function initialize() {
  totalDistance = 0;
  startMarker = null;
  endMarker = null;
  clearMarkers();
  deleteMarkers();
  if (infoWindow) {
    infoWindow.close();
  }
}

function getWeather(marker) {
  var lat = marker.getPosition().lat();
  var lng = marker.getPosition().lng();
  var time = marker.time;
  
  // NWS Forecast API (Legacy JSON endpoint used in original, keeping for compatibility but fixing bugs)
  var url = "https://forecast.weather.gov/MapClick.php?lat=" + lat + "&lon=" + lng + "&FcstType=json";
  var request = new XMLHttpRequest();

  request.onreadystatechange = function() {
    if (request.readyState === 4) {
      if (request.status === 200) {
        try {
          var fc = JSON.parse(request.responseText);
          var forecastFound = false;
          
          for (var i = 0; i < fc.time.startValidTime.length; i++) {
            if (new Date(fc.time.startValidTime[i]) > new Date(time)) {
              // Fix: Use index i (the first valid period found) or i-1 if it exists
              // The logic below assumes i is the next period, so i-1 is the current/closest
              var index = (i > 0) ? i - 1 : 0;
              var forecastText = fc.data.text[index];
              var iconLink = fc.data.iconLink[index];
              
              updateMarkerIcon(marker, forecastText);
              
              var day = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(time).getDay()];
              var locationDesc = fc.location.areaDescription;
              var locationHtml = isNaN(locationDesc.substring(0,1)) ? 
                                 "<br> Somewhere outside of " + locationDesc : 
                                 "<br>" + locationDesc;

              var content = "<h3>" + day + ", " + new Date(time).toLocaleString() + locationHtml + "</h3>" +
                            "<img style='float: left; vertical-align: middle; margin-right: .25rem;' src='" + iconLink + "'></img>" +
                            "<span>" + forecastText + "</span>";
              
              marker.addListener('click', function() {
                infoWindow.setContent(content);
                infoWindow.open(map, marker);
              });
              
              marker.setTitle(new Date(time).toLocaleString() + " : " + forecastText);
              forecastFound = true;
              break;
            }
          }
        } catch (e) {
          console.error("Error parsing weather data", e);
        }
      }
    }
  };

  request.open("GET", url , true);
  request.send(null);
}

function updateMarkerIcon(marker, text) {
  var iconPath = "./img/icons/sunny.png";
  text = text.toLowerCase();
  
  if (text.includes("thunder")) iconPath = "./img/icons/thunderstorm.png";
  else if (text.includes("rain") || (text.includes("shower") && !text.includes("snow"))) iconPath = "./img/icons/rainy.png";
  else if (text.includes("tornado")) iconPath = "./img/icons/tornado.png";
  else if (text.includes("snow") || text.includes("sleet")) iconPath = "./img/icons/snowy.png";
  else if (text.includes("cloud")) iconPath = "./img/icons/cloudy.png";
  
  marker.setIcon(iconPath);
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
    infoWindow = new google.maps.InfoWindow();
}

function addMarker(lat, lng, dt) {
  var marker = new google.maps.Marker({
    position: {lat: lat, lng: lng},
    map: map
  });
  if (dt) {
    marker.time = dt.getTime ? dt.getTime() : new Date(dt).getTime();
  } else {
    marker.time = new Date().getTime();
  }
  markers.push(marker);
  return marker;
}

function clearMarkers() {
    for (var i = 0; i < markers.length; i++) {
        markers[i].setMap(null);
    }
}

function deleteMarkers() {
    markers = [];
}

function createInitialMarkers() {
    initialize();
    var from = document.getElementById('from').value;
    var to = document.getElementById('to').value;

    if (!from || !to) {
      alert("Missing starting or ending location.");
      document.getElementById('from').focus();
      return;
    }

    // Use nested callbacks to avoid race conditions and remove polling
    geocoder.geocode({ 'address': from }, function(resultsFrom, statusFrom) {
      if (statusFrom === google.maps.GeocoderStatus.OK) {
        geocoder.geocode({ 'address': to }, function(resultsTo, statusTo) {
          if (statusTo === google.maps.GeocoderStatus.OK) {
            startMarker = addMarker(resultsFrom[0].geometry.location.lat(), resultsFrom[0].geometry.location.lng(), new Date());
            endMarker = addMarker(resultsTo[0].geometry.location.lat(), resultsTo[0].geometry.location.lng(), null); // Time updated later
            
            fitMapBounds();
            calculateAndDisplayRoute();
          } else {
            alert("Couldn't find your ending location.");
          }
        });
      } else {
        alert("Couldn't find your starting location.");
      }
    });
}

function fitMapBounds() {
  var bounds = new google.maps.LatLngBounds();
  bounds.extend(startMarker.getPosition());
  bounds.extend(endMarker.getPosition());
  map.fitBounds(bounds);
}

function calculateAndDisplayRoute() {
  directionsDisplay.setMap(map);
  var request = {
    origin: startMarker.getPosition(),
    destination: endMarker.getPosition(),
    travelMode: google.maps.TravelMode.DRIVING
  };

  directionsService.route(request, function(response, status) {
    if (status === google.maps.DirectionsStatus.OK) {
      directionsDisplay.setDirections(response);
      
      // Optimization: Extract distance/duration from Directions response (Save API calls)
      var route = response.routes[0].legs[0];
      var totalDistanceMiles = route.distance.value / 1609.344;
      var totalDurationHours = route.duration.value / 3600;
      
      var label = document.getElementById("information");
      label.innerHTML = "Total distance: " + totalDistanceMiles.toFixed(2) + " miles | Total driving time: " + totalDurationHours.toFixed(2) + " hours";
      
      // Update end marker time based on duration
      var arrivalTime = new Date();
      arrivalTime.setSeconds(arrivalTime.getSeconds() + route.duration.value);
      endMarker.time = arrivalTime.getTime();

      createRouteMarkers(response, totalDistanceMiles, totalDurationHours);
    } else {
      alert("Directions request failed: " + status);
    }
  });
}

function createRouteMarkers(response, totalDistance, totalDuration) {
  // Guard against short trips (division by zero / infinite loops)
  if (totalDistance < 5) {
    getWeather(startMarker);
    getWeather(endMarker);
    return;
  }

  var numMarkers = Math.max(2, Math.round(Math.log(totalDistance) * 1.5));
  var stepDistance = totalDistance / numMarkers;
  var stepDuration = totalDuration / numMarkers;
  
  var path = response.routes[0].overview_path;
  var currentDistance = 0;
  var lastMarkerPos = startMarker.getPosition();
  var currentTime = new Date();

  // Simple interpolation for markers along the path
  for (var i = 0; i < path.length; i++) {
    var segmentDist = google.maps.geometry.spherical.computeDistanceBetween(lastMarkerPos, path[i]) / 1609.344;
    
    if (segmentDist >= stepDistance) {
      currentTime = new Date(currentTime.getTime() + (stepDuration * 3600000));
      addMarker(path[i].lat(), path[i].lng(), currentTime);
      lastMarkerPos = path[i];
    }
  }

  // Fetch weather for all markers (including start/end)
  for (var i = 0; i < markers.length; i++) {
    getWeather(markers[i]);
  }
}
