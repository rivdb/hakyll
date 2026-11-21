(function () {
  "use strict";

  var root = document.documentElement;
  var SCHEMES = (root.getAttribute("data-schemes") || "").split(" ").filter(Boolean);

  /* Colour scheme toggle (the initial scheme is applied in <head>). */
  var toggle = document.querySelector(".scheme-toggle");
  if (toggle) {
    var label = toggle.querySelector(".scheme-name");
    var current = function () { return root.getAttribute("data-scheme"); };
    label.textContent = current();
    toggle.addEventListener("click", function () {
      var next = SCHEMES[(SCHEMES.indexOf(current()) + 1) % SCHEMES.length];
      root.setAttribute("data-scheme", next);
      label.textContent = next;
      try { localStorage.setItem("scheme", next); } catch (e) {}
    });
  }

  /* Contact buttons in the footer: show the value in a popup with a copy
     button. Values arrive base64-encoded (see `contact` in site.yaml). */
  var toast = document.getElementById("toast");
  var toastTimer = null;

  function decode(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toast.hidden = true;
    toast.replaceChildren();
    toast.removeAttribute("data-for");
    document.querySelectorAll(".contact-button.open").forEach(function (b) { b.classList.remove("open"); });
  }

  // Closes by itself, but not while the pointer or focus is on it.
  function armToast() {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 8000);
  }

  function showToast(btn) {
    var label = btn.getAttribute("data-label");
    var value = decode(btn.getAttribute("data-value"));

    var name = document.createElement("span");
    name.className = "toast-label";
    name.textContent = label;
    var val = document.createElement("span");
    val.className = "toast-value";
    val.textContent = value;
    var copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "copy";
    copy.addEventListener("click", function () {
      var done = function (msg) { copy.textContent = msg; };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(value).then(function () { done("copied"); }, function () { done("failed"); });
      } else {
        done("failed");
      }
    });
    var close = document.createElement("button");
    close.type = "button";
    close.className = "toast-close";
    close.setAttribute("aria-label", "close");
    close.textContent = "×";
    close.addEventListener("click", hideToast);

    hideToast();
    toast.replaceChildren(name, val, copy, close);
    toast.setAttribute("data-for", label);
    toast.hidden = false;
    btn.classList.add("open");
    armToast();
  }

  if (toast) {
    document.querySelectorAll(".contact-button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        // a second click on the same button closes it
        if (!toast.hidden && toast.getAttribute("data-for") === btn.getAttribute("data-label")) hideToast();
        else showToast(btn);
      });
    });
    toast.addEventListener("mouseenter", function () { clearTimeout(toastTimer); });
    toast.addEventListener("focusin", function () { clearTimeout(toastTimer); });
    toast.addEventListener("mouseleave", armToast);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !toast.hidden) hideToast();
    });
    // Pressing anywhere else closes it. On pointerdown rather than click, so
    // selecting the value and letting go outside the popup doesn't close it.
    document.addEventListener("pointerdown", function (e) {
      if (toast.hidden || e.target.closest("#toast, .contact-button")) return;
      hideToast();
    });
  }

  /* Mark the nav entry for the current section; posts belong to the blog. */
  var path = location.pathname.replace(/index\.html$/, "");
  var section = path.indexOf("/posts/") === 0 ? "/blog/" : path;
  document.querySelectorAll(".site-nav a").forEach(function (a) {
    var href = a.getAttribute("href");
    if (href === section || (href !== "/" && section.indexOf(href) === 0)) {
      a.setAttribute("aria-current", "page");
    }
  });

  /* "/" jumps to search from anywhere that isn't a text field. */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    var input = document.getElementById("search-input");
    e.preventDefault();
    if (input) input.focus();
    else location.href = "/search/";
  });

  /* Code blocks: language label and a copy button. */
  var IGNORED = ["sourceCode", "numberSource", "numberLines"];
  function enhanceCode() {
    document.querySelectorAll(".prose pre").forEach(function (pre) {
      if (pre.closest(".code-block")) return;
      var block = pre.parentElement.classList.contains("sourceCode") ? pre.parentElement : pre;
      var wrap = document.createElement("div");
      wrap.className = "code-block";
      block.parentNode.insertBefore(wrap, block);
      wrap.appendChild(block);

      var tools = document.createElement("div");
      tools.className = "code-tools";
      var lang = Array.prototype.filter.call(pre.classList, function (c) {
        return IGNORED.indexOf(c) === -1;
      })[0];
      if (lang) {
        var tag = document.createElement("span");
        tag.className = "code-lang";
        tag.textContent = lang.toLowerCase();
        tools.appendChild(tag);
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-copy";
      btn.textContent = "copy";
      btn.setAttribute("aria-label", "copy code to clipboard");
      btn.addEventListener("click", function () {
        var text = pre.innerText.replace(/\n$/, "");
        var done = function (msg) {
          btn.textContent = msg;
          btn.classList.toggle("copied", msg === "copied");
          setTimeout(function () { btn.textContent = "copy"; btn.classList.remove("copied"); }, 1500);
        };
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function () { done("copied"); }, function () { done("failed"); });
        } else {
          done("failed");
        }
      });
      tools.appendChild(btn);
      wrap.appendChild(tools);
    });
  }

  /* Contents: highlight the section being read. */
  var tocObserver = null;
  function watchContents() {
    if (tocObserver) tocObserver.disconnect();
    var tocLinks = document.querySelectorAll(".toc a[href^='#']");
    if (!tocLinks.length || !("IntersectionObserver" in window)) return;
    var byId = {};
    tocLinks.forEach(function (a) {
      var id = decodeURIComponent(a.getAttribute("href").slice(1));
      (byId[id] = byId[id] || []).push(a);
    });
    var headings = Object.keys(byId).map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    var visible = new Set();
    var setActive = function (id) {
      tocLinks.forEach(function (a) { a.classList.remove("active"); });
      (byId[id] || []).forEach(function (a) { a.classList.add("active"); });
    };
    tocObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) visible.add(en.target.id); else visible.delete(en.target.id);
      });
      // The first heading on screen wins; otherwise the last one scrolled past.
      var active = null;
      for (var i = 0; i < headings.length; i++) {
        if (visible.has(headings[i].id)) { active = headings[i].id; break; }
        if (headings[i].getBoundingClientRect().top < 0) active = headings[i].id;
      }
      if (active) setActive(active);
    }, { rootMargin: "0px 0px -60% 0px" });
    headings.forEach(function (h) { tocObserver.observe(h); });
  }

  enhanceCode();
  watchContents();
  // unlock.js fires this once a locked post's content is in the page.
  document.addEventListener("rivers:content", function () {
    enhanceCode();
    watchContents();
  });

  /* Back to top. */
  document.querySelectorAll(".to-top").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0 });
      history.replaceState(null, "", location.pathname + location.search);
    });
  });

  /* 404: show the path that was asked for. */
  document.querySelectorAll(".missing-path").forEach(function (el) {
    el.textContent = location.pathname;
  });
})();
