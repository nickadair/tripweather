if (Meteor.isClient) {
	UI.body.events({
		'click #zipSubmit': function (e) {
		  e.preventDefault();
		  Session.set('zipEntered', true);
		  Session.set('cityState1', document.getElementById('cityState1').value);
		  Session.set('cityState2', document.getElementById('cityState2').value);
		}
	  });

	Meteor.startup(function() {
		Session.setDefault('zipEntered', false);
		GoogleMaps.load();
  	});

	Template.mainContent.helpers({
		isTrue : function() { return Session.get('zipEntered') }
	});

	Template.map.helpers({
	  mainMapOptions: function() {
	    if (GoogleMaps.loaded()) {
	      return {
			center: new google.maps.LatLng(39.828127, -98.579404),
			zoom: 4
	      };
	    }
	  }
	});

	Template.map.onCreated(function() {
		GoogleMaps.ready('mainMap', function(map) {
		var cityState1 = Session.get('cityState1');
		var cityState2 = Session.get('cityState2');	
	    var loc1 = null;
		var loc2 = null;
		geocoder = new google.maps.Geocoder();
	  	geocoder.geocode( { 'address': cityState1}, function(results, status) {
			if (status == google.maps.GeocoderStatus.OK) {
			  loc1 = results[0].geometry.location;
			} else {
			  alert('Geocode was not successful for the following reason: ' + status);
			}
	  	});
	    geocoder.geocode( { 'address': cityState2}, function(results, status) {
			if (status == google.maps.GeocoderStatus.OK) {
			  loc2 = results[0].geometry.location;
			  var bounds_1 = new google.maps.LatLng(loc1.lat(), loc1.lng());
	    	  var bounds_2 = new google.maps.LatLng(loc2.lat(), loc2.lng());
	    	  var bounds = new google.maps.LatLngBounds();
			  bounds.extend(bounds_1);
			  bounds.extend(bounds_2);
			  map.instance.fitBounds(bounds);
			  var marker1 = new google.maps.Marker({
			    map: map.instance,
			    position: loc1
			  });
			  var marker2 = new google.maps.Marker({
			    map: map.instance,
			    position: loc2
			  });
			} else {
			  alert('Geocode was not successful for the following reason: ' + status);
			}
	  	});
		
	  });
	});

	Template.body.onCreated(function() {
		
	});
}

if (Meteor.isServer) {
  Meteor.startup(function () {
  });
}
