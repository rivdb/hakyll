(function () {
  "use strict";

  var input = document.getElementById("search-input");
  var status = document.getElementById("search-status");
  var list = document.getElementById("search-results");
  if (!input) return;

  var index = null;
  var loading = null;

  function load() {
    if (!loading) {
      loading = fetch("/search.json")
        .then(function (r) { return r.json(); })
        .then(function (data) {
          index = data.map(function (p) {
            return {
              post: p,
              title: p.title.toLowerCase(),
              terms: p.tags.concat(p.categories).join(" ").toLowerCase(),
              desc: p.description.toLowerCase(),
              text: p.text.toLowerCase()
            };
          });
        });
    }
    return loading;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Split on the matches (captured, so they land at odd indices) and escape
  // each piece, so a match can never land inside an HTML entity.
  function highlight(text, words) {
    var re = new RegExp("(" + words.map(escapeRegExp).join("|") + ")", "gi");
    return text.split(re).map(function (part, i) {
      return i % 2 ? "<mark>" + escapeHtml(part) + "</mark>" : escapeHtml(part);
    }).join("");
  }

  // A window of body text around the first match.
  function snippet(entry, words) {
    var at = -1;
    for (var i = 0; i < words.length && at === -1; i++) at = entry.text.indexOf(words[i]);
    if (at === -1) return "";
    var start = Math.max(0, at - 60);
    var end = Math.min(entry.post.text.length, at + 140);
    return (start > 0 ? "…" : "") + entry.post.text.slice(start, end).trim() +
      (end < entry.post.text.length ? "…" : "");
  }

  function score(entry, words) {
    var total = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i], s = 0;
      if (entry.title.indexOf(w) !== -1) s += 10;
      if (entry.terms.indexOf(w) !== -1) s += 5;
      if (entry.desc.indexOf(w) !== -1) s += 3;
      if (entry.text.indexOf(w) !== -1) s += 1;
      if (s === 0) return 0; // every word has to match somewhere
      total += s;
    }
    return total;
  }

  function render() {
    var q = input.value.trim();
    var url = q ? "?q=" + encodeURIComponent(q) : location.pathname;
    history.replaceState(null, "", url);

    if (!q) {
      list.innerHTML = "";
      status.textContent = index ? index.length + " posts indexed" : "";
      return;
    }
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    var hits = index
      .map(function (e) { return { e: e, s: score(e, words) }; })
      .filter(function (h) { return h.s > 0; })
      .sort(function (a, b) { return b.s - a.s; });

    status.textContent = hits.length === 0 ? "no matches for “" + q + "”"
      : hits.length + (hits.length === 1 ? " match" : " matches");

    list.innerHTML = hits.map(function (h) {
      var p = h.e.post;
      var snip = snippet(h.e, words);
      return '<li><time>' + escapeHtml(p.date) + '</time><span class="item">' +
        '<a class="item-title" href="' + escapeHtml(p.url) + '">' + highlight(p.title, words) + '</a>' +
        (p.locked ? ' <span class="kind">(locked)</span>' : '') +
        (p.description ? '<span class="item-desc">' + highlight(p.description, words) + '</span>' : '') +
        (snip ? '<span class="item-desc">' + highlight(snip, words) + '</span>' : '') +
        '</span></li>';
    }).join("");
  }

  var timer = null;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { load().then(render); }, 80);
  });
  input.form.addEventListener("submit", function (e) { e.preventDefault(); });

  var initial = new URLSearchParams(location.search).get("q");
  if (initial) input.value = initial;
  input.focus();
  load().then(render).catch(function () {
    status.textContent = "couldn't load the search index";
  });
})();
