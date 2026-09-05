/* TripWeather v4 — same idea as v2, simpler UX, no backend needed.
 * Uses Google Maps for route + api.weather.gov (CORS-enabled) for weather.
 * Called by Google Maps callback: initMap()
 */
(function () {
  "use strict";

  var map = null;
  var geocoder = null;
  var directionsDisplay = null;
  var directionsService = null;
  var infoWindow = null;
  var markers = [];
  var startMarker = null;
  var endMarker = null;
  var forecastCache = new Map(); // "lat,lon" -> periods[]

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(msg, isError, busy) {
    var el = $("status");
    if (!el) return;
    el.className = "status" + (isError ? " error" : "");
    el.innerHTML = busy ? '<span class="spinner" aria-hidden="true"></span>' + escapeHtml(msg) : escapeHtml(msg);
  }

  function setFieldError(inputId, errorId, msg) {
    var input = $(inputId);
    var err = $(errorId);
    if (err) err.textContent = msg || "";
    if (input) {
      if (msg) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
  }

  function setBusy(busy, label) {
    var btn = $("goBtn");
    if (!btn) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? label || "Loading…" : "Show weather \u2192";
  }

  // Google Maps entry point (global for ?callback=initMap).
  // index-v4.html defines a window.initMap stub first to avoid the
  // "initMap is not a function" race; the real init runs here.
  function realInit() {
    map = new google.maps.Map($("map"), {
      center: { lat: 41.5, lng: -89.5 },
      zoom: 6
    });
    geocoder = new google.maps.Geocoder();
    directionsDisplay = new google.maps.DirectionsRenderer();
    directionsDisplay.setMap(map);
    directionsService = new google.maps.DirectionsService();
    infoWindow = new google.maps.InfoWindow();
  }
  window.__twRealInit = realInit;
  if (window.twMapsReady) realInit();

  function mapsReady() {
    return !!(map && geocoder && directionsService && window.google && window.google.maps);
  }

  // Restored from v1: "Leaving Now / in 2 / 8 / 12 hours" select.
  function getLeavingOffsetHours() {
    var sel = $("leaving");
    var h = sel ? parseInt(sel.value, 10) : 0;
    return isNaN(h) ? 0 : h;
  }

  function getDepartureTime() {
    return Date.now() + getLeavingOffsetHours() * 3600 * 1000;
  }

  function clearMarkers() {
    for (var i = 0; i < markers.length; i++) markers[i].setMap(null);
    markers = [];
    startMarker = null;
    endMarker = null;
    if (infoWindow) infoWindow.close();
    if (directionsDisplay) directionsDisplay.setDirections({ routes: [] });
  }

  function addMarker(lat, lng, timeMs) {
    var m = new google.maps.Marker({ position: { lat: lat, lng: lng }, map: map });
    m.time = timeMs;
    m.setIcon("./img/icons/sunny.png");
    markers.push(m);
    return m;
  }

  function geocodeAddress(address) {
    return new Promise(function (resolve, reject) {
      geocoder.geocode({ address: address }, function (results, status) {
        if (status === "OK" && results && results[0]) resolve(results[0]);
        else reject(new Error(status || "NOT_FOUND"));
      });
    });
  }

  function iconFor(text) {
    var t = (text || "").toLowerCase();
    if (t.indexOf("thunder") >= 0 || t.indexOf("storm") >= 0) return "./img/icons/thunderstorm.png";
    if (t.indexOf("tornado") >= 0 || t.indexOf("funnel") >= 0) return "./img/icons/tornado.png";
    if (t.indexOf("snow") >= 0 || t.indexOf("sleet") >= 0 || t.indexOf("ice") >= 0 || t.indexOf("flurr") >= 0)
      return "./img/icons/snowy.png";
    if (t.indexOf("rain") >= 0 || t.indexOf("shower") >= 0 || t.indexOf("drizzle") >= 0)
      return "./img/icons/rainy.png";
    if (t.indexOf("cloud") >= 0 || t.indexOf("overcast") >= 0 || t.indexOf("fog") >= 0)
      return "./img/icons/cloudy.png";
    return "./img/icons/sunny.png";
  }

  function cacheKey(lat, lng) {
    return lat.toFixed(2) + "," + lng.toFixed(2);
  }

  function fetchHourlyPeriods(lat, lng) {
    var key = cacheKey(lat, lng);
    if (forecastCache.has(key)) return Promise.resolve(forecastCache.get(key));
    var pointUrl = "https://api.weather.gov/points/" + lat.toFixed(4) + "," + lng.toFixed(4);
    return fetch(pointUrl, { headers: { Accept: "application/geo+json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("outside US");
        return r.json();
      })
      .then(function (point) {
        var hourlyUrl = point && point.properties && point.properties.forecastHourly;
        if (!hourlyUrl) throw new Error("no hourly");
        return fetch(hourlyUrl, { headers: { Accept: "application/geo+json" } });
      })
      .then(function (r) {
        if (!r.ok) throw new Error("forecast failed");
        return r.json();
      })
      .then(function (fc) {
        var periods = (fc.properties && fc.properties.periods) || [];
        forecastCache.set(key, periods);
        return periods;
      });
  }

  function closestPeriod(periods, timeMs) {
    var best = null;
    var bestDiff = Infinity;
    for (var i = 0; i < periods.length; i++) {
      var t = new Date(periods[i].startTime).getTime();
      var d = Math.abs(t - timeMs);
      if (d < bestDiff) { bestDiff = d; best = periods[i]; }
      if (t >= timeMs) break; // periods are chronological; first at/after time is usually best
    }
    return best;
  }

  function getWeather(marker, placeName) {
    var lat = marker.getPosition().lat();
    var lng = marker.getPosition().lng();
    fetchHourlyPeriods(lat, lng).then(function (periods) {
      var p = closestPeriod(periods, marker.time);
      if (!p) return;
      var text = p.shortForecast || "";
      var temp = (p.temperature != null ? p.temperature + "\u00B0" + (p.temperatureUnit || "F") : "");
      marker.setIcon(iconFor(text));
      var when = new Date(marker.time).toLocaleString();
      var title = when + " : " + text + (temp ? " " + temp : "");
      marker.setTitle(title);
      // Store popup HTML; single shared InfoWindow avoids dozens of open windows
      marker._popupHtml =
        '<div class="tw-popup"><h3>' + escapeHtml(when) + "</h3>" +
        (p.icon ? '<img src="' + escapeHtml(p.icon) + '" alt="" width="54" height="54">' : "") +
        "<div><span class='tw-temp'>" + escapeHtml(temp) + "</span> " + escapeHtml(text) + "<br>" +
        "<span>" + escapeHtml(placeName || "") + "</span></div></div>";
      marker.addListener("click", function () {
        infoWindow.setContent(marker._popupHtml);
        infoWindow.open(map, marker);
      });
    }).catch(function () {
      marker.setTitle(new Date(marker.time).toLocaleString() + " : No forecast (outside US coverage)");
    });
  }

  function fitBounds() {
    var b = new google.maps.LatLngBounds();
    b.extend(startMarker.getPosition());
    b.extend(endMarker.getPosition());
    map.fitBounds(b);
  }

  function showSummary(miles, hours, arrival, offsetH) {
    var card = $("summary");
    var main = $("summaryMain");
    if (!card || !main) return;
    var arrivalStr = arrival.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    var prefix = offsetH > 0 ? "Leave in " + offsetH + " hr \u2022 " : "";
    main.textContent = prefix + Math.round(miles) + " mi \u2022 " + hours.toFixed(1) + " hr drive \u2022 arrive ~" + arrivalStr;
    card.hidden = false;
    var ph = $("mapPlaceholder");
    if (ph) ph.hidden = true;
  }

  function routeAndMark(departBase) {
    setStatus("Finding route…", false, true);
    setBusy(true, "Finding route…");
    var offsetH = getLeavingOffsetHours();
    var req = {
      origin: startMarker.getPosition(),
      destination: endMarker.getPosition(),
      travelMode: google.maps.TravelMode.DRIVING
    };
    directionsService.route(req, function (response, status) {
      if (status !== "OK") {
        setBusy(false);
        setStatus("Couldn't find a driving route. Try different places.", true, false);
        return;
      }
      directionsDisplay.setDirections(response);
      var leg = response.routes[0].legs[0];
      var miles = leg.distance.value / 1609.344;
      var hours = leg.duration.value / 3600;
      var arrival = new Date(departBase + leg.duration.value * 1000);
      endMarker.time = arrival.getTime();
      showSummary(miles, hours, arrival, offsetH);

      // Markers spaced along route; log scale keeps long trips readable
      if (miles >= 5) {
        var n = Math.max(2, Math.round(Math.log(miles) * 1.5));
        var stepMi = miles / n;
        var stepMs = (leg.duration.value * 1000) / n;
        var path = response.routes[0].overview_path;
        var lastPos = startMarker.getPosition();
        var t = departBase;
        for (var i = 0; i < path.length; i++) {
          var segMi = google.maps.geometry.spherical.computeDistanceBetween(lastPos, path[i]) / 1609.344;
          if (segMi >= stepMi) {
            t += stepMs;
            addMarker(path[i].lat(), path[i].lng(), t);
            lastPos = path[i];
          }
        }
      }
      setStatus("Checking weather along your route…", false, true);
      setBusy(true, "Checking weather…");
      var label = (leg.start_address || "").split(",").slice(0, 2).join(",");
      for (var j = 0; j < markers.length; j++) getWeather(markers[j], label);
      // Weather fetches resolve async; release button after a beat so user can re-search
      setTimeout(function () {
        setBusy(false);
        setStatus("Click any icon for details.", false, false);
      }, 1200);
    });
  }

  // Form submit — the only action. Obvious, Enter-friendly, no inline handlers.
  function onSubmit(e) {
    if (e) e.preventDefault();
    setFieldError("from", "fromError", "");
    setFieldError("to", "toError", "");
    var from = $("from").value.trim();
    var to = $("to").value.trim();
    if (!from) { setFieldError("from", "fromError", "Enter a starting place."); $("from").focus(); return; }
    if (!to) { setFieldError("to", "toError", "Enter a destination."); $("to").focus(); return; }
    if (window.twMapsAuthFailed) {
      setStatus("Map key isn't authorized for this site. Add this URL to the key's HTTP referrers.", true, false);
      return;
    }
    if (!mapsReady()) {
      setStatus("Map is still loading… wait a second and try again.", true, false);
      return;
    }
    clearMarkers();
    $("summary").hidden = true;
    setStatus("Looking up places…", false, true);
    setBusy(true, "Looking up places…");
    var depart = getDepartureTime();
    geocodeAddress(from).then(function (rFrom) {
      return geocodeAddress(to).then(function (rTo) { return { rFrom: rFrom, rTo: rTo }; });
    }).then(function (r) {
      startMarker = addMarker(r.rFrom.geometry.location.lat(), r.rFrom.geometry.location.lng(), depart);
      endMarker = addMarker(r.rTo.geometry.location.lat(), r.rTo.geometry.location.lng(), depart);
      fitBounds();
      routeAndMark(depart);
    }).catch(function (err) {
      setBusy(false);
      var msg = String((err && err.message) || "");
      if (!$("from").value.trim() || !$("to").value.trim()) return;
      // Attribute failure to the right field when possible
      if (markers.length === 0) {
        setFieldError("from", "fromError", "Couldn't find that place. Try CITY, ST.");
        setStatus("Couldn't find that starting place.", true, false);
        $("from").focus();
      } else {
        setFieldError("to", "toError", "Couldn't find that place. Try CITY, ST.");
        setStatus("Couldn't find that destination. " + msg, true, false);
        $("to").focus();
      }
    });
  }

  function wire() {
    var form = $("locationForm");
    if (form) form.addEventListener("submit", onSubmit);
    var swap = $("swapBtn");
    if (swap) swap.addEventListener("click", function () {
      var f = $("from"), t = $("to");
      var tmp = f.value; f.value = t.value; t.value = tmp;
      f.focus();
    });
    var ex = $("exampleBtn");
    if (ex) ex.addEventListener("click", function () {
      $("from").value = "Madison, WI";
      $("to").value = "Chicago, IL";
      onSubmit();
    });
    var loc = $("locateBtn");
    if (loc) loc.addEventListener("click", function () {
      if (!mapsReady()) { setStatus("Map is still loading… wait a second and try again.", true, false); return; }
      if (!navigator.geolocation) { setStatus("Your browser doesn't support location.", true, false); return; }
      setStatus("Using your location…", false, true);
      navigator.geolocation.getCurrentPosition(function (pos) {
        var g = new google.maps.Geocoder();
        g.geocode({ location: { lat: pos.coords.latitude, lng: pos.coords.longitude } }, function (res, st) {
          if (st === "OK" && res[0]) $("from").value = res[0].formatted_address;
          else $("from").value = pos.coords.latitude.toFixed(4) + ", " + pos.coords.longitude.toFixed(4);
          setStatus("Now enter your destination.", false, false);
          $("to").focus();
        });
      }, function () { setStatus("Couldn't get your location. Type it instead.", true, false); });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();

  // Expose for tests / inline fallback
  window.TripWeatherV4 = { onSubmit: onSubmit };
})();
