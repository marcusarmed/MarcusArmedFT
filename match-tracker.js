/*
 * Marcus Armed match tracker: the listing logic shared by the homepage ticker
 * (index.html) and the full tracker (matches.html). Listings are read from
 * matches.json in the same folder. Dates use the viewer's own time zone.
 */
(function (root) {
  'use strict';

  var USPSA_URL = 'https://uspsa.org/matches/list/major';
  var PIN_LIMIT = 4;

  // url is the club's PractiScore page. A club with no url is listed without a link.
  var CLUBS = [
    { slug: 'pathfinder-practical-shooters', name: 'Pathfinder Practical Shooters', url: 'https://practiscore.com/clubs/pathfinder-practical-shooters' },
    { slug: 'wincrest_sportsman', name: 'Wincrest Sportsman', url: 'https://practiscore.com/clubs/wincrest_sportsman' },
    { slug: 'wnyppl', name: 'WNYPPL', url: 'https://practiscore.com/clubs/wnyppl-1' },
    { slug: 'rochester-brooks-practical-shooters', name: 'Rochester Brooks Practical Shooters', url: 'https://practiscore.com/clubs/rochester-brooks-practical-shooters' },
    { slug: 'orgc', name: 'ORGC', url: 'https://practiscore.com/clubs/orgc' },
    { slug: 'gem-city-gun-club', name: 'Gem City Gun Club', url: 'https://practiscore.com/clubs/gem-city-gun-club' },
    { slug: 'gcl', name: 'GCL', url: 'https://practiscore.com/clubs/genesee-conservation-league' }
  ];

  var STATUS = {
    open: { label: 'Squadding open', tag: 'SQUADDING OPEN', rank: 0 },
    opening: { label: 'Opening soon', tag: 'OPENING SOON', rank: 1 },
    upcoming: { label: 'Upcoming', tag: 'UPCOMING', rank: 2 }
  };

  // USPSA areas and their states, from the state lists on uspsa.org (area pages 1 to 8).
  var AREA_STATES = {
    1: ['AK', 'ID', 'MT', 'NV', 'OR', 'UT', 'WA', 'WY'],
    2: ['AZ', 'CA', 'CO', 'HI', 'NM'],
    3: ['IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD'],
    4: ['AR', 'LA', 'OK', 'TX'],
    5: ['IL', 'IN', 'KY', 'MI', 'OH', 'WV', 'WI'],
    6: ['AL', 'FL', 'GA', 'MS', 'NC', 'SC', 'TN'],
    7: ['CT', 'ME', 'MA', 'NH', 'NY', 'RI', 'VT'],
    8: ['DC', 'DE', 'MD', 'NJ', 'PA', 'VA']
  };

  var DATE_OPTS = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };

  function fmtDate(d) { return d.toLocaleDateString('en-US', DATE_OPTS); }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Date-only values: a match runs to the end of its day, and registration opens at the start of its day.
  function parseWhen(s, endOfDay) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      var y = +m[1], mo = +m[2] - 1, d = +m[3];
      return endOfDay ? new Date(y, mo, d, 23, 59, 59) : new Date(y, mo, d, 0, 0, 0);
    }
    var t = new Date(s);
    return isNaN(t) ? null : t;
  }

  // Status from the dates at time `now`. Returns null once the match has passed.
  // regState "open" marks registration as open when no close time is known.
  // opensIn (whole months), opensInWeeks (whole weeks) or opensInDays (whole days) after the
  // listing date `base` gives an estimated opening date, marked approx.
  function derive(m, now, base) {
    var end = parseWhen(m.date, true);
    if (!end || end < now) return null;
    var opens = parseWhen(m.regOpens, false);
    var approx = false;
    var n = Number(m.opensIn);
    var w = Number(m.opensInWeeks);
    var dy = Number(m.opensInDays);
    if (!opens && base && n > 0) {
      opens = new Date(base.getFullYear(), base.getMonth() + n, base.getDate(), 0, 0, 0);
      approx = 'mo';
    } else if (!opens && base && w > 0) {
      opens = new Date(base.getFullYear(), base.getMonth(), base.getDate() + w * 7, 0, 0, 0);
      approx = 'wk';
    } else if (!opens && base && dy > 0) {
      opens = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dy, 0, 0, 0);
      approx = 'day';
    }
    var closes = parseWhen(m.regCloses, true);
    if (m.regState === 'open') return { status: 'open', at: closes || end, opens: opens, closes: closes, end: end, approx: approx };
    if (opens && now < opens) return { status: 'opening', at: opens, opens: opens, closes: closes, end: end, approx: approx };
    if ((opens || closes) && (!closes || now < closes)) {
      return { status: 'open', at: closes || end, opens: opens, closes: closes, end: end, approx: approx };
    }
    return { status: 'upcoming', at: end, opens: opens, closes: closes, end: end, approx: approx };
  }

  function clubName(slug) {
    for (var i = 0; i < CLUBS.length; i++) { if (CLUBS[i].slug === slug) return CLUBS[i].name; }
    return slug || 'Unknown club';
  }

  function clubUrl(slug) {
    for (var i = 0; i < CLUBS.length; i++) {
      if (CLUBS[i].slug === slug) return CLUBS[i].url;
    }
    return null;
  }

  // USPSA area (1 to 8) for a two-letter state code, or null.
  function areaOf(st) {
    var code = String(st || '').toUpperCase();
    var found = null;
    Object.keys(AREA_STATES).forEach(function (n) {
      if (AREA_STATES[n].indexOf(code) !== -1) found = Number(n);
    });
    return found;
  }

  // "Area 4" in a championship's name, used when the listing gives no location.
  function areaFromName(name) {
    var m = /\bArea (\d)\b/.exec(String(name || ''));
    return m && AREA_STATES[m[1]] ? Number(m[1]) : null;
  }

  function safeUrl(u) { return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null; }

  // list: raw entries. base: listing date. scope: 'local' (club matches) or 'national' (USPSA majors).
  function buildItems(list, base, now, scope) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (m) {
      var d = m && derive(m, now, base);
      if (!d) return;
      var local = scope === 'local';
      var st = String(m.state || '').toUpperCase();
      var place = [m.city, st].filter(Boolean).join(', ');
      var own = safeUrl(m.url);
      out.push({
        club: m.club || '', scope: scope,
        clubName: local ? clubName(m.club) : (place || 'USPSA major'),
        name: m.name || 'Untitled match',
        state: local ? '' : st,
        link: own || (local ? clubUrl(m.club) : USPSA_URL),
        linkLabel: own ? 'Match page' : (local ? 'Club page' : 'USPSA list'),
        area: local ? null : (areaOf(st) || areaFromName(m.name)),
        status: d.status, at: d.at, opens: d.opens, closes: d.closes, end: d.end, approx: d.approx
      });
    });
    out.sort(function (a, b) { return (STATUS[a.status].rank - STATUS[b.status].rank) || (a.at - b.at); });
    return out;
  }

  function fmtDelta(ms) {
    if (ms <= 0) return 'now';
    var mins = Math.floor(ms / 60000);
    var d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    if (d >= 1) return d + 'd ' + h + 'h';
    if (h >= 1) return h + 'h ' + m + 'm';
    return m + 'm';
  }

  function countdownText(it, now) {
    var ms = it.at - now;
    if (it.status === 'opening' && it.approx === 'day') {
      var days = Math.max(1, Math.ceil(ms / 86400000));
      return 'opens in ~' + days + (days === 1 ? ' day' : ' days');
    }
    if (it.status === 'opening' && it.approx === 'wk') {
      return 'opens in ~' + Math.max(1, Math.ceil(ms / 604800000)) + ' wk';
    }
    if (it.status === 'opening' && it.approx) {
      return 'opens in ~' + Math.max(1, Math.round(ms / 2629800000)) + ' mo';
    }
    var left = fmtDelta(ms);
    if (it.status === 'opening') return 'opens in ' + left;
    if (it.status === 'open' && it.closes) return 'closes in ' + left;
    return 'match in ' + left;
  }

  // Every listed item for one list at time `now`, before any filter. data is the parsed matches.json.
  function allItems(data, scope, now) {
    var d = data || {};
    return scope === 'local'
      ? buildItems(d.matches, parseWhen(d.updated, false), now, 'local')
      : buildItems(d.national, parseWhen(d.nationalUpdated, false), now, 'national');
  }

  // Stable key for a listed match. Pins are stored under these keys.
  function itemKey(it) {
    return [it.scope, it.club, it.name, it.end ? it.end.getTime() : ''].join('|');
  }

  function loadData() {
    return fetch('matches.json', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // Ticker markup for one pass of the local matches. The list is written twice so the scroll loops.
  function tickerSegment(items, now, copy) {
    var html = items.map(function (it, i) {
      return '<span class="match-ticker-item ' + it.status + '">' +
        '<span class="match-ticker-tag">' + STATUS[it.status].tag + '</span>' +
        '<span class="match-ticker-club">' + esc(it.clubName) + '</span>' +
        '<span>' + esc(it.name) + '</span>' +
        '<span class="match-ticker-date">' + esc(fmtDate(it.end)) + '</span>' +
        '<span class="match-ticker-cd" data-cd="' + i + '">' + esc(countdownText(it, now)) + '</span>' +
        '</span>';
    }).join('');
    return '<div class="match-ticker-seg"' + (copy ? ' aria-hidden="true"' : '') + '>' + html + '</div>';
  }

  // Homepage ticker: the local matches scroll across the band. The band hides itself if the listings cannot be read.
  function mountTicker(el) {
    var track = el.querySelector('.match-ticker-track');
    var data = null;
    var shown = null;

    function update() {
      var now = new Date();
      var items = allItems(data, 'local', now);
      var sig = items.map(function (it) { return itemKey(it); }).join('\n');
      if (sig !== shown) {
        shown = sig;
        if (items.length) {
          track.innerHTML = tickerSegment(items, now, false) + tickerSegment(items, now, true);
          track.style.setProperty('--dur', Math.max(20, items.length * 7) + 's');
          track.classList.remove('idle');
        } else {
          track.innerHTML = '<span class="match-ticker-empty">No upcoming local matches are listed right now.</span>';
          track.classList.add('idle');
        }
        return;
      }
      // Same matches as before: only the countdown text changes, so the scroll does not restart.
      track.querySelectorAll('[data-cd]').forEach(function (node) {
        var it = items[Number(node.getAttribute('data-cd'))];
        if (it) node.textContent = countdownText(it, now);
      });
    }

    loadData().then(function (d) {
      data = d;
      update();
      setInterval(update, 30000);
    }).catch(function () {
      el.hidden = true;
    });
  }

  root.MatchTracker = {
    CLUBS: CLUBS,
    STATUS: STATUS,
    AREA_STATES: AREA_STATES,
    PIN_LIMIT: PIN_LIMIT,
    parseWhen: parseWhen,
    derive: derive,
    buildItems: buildItems,
    countdownText: countdownText,
    areaOf: areaOf,
    areaFromName: areaFromName,
    clubName: clubName,
    clubUrl: clubUrl,
    fmtDate: fmtDate,
    esc: esc,
    itemKey: itemKey,
    allItems: allItems,
    loadData: loadData,
    mountTicker: mountTicker
  };
})(typeof window !== 'undefined' ? window : globalThis);
