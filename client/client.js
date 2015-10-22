  function createMarker(map, latlng, label) {
    var contentString = '<b>'+label+'</b>'
    var marker = new google.maps.Marker({
        position: latlng,
        map: map.instance,
        title: label
    })
  }

  function setMapBounds(locStart, locEnd, map){
    var bounds_1 = new google.maps.LatLng(locStart.lat(), locStart.lng())
    var bounds_2 = new google.maps.LatLng(locEnd.lat(), locEnd.lng())
    var bounds = new google.maps.LatLngBounds()
    bounds.extend(bounds_1)
    bounds.extend(bounds_2)
    map.instance.fitBounds(bounds)
    createMarker(map, locStart, "Start")
    createMarker(map, locEnd, "Finish")
  }

  Meteor.startup(function() {
		Session.setDefault('zipEntered', false)
  })

	Template.mainContent.helpers({
		isLocationKnown: function() { return Session.get('zipEntered') }
	})

  Template.zipInput.events({
    'submit form': function(event) {
      event.preventDefault()
		  Session.set('zipEntered', true)
		  Session.set('cityStateStart', document.getElementById('cityStateStart').value)
		  Session.set('cityStateEnd', document.getElementById('cityStateEnd').value)
      if (Session.get('zipEntered')) {
          GoogleMaps.load()
      } else {
        alert('Session not set')
      }
    }
  })

	Template.map.helpers({
	  mainMapOptions: function() {
	    if (GoogleMaps.loaded()) {
	      return {
			    center: new google.maps.LatLng(39.828127, -98.579404),
			    zoom: 4
	      }
	    }
	  }
	})

	Template.map.onCreated(function() {
		GoogleMaps.ready('mainMap', function(map) {
		  var cityStateStart = Session.get('cityStateStart')
		  var cityStateEnd = Session.get('cityStateEnd')
      var locStart, locEnd = null
		  geocoder = new google.maps.Geocoder()

	  	geocoder.geocode( { 'address': cityStateStart}, function(results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
          locStart = results[0].geometry.location
        } else {
          alert('Geocode was not successful for the following reason: ' + status)
        }
	  	})
	    geocoder.geocode( { 'address': cityStateEnd}, function(results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
          locEnd = results[0].geometry.location
        } else {
          alert('Geocode was not successful for the following reason: ' + status)
        }
        setMapBounds(locStart, locEnd, map)
        Session.set('mapLoaded', true)
	  	})
	  })
	})