(function () {
  var cfg = window.CRICKET_CONFIG || {};
  var LIVE = !!(cfg.useProxy || cfg.apiKey);
  function apiUrl(endpoint, id) {
    if (cfg.useProxy) return "/.netlify/functions/cricket?endpoint=" + endpoint + (id ? "&id=" + encodeURIComponent(id) : "");
    return "https://api.cricapi.com/v1/" + endpoint + "?apikey=" + encodeURIComponent(cfg.apiKey) + (endpoint === "currentMatches" ? "&offset=0" : "") + (id ? "&id=" + encodeURIComponent(id) : "");
  }
  var listEl = document.getElementById("list");
  var detailEl = document.getElementById("detail");
  var tabsEl = document.getElementById("tabs");
  var stampEl = document.getElementById("stamp");
  var noticeEl = document.getElementById("notice");
  var filter = "all";
  var matches = [];
  var openId = null;
  var openMatch = null;

  var SAMPLE = [
    { id: "s1", status: "live", series: "ODI Series: Australia v Bangladesh (Women)", a: "Australia", b: "Bangladesh", sa: "142/3 (28.2)", sb: "", text: "Australia batting" },
    { id: "s2", status: "upcoming", series: "T20 World Cup Sub Regional Asia Qualifier A", a: "Bhutan", b: "Thailand", sa: "", sb: "", text: "Starts 11:30 AM IST" },
    { id: "s3", status: "result", series: "T20 Series: Pakistan v Sri Lanka", a: "Pakistan", b: "Sri Lanka", sa: "168/8", sb: "172/2", text: "Sri Lanka won by 8 wickets" }
  ];
  var SAMPLE_BBB = [
    { ball: "28.2", runs: "4", text: "Driven through the covers for four." },
    { ball: "28.1", runs: "1", text: "Worked off the pads for a single." },
    { ball: "27.6", runs: "0", text: "Defended back to the bowler." },
    { ball: "27.5", runs: "W", text: "Bowled! Middle stump knocked back." },
    { ball: "27.4", runs: "2", text: "Pushed into the gap, two runs." }
  ];

  function esc(x) {
    return String(x == null ? "" : x).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function normalise(m) {
    var teams = m.teams || [];
    var scores = m.score || [];
    function scoreFor(team) {
      return scores.filter(function (x) { return (x.inning || "").indexOf(team) === 0; })
        .map(function (x) { return x.r + "/" + x.w + (x.o != null ? " (" + x.o + ")" : ""); }).join(" & ");
    }
    return {
      id: m.id,
      status: m.matchEnded ? "result" : (m.matchStarted ? "live" : "upcoming"),
      series: m.name || "", a: teams[0] || "", b: teams[1] || "",
      sa: scoreFor(teams[0] || ""), sb: scoreFor(teams[1] || ""), text: m.status || ""
    };
  }

  function row(m) {
    var label = { live: "Live", upcoming: "Upcoming", result: "Result" }[m.status];
    var cls = { live: "live", upcoming: "up", result: "fin" }[m.status];
    var btn = m.status === "upcoming" ? "" : ' data-id="' + esc(m.id) + '" tabindex="0" role="button" aria-label="Ball by ball: ' + esc(m.a) + ' v ' + esc(m.b) + '"';
    return '<article class="row' + (btn ? " click" : "") + '"' + btn + '><div class="teams">' +
      '<div class="team"><span>' + esc(m.a) + '</span>' + (m.sa ? '<span class="sc">' + esc(m.sa) + '</span>' : '') + '</div>' +
      '<div class="team"><span>' + esc(m.b) + '</span>' + (m.sb ? '<span class="sc">' + esc(m.sb) + '</span>' : '') + '</div></div>' +
      '<span class="pill ' + cls + '">' + label + '</span>' +
      '<div class="meta"><span>' + esc(m.series) + '</span><span class="res">' + esc(m.text) + '</span></div>' +
      (btn ? '<div class="more">Ball by ball →</div>' : '') + '</article>';
  }

  function render() {
    var titles = { live: "Live now", upcoming: "Coming up", result: "Results" };
    var html = "";
    ["live", "upcoming", "result"].forEach(function (s) {
      if (filter !== "all" && filter !== s) return;
      var items = matches.filter(function (m) { return m.status === s; });
      if (!items.length) return;
      html += "<h2>" + titles[s] + " (" + items.length + ")</h2>" + items.map(row).join("");
    });
    listEl.innerHTML = html || '<p class="empty">No matches in this view.</p>';
  }

  // ---- Ball by ball ----
  function ballItem(b) {
    var runs = String(b.runs == null ? "" : b.runs);
    var cls = runs === "W" ? "w" : (runs === "4" || runs === "6" ? "b" : "");
    return '<li><span class="ov">' + esc(b.ball) + '</span><span class="bd ' + cls + '">' + esc(runs) + '</span><span class="tx">' + esc(b.text) + '</span></li>';
  }

  // CricAPI field names for ball-by-ball can vary, so read several possibilities.
  function normaliseBall(x) {
    return {
      ball: x.n != null ? x.n : (x.over != null ? x.over + "." + (x.ball || "") : (x.ball || "")),
      runs: x.score != null ? x.score : (x.runs != null ? x.runs : ""),
      text: x.commentary || x.text || x.description || ""
    };
  }

  function showDetail(balls, msg) {
    var m = openMatch;
    detailEl.hidden = false;
    tabsEl.hidden = true; listEl.hidden = true;
    detailEl.innerHTML = '<button class="back" id="back">← All matches</button>' +
      '<h2>' + esc(m.a) + ' v ' + esc(m.b) + '</h2>' +
      '<p class="line">' + esc(m.sa) + (m.sb ? " | " + esc(m.sb) : "") + '</p><p class="res">' + esc(m.text) + '</p>' +
      (msg ? '<p class="notice">' + esc(msg) + '</p>' : '') +
      (balls.length ? '<ol class="bbb">' + balls.map(ballItem).join("") + '</ol>' : "");
    document.getElementById("back").onclick = closeDetail;
  }

  function closeDetail() {
    openId = null; openMatch = null;
    detailEl.hidden = true; tabsEl.hidden = false; listEl.hidden = false;
  }

  function loadBalls() {
    if (!openId) return;
    if (!LIVE) { showDetail(SAMPLE_BBB, "Sample commentary. Add your API key in config.js for the real thing."); return; }
    fetch(apiUrl("match_bbb", openId))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.status !== "success") throw new Error(j.reason || "not available");
        var d = j.data || {};
        var arr = d.bbb || d.balls || (Array.isArray(d) ? d : []);
        var balls = arr.map(normaliseBall).reverse();
        showDetail(balls, balls.length ? "" : "No ball-by-ball data for this match yet.");
      })
      .catch(function (e) {
        showDetail([], "Ball by ball is not available (" + e.message + "). It may need a paid plan with your provider.");
      });
  }

  function openFrom(el) {
    var card = el.closest(".click");
    if (!card) return;
    openId = card.dataset.id;
    openMatch = matches.filter(function (m) { return String(m.id) === String(openId); })[0];
    loadBalls();
  }
  listEl.addEventListener("click", function (e) { openFrom(e.target); });
  listEl.addEventListener("keydown", function (e) { if (e.key === "Enter") openFrom(e.target); });

  // ---- Live scores ----
  function load() {
    if (!LIVE) {
      matches = SAMPLE;
      noticeEl.hidden = false;
      noticeEl.textContent = "Showing sample data. Add your API key in config.js to see real scores.";
      stampEl.textContent = "Sample data";
      if (!openId) render();
      return;
    }
    fetch(apiUrl("currentMatches"))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.status !== "success") throw new Error(j.reason || "API error");
        matches = (j.data || []).map(normalise);
        noticeEl.hidden = true;
        stampEl.textContent = "Updated " + new Date().toLocaleTimeString("en-IN", { timeZone: cfg.timeZone || "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) + " IST";
        if (openId) {
          openMatch = matches.filter(function (m) { return String(m.id) === String(openId); })[0] || openMatch;
          loadBalls();
        } else render();
      })
      .catch(function (e) {
        noticeEl.hidden = false;
        noticeEl.textContent = "Could not load scores (" + e.message + "). Retrying shortly.";
      });
  }

  tabsEl.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    filter = b.dataset.f;
    [].forEach.call(tabsEl.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
    render();
  });

  load();
  setInterval(load, (cfg.refreshSeconds || 30) * 1000);
})();
